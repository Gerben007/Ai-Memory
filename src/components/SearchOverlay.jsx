import { useState, useEffect, useRef, useCallback } from 'react'
import { useStore } from '../lib/store'
import { getTags, getTagColor, getTagParts } from '../lib/tagUtils'
import TagPill from './TagPill'

export default function SearchOverlay({ onClose }) {
  const search = useStore(s => s.search)
  const notes = useStore(s => s.notes)
  const setActiveNote = useStore(s => s.setActiveNote)
  const setActiveView = useStore(s => s.setActiveView)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      setSelectedIdx(0)
      return
    }
    const raw = search(query, 15)
    // Group by note (keep best chunk per note)
    const seen = new Map()
    for (const r of raw) {
      const fn = r.chunk.noteFilename
      if (!seen.has(fn)) {
        const note = notes.find(n => n.filename === fn)
        seen.set(fn, {
          filename: fn,
          title: note?.frontmatter?.title || fn.replace(/\.md$/, ''),
          tags: getTags(note || {}),
          snippet: r.chunk.text.slice(0, 200),
          heading: r.chunk.heading,
          score: r.score,
          date: note?.frontmatter?.updated || note?.frontmatter?.created
        })
      }
    }
    setResults([...seen.values()])
    setSelectedIdx(0)
  }, [query, search, notes])

  const handleSelect = useCallback((filename) => {
    setActiveNote(filename)
    setActiveView('editor')
    onClose()
  }, [setActiveNote, setActiveView, onClose])

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx(i => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && results[selectedIdx]) {
      handleSelect(results[selectedIdx].filename)
    }
  }

  // Highlight query terms in text
  const highlight = (text) => {
    if (!query.trim()) return text
    const terms = query.trim().split(/\s+/).filter(Boolean)
    const regex = new RegExp(`(${terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
    const parts = text.split(regex)
    return parts.map((part, i) =>
      regex.test(part)
        ? <mark key={i} style={{ background: 'var(--accent-soft)', color: 'var(--accent-hi)', borderRadius: 2, padding: '0 1px' }}>{part}</mark>
        : part
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-xl mx-4 rounded-xl overflow-hidden shadow-2xl animate-fadeIn"
        style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-strong)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search your vault…"
            className="flex-1 bg-transparent text-sm focus:outline-none"
            style={{ color: 'var(--text-primary)' }}
          />
          <kbd className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[50vh] overflow-y-auto">
          {query.trim() && results.length === 0 && (
            <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              No results for "{query}"
            </div>
          )}
          {results.map((r, i) => (
            <button
              key={r.filename}
              onClick={() => handleSelect(r.filename)}
              className="w-full text-left px-4 py-3 transition-colors"
              style={{
                borderBottom: '1px solid var(--border)',
                background: i === selectedIdx ? 'var(--bg-surface-hover)' : 'transparent'
              }}
              onMouseEnter={() => setSelectedIdx(i)}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium flex-1 truncate" style={{ color: 'var(--text-primary)' }}>
                  {highlight(r.title)}
                </span>
                {r.date && (
                  <span className="text-[10px] shrink-0" style={{ color: 'var(--text-muted)' }}>
                    {new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                )}
              </div>
              {r.heading && (
                <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  &rsaquo; {r.heading}
                </div>
              )}
              <div className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>
                {highlight(r.snippet)}
              </div>
              {r.tags.length > 0 && (
                <div className="flex gap-1 mt-1.5">
                  {r.tags.slice(0, 3).map(tag => (
                    <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded-full"
                      style={{ background: getTagColor(tag) + '20', color: getTagColor(tag) }}>
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </button>
          ))}
        </div>

        {/* Footer */}
        {!query.trim() && (
          <div className="px-4 py-3 text-center" style={{ borderTop: '1px solid var(--border)' }}>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Search notes by title, content, or tags — no API needed
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
