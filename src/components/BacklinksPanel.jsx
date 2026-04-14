import { useMemo } from 'react'
import { useStore } from '../lib/store'
import { extractWikilinks } from '../lib/wikilinkParser'
import { getTitle } from '../lib/tagUtils'

export default function BacklinksPanel({ noteFilename }) {
  const notes = useStore(s => s.notes)
  const setActiveNote = useStore(s => s.setActiveNote)
  const setActiveView = useStore(s => s.setActiveView)

  const backlinks = useMemo(() => {
    if (!noteFilename) return []

    const currentNote = notes.find(n => n.filename === noteFilename)
    if (!currentNote) return []

    const currentTitle = getTitle(currentNote).toLowerCase()
    const currentSlug = noteFilename.replace(/\.md$/, '').toLowerCase()

    const results = []

    for (const note of notes) {
      if (note.filename === noteFilename) continue

      const text = note.content || ''
      const links = extractWikilinks(text)

      for (const link of links) {
        const target = link.target.toLowerCase()
        if (target === currentTitle || target === currentSlug) {
          // Build a snippet around the wikilink occurrence
          const body = note.body || text
          const linkIndex = body.indexOf(link.raw)
          let snippet = ''
          if (linkIndex >= 0) {
            const start = Math.max(0, linkIndex - 50)
            const end = Math.min(body.length, linkIndex + link.raw.length + 50)
            snippet = (start > 0 ? '...' : '') +
              body.slice(start, end).replace(/\n/g, ' ').trim() +
              (end < body.length ? '...' : '')
          }

          const updated = note.frontmatter?.updated || note.frontmatter?.created || ''
          const dateStr = updated ? formatDate(updated) : ''

          results.push({
            filename: note.filename,
            title: getTitle(note),
            snippet,
            date: dateStr
          })
          break // Only count each note once
        }
      }
    }

    // Sort by date descending (most recent first)
    results.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    return results
  }, [noteFilename, notes])

  if (backlinks.length === 0) return null

  const handleClick = (filename) => {
    setActiveNote(filename)
    setActiveView('editor')
  }

  return (
    <div style={{ borderTop: '1px solid var(--border)' }}>
      <div className="px-4 py-2.5 flex items-center gap-2" style={{ borderBottom: '1px solid var(--border)' }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)' }}>
          <path d="M15 7h3a5 5 0 0 1 5 5 5 5 0 0 1-5 5h-3m-6 0H6a5 5 0 0 1-5-5 5 5 0 0 1 5-5h3" />
          <line x1="8" y1="12" x2="16" y2="12" />
        </svg>
        <span className="text-[11px] font-medium tracking-wide uppercase" style={{ color: 'var(--text-muted)' }}>
          Backlinks
        </span>
        <span
          className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
          style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)' }}
        >
          {backlinks.length}
        </span>
      </div>
      <div className="px-2 py-1.5 max-h-48 overflow-y-auto">
        {backlinks.map(bl => (
          <button
            key={bl.filename}
            onClick={() => handleClick(bl.filename)}
            className="w-full text-left px-3 py-2 rounded-lg transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            onMouseOver={e => e.currentTarget.style.background = 'var(--bg-surface)'}
            onMouseOut={e => e.currentTarget.style.background = 'transparent'}
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium truncate flex-1" style={{ color: 'var(--text-primary)' }}>
                {bl.title}
              </span>
              {bl.date && (
                <span className="text-[9px] shrink-0" style={{ color: 'var(--text-muted)' }}>
                  {bl.date}
                </span>
              )}
            </div>
            {bl.snippet && (
              <div className="text-[11px] mt-0.5 line-clamp-2" style={{ color: 'var(--text-muted)' }}>
                {bl.snippet}
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

function formatDate(dateStr) {
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return ''
    const now = new Date()
    const diff = now - d
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    if (days === 0) return 'today'
    if (days === 1) return '1d ago'
    if (days < 30) return `${days}d ago`
    if (days < 365) return `${Math.floor(days / 30)}mo ago`
    return `${Math.floor(days / 365)}y ago`
  } catch {
    return ''
  }
}
