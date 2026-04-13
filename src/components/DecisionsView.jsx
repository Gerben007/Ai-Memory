import { useState, useMemo } from 'react'
import { useStore } from '../lib/store'

const STATUS_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active', color: '#34d399' },
  { key: 'superseded', label: 'Superseded', color: '#64748b' },
  { key: 'revisit', label: 'Revisit', color: '#fbbf24' }
]

function getStatus(note) {
  if (note.frontmatter?.status) return note.frontmatter.status
  const raw = note.content || ''
  const m = raw.match(/^status:\s*(\S+)/m)
  return m ? m[1] : 'active'
}

function getTitle(note) {
  return note.frontmatter?.title || note.filename.replace(/\.md$/, '').replace(/-/g, ' ')
}

function getTags(note) {
  if (note.frontmatter?.tags && Array.isArray(note.frontmatter.tags)) return note.frontmatter.tags
  const raw = note.content || ''
  const m = raw.match(/^tags:\s*\[([^\]]*)\]/m)
  if (m) return m[1].split(',').map(t => t.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
  return []
}

function extractDecisionSummary(body) {
  const match = (body || '').match(/## Decision\s*\n([\s\S]*?)(?=\n## |$)/)
  return match ? match[1].trim().slice(0, 150) : (body || '').slice(0, 150)
}

function StatusBadge({ status }) {
  const opt = STATUS_OPTIONS.find(s => s.key === status) || STATUS_OPTIONS[1]
  const color = opt.color || '#34d399'
  return (
    <span
      className="text-[10px] px-2 py-0.5 rounded-full font-medium"
      style={{ backgroundColor: color + '20', color }}
    >
      {status}
    </span>
  )
}

export default function DecisionsView() {
  const notes = useStore(s => s.notes)
  const search = useStore(s => s.search)
  const setActiveNote = useStore(s => s.setActiveNote)
  const createFromTemplate = useStore(s => s.createFromTemplate)

  const [statusFilter, setStatusFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [templateTitle, setTemplateTitle] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  // Filter to decision-tagged notes
  const decisions = useMemo(() => {
    let filtered = notes.filter(n => {
      const tags = getTags(n)
      return tags.includes('decision')
    })

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(n => getStatus(n) === statusFilter)
    }

    // Search filter
    if (searchQuery.trim()) {
      const results = search(searchQuery, 50)
      const matchedFiles = new Set(results.map(r => r.chunk.noteFilename))
      filtered = filtered.filter(n => matchedFiles.has(n.filename))
    }

    // Sort by created date descending
    filtered.sort((a, b) => {
      const da = new Date(a.frontmatter?.created || 0)
      const db = new Date(b.frontmatter?.created || 0)
      return db - da
    })

    return filtered
  }, [notes, statusFilter, searchQuery, search])

  const handleCreate = () => {
    if (templateTitle.trim()) {
      createFromTemplate('decision', templateTitle.trim())
      setTemplateTitle('')
      setShowCreate(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-white/5 px-4 py-3 md:px-6 md:py-4 glass-strong">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base md:text-lg font-semibold text-[var(--text-primary)]">⚖️ Decisions</h2>
            <p className="text-[10px] md:text-[11px] text-[var(--text-muted)] mt-0.5">
              {decisions.length} decision{decisions.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="btn-primary text-xs"
          >
            + New Decision
          </button>
        </div>

        {/* Create form */}
        {showCreate && (
          <div className="mt-3 flex gap-2 animate-fadeIn">
            <input
              type="text"
              value={templateTitle}
              onChange={e => setTemplateTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              placeholder="Decision title (e.g. 'Use PostgreSQL over MongoDB')"
              className="input-glass flex-1 text-sm"
              autoFocus
            />
            <button onClick={handleCreate} className="btn-primary text-xs">Create</button>
            <button onClick={() => { setShowCreate(false); setTemplateTitle('') }} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] px-2">&times;</button>
          </div>
        )}

        {/* Search */}
        <div className="mt-3">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search decisions... (e.g. 'why did I choose...')"
            className="input-glass w-full text-xs"
          />
        </div>

        {/* Status filter */}
        <div className="flex gap-2 mt-3">
          {STATUS_OPTIONS.map(opt => (
            <button
              key={opt.key}
              onClick={() => setStatusFilter(opt.key)}
              className={`text-[11px] px-3 py-1 rounded-full transition-colors ${
                statusFilter === opt.key
                  ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-white/[0.03]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Decision list */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {decisions.length === 0 ? (
          <div className="text-center text-[var(--text-muted)] mt-16">
            <div className="text-4xl mb-3 opacity-40">⚖️</div>
            <p className="text-sm">
              {searchQuery ? 'No decisions match your search' : statusFilter !== 'all' ? `No ${statusFilter} decisions` : 'No decisions logged yet'}
            </p>
            <p className="text-xs text-[var(--text-muted)] mt-2">
              Click "+ New Decision" to log your first decision
            </p>
          </div>
        ) : (
          <div className="space-y-3 max-w-3xl mx-auto">
            {decisions.map(note => {
              const title = getTitle(note)
              const status = getStatus(note)
              const summary = extractDecisionSummary(note.body || note.content)
              const tags = getTags(note).filter(t => t !== 'decision')
              const date = note.frontmatter?.created
                ? new Date(note.frontmatter.created).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                : ''

              return (
                <button
                  key={note.filename}
                  onClick={() => setActiveNote(note.filename)}
                  className="w-full text-left glass rounded-xl p-4 hover:border-[var(--accent)]/30 transition-colors group animate-fadeIn"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-medium text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors truncate">
                          {title}
                        </h3>
                        <StatusBadge status={status} />
                      </div>
                      {summary && (
                        <p className="text-xs text-[var(--text-secondary)] mt-1.5 line-clamp-2">
                          {summary}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-2">
                        {date && <span className="text-[10px] text-[var(--text-muted)]">{date}</span>}
                        {tags.length > 0 && (
                          <div className="flex gap-1">
                            {tags.map(tag => (
                              <span key={tag} className="text-[10px] text-[var(--text-muted)] bg-white/[0.03] px-1.5 py-0.5 rounded">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <span className="text-[var(--text-muted)] group-hover:text-[var(--text-secondary)] text-sm shrink-0">→</span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
