import path from 'path'
import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs/promises'
import { DirItem } from '../types'
import { app } from 'electron'
import { sendToRenderer, logToRenderer } from './index'
import { handleStopAllFFMPEGProcesses } from './ipc'

// For security, and mainly bugproofing purposes - the front will not be tracking the total and seperate progress of each converting file
// This would happen in the back, in this file.
// An event call would be sent to the front when the 'end' event is called by ffmpeg, which will change the UI ONLY
// The total conversion progress will be counted here as well, each 'end' event would increment the alreadyConverted let and init a func that checks if it equals the total
// If it is, the CONVERSION_COMPLETE event would call the front.

let totalToConvert: number = 0
let alreadyConverted: number = 0

const resetConversionCount = (): void => {
  console.log('resetting converesion counts')
  totalToConvert = 0
  alreadyConverted = 0
}

const isConversionComplete = (): void => {
  console.log('check if conversion complete')
  if (alreadyConverted === totalToConvert) {
    console.log('conversion is complete calling front')
    sendToRenderer('CONVERSION_COMPLETE')
    resetConversionCount()
  }
}

export const convertExplorer = async (explorer: DirItem[], outputDir: string): Promise<void> => {
  await fs.mkdir(outputDir, { recursive: true }) // Create the parent 'converted' folder in the output path the user chose

  await Promise.allSettled(
    explorer.map(async (dir: DirItem) => {
      if (dir.type === 'folder') {
        const childOutputDir = path.join(outputDir, dir.name) // Create the child folder name
        await fs.mkdir(childOutputDir, { recursive: true }) // Create the new folder in the correct location
        if (dir.children) {
          // Not all folders have children
          // Convert the children as well and create the subfolders if necessary - the nested processing occurs here
          await convertExplorer(dir.children, childOutputDir)
        }
      } else {
        // Convert the actual files and output to the correct folder
        totalToConvert++
        console.log('total is', totalToConvert)
        const fileOutputDir = path.join(outputDir, dir.name)
        switch (dir.ext) {
          case 'audio':
            await convertAudio(dir.path, fileOutputDir)
            break
          case 'video':
            await convertVideo(dir.path, fileOutputDir)
            break
          case 'image':
            await convertImage(dir.path, fileOutputDir)
            break
        }
      }
    })
  )
}

const convertAudio = async (inputPath: string, outputPath: string): Promise<void> => {
  let progressTracker: number = 0

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .audioCodec('libopus')
      .audioBitrate('64k')
      .audioChannels(1)
      .outputOptions([
        '-ar 24000',
        '-vbr on',
        '-compression_level 8',
        '-frame_duration 60',
        '-packet_loss 3',
        '-mapping_family 1',
        '-threads 2'
      ])
      .output(outputPath.replace(/\.[^/.]+$/, '.opus'))
      .on('start', () => {
        console.log(`[AUDIO] Starting: ${path.basename(inputPath)}`)
        logToRenderer(`[AUDIO] Starting: ${path.basename(inputPath)}`)
      })
      .on('progress', (progress) => {
        if (progress.percent > progressTracker + 20) {
          // Audio conversion is fast so 20 is high enough to keep the console clean
          progressTracker = progress.percent
          console.log(`[AUDIO] ${path.basename(inputPath)}: ${Math.round(progress.percent)}%`)
          logToRenderer(`[AUDIO] ${path.basename(inputPath)}: ${Math.round(progress.percent)}%`)
        }
        sendToRenderer('LIVE_PROGRESS', inputPath, progress.percent)
      })
      .on('error', async (err) => {
        console.error('error occured', err)
        await handleStopAllFFMPEGProcesses()
        resetConversionCount() // To make sure the values don't persist into next conversion
        sendToRenderer('CONVERSION_ERROR', inputPath, err.message)
        reject(err)
      })
      .on('end', () => {
        sendToRenderer('LIVE_PROGRESS', inputPath, 100) // As mentioned above, this is only to update UI and NOT to track total progress
        alreadyConverted++ // One more file was successfully converted
        isConversionComplete() // Check if they are finally equal
        resolve()
      })
      .run()
  })
}

const convertVideo = async (inputPath: string, outputPath: string): Promise<void> => {
  let progressTracker: number = 0

  return new Promise((resolve, reject) => {
    const commonOptions = [
      '-c:v libaom-av1', // Video codec - AV1 encoder
      '-f mp4', // Force .mp4 container to assure wide compatability
      '-crf 22', // Constant Rate Factor - controls quality (lower = better)
      '-b:v 0', // Sets variable bitrate (VBR) mode by specifying 0 for the video bitrate. This lets the CRF value control quality instead of targeting a specific bitrate.
      '-cpu-used 4', // Encoding speed (0-8, higher = faster but lower quality)
      '-row-mt 1', // Enable row-based multithreading
      '-tile-columns 2', // Number of tile columns for parallelization
      '-tile-rows 2', // Number of tile rows for parallelization
      '-threads 4', // Number of threads to use for encoding
      '-aq-mode 2', // How the encoder distributes bits across different parts of each frame. AQ mode 2 is particularly sophisticated
      '-g 240', // Keyframe interval (in frames)
      '-vf scale=1920:1080:flags=lanczos' // Scale video to 1080p using Lanczos algorithm - Most advanced algorithm
    ]

    ffmpeg(inputPath)
      .videoCodec('libaom-av1')
      .outputOptions([...commonOptions, '-pass 1', '-f null'])
      .output('/dev/null')
      .on('start', () => {
        console.log(`[VIDEO] Starting: ${path.basename(inputPath)}`)
        logToRenderer(`[VIDEO] Starting: ${path.basename(inputPath)}`) // The starting log should be in the first pass so the user knows when the processing actually starts
      })
      .on('error', async (err) => {
        await handleStopAllFFMPEGProcesses()
        resetConversionCount() // To make sure the values don't persist into next conversion
        sendToRenderer('CONVERSION_ERROR', inputPath, err.message)
        reject(err)
      })
      .on('end', () => {
        console.log('[VIDEO] First pass completed')
        // This is the first pass there is no need to increment alreadyConverted here - that's before the errors

        ffmpeg(inputPath)
          .videoCodec('libaom-av1')
          .outputOptions([...commonOptions, '-pass 2'])
          .on('progress', (progress) => {
            if (progress.percent > progressTracker + 5) {
              // Video conversion is slower so I'd want more frequent updates
              progressTracker = progress.percent
              console.log(`[VIDEO] ${path.basename(inputPath)}: ${Math.round(progress.percent)}%`)
              logToRenderer(`[VIDEO] ${path.basename(inputPath)}: ${Math.round(progress.percent)}%`)
            }
            sendToRenderer('LIVE_PROGRESS', inputPath, progress.percent)
          })
          .on('error', async (err) => {
            await handleStopAllFFMPEGProcesses()
            resetConversionCount() // To make sure the values don't persist into next conversion
            sendToRenderer('CONVERSION_ERROR', inputPath, err.message)
            reject(err)
          })
          .on('end', () => {
            alreadyConverted++ // One more file was successfully converted
            isConversionComplete() // Check if they are finally equal
            sendToRenderer('LIVE_PROGRESS', inputPath, 100)
            resolve()
          })
          .save(outputPath)
      })
      .run()
  })
}

const convertImage = async (inputPath: string, outputPath: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const commonOptions = [
      '-c:v',
      'libaom-av1', // AV1 codec for any potential encoding tasks
      '-crf',
      '22', // Quality setting for compression
      '-cpu-used',
      '4', // Speed/efficiency tradeoff
      '-vf',
      'scale=1920:1080:flags=lanczos', // Resize image using Lanczos scaling
      '-f',
      'avif'
    ]

    ffmpeg(inputPath)
      .outputOptions(commonOptions)
      .on('start', () => {
        console.log(`[IMAGE] Starting: ${path.basename(inputPath)}`)
        logToRenderer(`[IMAGE] Starting: ${path.basename(inputPath)}`)
      })
      .on('error', async (err) => {
        await handleStopAllFFMPEGProcesses()
        resetConversionCount()
        sendToRenderer('CONVERSION_ERROR', inputPath, err.message)
        reject(err)
      })
      .on('end', () => {
        sendToRenderer('LIVE_PROGRESS', inputPath, 100)
        alreadyConverted++
        isConversionComplete()
        resolve()
      })
      .save(outputPath)
  })
}

export const getFFmpegPath = (): string => {
  const ffmpegPath = app.isPackaged
    ? path.join(process.resourcesPath, 'bin', 'ffmpeg.exe')
    : path.join(app.getAppPath(), 'resources', 'bin', 'ffmpeg.exe')

  return ffmpegPath
}

export const getFFprobePath = (): string => {
  const ffprobePath = app.isPackaged
    ? path.join(process.resourcesPath, 'bin', 'ffprobe.exe')
    : path.join(app.getAppPath(), 'resources', 'bin', 'ffprobe.exe')

  return ffprobePath
}
