import { useState, useMemo, useCallback } from 'react'
import { useStore } from '../lib/store'
import { getTagColor, getTags, analyzeTagHealth } from '../lib/tagUtils'
import matter from 'gray-matter'

export default function TagCleanup({ onClose }) {
  const notes = useStore(s => s.notes)
  const saveNote = useStore(s => s.saveNote)
  const loadNotes = useStore(s => s.loadNotes)
  const rebuildIndex = useStore(s => s.rebuildIndex)

  const [renaming, setRenaming] = useState(null) // { from: string, to: string }
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState(null)
  const [filter, setFilter] = useState('all') // all | issues | orphans
  const [selectedTag, setSelectedTag] = useState(null)

  const health = useMemo(() => analyzeTagHealth(notes), [notes])
  const { tagCounts, issues, orphans } = health

  const sortedTags = useMemo(() =>
    [...tagCounts.entries()].sort((a, b) => b[1] - a[1]),
    [tagCounts]
  )

  // Rename/merge a tag across all notes
  const renameTag = useCallback(async (oldTag, newTag) => {
    if (!oldTag || !newTag || oldTag === newTag) return
    setProcessing(true)
    setResult(null)

    let count = 0
    for (const note of notes) {
      const noteTags = getTags(note)
      if (!noteTags.includes(oldTag)) continue

      const updatedTags = noteTags.map(t => t === oldTag ? newTag : t)
      const dedupedTags = [...new Set(updatedTags)]

      const fm = { ...(note.frontmatter || {}), tags: dedupedTags, updated: new Date().toISOString() }
      const content = matter.stringify(note.body || '', fm)
      await saveNote(note.filename, content)
      count++
    }

    await loadNotes()
    rebuildIndex()
    setProcessing(false)
    setResult(`Renamed "${oldTag}" → "${newTag}" in ${count} note${count !== 1 ? 's' : ''}`)
    setRenaming(null)
  }, [notes, saveNote, loadNotes, rebuildIndex])

  // Delete a tag from all notes
  const deleteTag = useCallback(async (tag) => {
    setProcessing(true)
    setResult(null)

    let count = 0
    for (const note of notes) {
      const noteTags = getTags(note)
      if (!noteTags.includes(tag)) continue

      const updatedTags = noteTags.filter(t => t !== tag)
      const fm = { ...(note.frontmatter || {}), tags: updatedTags, updated: new Date().toISOString() }
      const content = matter.stringify(note.body || '', fm)
      await saveNote(note.filename, content)
      count++
    }

    await loadNotes()
    rebuildIndex()
    setProcessing(false)
    setResult(`Removed "${tag}" from ${count} note${count !== 1 ? 's' : ''}`)
  }, [notes, saveNote, loadNotes, rebuildIndex])

  // Auto-fix all detected issues
  const fixAllIssues = useCallback(async () => {
    if (issues.length === 0) return
    setProcessing(true)
    setResult(null)

    let totalChanges = 0
    for (const issue of issues) {
      for (const oldTag of issue.tags) {
        if (oldTag === issue.suggestion) continue
        for (const note of notes) {
          const noteTags = getTags(note)
          if (!noteTags.includes(oldTag)) continue

          const updatedTags = noteTags.map(t => t === oldTag ? issue.suggestion : t)
          const dedupedTags = [...new Set(updatedTags)]
          const fm = { ...(note.frontmatter || {}), tags: dedupedTags, updated: new Date().toISOString() }
          const content = matter.stringify(note.body || '', fm)
          await saveNote(note.filename, content)
          totalChanges++
        }
      }
    }

    await loadNotes()
    rebuildIndex()
    setProcessing(false)
    setResult(`Fixed ${issues.length} issue${issues.length !== 1 ? 's' : ''} across ${totalChanges} note${totalChanges !== 1 ? 's' : ''}`)
  }, [issues, notes, saveNote, loadNotes, rebuildIndex])

  const displayTags = useMemo(() => {
    if (filter === 'issues') {
      const issueTags = new Set()
      issues.forEach(i => i.tags.forEach(t => issueTags.add(t)))
      return sortedTags.filter(([tag]) => issueTags.has(tag))
    }
    if (filter === 'orphans') {
      return sortedTags.filter(([tag]) => orphans.includes(tag))
    }
    return sortedTags
  }, [sortedTags, filter, issues, orphans])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="p-4 md:p-5 border-b border-white/5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base md:text-lg font-semibold text-[var(--text-primary)]">🏷 Tag Cleanup</h2>
              <p className="text-[10px] md:text-[11px] text-[var(--text-muted)] mt-0.5">
                {tagCounts.size} tags across {notes.length} notes
                {issues.length > 0 && <span className="text-amber-400 ml-2">• {issues.length} issue{issues.length !== 1 ? 's' : ''} found</span>}
              </p>
            </div>
            <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-lg">&times;</button>
          </div>

          {/* Filter tabs */}
          <div className="flex gap-2 mt-3">
            {[
              { key: 'all', label: `All (${tagCounts.size})` },
              { key: 'issues', label: `Issues (${issues.length})` },
              { key: 'orphans', label: `Orphans (${orphans.length})` }
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={`text-[11px] px-3 py-1 rounded-full transition-colors ${
                  filter === tab.key
                    ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-white/[0.03]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Issues quick fix */}
          {issues.length > 0 && filter === 'issues' && (
            <div className="mt-3 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
              <div className="space-y-1.5">
                {issues.map((issue, i) => (
                  <div key={i} className="text-xs text-[var(--text-secondary)] flex items-center gap-2">
                    <span className="text-amber-400">•</span>
                    <span>{issue.message}</span>
                    <span className="text-[var(--text-muted)]">→ {issue.suggestion}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={fixAllIssues}
                disabled={processing}
                className="mt-2 text-xs bg-amber-600 text-white px-3 py-1.5 rounded-lg hover:bg-amber-500 disabled:opacity-50"
              >
                {processing ? 'Fixing...' : `Fix all ${issues.length} issues`}
              </button>
            </div>
          )}
        </div>

        {/* Result banner */}
        {result && (
          <div className="px-4 py-2 bg-green-500/10 border-b border-green-500/20 text-xs text-green-400 flex items-center justify-between">
            <span>{result}</span>
            <button onClick={() => setResult(null)} className="text-green-400/50 hover:text-green-400">&times;</button>
          </div>
        )}

        {/* Tag list */}
        <div className="flex-1 overflow-y-auto p-4 md:p-5">
          {displayTags.length === 0 ? (
            <div className="text-center text-[var(--text-muted)] py-8">
              <p className="text-sm">{filter === 'issues' ? 'No tag issues found' : filter === 'orphans' ? 'No orphan tags' : 'No tags in vault'}</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {displayTags.map(([tag, count]) => (
                <div key={tag} className="rounded-lg hover:bg-white/[0.03]">
                  {renaming?.from === tag ? (
                    <div className="px-3 py-2 space-y-2">
                      <div className="text-xs text-[var(--text-muted)]">Rename "{tag}" to:</div>
                      <input
                        type="text"
                        value={renaming.to}
                        onChange={e => setRenaming({ ...renaming, to: e.target.value })}
                        onKeyDown={e => {
                          if (e.key === 'Enter') renameTag(tag, renaming.to.trim())
                          if (e.key === 'Escape') setRenaming(null)
                        }}
                        className="w-full bg-gray-800 text-sm text-[var(--text-primary)] rounded-lg px-2.5 py-1.5 border border-[var(--accent)] focus:outline-none"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button onClick={() => renameTag(tag, renaming.to.trim())} disabled={processing || !renaming.to.trim()} className="text-xs text-[var(--accent)] hover:underline disabled:opacity-50">Save</button>
                        <button onClick={() => setRenaming(null)} className="text-xs text-[var(--text-muted)]">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer"
                      onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                    >
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: getTagColor(tag) }} />
                      <span className="text-sm text-[var(--text-primary)] flex-1">{tag}</span>
                      <span className="text-[10px] text-[var(--text-muted)] shrink-0">{count}</span>
                    </div>
                  )}
                  {/* Actions — shown on tap/select */}
                  {selectedTag === tag && !renaming && (
                    <div className="flex gap-2 px-3 pb-2">
                      <button
                        onClick={() => setRenaming({ from: tag, to: tag })}
                        className="text-[11px] text-[var(--text-secondary)] hover:text-[var(--accent)] px-2 py-1 rounded-lg bg-white/[0.03] border border-white/5"
                      >
                        Rename
                      </button>
                      <button
                        onClick={() => deleteTag(tag)}
                        disabled={processing}
                        className="text-[11px] text-[var(--text-secondary)] hover:text-red-400 px-2 py-1 rounded-lg bg-white/[0.03] border border-white/5 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
