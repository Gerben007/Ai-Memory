import { useState } from 'react'
import { useStore, TEMPLATES } from '../lib/store'

const TAG_PALETTE = [
  '#818cf8', '#f472b6', '#34d399', '#fbbf24', '#60a5fa',
  '#a78bfa', '#fb923c', '#2dd4bf', '#f87171', '#a3e635'
]

function hashCode(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) { hash = ((hash << 5) - hash) + str.charCodeAt(i); hash |= 0 }
  return Math.abs(hash)
}

function getTagColor(tag) {
  return TAG_PALETTE[hashCode(tag) % TAG_PALETTE.length]
}

const NAV_ITEMS = [
  { key: 'editor', label: 'Notes', icon: '📝' },
  { key: 'chat', label: 'AI Chat', icon: '💬' },
  { key: 'brainstorm', label: 'Brainstorm', icon: '🧠' },
  { key: 'graph', label: 'Graph', icon: '🕸️' },
  { key: 'agent', label: 'Agent API', icon: '🤖' },
  { key: 'settings', label: 'Settings', icon: '⚙️' }
]

export default function Sidebar({ onNavigate }) {
  const notes = useStore(s => s.notes)
  const activeNoteFilename = useStore(s => s.activeNoteFilename)
  const activeView = useStore(s => s.activeView)
  const setActiveNote = useStore(s => s.setActiveNote)
  const setActiveView = useStore(s => s.setActiveView)
  const createNote = useStore(s => s.createNote)
  const createFromTemplate = useStore(s => s.createFromTemplate)
  const deleteNote = useStore(s => s.deleteNote)
  const search = useStore(s => s.search)
  const quickCapture = useStore(s => s.quickCapture)
  const getRandomNote = useStore(s => s.getRandomNote)

  const [searchQuery, setSearchQuery] = useState('')
  const [showNewNote, setShowNewNote] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [newNoteTitle, setNewNoteTitle] = useState('')
  const [templateKey, setTemplateKey] = useState(null)
  const [templateTitle, setTemplateTitle] = useState('')
  const [quickText, setQuickText] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [captureStatus, setCaptureStatus] = useState('')

  let displayedNotes = notes
  if (searchQuery.trim()) {
    const results = search(searchQuery, 20)
    const matchedFiles = new Set(results.map(r => r.chunk.noteFilename))
    displayedNotes = notes.filter(n => matchedFiles.has(n.filename))
  }

  const handleCreate = () => {
    if (newNoteTitle.trim()) { createNote(newNoteTitle.trim()); setNewNoteTitle(''); setShowNewNote(false) }
  }

  const handleTemplateCreate = () => {
    if (templateKey === 'daily') {
      createFromTemplate('daily')
      setTemplateKey(null); setShowTemplates(false); onNavigate?.()
    } else if (templateTitle.trim()) {
      createFromTemplate(templateKey, templateTitle.trim())
      setTemplateTitle(''); setTemplateKey(null); setShowTemplates(false); onNavigate?.()
    }
  }

  const handleQuickCapture = async () => {
    if (!quickText.trim()) return
    await quickCapture(quickText.trim())
    setQuickText('')
    setCaptureStatus('Captured!')
    setTimeout(() => setCaptureStatus(''), 2000)
  }

  const handleRandom = () => {
    const note = getRandomNote()
    if (note) { setActiveNote(note.filename); onNavigate?.() }
  }

  const handleNoteClick = (filename) => { setActiveNote(filename); onNavigate?.() }
  const handleNavClick = (key) => { setActiveView(key); onNavigate?.() }
  const handleDelete = (filename) => { deleteNote(filename); setConfirmDelete(null) }

  return (
    <aside className="w-full h-full bg-gray-900 border-r border-gray-800 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-800">
        <h1 className="text-lg font-bold text-indigo-400">Knowledge Vault</h1>
        <p className="text-[10px] text-gray-500 mt-0.5">{notes.length} notes</p>
      </div>

      {/* Quick Capture */}
      <div className="p-3 border-b border-gray-800">
        <div className="flex gap-1.5">
          <input
            type="text"
            value={quickText}
            onChange={e => setQuickText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleQuickCapture()}
            placeholder="Quick capture..."
            className="flex-1 bg-gray-800 text-gray-200 text-xs rounded-lg px-3 py-2 border border-gray-700 focus:border-amber-500 focus:outline-none placeholder-gray-500"
          />
          <button onClick={handleQuickCapture} className="text-xs bg-amber-600 text-white px-2.5 py-2 rounded-lg hover:bg-amber-500 shrink-0">
            +
          </button>
        </div>
        {captureStatus && <p className="text-[10px] text-amber-400 mt-1">{captureStatus}</p>}
      </div>

      {/* Action buttons */}
      <div className="p-3 border-b border-gray-800 flex gap-2">
        <button
          onClick={() => createFromTemplate('daily')}
          className="flex-1 text-[11px] bg-gray-800 text-gray-300 py-2 rounded-lg hover:bg-gray-700 border border-gray-700 flex items-center justify-center gap-1"
        >
          📅 Today
        </button>
        <button
          onClick={handleRandom}
          className="flex-1 text-[11px] bg-gray-800 text-gray-300 py-2 rounded-lg hover:bg-gray-700 border border-gray-700 flex items-center justify-center gap-1"
        >
          🎲 Random
        </button>
      </div>

      {/* Search */}
      <div className="p-3 border-b border-gray-800">
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search notes..."
          className="w-full bg-gray-800 text-gray-200 text-sm rounded-lg px-3 py-2 border border-gray-700 focus:border-indigo-500 focus:outline-none placeholder-gray-500"
        />
      </div>

      {/* New Note / Templates */}
      <div className="p-3 border-b border-gray-800">
        {templateKey ? (
          <div className="space-y-2">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider">{TEMPLATES[templateKey].icon} {TEMPLATES[templateKey].label}</div>
            {templateKey !== 'daily' && (
              <input
                type="text"
                value={templateTitle}
                onChange={e => setTemplateTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleTemplateCreate()}
                placeholder="Title..."
                className="w-full bg-gray-800 text-gray-200 text-sm rounded-lg px-3 py-1.5 border border-gray-700 focus:border-indigo-500 focus:outline-none placeholder-gray-500"
                autoFocus
              />
            )}
            <div className="flex gap-2">
              <button onClick={handleTemplateCreate} className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-500">Create</button>
              <button onClick={() => { setTemplateKey(null); setTemplateTitle('') }} className="text-xs text-gray-400 hover:text-gray-200">&times; Cancel</button>
            </div>
          </div>
        ) : showTemplates ? (
          <div className="space-y-1">
            {Object.entries(TEMPLATES).map(([key, tmpl]) => (
              <button
                key={key}
                onClick={() => { if (key === 'daily') { createFromTemplate('daily'); setShowTemplates(false); onNavigate?.() } else { setTemplateKey(key) } }}
                className="w-full text-left text-xs bg-gray-800 text-gray-300 px-3 py-2 rounded-lg hover:bg-gray-700 flex items-center gap-2"
              >
                <span>{tmpl.icon}</span><span>{tmpl.label}</span>
              </button>
            ))}
            <button onClick={() => setShowTemplates(false)} className="w-full text-xs text-gray-500 hover:text-gray-300 py-1">Cancel</button>
          </div>
        ) : showNewNote ? (
          <div className="flex gap-2">
            <input
              type="text" value={newNoteTitle} onChange={e => setNewNoteTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()} placeholder="Note title..."
              className="flex-1 bg-gray-800 text-gray-200 text-sm rounded-lg px-3 py-1.5 border border-gray-700 focus:border-indigo-500 focus:outline-none placeholder-gray-500"
              autoFocus
            />
            <button onClick={handleCreate} className="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-500">Add</button>
            <button onClick={() => { setShowNewNote(false); setNewNoteTitle('') }} className="text-sm text-gray-400 hover:text-gray-200 px-1">&times;</button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => setShowNewNote(true)} className="flex-1 text-xs bg-gray-800 text-gray-300 py-2 rounded-lg hover:bg-gray-700 border border-gray-700 border-dashed">
              + New Note
            </button>
            <button onClick={() => setShowTemplates(true)} className="text-xs bg-gray-800 text-gray-300 px-3 py-2 rounded-lg hover:bg-gray-700 border border-gray-700">
              📋
            </button>
          </div>
        )}
      </div>

      {/* Note List */}
      <div className="flex-1 overflow-y-auto">
        {displayedNotes.length === 0 ? (
          <div className="p-4 text-sm text-gray-500 text-center">{searchQuery ? 'No matching notes' : 'No notes yet'}</div>
        ) : (
          displayedNotes.map(note => (
            <div
              key={note.filename}
              className={`group relative px-4 py-3 cursor-pointer border-b border-gray-800/50 hover:bg-gray-800/50 active:bg-gray-800 ${
                activeNoteFilename === note.filename && activeView === 'editor' ? 'bg-gray-800 border-l-2 border-l-indigo-500' : ''
              }`}
              onClick={() => handleNoteClick(note.filename)}
            >
              <div className="text-sm font-medium text-gray-200 truncate pr-6">
                {note.frontmatter?.title || note.filename.replace(/\.md$/, '')}
              </div>
              {note.frontmatter?.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {note.frontmatter.tags.slice(0, 3).map(tag => (
                    <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: getTagColor(tag) + '20', color: getTagColor(tag) }}>{tag}</span>
                  ))}
                  {note.frontmatter.tags.length > 3 && <span className="text-[10px] text-gray-500">+{note.frontmatter.tags.length - 3}</span>}
                </div>
              )}
              {confirmDelete === note.filename ? (
                <div className="absolute right-2 top-2 flex gap-1">
                  <button onClick={e => { e.stopPropagation(); handleDelete(note.filename) }} className="text-[10px] bg-red-600 text-white px-2 py-0.5 rounded">Delete</button>
                  <button onClick={e => { e.stopPropagation(); setConfirmDelete(null) }} className="text-[10px] bg-gray-700 text-gray-300 px-2 py-0.5 rounded">Cancel</button>
                </div>
              ) : (
                <button onClick={e => { e.stopPropagation(); setConfirmDelete(note.filename) }} className="absolute right-2 top-3 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity text-sm">🗑</button>
              )}
            </div>
          ))
        )}
      </div>

      {/* Desktop nav */}
      <nav className="border-t border-gray-800 p-2 hidden md:block">
        {NAV_ITEMS.map(item => (
          <button key={item.key} onClick={() => handleNavClick(item.key)}
            className={`w-full text-left text-sm px-3 py-2 rounded-lg flex items-center gap-2 ${activeView === item.key ? 'bg-indigo-600/20 text-indigo-400' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'}`}
          >
            <span>{item.icon}</span><span>{item.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  )
}
