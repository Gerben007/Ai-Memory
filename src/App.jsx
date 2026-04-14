import { useEffect, useState } from 'react'
import { useStore } from './lib/store'
import Sidebar from './components/Sidebar'
import Editor from './components/Editor'
import ChatPanel from './components/ChatPanel'
import BrainstormPanel from './components/BrainstormPanel'
import GraphView from './components/GraphView'
import AgentPanel from './components/AgentPanel'
import ImportPanel from './components/ImportPanel'
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
  const loadConfig = useStore(s => s.loadConfig)
  const rebuildIndex = useStore(s => s.rebuildIndex)
  const initialized = useStore(s => s.initialized)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    async function init() {
      await loadConfig()
      await loadNotes()
      rebuildIndex()
    }
    init()
  }, [loadNotes, loadConfig, rebuildIndex])

  const handleNavClick = (view) => {
    setActiveView(view)
    setSidebarOpen(false)
  }

  if (!initialized) {
    return (
      <div className="h-dvh flex items-center justify-center app-bg">
        <div className="text-gradient text-2xl font-bold">Knowledge Vault</div>
      </div>
    )
  }

  return (
    <div className="h-dvh flex flex-col app-bg text-gray-100 overflow-hidden">
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
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 glass-strong md:hidden">
            <button onClick={() => setSidebarOpen(true)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
            </button>
            <span className="text-sm font-semibold text-gradient">Knowledge Vault</span>
            <div className="w-7" />
          </div>

          <div className="flex-1 overflow-hidden">
            {activeView === 'editor' && <Editor />}
            {activeView === 'chat' && <ChatPanel />}
            {activeView === 'brainstorm' && <BrainstormPanel />}

            {activeView === 'graph' && <GraphView />}
            {activeView === 'agent' && <AgentPanel />}
            {activeView === 'import' && <ImportPanel />}
            {activeView === 'settings' && <Settings />}
          </div>
        </main>
      </div>

      <nav className="flex border-t border-white/5 glass-strong md:hidden shrink-0 relative z-10">
        {NAV_ITEMS.map(item => (
          <button
            key={item.key}
            onClick={() => handleNavClick(item.key)}
            className={`flex-1 flex flex-col items-center py-2.5 text-[10px] gap-0.5 transition-colors ${
              activeView === item.key ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
            }`}
          >
            <span className="text-base">{item.icon}</span>
            <span>{item.label}</span>
            {activeView === item.key && <span className="w-1 h-1 rounded-full bg-[var(--accent)] mt-0.5" />}
          </button>
        ))}
      </nav>
    </div>
  )
}
