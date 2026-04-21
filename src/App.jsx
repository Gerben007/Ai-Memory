import { useEffect, useState } from 'react'
import { useStore } from './lib/store'
import { fetchAuthStatus } from './lib/auth'
import Sidebar from './components/Sidebar'
import Editor from './components/Editor'
import BrainstormPanel from './components/BrainstormPanel'
import GraphView from './components/GraphView'
import AgentPanel from './components/AgentPanel'
import Settings from './components/Settings'
import SearchOverlay from './components/SearchOverlay'
import KnowledgePulse from './components/KnowledgePulse'
import LoginScreen from './components/LoginScreen'
import AuthGate from './components/AuthGate'

// SVG icon components
const Icons = {
  notes: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <polyline points="10 9 9 9 8 9"/>
    </svg>
  ),
  chat: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  ),
  brainstorm: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.44-4.66Z"/>
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.44-4.66Z"/>
    </svg>
  ),
  graph: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
    </svg>
  ),
  agent: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  ),
  import: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  ),
  settings: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  ),
  menu: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="3" y1="6" x2="21" y2="6"/>
      <line x1="3" y1="12" x2="21" y2="12"/>
      <line x1="3" y1="18" x2="21" y2="18"/>
    </svg>
  )
}

const Icons2 = {
  timeline: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
  ),
  pulse: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
  ),
  insight: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18h6"/><path d="M10 22h4"/>
      <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/>
    </svg>
  ),
  interview: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  )
}

const NAV_ITEMS = [
  { key: 'editor',    label: 'Notes',     icon: Icons.notes },
  { key: 'brainstorm',label: 'AI Studio', icon: Icons.brainstorm },
  { key: 'graph',     label: 'Graph',     icon: Icons.graph },
  { key: 'pulse',     label: 'Pulse',     icon: Icons2.pulse },
  { key: 'settings',  label: 'Settings',  icon: Icons.settings },
]

// Mobile bottom nav
const MOBILE_NAV = [
  { key: 'editor',    label: 'Notes',    icon: Icons.notes },
  { key: 'brainstorm',label: 'AI',       icon: Icons.brainstorm },
  { key: 'graph',     label: 'Graph',    icon: Icons.graph },
  { key: 'pulse',     label: 'Pulse',    icon: Icons2.pulse },
  { key: 'search',    label: 'Search',   icon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  )},
]

export default function App() {
  const activeView = useStore(s => s.activeView)
  const setActiveView = useStore(s => s.setActiveView)
  const loadNotes = useStore(s => s.loadNotes)
  const loadConfig = useStore(s => s.loadConfig)
  const loadContext = useStore(s => s.loadContext)
  const rebuildIndex = useStore(s => s.rebuildIndex)
  const initialized = useStore(s => s.initialized)
  const [panelOpen, setPanelOpen] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [authState, setAuthState] = useState({ status: 'checking', required: false, authenticated: false })

  // Ctrl+K / Cmd+K to open search
  useEffect(() => {
    const handleKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setShowSearch(s => !s)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  // Check auth status on mount before loading anything
  useEffect(() => {
    fetchAuthStatus().then(s => {
      setAuthState({ status: 'ready', required: !!s.required, authenticated: !!s.authenticated })
    })
  }, [])

  useEffect(() => {
    if (authState.status !== 'ready') return
    if (authState.required && !authState.authenticated) return
    async function init() {
      await loadConfig()
      await loadNotes()
      rebuildIndex()
      loadContext()
    }
    init()
  }, [authState, loadNotes, loadConfig, loadContext, rebuildIndex])

  const handleNavClick = (view) => {
    setActiveView(view)
    setPanelOpen(false)
  }

  if (authState.status === 'checking') {
    return (
      <div className="h-dvh flex items-center justify-center app-bg">
        <div className="text-center">
          <div className="text-gradient text-xl font-semibold tracking-tight mb-1">Knowledge Vault</div>
          <div className="text-xs text-[var(--text-muted)] tracking-widest uppercase">Loading</div>
        </div>
      </div>
    )
  }

  if (authState.required && !authState.authenticated) {
    return (
      <LoginScreen
        onAuthenticated={() => setAuthState(s => ({ ...s, authenticated: true }))}
      />
    )
  }

  if (!initialized) {
    return (
      <div className="h-dvh flex items-center justify-center app-bg">
        <div className="text-center">
          <div className="text-gradient text-xl font-semibold tracking-tight mb-1">Knowledge Vault</div>
          <div className="text-xs text-[var(--text-muted)] tracking-widest uppercase">Loading</div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-dvh flex app-bg overflow-hidden">

      {/* ── Desktop icon strip nav ──────────────────────────────── */}
      <nav
        className="hidden md:flex flex-col shrink-0 z-20"
        style={{ width: 'var(--nav-w)', background: 'var(--bg-nav)', borderRight: '1px solid var(--border)' }}
      >
        {/* Logo mark */}
        <div className="flex items-center justify-center h-12 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent-hi)', border: '1px solid rgba(59,130,246,0.25)' }}>
            KV
          </div>
        </div>

        {/* Search button */}
        <div className="flex items-center justify-center py-2 px-1">
          <button
            onClick={() => setShowSearch(true)}
            className="nav-icon"
            data-label="Search (Ctrl+K)"
            title="Search (Ctrl+K)"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </button>
        </div>

        {/* Nav icons */}
        <div className="flex-1 flex flex-col items-center gap-1 py-3 px-1">
          {NAV_ITEMS.map(item => (
            <button
              key={item.key}
              onClick={() => handleNavClick(item.key)}
              className={`nav-icon ${activeView === item.key ? 'active' : ''}`}
              data-label={item.label}
              title={item.label}
            >
              {item.icon}
            </button>
          ))}
        </div>
      </nav>

      {/* ── Note list panel ─────────────────────────────────────── */}
      {/* Only visible when editor is active on desktop, always slide-in on mobile */}
      <div className={`
        fixed md:relative inset-y-0 left-0 z-40 flex flex-col
        transform transition-transform duration-200 ease-out
        ${panelOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `} style={{ width: 'var(--panel-w)', background: 'var(--bg-panel)', borderRight: '1px solid var(--border)' }}>
        <Sidebar onNavigate={() => setPanelOpen(false)} />
      </div>

      {/* Backdrop for mobile panel */}
      {panelOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
          onClick={() => setPanelOpen(false)}
        />
      )}

      {/* ── Main content ────────────────────────────────────────── */}
      <main className="flex-1 overflow-hidden flex flex-col min-w-0 pb-[58px] md:pb-0">
        {/* Mobile top bar */}
        <div
          className="flex items-center gap-3 px-4 py-2.5 shrink-0 md:hidden"
          style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)' }}
        >
          <button
            onClick={() => setPanelOpen(true)}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            {Icons.menu}
          </button>
          <span className="flex-1 text-sm font-semibold text-gradient">Knowledge Vault</span>
        </div>

        {/* View content */}
        <div className="flex-1 overflow-hidden">
          {activeView === 'editor'     && <Editor />}
          {activeView === 'brainstorm' && <BrainstormPanel />}
          {activeView === 'graph'      && <GraphView />}
          {activeView === 'pulse'      && <KnowledgePulse />}
          {activeView === 'agent'      && <AgentPanel />}
          {activeView === 'settings'   && <Settings />}
        </div>
      </main>

      {/* ── Mobile bottom nav ───────────────────────────────────── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 flex shrink-0 z-20"
        style={{ background: 'var(--bg-nav)', borderTop: '1px solid var(--border)' }}
      >
        {MOBILE_NAV.map(item => (
          <button
            key={item.key}
            onClick={() => item.key === 'search' ? setShowSearch(true) : handleNavClick(item.key)}
            className="flex-1 flex flex-col items-center py-2.5 gap-0.5 transition-colors"
            style={{ color: activeView === item.key ? 'var(--accent-hi)' : 'var(--text-muted)' }}
          >
            <span className="scale-90">{item.icon}</span>
            <span className="text-[9.5px] font-medium">{item.label}</span>
            {activeView === item.key && (
              <span className="w-1 h-1 rounded-full" style={{ background: 'var(--accent)' }} />
            )}
          </button>
        ))}
      </nav>

      {/* ── Search overlay ──────────────────────────────────────── */}
      {showSearch && <SearchOverlay onClose={() => setShowSearch(false)} />}

      {/* ── Auth gate (shown when the server requires a token) ──── */}
      <AuthGate onUnlock={() => { loadNotes(); loadConfig(); loadContext() }} />
    </div>
  )
}
