import { ipcMain, IpcMainInvokeEvent, dialog } from 'electron'
import { ExecException } from 'child_process'
import { lstat, readdir } from 'fs/promises'
import { isValidExt, getDuration, convertExplorer } from './utils'
import path, { parse, join } from 'path'
import bytes from 'bytes'
import { getFolderSize } from 'go-get-folder-size'
import { DirItem } from '../types'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export default function ipc(): void {
  ipcMain.handle('SELECT_DIRS', handleSelectDirs)
  ipcMain.handle('GET_DETAILS', handleGetDetails)
  ipcMain.handle('SELECT_OUTPUT_DIR', handleSelectOutputDir)
  ipcMain.handle('CONVERT_EXPLORER', handleConvertExplorer)
  ipcMain.handle('IS_FFMPEG_ACTIVE', handleIsFFMPEGActive)
  ipcMain.handle('STOP_ALL_FFMPEG_PROCESSES', handleStopAllFFMPEGProcesses)
}

// Accept event and object if the func was called via dnd in front, or pathsToDetail if it was called via handleSelectDir
const handleGetDetails = async (
  _e: IpcMainInvokeEvent | null,
  pathsToDetail: string[]
): Promise<DirItem[]> => {
  const res = await Promise.allSettled<DirItem | undefined>(
    // 1. Check paths type - file/folder
    pathsToDetail.map(async (path: string) => {
      try {
        console.log('about to detail files')
        const stats = await lstat(path)
        if (stats.isDirectory()) {
          const childNames = await readdir(path) // Get children names
          // Recursively get children details
          const children = await Promise.all(
            childNames.map(async (childName: string) => {
              return await handleGetDetails(null, [join(path, childName)])
            })
          )

          // Ensure children property is properly typed in return value
          const detailedFolder: DirItem = {
            path,
            isExpanded: false,
            name: parse(path).base,
            type: 'folder',
            size: bytes(await getFolderSize(path)),
            children: children.flat() as DirItem[] // Explicitly type the flattened array
          }

          return detailedFolder
        } else if (stats.isFile() && isValidExt(path)) {
          const pathExt = isValidExt(path)
          if (pathExt !== null) {
            // Add null check
            const detailedFile: DirItem = {
              path,
              name: parse(path).base,
              type: 'file',
              ext: pathExt, // Now pathExt is guaranteed to be 'video' | 'audio' | 'image'
              size: bytes(stats.size),
              duration: ['video', 'audio'].includes(pathExt) ? await getDuration(path) : 'none'
            }
            return detailedFile
          }
        }

        return undefined
      } catch (err: unknown) {
        // Type guard to check if err is an Error object
        if (err instanceof Error) {
          throw new Error(`Error processing path ${path}: ${err.message}`)
        }
        // Handle non-Error objects
        throw new Error(`Error processing path ${path}: Unknown error`)
      }
    })
  )

  const getCircularReplacer = () => {
    const seen = new WeakSet()
    return (_key: string, value: unknown): unknown => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]'
        }
        seen.add(value)
      }
      return value
    }
  }

  // Helper function to filter and type-check settled promises
  const filteredRes = (items: PromiseSettledResult<DirItem | undefined>[]): DirItem[] => {
    return items.reduce((acc: DirItem[], item) => {
      if (item.status === 'fulfilled' && item.value !== undefined) {
        acc.push(item.value)
      }
      return acc
    }, [])
  }

  console.log('explorer is', JSON.stringify(filteredRes(res), getCircularReplacer(), 2))
  return filteredRes(res)
}

async function handleConvertExplorer(
  _e: IpcMainInvokeEvent,
  { explorer, outputDir }: { explorer: DirItem[]; outputDir: string }
): Promise<void> {
  const newOutputDir = path.join(outputDir, 'converted') // Create 'Converted' folder in output dir
  await convertExplorer(explorer, newOutputDir)
}

async function handleSelectDirs(
  _e: IpcMainInvokeEvent,
  { type }: { type: string }
): Promise<DirItem[]> {
  console.log('type is', type)
  const res = await dialog.showOpenDialog({
    properties:
      type === 'file' ? ['openFile', 'multiSelections'] : ['openDirectory', 'multiSelections']
  })

  if (res.canceled) {
    throw new Error('err in handleSelectDir in ipc.ts')
  } else {
    // Standardize function
    const pathsToDetail = res.filePaths
    const explorer = await handleGetDetails(null, pathsToDetail)

    return explorer
  }
}

async function handleSelectOutputDir(_e: IpcMainInvokeEvent): Promise<string> {
  console.log('select output dir')
  const res = await dialog.showOpenDialog({
    properties: ['openDirectory']
  })
  if (res.canceled) {
    throw new Error('err in handleSelectDir in ipc.ts')
  } else {
    console.log('selected res is', res)
    return res.filePaths[0]
  }
}

// Check if any FFMPEG processes are currently running
async function handleIsFFMPEGActive(): Promise<boolean> {
  const command =
    process.platform === 'win32'
      ? 'tasklist | findstr "ffmpeg"'
      : 'ps aux | grep ffmpeg | grep -v grep'

  try {
    const { stdout } = await execAsync(command)
    return typeof stdout === 'string' && stdout.trim().length > 0
  } catch (error: unknown) {
    // Type guard to check if error is an object with a code property
    if (error && typeof error === 'object' && 'code' in error && error.code !== 1) {
      console.error('Error checking FFMPEG:', error)
    }
    return false
  }
}

export async function handleStopAllFFMPEGProcesses(): Promise<string> {
  console.log('killing all FFMPEG processes')

  // Command based on platform
  const command = process.platform === 'win32' ? 'taskkill /F /IM ffmpeg.exe' : 'pkill -9 ffmpeg'

  try {
    const { stdout, stderr } = await execAsync(command)

    if (stderr) {
      console.error(`Stderr: ${stderr}`)
      throw new Error(stderr)
    }

    console.log(`FFmpeg processes terminated: ${stdout}`)
    return stdout
  } catch (error: unknown) {
    // Type guard to handle ExecException specifically
    const execError = error as ExecException
    console.error(`Error stopping FFmpeg processes: ${execError.message}`)
    throw execError
  }
}
