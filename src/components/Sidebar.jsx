import { useState } from 'react'
import { useStore, TEMPLATES } from '../lib/store'
import { getTags, getAllTagsWithCounts } from '../lib/tagUtils'
import TagCleanup from './TagCleanup'
import TagPill from './TagPill'

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
  const [newNoteTitle, setNewNoteTitle] = useState('')
  const [quickText, setQuickText] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [captureStatus, setCaptureStatus] = useState('')
  const [showTagCleanup, setShowTagCleanup] = useState(false)

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
      onNavigate?.()
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

  const handleNoteClick = (filename) => {
    setActiveNote(filename)
    setActiveView('editor')
    onNavigate?.()
  }

  const handleDelete = (filename) => {
    deleteNote(filename)
    setConfirmDelete(null)
  }

  // Get preview text from note body
  const getPreview = (note) => {
    if (!note.body) return ''
    return note.body
      .replace(/^#+\s+.+$/gm, '')          // remove headings
      .replace(/!\[.*?\]\(.*?\)/g, '')      // remove images
      .replace(/\[.*?\]\(.*?\)/g, '$1')     // flatten links
      .replace(/[*_`~]/g, '')              // remove markdown syntax
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Header ───────────────────────────────────────────── */}
      <div className="px-4 py-3 shrink-0 flex items-center justify-between"
        style={{ borderBottom: '1px solid var(--border)' }}>
        <div>
          <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Notes
          </div>
          <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {notes.length} {notes.length === 1 ? 'note' : 'notes'}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => createFromTemplate('daily')}
            className="nav-icon"
            data-label="Today's note"
            title="Today's note"
            style={{ width: 28, height: 28 }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </button>
          <button
            onClick={handleRandom}
            className="nav-icon"
            data-label="Random note"
            title="Random note"
            style={{ width: 28, height: 28 }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/>
              <polyline points="21 16 21 21 16 21"/>
              <line x1="15" y1="15" x2="21" y2="21"/>
            </svg>
          </button>
          <button
            onClick={() => setShowTagCleanup(true)}
            className="nav-icon"
            data-label="Tag cleanup"
            title="Tag cleanup"
            style={{ width: 28, height: 28 }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
              <line x1="7" y1="7" x2="7.01" y2="7"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ── Quick capture ────────────────────────────────────── */}
      <div className="px-3 py-2.5 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={quickText}
            onChange={e => setQuickText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleQuickCapture()}
            placeholder="Quick capture…"
            className="flex-1 input-glass"
            style={{ paddingTop: 7, paddingBottom: 7 }}
          />
          <button
            onClick={handleQuickCapture}
            className="btn-primary shrink-0"
            style={{ padding: '7px 10px', borderRadius: 8 }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        </div>
        {captureStatus && (
          <p className="text-[10px] mt-1" style={{ color: 'var(--green)' }}>{captureStatus}</p>
        )}
      </div>

      {/* ── Search ───────────────────────────────────────────── */}
      <div className="px-3 py-2 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ color: 'var(--text-muted)' }}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search notes…"
            className="input-glass w-full"
            style={{ paddingLeft: 28, paddingTop: 6, paddingBottom: 6, fontSize: 12 }}
          />
        </div>
      </div>

      {/* ── New note bar ─────────────────────────────────────── */}
      <div className="px-3 py-2 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        {showNewNote ? (
          <div className="flex gap-1.5">
            <input
              type="text"
              value={newNoteTitle}
              onChange={e => setNewNoteTitle(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleCreate()
                if (e.key === 'Escape') { setShowNewNote(false); setNewNoteTitle('') }
              }}
              placeholder="Note title…"
              className="flex-1 input-glass text-xs"
              style={{ paddingTop: 6, paddingBottom: 6 }}
              autoFocus
            />
            <button onClick={handleCreate} className="btn-primary text-xs" style={{ padding: '6px 10px' }}>Add</button>
            <button
              onClick={() => { setShowNewNote(false); setNewNoteTitle('') }}
              style={{ color: 'var(--text-muted)', fontSize: 16, padding: '0 4px' }}
            >&times;</button>
          </div>
        ) : (
          <button
            onClick={() => setShowNewNote(true)}
            className="w-full text-xs flex items-center gap-2 py-1.5 px-2 rounded-lg transition-colors"
            style={{ color: 'var(--text-muted)', border: '1px dashed var(--border)' }}
            onMouseOver={e => e.currentTarget.style.color = 'var(--text-secondary)'}
            onMouseOut={e => e.currentTarget.style.color = 'var(--text-muted)'}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New note
          </button>
        )}
      </div>

      {/* ── Note list ────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {displayedNotes.length === 0 ? (
          <div className="p-6 text-center" style={{ color: 'var(--text-muted)', fontSize: 12 }}>
            {searchQuery ? 'No matching notes' : 'No notes yet'}
          </div>
        ) : (
          displayedNotes.map(note => {
            const isActive = activeNoteFilename === note.filename && activeView === 'editor'
            const noteTags = getTags(note)
            const preview = getPreview(note)
            const dateStr = note.frontmatter?.updated || note.frontmatter?.created
            const displayDate = dateStr
              ? new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              : ''

            return (
              <div
                key={note.filename}
                className={`note-card group ${isActive ? 'active' : ''}`}
                onClick={() => handleNoteClick(note.filename)}
                style={isActive ? { borderLeftWidth: 2, borderLeftColor: 'var(--accent)', paddingLeft: 12 } : {}}
              >
                <div className="flex items-start justify-between gap-1">
                  <div className="note-card-title flex-1">
                    {note.frontmatter?.title || note.filename.replace(/\.md$/, '')}
                  </div>
                  {displayDate && (
                    <span className="text-[10px] shrink-0 mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {displayDate}
                    </span>
                  )}
                </div>

                {preview && (
                  <div className="note-card-preview">{preview}</div>
                )}

                {noteTags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {noteTags.slice(0, 3).map(tag => (
                      <TagPill key={tag} tag={tag} />
                    ))}
                    {noteTags.length > 3 && (
                      <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                        +{noteTags.length - 3}
                      </span>
                    )}
                  </div>
                )}

                {/* Delete button */}
                {confirmDelete === note.filename ? (
                  <div className="flex gap-1 mt-1.5">
                    <button
                      onClick={e => { e.stopPropagation(); handleDelete(note.filename) }}
                      className="text-[10px] px-2 py-0.5 rounded"
                      style={{ background: 'var(--red)', color: '#fff' }}
                    >
                      Delete
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); setConfirmDelete(null) }}
                      className="text-[10px] px-2 py-0.5 rounded"
                      style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={e => { e.stopPropagation(); setConfirmDelete(note.filename) }}
                    className="absolute right-2 top-2.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: 'var(--text-muted)', fontSize: 12 }}
                    title="Delete"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                    </svg>
                  </button>
                )}
              </div>
            )
          })
        )}
      </div>

      {showTagCleanup && <TagCleanup onClose={() => setShowTagCleanup(false)} />}
    </div>
  )
}
