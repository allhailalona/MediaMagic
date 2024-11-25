import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
// import ffmpeg from 'fluent-ffmpeg'
// import { getFFmpegPath, getFFprobePath } from './utils'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import ipc from './ipc'
import { handleStopAllFFMPEGProcesses } from './ipc'

console.log('Starting FFmpeg path setup...')
console.log('App is packaged?', app.isPackaged)
console.log('Current directory:', __dirname)

// Set FFmpeg and FFprobe paths globally
// try {
//   console.log('Getting FFmpeg path...')
//   const ffmpegPath = getFFmpegPath()
//   console.log('Setting FFmpeg path:', ffmpegPath)
//   ffmpeg.setFfmpegPath(ffmpegPath)

//   console.log('Getting FFprobe path...')
//   const ffprobePath = getFFprobePath()
//   console.log('Setting FFprobe path:', ffprobePath)
//   ffmpeg.setFfprobePath(ffprobePath)
// } catch (error) {
//   console.error('Error setting FFmpeg paths:', error)
// }

// Declare mainWindow as a global variable
let mainWindow: BrowserWindow | null = null

// This function serves the interval live progress reports of converting files
export function sendToRenderer(channel: string, ...args): void {
  console.log('sending to renderer', channel, ...args)
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args)
  }
}

function createWindow(): void {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.maximize() // Default full screen
  mainWindow.removeMenu() // Default remove top menu

  // Stop all FFMPEG processes on close listener 1
  mainWindow.on('close', async () => {
    await handleStopAllFFMPEGProcesses()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('before-input-event', (_, input) => {
    // Check for Ctrl+Shift+I combination
    if (input.control && input.shift && input.key.toLowerCase() === 'i') {
      mainWindow?.webContents.toggleDevTools()
    }
  })

  ipc()

  // HMR for renderer based on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Create window
  app.whenReady().then(() => {
    createWindow()

    console.log('Main process is ready!')
  })

  // Preserve the original console methods
  const originalConsoleLog = console.log
  const originalConsoleError = console.error

  // Function to log to renderer
  function logToRenderer(level: string, message: string): void {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('log', { level, message })
    }
  }

  // Override default console.log and console.error
  console.log = (msg: string, ...args: unknown[]) => {
    logToRenderer('log', [msg, ...args].join(' '))
    originalConsoleLog(msg, ...args) // Use the original log to avoid recursion
  }

  console.error = (msg: string, ...args: unknown[]) => {
    logToRenderer('error', [msg, ...args].join(' '))
    originalConsoleError(msg, ...args) // Use the original error to avoid recursion
  }

  // Stop all FFMPEG processes before app closes listener 2
  app.on('before-quit', async () => {
    await handleStopAllFFMPEGProcesses()
  })

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
