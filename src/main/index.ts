import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import ipc from './ipc'
import { handleStopAllFFMPEGProcesses } from './ipc'

// Global state
let ipcInitialized = false
let mainWindow: BrowserWindow | null = null

// Renderer communication
export function sendToRenderer(channel: string, ...args): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      mainWindow.webContents.send(channel, ...args)
      console.log('sending to renderer', channel, ...args)
    } catch (error) {
      console.error('Error sending to renderer:', error)
    }
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.maximize()
  mainWindow.removeMenu()

  // Clean up FFmpeg processes on window close
  mainWindow.on('close', async () => {
    try {
      await handleStopAllFFMPEGProcesses()
    } catch (error) {
      if (error instanceof Error && !error.message.includes('not found')) {
        console.error('Error stopping FFmpeg processes:', error)
      }
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('before-input-event', (_, input) => {
    if (input.control && input.shift && input.key.toLowerCase() === 'i') {
      mainWindow?.webContents.toggleDevTools()
    }
  })

  // Load application
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// App initialization
app
  .whenReady()
  .then(() => {
    electronApp.setAppUserModelId('com.electron')

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    // Initialize IPC handlers once
    if (!ipcInitialized) {
      ipc()
      ipcInitialized = true
    }

    createWindow()
    console.log('Main process is ready!')

    // Set up logging
    const originalConsoleLog = console.log
    const originalConsoleError = console.error

    function logToRenderer(level: string, message: string): void {
      if (mainWindow && !mainWindow.isDestroyed()) {
        try {
          mainWindow.webContents.send('log', { level, message })
        } catch (error) {
          originalConsoleError('Error in logToRenderer:', error)
        }
      }
    }

    // Console overrides with error handling
    console.log = (msg: string, ...args: unknown[]) => {
      originalConsoleLog(msg, ...args)
      try {
        logToRenderer('log', [msg, ...args].join(' '))
      } catch (error) {
        originalConsoleError('Error in console.log override:', error)
      }
    }

    console.error = (msg: string, ...args: unknown[]) => {
      originalConsoleError(msg, ...args)
      try {
        logToRenderer('error', [msg, ...args].join(' '))
      } catch (error) {
        originalConsoleError('Error in console.error override:', error)
      }
    }

    // Clean up FFmpeg processes before quit
    app.on('before-quit', async () => {
      try {
        await handleStopAllFFMPEGProcesses()
      } catch (error) {
        if (error instanceof Error && !error.message.includes('not found')) {
          console.error('Error stopping FFmpeg processes:', error)
        }
      }
    })

    // Handle macOS activation
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })
  })
  .catch((error) => {
    console.error('Error during app initialization:', error)
  })

// Handle window closure
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
