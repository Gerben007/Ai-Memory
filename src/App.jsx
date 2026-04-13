import { useEffect, useState } from 'react'
import { useStore } from './lib/store'
import Sidebar from './components/Sidebar'
import Editor from './components/Editor'
import ChatPanel from './components/ChatPanel'
import BrainstormPanel from './components/BrainstormPanel'
import GraphView from './components/GraphView'
import AgentPanel from './components/AgentPanel'
import Settings from './components/Settings'

const NAV_ITEMS = [
  { key: 'editor', label: 'Notes', icon: '📝' },
  { key: 'chat', label: 'Chat', icon: '💬' },
  { key: 'brainstorm', label: 'Brain', icon: '🧠' },
  { key: 'graph', label: 'Graph', icon: '🕸️' },
  { key: 'settings', label: 'Settings', icon: '⚙️' }
]

export default function App() {
  const activeView = useStore(s => s.activeView)
  const setActiveView = useStore(s => s.setActiveView)
  const loadNotes = useStore(s => s.loadNotes)
  const rebuildIndex = useStore(s => s.rebuildIndex)
  const initialized = useStore(s => s.initialized)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    async function init() {
      await loadNotes()
      rebuildIndex()
    }
    init()
  }, [loadNotes, rebuildIndex])

  const handleNavClick = (view) => {
    setActiveView(view)
    setSidebarOpen(false)
  }

  if (!initialized) {
    return (
      <div className="h-dvh flex items-center justify-center bg-gray-950">
        <div className="text-gray-400 text-lg">Loading Knowledge Vault...</div>
      </div>
    )
  }

  return (
    <div className="h-dvh flex flex-col bg-gray-950 text-gray-100 overflow-hidden">
      <div className="flex-1 flex overflow-hidden relative">
        <div className={`
          fixed inset-y-0 left-0 z-40 w-72 transform transition-transform duration-200 ease-out
          md:relative md:translate-x-0 md:w-64 md:z-auto
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}>
          <Sidebar onNavigate={() => setSidebarOpen(false)} />
        </div>

        {sidebarOpen && (
          <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={() => setSidebarOpen(false)} />
        )}

        <main className="flex-1 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800 bg-gray-900/80 md:hidden">
            <button onClick={() => setSidebarOpen(true)} className="text-gray-400 hover:text-gray-200 p-1">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
            </button>
            <span className="text-sm font-semibold text-indigo-400">Knowledge Vault</span>
            <div className="w-7" />
          </div>

          <div className="flex-1 overflow-hidden">
            {activeView === 'editor' && <Editor />}
            {activeView === 'chat' && <ChatPanel />}
            {activeView === 'brainstorm' && <BrainstormPanel />}
            {activeView === 'graph' && <GraphView />}
            {activeView === 'agent' && <AgentPanel />}
            {activeView === 'settings' && <Settings />}
          </div>
        </main>
      </div>

      <nav className="flex border-t border-gray-800 bg-gray-900 md:hidden shrink-0">
        {NAV_ITEMS.map(item => (
          <button
            key={item.key}
            onClick={() => handleNavClick(item.key)}
            className={`flex-1 flex flex-col items-center py-2 text-[10px] gap-0.5 ${
              activeView === item.key ? 'text-indigo-400' : 'text-gray-500'
            }`}
          >
            <span className="text-base">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
