import { useState, useMemo, useCallback } from 'react'
import { useStore } from '../lib/store'
import { getTagColor, getTags, getBody, analyzeTagHealth } from '../lib/tagUtils'
import { saveNote as apiSaveNote } from '../lib/api'

// Build note content without matter.stringify (which can crash)
function buildNoteContent(note, newTags) {
  const raw = note.content || ''
  // Try to replace tags line in existing frontmatter
  const tagStr = newTags.map(t => t.includes(',') ? `"${t}"` : t).join(', ')
  const updated = raw.replace(
    /^tags:\s*\[.*?\]\s*$/m,
    `tags: [${tagStr}]`
  ).replace(
    /^updated:\s*.*$/m,
    `updated: ${new Date().toISOString()}`
  )
  return updated
}

export default function TagCleanup({ onClose }) {
  const notes = useStore(s => s.notes)
  const loadNotes = useStore(s => s.loadNotes)
  const rebuildIndex = useStore(s => s.rebuildIndex)

  const [renaming, setRenaming] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState(null)
  const [filter, setFilter] = useState('all')
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

      const updatedTags = [...new Set(noteTags.map(t => t === oldTag ? newTag : t))]
      const content = buildNoteContent(note, updatedTags)
      await apiSaveNote(note.filename, content)
      count++
    }

    await loadNotes()
    rebuildIndex()
    setProcessing(false)
    setResult(`Renamed "${oldTag}" → "${newTag}" in ${count} note${count !== 1 ? 's' : ''}`)
    setRenaming(null)
  }, [notes, loadNotes, rebuildIndex])

  // Delete a tag from all notes
  const deleteTag = useCallback(async (tag) => {
    setProcessing(true)
    setResult(null)

    let count = 0
    for (const note of notes) {
      const noteTags = getTags(note)
      if (!noteTags.includes(tag)) continue

      const updatedTags = noteTags.filter(t => t !== tag)
      const content = buildNoteContent(note, updatedTags)
      await apiSaveNote(note.filename, content)
      count++
    }

    await loadNotes()
    rebuildIndex()
    setProcessing(false)
    setResult(`Removed "${tag}" from ${count} note${count !== 1 ? 's' : ''}`)
  }, [notes, loadNotes, rebuildIndex])

  // Remove all orphan tags (tags used by only 1 note)
  const removeAllOrphans = useCallback(async () => {
    if (orphans.length === 0) return
    setProcessing(true)
    setResult(null)

    let totalChanges = 0
    for (const note of notes) {
      const noteTags = getTags(note)
      const cleaned = noteTags.filter(t => !orphans.includes(t))
      if (cleaned.length === noteTags.length) continue

      const content = buildNoteContent(note, cleaned)
      await apiSaveNote(note.filename, content)
      totalChanges++
    }

    await loadNotes()
    rebuildIndex()
    setProcessing(false)
    setResult(`Removed ${orphans.length} orphan tag${orphans.length !== 1 ? 's' : ''} from ${totalChanges} note${totalChanges !== 1 ? 's' : ''}`)
  }, [orphans, notes, loadNotes, rebuildIndex])

  // Fix all detected issues (similar/duplicate tags)
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

          const updatedTags = [...new Set(noteTags.map(t => t === oldTag ? issue.suggestion : t))]
          const content = buildNoteContent(note, updatedTags)
          await apiSaveNote(note.filename, content)
          totalChanges++
        }
      }
    }

    await loadNotes()
    rebuildIndex()
    setProcessing(false)
    setResult(`Fixed ${issues.length} issue${issues.length !== 1 ? 's' : ''} across ${totalChanges} note${totalChanges !== 1 ? 's' : ''}`)
  }, [issues, notes, loadNotes, rebuildIndex])

  // Clean everything: fix issues + remove orphans
  const cleanAll = useCallback(async () => {
    setProcessing(true)
    setResult(null)

    let changes = 0

    // Pass 1: fix issues
    for (const issue of issues) {
      for (const oldTag of issue.tags) {
        if (oldTag === issue.suggestion) continue
        for (const note of notes) {
          const noteTags = getTags(note)
          if (!noteTags.includes(oldTag)) continue
          const updatedTags = [...new Set(noteTags.map(t => t === oldTag ? issue.suggestion : t))]
          const content = buildNoteContent(note, updatedTags)
          await apiSaveNote(note.filename, content)
          changes++
        }
      }
    }

    // Reload after issue fixes to get fresh tag list
    await loadNotes()

    // Pass 2: remove orphans
    const freshNotes = useStore.getState().notes
    const freshHealth = analyzeTagHealth(freshNotes)
    for (const note of freshNotes) {
      const noteTags = getTags(note)
      const cleaned = noteTags.filter(t => !freshHealth.orphans.includes(t))
      if (cleaned.length === noteTags.length) continue
      const content = buildNoteContent(note, cleaned)
      await apiSaveNote(note.filename, content)
      changes++
    }

    await loadNotes()
    rebuildIndex()
    setProcessing(false)
    setResult(`Cleaned up: ${issues.length} issues fixed, ${freshHealth.orphans.length} orphans removed (${changes} notes updated)`)
  }, [issues, notes, loadNotes, rebuildIndex])

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

  const hasWork = issues.length > 0 || orphans.length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl rounded-2xl overflow-hidden"
        style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-strong)' }}
      >
        {/* Header */}
        <div className="p-4 md:p-5 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base md:text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Tag Cleanup</h2>
              <p className="text-[10px] md:text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {tagCounts.size} tags across {notes.length} notes
              </p>
            </div>
            <button onClick={onClose} style={{ color: 'var(--text-muted)', fontSize: 18 }}>&times;</button>
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
                className="text-[11px] px-3 py-1 rounded-full transition-colors"
                style={{
                  background: filter === tab.key ? 'var(--accent-soft)' : 'transparent',
                  color: filter === tab.key ? 'var(--accent-hi)' : 'var(--text-muted)'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Auto-cleanup buttons */}
          {hasWork && (
            <div className="flex gap-2 mt-3">
              <button
                onClick={cleanAll}
                disabled={processing}
                className="btn-primary text-[11px] disabled:opacity-40"
                style={{ padding: '6px 14px' }}
              >
                {processing ? 'Cleaning…' : `Clean All (${issues.length} issues + ${orphans.length} orphans)`}
              </button>
              {filter === 'orphans' && orphans.length > 0 && (
                <button
                  onClick={removeAllOrphans}
                  disabled={processing}
                  className="btn-secondary text-[11px] disabled:opacity-40"
                  style={{ padding: '6px 12px' }}
                >
                  Remove all orphans
                </button>
              )}
            </div>
          )}

          {/* Issues detail */}
          {issues.length > 0 && filter === 'issues' && (
            <div className="mt-3 p-3 rounded-xl" style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)' }}>
              <div className="space-y-1.5">
                {issues.map((issue, i) => (
                  <div key={i} className="text-xs flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                    <span style={{ color: 'var(--amber)' }}>•</span>
                    <span>{issue.message}</span>
                    <span style={{ color: 'var(--text-muted)' }}>→ {issue.suggestion}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={fixAllIssues}
                disabled={processing}
                className="mt-2 text-xs px-3 py-1.5 rounded-lg disabled:opacity-50 font-medium"
                style={{ background: 'var(--amber)', color: '#0a0a0d' }}
              >
                {processing ? 'Fixing…' : `Fix all ${issues.length} issues`}
              </button>
            </div>
          )}
        </div>

        {/* Result banner */}
        {result && (
          <div className="px-4 py-2 flex items-center justify-between text-xs shrink-0" style={{ background: 'rgba(74,222,128,0.08)', borderBottom: '1px solid rgba(74,222,128,0.15)', color: 'var(--green)' }}>
            <span>{result}</span>
            <button onClick={() => setResult(null)} style={{ opacity: 0.5 }}>&times;</button>
          </div>
        )}

        {/* Tag list */}
        <div className="flex-1 overflow-y-auto p-4 md:p-5">
          {displayTags.length === 0 ? (
            <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
              <p className="text-sm">{filter === 'issues' ? 'No tag issues found' : filter === 'orphans' ? 'No orphan tags' : 'No tags in vault'}</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {displayTags.map(([tag, count]) => (
                <div key={tag} className="rounded-lg transition-colors" style={selectedTag === tag ? { background: 'var(--bg-surface)' } : {}}>
                  {renaming?.from === tag ? (
                    <div className="px-3 py-2 space-y-2">
                      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Rename "{tag}" to:</div>
                      <input
                        type="text"
                        value={renaming.to}
                        onChange={e => setRenaming({ ...renaming, to: e.target.value })}
                        onKeyDown={e => {
                          if (e.key === 'Enter') renameTag(tag, renaming.to.trim())
                          if (e.key === 'Escape') setRenaming(null)
                        }}
                        className="w-full text-sm rounded-lg px-2.5 py-1.5 focus:outline-none"
                        style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--accent)' }}
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button onClick={() => renameTag(tag, renaming.to.trim())} disabled={processing || !renaming.to.trim()} className="text-xs disabled:opacity-50" style={{ color: 'var(--accent-hi)' }}>Save</button>
                        <button onClick={() => setRenaming(null)} className="text-xs" style={{ color: 'var(--text-muted)' }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer rounded-lg transition-colors"
                      onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                      onMouseOver={e => e.currentTarget.style.background = 'var(--bg-surface)'}
                      onMouseOut={e => { if (selectedTag !== tag) e.currentTarget.style.background = 'transparent' }}
                    >
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: getTagColor(tag) }} />
                      <span className="text-sm flex-1" style={{ color: 'var(--text-primary)' }}>{tag}</span>
                      <span className="text-[10px] shrink-0" style={{ color: 'var(--text-muted)' }}>{count}</span>
                    </div>
                  )}
                  {selectedTag === tag && !renaming && (
                    <div className="flex gap-2 px-3 pb-2">
                      <button
                        onClick={() => setRenaming({ from: tag, to: tag })}
                        className="text-[11px] px-2 py-1 rounded-lg transition-colors"
                        style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                      >
                        Rename
                      </button>
                      <button
                        onClick={() => deleteTag(tag)}
                        disabled={processing}
                        className="text-[11px] px-2 py-1 rounded-lg transition-colors disabled:opacity-50"
                        style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
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
