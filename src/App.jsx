import { useEffect } from 'react'
import { useStore } from './lib/store'
import Sidebar from './components/Sidebar'
import Editor from './components/Editor'
import ChatPanel from './components/ChatPanel'
import GraphView from './components/GraphView'
import AgentPanel from './components/AgentPanel'
import Settings from './components/Settings'

export default function App() {
  const activeView = useStore(s => s.activeView)
  const loadNotes = useStore(s => s.loadNotes)
  const rebuildIndex = useStore(s => s.rebuildIndex)
  const initialized = useStore(s => s.initialized)

  useEffect(() => {
    async function init() {
      await loadNotes()
      rebuildIndex()
    }
    init()
  }, [loadNotes, rebuildIndex])

  if (!initialized) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-950">
        <div className="text-gray-400 text-lg">Loading Knowledge Vault...</div>
      </div>
    )
  }

  return (
    <div className="h-screen flex bg-gray-950 text-gray-100 overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-hidden">
        {activeView === 'editor' && <Editor />}
        {activeView === 'chat' && <ChatPanel />}
        {activeView === 'graph' && <GraphView />}
        {activeView === 'agent' && <AgentPanel />}
        {activeView === 'settings' && <Settings />}
      </main>
    </div>
  )
}
