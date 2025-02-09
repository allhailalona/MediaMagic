/* eslint-disable prettier/prettier */
import path from 'path'
import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs/promises'
import os from 'os'
import { DirItem } from '../types'
import { sendToRenderer, logToRenderer } from './index'
import { handleStopAllFFMPEGProcesses } from './ipc'

const calculateThreads = (): number => {
  const totalThreads = os.cpus().length
  console.log('total threads are', Math.floor(totalThreads * 0.7))
  return Math.floor(totalThreads * 0.7) // 70%
}

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
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .audioCodec('libmp3lame')
      .audioBitrate('128k')
      .audioFrequency(44100)
      .outputOptions(['-threads 4', '-q:a 0'])
      .output(outputPath.replace(/\.[^/.]+$/, '.mp3'))
      .on('start', () => {
        console.log(`[AUDIO] Starting: ${path.basename(inputPath)}`)
        logToRenderer(`[AUDIO] Starting: ${path.basename(inputPath)}`)
      })
      .on('progress', (progress) => {
        console.log(`[AUDIO] ${path.basename(inputPath)}: ${Math.round(progress.percent)}%`)
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
    return new Promise((resolve, reject) => {
      const commonOptions = [
        '-c:v', 'libsvtav1',
        '-c:a', 'libmp3lame',
        '-b:a', '128k',
        '-ar', '44100',
        '-q:a', '0',
        '-crf', '22',
        '-b:v', '0',
        '-preset', '4',
        '-threads', calculateThreads().toString(),
        '-movflags', '+faststart',
        '-vf', 'scale=\'min(1920,iw):-2:flags=lanczos\''
      ];
      ffmpeg(inputPath)
        .outputOptions([...commonOptions, '-pass', '1', '-f', 'null'])
        .output('/dev/null')
        .on('start', () => {
          console.log(`[VIDEO] Starting: ${path.basename(inputPath)}`);
          logToRenderer(`[VIDEO] Starting: ${path.basename(inputPath)}`);
        })
        .on('error', async (err) => {
          await handleStopAllFFMPEGProcesses();
          resetConversionCount();
          sendToRenderer('CONVERSION_ERROR', inputPath, err.message);
          reject(err);
        })
        .on('end', () => {
          console.log('[VIDEO] First pass completed');

          ffmpeg(inputPath)
            .outputOptions([...commonOptions, '-pass', '2'])
            .on('start', () => {
            })
            .on('progress', (progress) => {
              console.log(`[VIDEO] ${path.basename(inputPath)}: ${Math.round(progress.percent)}%`);
              sendToRenderer('LIVE_PROGRESS', inputPath, progress.percent);
            })
            .on('error', async (err) => {
              await handleStopAllFFMPEGProcesses();
              resetConversionCount();
              sendToRenderer('CONVERSION_ERROR', inputPath, err.message);
              reject(err);
            })
            .on('end', () => {
              alreadyConverted++;
              isConversionComplete();
              sendToRenderer('LIVE_PROGRESS', inputPath, 100);
              resolve();
            })
            .save(outputPath.replace(/\.[^/.]+$/, '.mp4'));
        })
        .run();
    });
  }

  const convertImage = async (inputPath: string, outputPath: string): Promise<void> => {
    const avifOutputPath = outputPath.replace(/\.[^/.]+$/, '.avif');
    
    return new Promise((resolve, reject) => {
      const commonOptions = [
        '-c:v', 'libsvtav1',
        '-crf', '22',
        '-preset', '4',
        '-threads', calculateThreads().toString(),
        '-vf', 'scale=\'min(1920,iw):-2:flags=lanczos\'', 
        '-f', 'avif'
      ];
          
      ffmpeg(inputPath)
        .outputOptions(commonOptions)
        .on('start', () => {
          console.log(`[IMAGE] Starting: ${path.basename(inputPath)}`);
          logToRenderer(`[IMAGE] Starting: ${path.basename(inputPath)}`);
        })
        .on('error', async (err) => {
          await handleStopAllFFMPEGProcesses();
          resetConversionCount();
          sendToRenderer('CONVERSION_ERROR', inputPath, err.message);
          reject(err);
        })
        .on('end', () => {
          sendToRenderer('LIVE_PROGRESS', inputPath, 100);
          alreadyConverted++;
          isConversionComplete();
          resolve();
        })
        .save(avifOutputPath);
    });
  }
