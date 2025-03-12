/* eslint-disable prettier/prettier */
import path from 'path'
import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs/promises'
import os from 'os'
import { DirItem, ConversionQueue } from '../types'
import { sendToRenderer, logToRenderer } from './index'
import { handleStopAllFFMPEGProcesses } from './ipc'

// More aggressive thread allocation
const calculateThreads = (mediaType: 'audio' | 'video' | 'image'): number => {
  const totalThreads = os.cpus().length;
  
  switch(mediaType) {
    case 'audio':
      return Math.max(2, Math.floor(totalThreads * 0.35)); // Up from 0.25
    case 'video':
      return Math.max(3, Math.floor(totalThreads * 0.75)); // Up from 0.6
    case 'image':
      return Math.max(2, Math.floor(totalThreads * 0.5));  // Up from 0.4
  }
}

// More concurrent processes
const MAX_CONCURRENT = Math.max(2, Math.min(8, Math.floor(os.cpus().length / 2.5)));
let parentOutputDir: string
let activeConversions = 0;
const conversionQueue: ConversionQueue[] = []

export const convertExplorer = async (explorer: DirItem[], outputDir: string): Promise<void> => {
  parentOutputDir = outputDir;
  await fs.mkdir(outputDir, { recursive: true });
  
  // First pass: build queue without starting conversions
  const buildQueue = async (items: DirItem[], currentDir: string): Promise<void> => {
    for (const dir of items) {
      if (dir.type === 'folder') {
        const childDir = path.join(currentDir, dir.name);
        await fs.mkdir(childDir, { recursive: true });
        if (dir.children) {
          await buildQueue(dir.children, childDir);
        }
      } else {
        const fileOutputDir = path.join(currentDir, dir.name);
        // Add to queue instead of converting immediately
        conversionQueue.push({
          type: dir.ext,
          inputPath: dir.path,
          outputPath: fileOutputDir
        });
      }
    }
  };
  
  await buildQueue(explorer, outputDir);
  
  // Start processing with controlled concurrency
  for (let i = 0; i < MAX_CONCURRENT; i++) { // Run loop only set amount of times to assure a constant amount of workers
    processNextInQueue();
  }
};

// New function to process queue items
const processNextInQueue = async (): Promise<void> => {
  // STEP 1: Check if queue is empty
  if (conversionQueue.length === 0) {
    // No more items to process
    if (activeConversions === 0) {
      // Everything is done, notify completion
      console.log('Conversion is complete!')
      sendToRenderer('CONVERSION_COMPLETE')
    }
    return;
  }
  
  // STEP 2: Check if we're at capacity - for end cases
  if (activeConversions >= MAX_CONCURRENT) {
    // Already at maximum concurrent conversions
    return;
  }
  
  // STEP 3: Get next file and start processing
  const item = conversionQueue.shift();
  // Add this check to handle undefined
  if (!item) {
    return;
  }

  activeConversions++;
  
  try {
    // STEP 4: Convert the file
    switch (item.type) {
      case 'audio':
        await convertAudio(item.inputPath, item.outputPath);
        break;
      case 'video':
        await convertVideo(item.inputPath, item.outputPath);
        break;
      case 'image':
        await convertImage(item.inputPath, item.outputPath);
        break;
    }
  } catch (err) {
    // There is no reject for conversion functions since errors are handled by ffmpeg
  } finally {
    // STEP 5: Update counters
    activeConversions--;
    
    // STEP 6: Process next item
    processNextInQueue();
  }
};

const convertAudio = async (inputPath: string, outputPath: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .audioCodec('libmp3lame')
      .audioBitrate('128k')
      .audioChannels(1)
      .audioFrequency(44100)
      .outputOptions([`-threads ${calculateThreads('audio')}`, '-q:a 0'])
      .output(outputPath.replace(/\.[^/.]+$/, '.mp3'))
      .on('start', () => {
        console.log(`[AUDIO] Starting: ${path.basename(inputPath)}`)
        logToRenderer(`[AUDIO] Starting: ${path.basename(inputPath)}`)
      })
      .on('progress', (progress) => {
        if (typeof progress.percent === "number" && !isNaN(progress.percent)) {
          logToRenderer(`[AUDIO] ${path.basename(inputPath)}: ${progress.percent}%`)
          sendToRenderer('LIVE_PROGRESS', inputPath, progress.percent)
        } else {
          console.log('progress percent is not a number')
        }
      })
      .on('error', async (err) => {
        console.error('error occured', err)
        await handleStopAllFFMPEGProcesses(parentOutputDir)
        sendToRenderer('CONVERSION_ERROR', inputPath, err.message)
        reject(err)
      })
      .on('end', () => {
        sendToRenderer('LIVE_PROGRESS', inputPath, 100) // As mentioned above, this is only to update UI and NOT to track total progress
        resolve()
      })
      .run()
  })
}

const convertVideo = async (inputPath: string, outputPath: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    // SVT-AV1 specific parameters
    const svtParams = [
      'tune=1',           // Optimize for PSNR (mathematical quality)
      'enable-overlays=1',// Enable overlapping blocks for better compression
      'enable-qm=1',      // Enable quantization matrices for better visual quality
      'rc=1'              // Variable bitrate mode for optimal size/quality balance
    ].join(':')

    const commonOptions = [
      // Video codec and settings
      '-c:v', 'libsvtav1',      // AV1 codec - excellent compression
      '-crf', '22',             // Constant Rate Factor - balance of quality/size
      '-b:v', '0',              // Let CRF control bitrate
      '-preset', '4',           // Encoding speed preset (0=slowest/best, 8=fastest)
      '-pix_fmt', 'yuv420p10le',// 10-bit color depth prevents banding
      '-g', '240',              // Keyframe interval - improves seeking and compression

      '-svtav1-params', svtParams,  // SVT-AV1 specific parameters

      // Audio codec and settings
      '-c:a', 'libmp3lame',     // MP3 audio codec
      '-b:a', '128k',           // Audio bitrate
      '-ar', '44100',           // Audio sample rate (CD quality) 
      '-q:a', '0',              // Best quality for VBR audio
      '-ac', '1',               // Mono audio (saves space)

      // Performance and compatibility settings
      '-threads', calculateThreads('video').toString(), // Optimize CPU usage
      '-movflags', '+faststart', // Optimize for web playback (streams before fully downloaded) 
      
      // Video processing
      '-vf', "scale='min(1920,iw):-2:flags=lanczos'" // Resize to max 1080p with high-quality scaling
    ]
    
    ffmpeg(inputPath)
      .outputOptions([...commonOptions, '-pass', '1', '-f', 'null'])
      .output('/dev/null')
      .on('start', () => {
        console.log(`[VIDEO] Starting: ${path.basename(inputPath)}`)
        logToRenderer(`[VIDEO] Starting: ${path.basename(inputPath)}`)
      })
      .on('error', async (err) => {
        await handleStopAllFFMPEGProcesses(parentOutputDir)
        sendToRenderer('CONVERSION_ERROR', inputPath, err.message)
        reject(err)
      })
      // .on('stderr', (stderrLine) => {
      //   console.log(`[VIDEO-STDERR] ${stderrLine}`)
      // })
      .on('end', () => {
        console.log('[VIDEO] First pass completed')

        ffmpeg(inputPath)
          .outputOptions([...commonOptions, '-pass', '2'])
          .on('start', () => {})
          .on('progress', (progress) => {
            if (typeof progress.percent === "number" && !isNaN(progress.percent)) {
              logToRenderer(`[VIDEO] ${path.basename(inputPath)}: ${progress.percent}%`)
              sendToRenderer('LIVE_PROGRESS', inputPath, progress.percent)
            } else {
              console.log('progress percent is not a number')
            }
          })
          .on('error', async (err) => {
            await handleStopAllFFMPEGProcesses(parentOutputDir)
            sendToRenderer('CONVERSION_ERROR', inputPath, err.message)
            reject(err)
          })
          .on('end', () => {
            sendToRenderer('LIVE_PROGRESS', inputPath, 100)
            resolve()
          })
          .save(outputPath.replace(/\.[^/.]+$/, '.mp4'))
      })
      .run()
  })
}

const convertImage = async (inputPath: string, outputPath: string): Promise<void> => {
  const avifOutputPath = outputPath.replace(/\.[^/.]+$/, '.avif')

  return new Promise((resolve, reject) => {
    const commonOptions = [
      // Codec and quality settings
      '-c:v', 'libsvtav1',      // AV1 codec - excellent for image compression
      '-crf', '22',             // Quality level - balanced setting
      '-preset', '4',           // Encoding speed/efficiency tradeoff
      '-pix_fmt', 'yuv420p10le',// 10-bit color depth prevents banding
      '-color_range', '1',      // Full color range for better image quality
      
      // Performance and output settings
      '-threads', calculateThreads('image').toString(), // Optimize CPU usage
      '-vf', "scale='min(1920,iw):-2:flags=lanczos'",  // Resize to max 1080p with high-quality scaling
      '-f', 'avif'              // Output format - modern efficient image format
    ]

    ffmpeg(inputPath)
      .outputOptions([...commonOptions, '-pass', '1', '-f', 'null'])
      .output('/dev/null')
      .on('start', () => {
        console.log(`[IMAGE] Starting: ${path.basename(inputPath)}`)
        logToRenderer(`[IMAGE] Starting: ${path.basename(inputPath)}`)
      })
      // .on('stderr', (stderrLine) => {
      //   console.log(`[IMAGE-STDERR] ${stderrLine}`)
      // })
      .on('error', async (err) => {
        await handleStopAllFFMPEGProcesses(parentOutputDir)
        sendToRenderer('CONVERSION_ERROR', inputPath, err.message)
        reject(err)
      })
      .on('end', () => {
        console.log('[IMAGE] First pass completed')

        ffmpeg(inputPath)
          .outputOptions([...commonOptions, '-pass', '2'])
          .on('error', async (err) => {
            await handleStopAllFFMPEGProcesses(parentOutputDir)
            sendToRenderer('CONVERSION_ERROR', inputPath, err.message)
            reject(err)
          })
          .on('end', () => {
            sendToRenderer('LIVE_PROGRESS', inputPath, 100)
            resolve()
          })
          .save(avifOutputPath)
      })
      .run()
  })
}
