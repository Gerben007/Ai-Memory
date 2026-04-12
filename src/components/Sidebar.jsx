import { useState } from 'react'
import { useStore } from '../lib/store'

const TAG_PALETTE = [
  '#818cf8', '#f472b6', '#34d399', '#fbbf24', '#60a5fa',
  '#a78bfa', '#fb923c', '#2dd4bf', '#f87171', '#a3e635'
]

function hashCode(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

function getTagColor(tag) {
  return TAG_PALETTE[hashCode(tag) % TAG_PALETTE.length]
}

const NAV_ITEMS = [
  { key: 'editor', label: 'Notes', icon: '📝' },
  { key: 'chat', label: 'AI Chat', icon: '💬' },
  { key: 'graph', label: 'Graph', icon: '🕸️' },
  { key: 'agent', label: 'Agent API', icon: '🤖' },
  { key: 'settings', label: 'Settings', icon: '⚙️' }
]

export default function Sidebar() {
  const notes = useStore(s => s.notes)
  const activeNoteFilename = useStore(s => s.activeNoteFilename)
  const activeView = useStore(s => s.activeView)
  const setActiveNote = useStore(s => s.setActiveNote)
  const setActiveView = useStore(s => s.setActiveView)
  const createNote = useStore(s => s.createNote)
  const deleteNote = useStore(s => s.deleteNote)
  const search = useStore(s => s.search)

  const [searchQuery, setSearchQuery] = useState('')
  const [showNewNote, setShowNewNote] = useState(false)
  const [newNoteTitle, setNewNoteTitle] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(null)

  // Filter notes by search
  let displayedNotes = notes
  if (searchQuery.trim()) {
    const results = search(searchQuery, 20)
    const matchedFiles = new Set(results.map(r => r.chunk.noteFilename))
    displayedNotes = notes.filter(n => matchedFiles.has(n.filename))
  }

  const handleCreate = () => {
    if (newNoteTitle.trim()) {
      createNote(newNoteTitle.trim())
      setNewNoteTitle('')
      setShowNewNote(false)
    }
  }

  const handleDelete = (filename) => {
    deleteNote(filename)
    setConfirmDelete(null)
  }

  return (
    <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col h-screen shrink-0">
      {/* Header */}
      <div className="p-4 border-b border-gray-800">
        <h1 className="text-lg font-bold text-indigo-400">Knowledge Vault</h1>
        <p className="text-[10px] text-gray-500 mt-0.5">{notes.length} notes</p>
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

      {/* New Note */}
      <div className="p-3 border-b border-gray-800">
        {showNewNote ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={newNoteTitle}
              onChange={e => setNewNoteTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              placeholder="Note title..."
              className="flex-1 bg-gray-800 text-gray-200 text-sm rounded-lg px-3 py-1.5 border border-gray-700 focus:border-indigo-500 focus:outline-none placeholder-gray-500"
              autoFocus
            />
            <button
              onClick={handleCreate}
              className="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-500"
            >
              Add
            </button>
            <button
              onClick={() => { setShowNewNote(false); setNewNoteTitle('') }}
              className="text-sm text-gray-400 hover:text-gray-200 px-2"
            >
              x
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowNewNote(true)}
            className="w-full text-sm bg-gray-800 text-gray-300 py-2 rounded-lg hover:bg-gray-700 border border-gray-700 border-dashed"
          >
            + New Note
          </button>
        )}
      </div>

      {/* Note List */}
      <div className="flex-1 overflow-y-auto">
        {displayedNotes.length === 0 ? (
          <div className="p-4 text-sm text-gray-500 text-center">
            {searchQuery ? 'No matching notes' : 'No notes yet'}
          </div>
        ) : (
          displayedNotes.map(note => (
            <div
              key={note.filename}
              className={`group relative px-4 py-3 cursor-pointer border-b border-gray-800/50 hover:bg-gray-800/50 ${
                activeNoteFilename === note.filename && activeView === 'editor'
                  ? 'bg-gray-800 border-l-2 border-l-indigo-500'
                  : ''
              }`}
              onClick={() => setActiveNote(note.filename)}
            >
              <div className="text-sm font-medium text-gray-200 truncate">
                {note.frontmatter?.title || note.filename.replace(/\.md$/, '')}
              </div>
              {note.frontmatter?.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {note.frontmatter.tags.map(tag => (
                    <span
                      key={tag}
                      className="text-[10px] px-1.5 py-0.5 rounded-full"
                      style={{ backgroundColor: getTagColor(tag) + '20', color: getTagColor(tag) }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Delete button */}
              {confirmDelete === note.filename ? (
                <div className="absolute right-2 top-2 flex gap-1">
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(note.filename) }}
                    className="text-[10px] bg-red-600 text-white px-2 py-0.5 rounded"
                  >
                    Delete
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); setConfirmDelete(null) }}
                    className="text-[10px] bg-gray-700 text-gray-300 px-2 py-0.5 rounded"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={e => { e.stopPropagation(); setConfirmDelete(note.filename) }}
                  className="absolute right-2 top-3 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity text-sm"
                >
                  🗑
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {/* Navigation */}
      <nav className="border-t border-gray-800 p-2">
        {NAV_ITEMS.map(item => (
          <button
            key={item.key}
            onClick={() => setActiveView(item.key)}
            className={`w-full text-left text-sm px-3 py-2 rounded-lg flex items-center gap-2 ${
              activeView === item.key
                ? 'bg-indigo-600/20 text-indigo-400'
                : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
            }`}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  )
}
