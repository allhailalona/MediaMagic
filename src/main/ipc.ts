import { ipcMain, IpcMainInvokeEvent, dialog } from 'electron'
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
  e: IpcMainInvokeEvent | null,
  pathsToDetail: string[]
): Promise<DirItem[]> => {
  const res = await Promise.allSettled(
    // 1. Check paths type - file/folder
    pathsToDetail.map(async (path: string) => {
      try {
        const stats = await lstat(path)
        if (stats.isDirectory()) {
          const childNames = await readdir(path) // Get children names
          // Recursively get children details
          const children = await Promise.all(
            childNames.map(async (childName: string) => {
              return await handleGetDetails(null, [join(path, childName)])
            })
          )

          const detailedFolder: DirItem = {
            path,
            isExpanded: false, // This one is for future rendering
            name: parse(path).base,
            type: 'folder',
            size: bytes(await getFolderSize(path)),
            children: children.flat()
          }

          return detailedFolder
        } else if (stats.isFile() && ['video', 'audio', 'image'].includes(isValidExt(path))) {
          // 2. Check if the file exension is media
          const pathExt = isValidExt(path)
          if (['video', 'audio', 'image'].includes(pathExt!)) {
            // 3. Construct a detailed file obj
            const name = parse(path)
            console.log('name is', name)

            const detailedFile: DirItem = {
              path,
              name: parse(path).base,
              type: 'file',
              ext: pathExt,
              size: bytes(stats.size),
              duration: ['video', 'audio'].includes(pathExt!) ? await getDuration(path) : 'none'
            }
            return detailedFile
          }
        }
      } catch (err) {
        throw new Error(`Error processing path ${path}: ${err.message}`)
      }
    })
  )

  const filteredRes = (items) => {
    return items.reduce((acc, item) => {
      if (item.status === 'fulfilled') {
        if (item.value) {
          acc.push(item.value)
        }
        // If no value, item is not added to acc (effectively deleted)
      } else {
        if (item.children && item.children.length > 0) {
          item.children = filteredRes(item.children)
        }
        acc.push(item)
      }
      return acc
    }, [])
  }

  // A logging tecnique, doesn't manipulate the object
  const getCircularReplacer = () => {
    const seen = new WeakSet()
    return (key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]'
        }
        seen.add(value)
      }
      return value
    }
  }

  console.log('explorer is', JSON.stringify(filteredRes(res), getCircularReplacer(), 2))
  return filteredRes(res)
}

async function handleConvertExplorer(
  e: IpcMainInvokeEvent,
  { explorer, outputDir }: { explorer: DirItem[]; outputDir: string }
): Promise<void> {
  const newOutputDir = path.join(outputDir, 'converted') // Create 'Converted' folder in output dir
  await convertExplorer(explorer, newOutputDir)
}

async function handleSelectDirs(
  e: IpcMainInvokeEvent,
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

async function handleSelectOutputDir(e: IpcMainInvokeEvent): Promise<string> {
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

async function handleIsFFMPEGActive(): Promise<boolean> {
  const command =
    process.platform === 'win32'
      ? 'tasklist | findstr "ffmpeg"'
      : 'ps aux | grep ffmpeg | grep -v grep'

  try {
    const { stdout } = await execAsync(command)
    return typeof stdout === 'string' && stdout.trim().length > 0
  } catch (error) {
    if (error.code !== 1) {
      console.error('Error checking FFMPEG:', error)
    }
    return false
  }
}

async function handleStopAllFFMPEGProcesses(): Promise<void> {
  const command = process.platform === 'win32' ? 'taskkill /F /IM ffmpeg.exe' : 'pkill -9 ffmpeg'

  try {
    const { stdout, stderr } = await execAsync(command)

    if (stderr) {
      console.error(`Stderr: ${stderr}`)
      throw new Error(stderr)
    }

    console.log(`FFmpeg processes terminated: ${stdout}`)
    return stdout
  } catch (error) {
    console.error(`Error stopping FFmpeg processes: ${error.message}`)
    throw error
  }
}
