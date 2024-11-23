import { useState, useEffect } from 'react'
import { cloneDeep } from 'lodash'
import { useExplorer } from '../ExplorerContext'
import { Button, Input, Progress } from 'antd'
import {
  showSelectedFilesNotification,
  showConversionSuccessNotification,
  showConversionStoppedNotification
} from '../Notifications'

export default function ActionPane(): JSX.Element {
  const [outputDir, setOutputDir] = useState<string>('C:\\Users\\user\\Desktop')

  const { explorer, setExplorer, convertClicked, setConvertClicked } = useExplorer()

  const handleSelectOutputDir = async (): Promise<void> => {
    const res = await window.electron.ipcRenderer.invoke('SELECT_OUTPUT_DIR')
    setOutputDir(res)
  }

  const handleConvertExplorer = async (): Promise<void> => {
    // Clone explorer
    if (explorer.length > 0 && outputDir.length > 0) {
      setConvertClicked(true)
      const clonedExplorer = cloneDeep(explorer) // Properly cloning the explorer
      const props = { explorer: clonedExplorer, outputDir } // Create props object with cloned explorer
      console.log('sending', props)
      await window.electron.ipcRenderer.invoke('CONVERT_EXPLORER', props)
    } else {
      showSelectedFilesNotification()
    }
  }

  // Check if any FFMPEG process is running
  const isFFMPEGActive = async (): Promise<boolean> => {
    return await window.electron.ipcRenderer.invoke('IS_FFMPEG_ACTIVE')
  }

  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null

    if (convertClicked) {
      intervalId = setInterval(async () => {
        const status = await isFFMPEGActive()
        if (!status) {
          setConvertClicked(false)
          showConversionSuccessNotification()
          setExplorer([]) // Clear All
        }
      }, 1000)
    }

    return () => {
      if (intervalId) clearInterval(intervalId)
    }
  }, [convertClicked, setConvertClicked])

  const stopAllFFmpegProcesses = async (): Promise<void> => {
    await window.electron.ipcRenderer.invoke('STOP_ALL_FFMPEG_PROCESSES')
    setConvertClicked(false)
    showConversionStoppedNotification()
  }

  return (
    <>
      {convertClicked ? (
        <div className="w-full h-[7%] px-3 bg-gray-900 flex flex-row justify-between items-center">
          <Progress
            percent={100}
            status="active"
            showInfo={false}
            strokeWidth={24} // This controls the thickness
            strokeColor={{
              '0%': '#108ee9',
              '100%': '#87d068'
            }}
            style={{ width: '92%' }} // Control the width this way
          />
          <Button
            type="primary"
            danger
            size="large"
            onClick={stopAllFFmpegProcesses}
            className="bg-red-500, border-white flex justify-center items-center h-[40px] w-[5%] font-bold"
          >
            Stop
          </Button>
        </div>
      ) : (
        <div className="w-full h-[7%] pb-2 px-3 bg-gray-900 flex justify-between items-center">
          <div className="flex flex-row items-center gap-4">
            <Button
              onClick={() => {
                setExplorer([])
                setOutputDir('')
              }}
              className="bg-red-600 transition-colors duration-500 text-white text-lg font-bold px-5 py-4 rounded"
            >
              Clear All
            </Button>
            <div className="flex flex-row rounded overflow-hidden">
              <Button
                onClick={handleSelectOutputDir}
                className="bg-yellow-600 transition-colors duration-500 text-white text-lg font-bold px-5 py-4 rounded-none"
              >
                Output
              </Button>
              <div
                className={`transition-all duration-500 ease-in-out overflow-hidden ${outputDir.length > 0 ? 'w-[400px]' : 'w-0'}`}
              >
                <Input
                  placeholder="Select Output"
                  className="h-full rounded-none font-bold text-lg"
                  value={outputDir}
                />
              </div>
            </div>
          </div>
          <Button
            onClick={handleConvertExplorer}
            className="bg-green-600 transition-colors duration-500 text-white text-lg font-bold px-5 py-4"
          >
            Convert
          </Button>
        </div>
      )}
    </>
  )
}
