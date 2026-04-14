import { useMemo } from 'react'
import { useStore } from '../lib/store'
import { getTitle, getBody, getTags, getTagColor } from '../lib/tagUtils'

export default function RelatedNotes({ noteFilename, compact = false }) {
  const notes = useStore(s => s.notes)
  const search = useStore(s => s.search)
  const setActiveNote = useStore(s => s.setActiveNote)
  const setActiveView = useStore(s => s.setActiveView)

  const related = useMemo(() => {
    if (!noteFilename) return []
    const note = notes.find(n => n.filename === noteFilename)
    if (!note) return []

    const title = getTitle(note)
    const body = getBody(note)
    const query = `${title} ${body.slice(0, 500)}`
    if (!query.trim()) return []

    const results = search(query, 10)
    // Filter out the note itself, deduplicate by filename
    const seen = new Set([noteFilename])
    const out = []
    for (const r of results) {
      const fn = r.chunk.noteFilename
      if (seen.has(fn)) continue
      seen.add(fn)
      const n = notes.find(x => x.filename === fn)
      if (!n) continue
      out.push({
        filename: fn,
        title: getTitle(n),
        preview: getBody(n).replace(/^#.*\n/gm, '').replace(/[*_`~]/g, '').trim().slice(0, 100),
        tags: getTags(n).slice(0, 3),
        score: r.score
      })
      if (out.length >= 5) break
    }
    return out
  }, [noteFilename, notes, search])

  if (related.length === 0) return null

  const handleClick = (filename) => {
    setActiveNote(filename)
    setActiveView('editor')
  }

  if (compact) {
    return (
      <div className="space-y-1">
        {related.map(r => (
          <button
            key={r.filename}
            onClick={() => handleClick(r.filename)}
            className="w-full text-left px-2.5 py-2 rounded-lg transition-colors text-xs"
            style={{ color: 'var(--text-secondary)' }}
            onMouseOver={e => e.currentTarget.style.background = 'var(--bg-surface)'}
            onMouseOut={e => e.currentTarget.style.background = 'transparent'}
          >
            <div className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>{r.title}</div>
            {r.tags.length > 0 && (
              <div className="flex gap-1 mt-1">
                {r.tags.map(t => (
                  <span key={t} className="text-[9px] px-1 py-0.5 rounded-full" style={{ background: getTagColor(t) + '18', color: getTagColor(t) }}>{t}</span>
                ))}
              </div>
            )}
          </button>
        ))}
      </div>
    )
  }

  return (
    <div style={{ borderTop: '1px solid var(--border)' }}>
      <div className="px-4 py-2.5 flex items-center gap-2" style={{ borderBottom: '1px solid var(--border)' }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: 'var(--text-muted)' }}>
          <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
        </svg>
        <span className="text-[11px] font-medium tracking-wide uppercase" style={{ color: 'var(--text-muted)' }}>Related Notes</span>
      </div>
      <div className="px-2 py-1.5 max-h-48 overflow-y-auto">
        {related.map(r => (
          <button
            key={r.filename}
            onClick={() => handleClick(r.filename)}
            className="w-full text-left px-3 py-2 rounded-lg transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            onMouseOver={e => e.currentTarget.style.background = 'var(--bg-surface)'}
            onMouseOut={e => e.currentTarget.style.background = 'transparent'}
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium truncate flex-1" style={{ color: 'var(--text-primary)' }}>{r.title}</span>
              <span className="text-[9px] shrink-0" style={{ color: 'var(--text-muted)' }}>{Math.round(r.score * 10)}</span>
            </div>
            {r.preview && (
              <div className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>{r.preview}</div>
            )}
            {r.tags.length > 0 && (
              <div className="flex gap-1 mt-1">
                {r.tags.map(t => (
                  <span key={t} className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: getTagColor(t) + '18', color: getTagColor(t) }}>{t}</span>
                ))}
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
