import { useState, Fragment, useEffect } from 'react'
import { Button } from 'antd'
import { DirItem } from '../../../types'
import { FaTrash, FaChevronDown, FaChevronRight } from 'react-icons/fa'
import { showConversionErrorNotification } from '../Notifications'
import { useExplorer } from '../ExplorerContext'
import { IpcRendererEvent } from 'electron'
import ProgressIndicator from './ProgressIndicator'

export default function FileView(): JSX.Element {
  const [dragOverScreen, setDragOverScreen] = useState<boolean>(false)

  const { explorer, setExplorer, expandFolder, deleteItem, convertClicked } = useExplorer()

  const updateItemProgress = (items: DirItem[], path: string, progress: number): DirItem[] => {
    return items.map((item) => {
      if (item.path === path) {
        return { ...item, progress }
      } else if (item.children) {
        return {
          ...item,
          children: updateItemProgress(item.children, path, progress)
        }
      }
      return item
    })
  }

  useEffect(() => {
    const handleProgressUpdate = (
      _event: IpcRendererEvent,
      inputPath: string,
      latestProgress: number
    ): void => {
      setExplorer((prevExplorer) => updateItemProgress(prevExplorer, inputPath, latestProgress))
    }

    const handleConversionError = (
      _event: IpcRendererEvent,
      inputPath: string,
      errorMessage: string
    ): void => {
      showConversionErrorNotification(inputPath, errorMessage)
    }

    window.electron.ipcRenderer.on('LIVE_PROGRESS', handleProgressUpdate)
    window.electron.ipcRenderer.on('CONVERSION_ERROR', handleConversionError)

    return (): void => {
      window.electron.ipcRenderer.removeListener('LIVE_PROGRESS', handleProgressUpdate)
      window.electron.ipcRenderer.removeListener('CONVERSION_ERROR', handleConversionError)
    }
  }, [])

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy' // Explicitly setting the dropEffect
    setDragOverScreen(true)
  }

  const handleDragLeave = (): void => {
    setDragOverScreen(false)
  }

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>): Promise<void> => {
    e.preventDefault()
    setDragOverScreen(false)
    const pathsToDetail = Array.from(e.dataTransfer.files).map((file) => file.path)
    const res = await window.electron.ipcRenderer.invoke('GET_DETAILS', pathsToDetail)
    console.log('detiled res is', res)

    setExplorer(res)
  }

  const importDirs = async (type: 'folder' | 'file'): Promise<void> => {
    const res = await window.electron.ipcRenderer.invoke('SELECT_DIRS', { type })
    console.log('detiled res is', res)

    setExplorer(res)
  }

  const renderDirItems = (items: DirItem[], depth: number = 0): JSX.Element[] => {
    return items.map((dir, index) => (
      <Fragment key={`${depth}-${index}`}>
        <tr className="border-b border-gray-700 hover:bg-gray-800">
          <td className="p-1 w-16 text-lg">
            <div style={{ paddingLeft: `${depth * 10}px` }} className="flex items-center">
              {dir.type === 'folder' && dir.children ? (
                <Button
                  onClick={() => expandFolder(dir.size, index, depth)}
                  className="bg-gray-700 hover:bg-gray-600 text-white p-2 rounded"
                >
                  {dir.isExpanded ? <FaChevronDown size={14} /> : <FaChevronRight size={14} />}
                </Button>
              ) : (
                <div className="w-8"></div> // Placeholder for alignment
              )}
              {!convertClicked && (
                <Button
                  onClick={() => deleteItem(dir.size, index, depth)}
                  className="bg-red-600 hover:bg-red-700 text-white p-2 rounded ml-2"
                >
                  <FaTrash size={14} />
                </Button>
              )}
            </div>
          </td>
          <td className="text-lg">
            <div style={{ paddingLeft: `${depth * 10}px` }} className="flex items-center">
              {dir.type === 'folder' ? (
                <span className="mr-2">📁</span>
              ) : dir.ext === 'video' ? (
                <span className="mr-2">🎬</span>
              ) : dir.ext === 'image' ? (
                <span className="mr-2">🖼️</span>
              ) : dir.ext === 'audio' ? (
                <span className="mr-2">🔊</span>
              ) : null}
              {dir.name}
            </div>
          </td>
          <td className="p-3 text-lg">{dir.size}</td>
          <td className="p-3 text-lg">{dir.duration}</td>
          <td className="p-3 text-lg">
            <ProgressIndicator fileType={dir.ext} progress={dir.progress || 0} />
          </td>
        </tr>
        {dir.children && dir.isExpanded && renderDirItems(dir.children, depth + 1)}
      </Fragment>
    ))
  }

  return (
    <div className="bg-gray-900 text-gray-100 h-[93%] p-3 overflow-y-auto">
      {explorer.length === 0 ? (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`w-full h-full border-4 ${
            dragOverScreen
              ? 'border-dashed border-blue-400 bg-gray-800'
              : 'border-solid border-gray-500'
          } rounded-lg flex justify-center items-center transition-all duration-300`}
        >
          {dragOverScreen ? (
            <h1 className="text-2xl font-bold text-blue-400">Drop files here</h1>
          ) : (
            <div className="flex justify-center items-center flex-col">
              <div className="w-[60%] mb-6 text-center">
                <h1 className="text-xl font-bold text-gray-400">
                  Greetings, videos will be converted to AV1, images will be converted to AVIF,
                  audios will be converted to OPUS
                </h1>
              </div>
              <div className="flex justify-center space-x-4 mb-6">
                <Button
                  onClick={() => importDirs('folder')}
                  className="bg-blue-600 duration-500 text-white text-lg font-bold px-5 py-4 rounded"
                >
                  Select Folders
                </Button>
                <Button
                  onClick={() => importDirs('file')}
                  className="bg-blue-600 duration-500 text-white text-lg font-bold px-5 py-4 rounded"
                >
                  Select Files
                </Button>
              </div>
              <h1 className="text-xl font-bold text-gray-400">Or drop your files here</h1>
            </div>
          )}
        </div>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-800 text-left">
              <>
                <th className="p-3 w-24 text-lg"></th>
                <th className="p-3 text-lg">Name</th>
                <th className="p-3 text-lg">Size</th>
                <th className="p-3 text-lg">Duration</th>
                <th className="p-3 text-lg">Progress</th>
              </>
            </tr>
          </thead>
          <tbody>{renderDirItems(explorer)}</tbody>
        </table>
      )}
    </div>
  )
}
