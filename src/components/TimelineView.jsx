import { useState, useMemo } from 'react'
import { useStore } from '../lib/store'
import { getTitle, getBody, getTags, getTagColor, getAllTagsWithCounts } from '../lib/tagUtils'

function stripMarkdown(text) {
  return text
    .replace(/^#+\s+.+$/gm, '')       // headings
    .replace(/!\[.*?\]\(.*?\)/g, '')   // images
    .replace(/\[([^\]]*)\]\(.*?\)/g, '$1') // links -> text
    .replace(/[*_`~]/g, '')            // bold/italic/code/strike
    .replace(/^>\s?/gm, '')            // blockquotes
    .replace(/^[-*+]\s/gm, '')         // list markers
    .replace(/^\d+\.\s/gm, '')         // ordered list markers
    .replace(/---+/g, '')              // horizontal rules
    .replace(/\n{2,}/g, ' ')           // collapse newlines
    .replace(/\s+/g, ' ')
    .trim()
}

function formatMonthYear(date) {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function formatDate(date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function TimelineView() {
  const notes = useStore(s => s.notes)
  const setActiveNote = useStore(s => s.setActiveNote)
  const setActiveView = useStore(s => s.setActiveView)

  const [selectedTag, setSelectedTag] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Collect all tags with counts for the filter bar
  const allTags = useMemo(() => {
    const counts = getAllTagsWithCounts(notes)
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
  }, [notes])

  // Prepare sorted and filtered notes with parsed dates
  const processedNotes = useMemo(() => {
    return notes
      .map(note => {
        const title = getTitle(note)
        const body = getBody(note)
        const tags = getTags(note)
        const preview = stripMarkdown(body).slice(0, 120)
        const created = note.frontmatter?.created
          ? new Date(note.frontmatter.created)
          : null
        return { note, title, body, tags, preview, created }
      })
      .filter(item => item.created !== null)
      .sort((a, b) => b.created - a.created)
  }, [notes])

  // Apply tag and search filters
  const filteredNotes = useMemo(() => {
    let result = processedNotes

    if (selectedTag) {
      result = result.filter(item =>
        item.tags.some(t => t === selectedTag || t.startsWith(selectedTag + '/'))
      )
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(item =>
        item.title.toLowerCase().includes(q) ||
        item.body.toLowerCase().includes(q) ||
        item.tags.some(t => t.toLowerCase().includes(q))
      )
    }

    return result
  }, [processedNotes, selectedTag, searchQuery])

  // Group by month/year
  const groups = useMemo(() => {
    const map = new Map()
    for (const item of filteredNotes) {
      const key = `${item.created.getFullYear()}-${String(item.created.getMonth() + 1).padStart(2, '0')}`
      if (!map.has(key)) {
        map.set(key, { label: formatMonthYear(item.created), items: [] })
      }
      map.get(key).items.push(item)
    }
    return [...map.values()]
  }, [filteredNotes])

  const handleNoteClick = (filename) => {
    setActiveNote(filename)
    setActiveView('editor')
  }

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--bg-base)' }}>

      {/* Header */}
      <div
        className="px-5 py-3.5 shrink-0 flex items-center gap-3"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent)' }}>
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Timeline
        </span>
        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          {filteredNotes.length} {filteredNotes.length === 1 ? 'note' : 'notes'}
        </span>
      </div>

      {/* Search input */}
      <div className="px-4 py-2.5 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="relative">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2"
            width="12" height="12" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
            style={{ color: 'var(--text-muted)' }}
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Filter by text content..."
            className="input-glass w-full"
            style={{ paddingLeft: 28, paddingTop: 7, paddingBottom: 7, fontSize: 12 }}
          />
        </div>
      </div>

      {/* Tag filter bar */}
      {allTags.length > 0 && (
        <div
          className="px-4 py-2.5 shrink-0 flex flex-wrap gap-1.5 overflow-x-auto"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          {selectedTag && (
            <button
              onClick={() => setSelectedTag(null)}
              className="text-[10px] px-2 py-1 rounded-full font-medium transition-colors"
              style={{
                background: 'var(--bg-surface)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
              }}
            >
              Clear
            </button>
          )}
          {allTags.map(([tag, count]) => {
            const isActive = selectedTag === tag
            const color = getTagColor(tag)
            return (
              <button
                key={tag}
                onClick={() => setSelectedTag(isActive ? null : tag)}
                className="text-[10px] px-2 py-1 rounded-full font-medium transition-colors"
                style={{
                  background: isActive ? color + '30' : color + '12',
                  color: isActive ? color : color + 'cc',
                  border: isActive ? `1px solid ${color}60` : '1px solid transparent',
                }}
              >
                {tag}
                <span className="ml-1 opacity-60">{count}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Timeline content */}
      <div className="flex-1 overflow-y-auto">
        {groups.length === 0 ? (
          <div className="p-8 text-center" style={{ color: 'var(--text-muted)', fontSize: 12 }}>
            {searchQuery || selectedTag ? 'No notes match the current filters' : 'No notes with dates found'}
          </div>
        ) : (
          <div className="px-4 py-3">
            {groups.map((group, gi) => (
              <div key={gi} className="mb-4">
                {/* Month/year header */}
                <div className="flex items-center gap-2.5 mb-2.5">
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: 'var(--accent)' }}
                  />
                  <span
                    className="text-xs font-semibold tracking-wide uppercase"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {group.label}
                  </span>
                  <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    {group.items.length}
                  </span>
                </div>

                {/* Note cards with timeline spine */}
                <div className="relative" style={{ marginLeft: 4 }}>
                  {/* Vertical timeline line */}
                  <div
                    className="absolute top-0 bottom-0"
                    style={{
                      left: 0,
                      width: 1,
                      background: 'var(--border)',
                    }}
                  />

                  <div className="space-y-1.5" style={{ paddingLeft: 18 }}>
                    {group.items.map(item => (
                      <button
                        key={item.note.filename}
                        onClick={() => handleNoteClick(item.note.filename)}
                        className="w-full text-left px-3.5 py-3 rounded-lg transition-colors relative"
                        style={{
                          background: 'var(--bg-panel)',
                          border: '1px solid var(--border)',
                          color: 'var(--text-secondary)',
                        }}
                        onMouseOver={e => {
                          e.currentTarget.style.background = 'var(--bg-surface-hover)'
                          e.currentTarget.style.borderColor = 'var(--border-strong)'
                        }}
                        onMouseOut={e => {
                          e.currentTarget.style.background = 'var(--bg-panel)'
                          e.currentTarget.style.borderColor = 'var(--border)'
                        }}
                      >
                        {/* Timeline dot connector */}
                        <div
                          className="absolute rounded-full"
                          style={{
                            left: -22,
                            top: 14,
                            width: 7,
                            height: 7,
                            background: 'var(--bg-panel)',
                            border: '2px solid var(--accent)',
                          }}
                        />

                        {/* Title + date row */}
                        <div className="flex items-start justify-between gap-2">
                          <span
                            className="text-xs font-medium truncate flex-1"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            {item.title}
                          </span>
                          <span
                            className="text-[10px] shrink-0 mt-0.5"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            {formatDate(item.created)}
                          </span>
                        </div>

                        {/* Body preview */}
                        {item.preview && (
                          <div
                            className="text-[11px] mt-1 leading-relaxed"
                            style={{
                              color: 'var(--text-muted)',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                            }}
                          >
                            {item.preview}
                          </div>
                        )}

                        {/* Tag dots */}
                        {item.tags.length > 0 && (
                          <div className="flex items-center gap-1.5 mt-2">
                            {item.tags.map(tag => (
                              <div
                                key={tag}
                                title={tag}
                                className="rounded-full"
                                style={{
                                  width: 7,
                                  height: 7,
                                  background: getTagColor(tag),
                                  opacity: 0.85,
                                }}
                              />
                            ))}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
