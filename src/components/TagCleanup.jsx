import { useState, useMemo, useCallback } from 'react'
import { useStore } from '../lib/store'
import { getTagColor, getTags, getBody, analyzeTagHealth } from '../lib/tagUtils'
import { saveNote as apiSaveNote, chatCompletion } from '../lib/api'

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
  const apiKey = useStore(s => s.apiKey)
  const model = useStore(s => s.model)

  const [renaming, setRenaming] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState(null)
  const [filter, setFilter] = useState('all')
  const [selectedTag, setSelectedTag] = useState(null)
  const [bulkReview, setBulkReview] = useState(null)  // { mappings: {oldTag: newTag|null}, reasoning }
  const [bulkLoading, setBulkLoading] = useState(false)

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

  // AI bulk tag review — sends entire tag list to Claude, gets back mappings
  const runBulkReview = useCallback(async () => {
    if (!apiKey) {
      setResult({ error: 'Set your Claude API key in Settings first' })
      return
    }
    setBulkLoading(true)
    setResult(null)

    const tagList = [...tagCounts.entries()].map(([t, c]) => `${t} (${c})`).join(', ')

    try {
      const res = await chatCompletion({
        model,
        max_tokens: 4000,
        system: `You are a knowledge taxonomy architect. Design a SYSTEMATIC, SOPHISTICATED tagging schema for this personal knowledge vault, then produce a consolidation plan that enforces it across all existing tags.

## Your job
Don't just merge duplicates — build a COHERENT TAXONOMY. Every tag must fit a deliberate system. The end result should feel like an engineered classification scheme, not an ad-hoc collection.

## Taxonomy principles
1. **Parent/child hierarchy** — prefer \`parent/child\` form for grouped concepts. Examples:
   - \`church/meintjieskop\`, \`church/brukaros\`, \`church/council\`
   - \`project/ai-memory\`, \`project/vault\`
   - \`person/john-doe\`, \`place/windhoek\`
2. **Consistent top-level categories** — pick a small set of parent categories (e.g., project, person, place, topic, church, event, tool) and fit most tags under them. Flat standalone tags are allowed only for broad themes (e.g., \`theology\`, \`strategy\`).
3. **Naming convention** — lowercase, hyphens for multi-word, no spaces, no special characters, no trailing punctuation. Singular over plural where ambiguous.
4. **Language** — translate non-English common nouns/concepts to English. Keep proper nouns (place names, personal names, institution names) in their original form.
5. **Resolve inconsistencies**:
   - case variants → single lowercase form
   - singular/plural duplicates → singular
   - synonyms → single canonical term
   - near-duplicates (typos, spacing) → canonical form
6. **Preserve specificity** — keep specific tags even if used once, but fit them into the hierarchy (e.g., a rare \`gk-meintjieskop\` becomes \`church/meintjieskop\`).
7. **Drop only truly generic noise** — tags like \`reference\`, \`document\`, \`note\`, \`email\` that apply to everything. If unsure, keep it.

## Output format
Return ONLY a JSON object, no prose outside it:
{
  "methodology": "2-3 sentence description of the taxonomy system you designed (parent categories used, naming rules, etc.)",
  "mappings": {
    "old-tag": "new-tag",
    "tag-to-delete": null
  },
  "reasoning": "Brief bullet summary of the main consolidation moves"
}

Rules for mappings:
- Only include tags that should CHANGE or be DELETED. Unchanged tags must NOT appear.
- Use \`null\` as the value to DELETE a tag entirely (only for true noise).
- Every mapping must follow the taxonomy you designed in "methodology" — be consistent.`,
        messages: [{
          role: 'user',
          content: `Review these tags (name followed by count in parens):\n\n${tagList}\n\nReturn the JSON consolidation plan.`
        }]
      }, apiKey)

      const data = await res.json()
      const text = data.content?.[0]?.text || ''

      // Extract JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('AI did not return valid JSON')
      const parsed = JSON.parse(jsonMatch[0])

      setBulkReview(parsed)
    } catch (err) {
      setResult({ error: `Bulk review failed: ${err.message}` })
    } finally {
      setBulkLoading(false)
    }
  }, [apiKey, model, tagCounts])

  // Apply the bulk review mappings (null value = delete tag)
  const applyBulkReview = useCallback(async () => {
    if (!bulkReview?.mappings) return
    setProcessing(true)

    const mappings = bulkReview.mappings
    let totalChanges = 0

    for (const note of notes) {
      const noteTags = getTags(note)
      const newTags = noteTags
        .map(t => (t in mappings ? mappings[t] : t))
        .filter(t => t != null && t !== '')
      const deduped = [...new Set(newTags)]
      if (deduped.length === noteTags.length && deduped.every((t, i) => t === noteTags[i])) continue

      const content = buildNoteContent(note, deduped)
      await apiSaveNote(note.filename, content)
      totalChanges++
    }

    await loadNotes()
    rebuildIndex()
    setProcessing(false)
    setBulkReview(null)
    setResult(`Applied ${Object.keys(mappings).length} tag change${Object.keys(mappings).length !== 1 ? 's' : ''} across ${totalChanges} note${totalChanges !== 1 ? 's' : ''}`)
  }, [bulkReview, notes, loadNotes, rebuildIndex])

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

          {/* AI bulk review — systematic taxonomy pass */}
          <div className="flex gap-2 mt-3">
            <button
              onClick={runBulkReview}
              disabled={bulkLoading || processing || tagCounts.size === 0}
              className="btn-primary text-[11px] disabled:opacity-40"
              style={{ padding: '6px 14px' }}
              title="Let Claude design a systematic taxonomy across all tags"
            >
              {bulkLoading ? 'Reviewing…' : 'AI Bulk Review'}
            </button>
          </div>
          <p className="text-[10px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
            Designs a coherent taxonomy, merges duplicates, translates to English, enforces parent/child hierarchy.
          </p>

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
          <div
            className="px-4 py-2 flex items-center justify-between text-xs shrink-0"
            style={
              typeof result === 'object' && result.error
                ? { background: 'rgba(239,68,68,0.08)', borderBottom: '1px solid rgba(239,68,68,0.15)', color: 'var(--red, #f87171)' }
                : { background: 'rgba(74,222,128,0.08)', borderBottom: '1px solid rgba(74,222,128,0.15)', color: 'var(--green)' }
            }
          >
            <span>{typeof result === 'object' ? result.error : result}</span>
            <button onClick={() => setResult(null)} style={{ opacity: 0.5 }}>&times;</button>
          </div>
        )}

        {/* Bulk review preview modal */}
        {bulkReview && (
          <div className="absolute inset-0 z-10 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
            <div
              className="w-full max-w-md max-h-[90%] flex flex-col rounded-2xl overflow-hidden"
              style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-strong)' }}
            >
              <div className="p-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Proposed Taxonomy
                  </h3>
                  <button onClick={() => setBulkReview(null)} style={{ color: 'var(--text-muted)', fontSize: 18 }}>&times;</button>
                </div>
                {bulkReview.methodology && (
                  <p className="text-[11px] mt-2 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    <span style={{ color: 'var(--accent-hi)' }}>System:</span> {bulkReview.methodology}
                  </p>
                )}
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {bulkReview.reasoning && (
                  <div className="mb-3 text-[11px] whitespace-pre-wrap" style={{ color: 'var(--text-muted)' }}>
                    {bulkReview.reasoning}
                  </div>
                )}
                <div className="space-y-1">
                  {Object.entries(bulkReview.mappings || {}).map(([from, to]) => (
                    <div key={from} className="flex items-center gap-2 text-xs py-1">
                      <span className="font-mono truncate" style={{ color: 'var(--text-secondary)' }}>{from}</span>
                      <span style={{ color: 'var(--text-muted)' }}>→</span>
                      {to == null ? (
                        <span className="font-mono" style={{ color: 'var(--red, #f87171)' }}>delete</span>
                      ) : (
                        <span className="font-mono truncate" style={{ color: 'var(--accent-hi)' }}>{to}</span>
                      )}
                    </div>
                  ))}
                  {Object.keys(bulkReview.mappings || {}).length === 0 && (
                    <p className="text-xs text-center py-4" style={{ color: 'var(--text-muted)' }}>
                      No changes proposed — your tags are already consistent.
                    </p>
                  )}
                </div>
              </div>
              <div className="p-4 flex gap-2 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
                <button
                  onClick={applyBulkReview}
                  disabled={processing || Object.keys(bulkReview.mappings || {}).length === 0}
                  className="btn-primary text-xs flex-1 disabled:opacity-40"
                  style={{ padding: '8px 14px' }}
                >
                  {processing ? 'Applying…' : `Apply ${Object.keys(bulkReview.mappings || {}).length} change${Object.keys(bulkReview.mappings || {}).length !== 1 ? 's' : ''}`}
                </button>
                <button
                  onClick={() => setBulkReview(null)}
                  disabled={processing}
                  className="text-xs px-3 py-2 rounded-lg"
                  style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                >
                  Cancel
                </button>
              </div>
            </div>
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
