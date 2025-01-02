import { ipcMain, IpcMainInvokeEvent, dialog } from 'electron'
import { ExecException } from 'child_process'
import { lstat, readdir } from 'fs/promises'
import path, { parse, join } from 'path'
import bytes from 'bytes'
import { getFolderSize } from 'go-get-folder-size'
import { DirItem } from '../types'
import { exec } from 'child_process'
import { promisify } from 'util'
import { isValidExt, getDuration } from './fileUtils'
import { convertExplorer } from './ffmpegUtils'

const execAsync = promisify(exec)
let isIpcInitialized = false

export default function ipc(): void {
  if (isIpcInitialized) {
    console.log('IPC handlers already initialized, skipping...')
    return
  }

  // Clean up any existing handlers
  try {
    ipcMain.removeHandler('SELECT_DIRS')
    ipcMain.removeHandler('GET_DETAILS')
    ipcMain.removeHandler('SELECT_OUTPUT_DIR')
    ipcMain.removeHandler('CONVERT_EXPLORER')
    ipcMain.removeHandler('IS_FFMPEG_ACTIVE')
    ipcMain.removeHandler('STOP_ALL_FFMPEG_PROCESSES')
  } catch (error) {
    // Ignore errors from removing non-existent handlers
  }

  // Register handlers
  ipcMain.handle('SELECT_DIRS', handleSelectDirs)
  ipcMain.handle('GET_DETAILS', handleGetDetails)
  ipcMain.handle('SELECT_OUTPUT_DIR', handleSelectOutputDir)
  ipcMain.handle('CONVERT_EXPLORER', handleConvertExplorer)
  ipcMain.handle('IS_FFMPEG_ACTIVE', handleIsFFMPEGActive)
  ipcMain.handle('STOP_ALL_FFMPEG_PROCESSES', handleStopAllFFMPEGProcesses)

  isIpcInitialized = true
  console.log('IPC handlers initialized successfully')
}

const handleGetDetails = async (
  _e: IpcMainInvokeEvent | null,
  pathsToDetail: string[]
): Promise<DirItem[]> => {
  const res = await Promise.allSettled<DirItem | undefined>(
    pathsToDetail.map(async (path: string) => {
      try {
        console.log('Processing path:', path)
        const stats = await lstat(path)

        if (stats.isDirectory()) {
          const childNames = await readdir(path)
          const children = await Promise.all(
            childNames.map(async (childName: string) => {
              return await handleGetDetails(null, [join(path, childName)])
            })
          )

          const detailedFolder: DirItem = {
            path,
            isExpanded: false,
            name: parse(path).base,
            type: 'folder',
            size: bytes(await getFolderSize(path)),
            children: children.flat() as DirItem[]
          }

          return detailedFolder
        }

        if (stats.isFile() && isValidExt(path)) {
          const pathExt = isValidExt(path)
          if (pathExt !== null) {
            const detailedFile: DirItem = {
              path,
              name: parse(path).base,
              type: 'file',
              ext: pathExt,
              size: bytes(stats.size),
              duration: ['video', 'audio'].includes(pathExt) ? await getDuration(path) : 'none'
            }
            return detailedFile
          }
        }

        return undefined
      } catch (err) {
        if (err instanceof Error) {
          console.error(`Error processing path ${path}:`, err)
          throw new Error(`Error processing path ${path}: ${err.message}`)
        }
        throw new Error(`Error processing path ${path}: Unknown error`)
      }
    })
  )

  const filteredRes = (items: PromiseSettledResult<DirItem | undefined>[]): DirItem[] => {
    return items.reduce((acc: DirItem[], item) => {
      if (item.status === 'fulfilled' && item.value !== undefined) {
        acc.push(item.value)
      }
      return acc
    }, [])
  }

  const result = filteredRes(res)
  console.log('Processing completed, found items:', result.length)
  return result
}

async function handleConvertExplorer(
  _e: IpcMainInvokeEvent,
  { explorer, outputDir }: { explorer: DirItem[]; outputDir: string }
): Promise<void> {
  const newOutputDir = path.join(outputDir, 'converted')
  console.log('Starting conversion to:', newOutputDir)
  await convertExplorer(explorer, newOutputDir)
}

async function handleSelectDirs(
  _e: IpcMainInvokeEvent,
  { type }: { type: string }
): Promise<DirItem[]> {
  console.log('Selection type:', type)
  const res = await dialog.showOpenDialog({
    properties:
      type === 'file' ? ['openFile', 'multiSelections'] : ['openDirectory', 'multiSelections']
  })

  if (res.canceled) {
    throw new Error('Selection cancelled by user')
  }

  const pathsToDetail = res.filePaths
  console.log('Selected paths:', pathsToDetail)
  const explorer = await handleGetDetails(null, pathsToDetail)
  return explorer
}

async function handleSelectOutputDir(_e: IpcMainInvokeEvent): Promise<string> {
  console.log('Selecting output directory')
  const res = await dialog.showOpenDialog({
    properties: ['openDirectory']
  })

  if (res.canceled) {
    throw new Error('Output directory selection cancelled')
  }

  console.log('Selected output directory:', res.filePaths[0])
  return res.filePaths[0]
}

async function handleIsFFMPEGActive(): Promise<boolean> {
  const command =
    process.platform === 'win32'
      ? 'tasklist | findstr "ffmpeg"'
      : 'ps aux | grep ffmpeg | grep -v grep'

  try {
    const { stdout } = await execAsync(command)
    return typeof stdout === 'string' && stdout.trim().length > 0
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code !== 1) {
      console.error('Error checking FFmpeg status:', error)
    }
    return false
  }
}

export async function handleStopAllFFMPEGProcesses(): Promise<string> {
  console.log('Stopping all FFmpeg processes')
  const command = process.platform === 'win32' ? 'taskkill /F /IM ffmpeg.exe' : 'pkill -9 ffmpeg'

  try {
    const { stdout, stderr } = await execAsync(command)

    if (stderr && !stderr.includes('not found')) {
      console.error('Error output:', stderr)
      throw new Error(stderr)
    }

    return stdout || 'No FFmpeg processes were running'
  } catch (error) {
    const execError = error as ExecException
    if (execError.message.includes('not found')) {
      return 'No FFmpeg processes were running'
    }
    console.error('Error stopping FFmpeg processes:', execError)
    throw execError
  }
}
