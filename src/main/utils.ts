import path from 'path'
import { app } from 'electron'
import { sendToRenderer } from './index'
import { setInterval } from 'timers'
import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs/promises'
import { getVideoDurationInSeconds } from 'get-video-duration'
import { DirItem, ext } from '../types'

export function isValidExt(filePath: string): ext {
  // Define validExt with explicit key typing
  const validExt = {
    video: ['mp4', 'mkv', 'mov', 'avi', 'webm'],
    audio: ['mp3', 'wav', 'flac', 'ogg', 'opus'],
    image: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'tif', 'tiff']
  } as const // Make it readonly

  const ext = path.extname(filePath).toLowerCase().slice(1)

  // Use type assertion for Object.entries to ensure correct types
  for (const [group, extensions] of Object.entries(validExt) as [ext, readonly string[]][]) {
    if (extensions.includes(ext)) {
      return group
    }
  }

  return null
}

export async function getDuration(filePath: string): Promise<string> {
  try {
    const seconds = await getVideoDurationInSeconds(filePath)

    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const remainingSeconds = Math.floor(seconds % 60)

    const duration = [hours, minutes, remainingSeconds]
      .map((v) => v.toString().padStart(2, '0'))
      .join(':')

    return duration
  } catch (err) {
    console.error('err in getDuration in utils.ts', err)
    throw err
  }
}

export async function convertExplorer(explorer: DirItem[], outputDir: string): Promise<void> {
  console.log('Starting conversion process', explorer, outputDir)
  // Create 'Converted' folder in
  await fs.mkdir(outputDir, { recursive: true })

  await Promise.allSettled(
    explorer.map(async (dir: DirItem) => {
      if (dir.type === 'folder') {
        const childOutputDir = path.join(outputDir, dir.name)
        await fs.mkdir(childOutputDir, { recursive: true }) // Create folder with child's name in output dir 'Converted'
        await convertExplorer(dir.children!, childOutputDir)
      } else {
        const fileOutputDir = path.join(outputDir, dir.name)
        // 3 Function to handle all extensions - input path (what to convert), and output path (where to convert), for each function
        console.log(`Starting conversion of ${dir.path}`)
        switch (dir.ext) {
          case 'audio':
            console.log('converting audio')
            await convertAudio(dir.path, fileOutputDir)
            break
          case 'video':
            console.log('converting video')
            await convertVideo(dir.path, fileOutputDir)
            break
          case 'image':
            console.log('converting image')
            await convertImage(dir.path, fileOutputDir)
            break
        }
      }
    })
  )
}

async function convertAudio(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let latestProgress = 0

    console.log('Starting audio conversion for:', inputPath)

    const progressInterval = setInterval(() => {
      sendToRenderer('LIVE_PROGRESS', inputPath, latestProgress)
    }, 500)

    ffmpeg(inputPath)
      .audioCodec('libopus')
      .audioBitrate('64k')        // Changed from 256k to 64k
      .audioChannels(1)           // Changed from 2 to 1 (mono)
      .outputOptions([
        '-ar 24000',              // Added 24kHz sample rate
        '-vbr on',
        '-compression_level 10',
        '-frame_duration 60',
        '-packet_loss 3',
        '-mapping_family 1',
        '-threads 0.9' // Use 90% of PC resources
      ])
      .output(outputPath.replace(/\.[^/.]+$/, '.opus'))
      .on('start', (commandLine) => {
        console.log('Spawned FFmpeg with command: ' + commandLine)
      })
      .on('progress', (progress) => {
        latestProgress = progress.percent
        console.log('Progress update:', inputPath, latestProgress)
      })
      .on('stderr', (stderrLine) => {
        console.log(`FFmpeg stderr: ${stderrLine}`)
      })
      .on('error', (err, stdout, stderr) => {
        clearInterval(progressInterval)
        console.error('Error:', err.message)
        console.error('FFmpeg stdout:', stdout)
        console.error('FFmpeg stderr:', stderr)
        sendToRenderer('CONVERSION_ERROR', inputPath, err.message)
        reject(err)
      })
      .on('end', () => {
        console.log('completed conversion of ', inputPath)
        clearInterval(progressInterval)
        latestProgress = 100
        sendToRenderer('LIVE_PROGRESS', inputPath, latestProgress)
        resolve()
      })
      .run()
  })
}

async function convertVideo(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let latestProgress = 0

    // Send prgoress report to front every 0.5 secs
    const progressInterval = setInterval(() => {
      sendToRenderer('LIVE_PROGRESS', inputPath, latestProgress)
    }, 500)

    // Common encoding options for both passes`
    const commonOptions = [
      '-c:v libaom-av1', // Use AV1 codec (libaom implementation)
      '-crf 22', // Constant Rate Factor: balance between quality and file size (lower = higher quality, larger file)
      '-b:v 0', // Disable bitrate targeting, let CRF control quality
      '-cpu-used 4', // CPU usage preset: 0 (slowest/best) to 8 (fastest/worst), 4 is a good balance
      '-row-mt 1', // Enable row-based multithreading for better CPU utilization
      '-tile-columns 2', // Split frame into 4 columns for parallel processing
      '-tile-rows 2', // Split frame into 4 rows for parallel processing
      '-threads 0', // Use all available CPU threads
      '-aq-mode 2', // Adaptive quantization mode: 2 is generally best for AV1
      '-g 240' // Keyframe interval: 240 frames (assuming 30fps, this is 8 seconds)
    ]

    // First pass: analyze video content
    ffmpeg(inputPath)
      .videoCodec('libaom-av1')
      .outputOptions([...commonOptions, '-pass 1', '-f null'])
      .output('/dev/null') // Discard output, we only need the analysis
      .on('error', (err) => {
        clearInterval(progressInterval)
        sendToRenderer('CONVERSION_ERROR', inputPath, err.message)
        reject(err)
      })
      .on('end', () => {
        console.log('First pass completed')

        // Second pass: actual encoding using the analysis from first pass
        ffmpeg(inputPath)
          .videoCodec('libaom-av1')
          .outputOptions([...commonOptions, '-pass 2'])
          .audioCodec('libopus') // Use Opus codec for audio (high quality, low bitrate)
          .audioChannels(2) // Stereo audio
          .outputOptions(['-b:a 256k']) // Set audio bitrate to 256kbps for high quality
          .on('progress', (progress) => {
            latestProgress = progress.percent
            console.log('Progress update:', inputPath, latestProgress)
          })
          .on('error', (err) => {
            clearInterval(progressInterval)
            sendToRenderer('CONVERSION_ERROR', inputPath, err.message)
            reject(err)
          })
          .on('end', () => {
            clearInterval(progressInterval)
            latestProgress = 100
            sendToRenderer('LIVE_PROGRESS', inputPath, latestProgress)
            resolve()
          })
          .save(outputPath)
      })
      .run()
  })
}

async function convertImage(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let latestProgress = 0
    sendToRenderer('LIVE_PROGRESS', inputPath, latestProgress)

    // Send live progress reports at 0.5s intervals
    const progressInterval = setInterval(() => {
      sendToRenderer('LIVE_PROGRESS', inputPath, latestProgress)
    }, 500)

    // AVIF encoding options
    const avifOptions = [
      '-c:v libaom-av1', // Use AV1 codec for AVIF encoding
      '-crf 23', // Constant Rate Factor: balance between quality and file size
      '-b:v 0', // Disable bitrate targeting, let CRF control quality
      '-cpu-used 2', // CPU usage preset: 0 (slowest/best) to 8 (fastest/worst)
      '-row-mt 1', // Enable row-based multithreading for better CPU utilization
      '-tile-columns 2', // Split image into 4 columns for parallel processing
      '-tile-rows 2', // Split image into 4 rows for parallel processing
      '-threads 0', // Use all available CPU threads
      '-strict experimental' // Allow use of experimental codecs/features
    ]

    ffmpeg(inputPath)
      .outputOptions(avifOptions)
      .toFormat('avif') // Specify output format as AVIF
      .on('error', (err) => {
        clearInterval(progressInterval)
        sendToRenderer('CONVERSION_ERROR', inputPath, err.message)
        reject(err)
      })
      .on('end', () => {
        clearInterval(progressInterval)
        latestProgress = 100
        sendToRenderer('LIVE_PROGRESS', inputPath, latestProgress)
        resolve()
      })
      .save(outputPath)
  })
}

export const getFFmpegPath = () => {
  console.log('hello from getFFmpeg path')
  const ffmpegPath = app.isPackaged
    ? path.join(process.resourcesPath, 'bin', 'ffmpeg.exe')
    : path.join(app.getAppPath(), 'resources', 'bin', 'ffmpeg.exe');
    
  console.log('FFmpeg Path:', {
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    appPath: app.getAppPath(),
    finalPath: ffmpegPath
  });
  
  return ffmpegPath;
};

export const getFFprobePath = () => {
  console.log('hello from getFFprobePath')
  const ffprobePath = app.isPackaged
    ? path.join(process.resourcesPath, 'bin', 'ffprobe.exe')
    : path.join(app.getAppPath(), 'resources', 'bin', 'ffprobe.exe');
    
  console.log('FFprobe Path:', {
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    appPath: app.getAppPath(),
    finalPath: ffprobePath
  });
  
  return ffprobePath;
};
