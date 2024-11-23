import FileView from './comps/FileView'
import ActionPane from './comps/ActionPane'

export default function App(): JSX.Element {
  // Listen for log messages from the main process
  window.electron.ipcRenderer.on('log', (_, { level, message }) => {
    if (level === 'log') {
      console.log(`[Main Process]: ${message}`)
    } else if (level === 'error') {
      console.error(`[Main Process]: ${message}`)
    }
  })

  return (
    <div className="w-screen h-screen">
      <FileView />
      <ActionPane />
    </div>
  )
}
