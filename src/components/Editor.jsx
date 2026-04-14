import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useStore } from '../lib/store'
import { renderMarkdown } from '../lib/markdownParser'
import { useAutoSave } from '../hooks/useAutoSave'
import { getTagColor, getTags, getTagParts, suggestTags, getAllTagsWithCounts, buildTagTree } from '../lib/tagUtils'
import { saveNote as apiSaveNote, chatCompletion } from '../lib/api'
import TagPill from './TagPill'
import matter from 'gray-matter'

export default function Editor() {
  const notes = useStore(s => s.notes)
  const activeNoteFilename = useStore(s => s.activeNoteFilename)
  const saveNote = useStore(s => s.saveNote)
  const deleteNote = useStore(s => s.deleteNote)
  const setActiveNote = useStore(s => s.setActiveNote)
  const createNote = useStore(s => s.createNote)

  const apiKey = useStore(s => s.apiKey)
  const model = useStore(s => s.model)
  const activeNote = notes.find(n => n.filename === activeNoteFilename)

  const [body, setBody] = useState('')
  const [title, setTitle] = useState('')
  const [tags, setTags] = useState('')
  const [showPreview, setShowPreview] = useState(true)
  const [saveStatus, setSaveStatus] = useState('')
  const [dirty, setDirty] = useState(false)
  const [showTagSuggestions, setShowTagSuggestions] = useState(false)
  const [tagSearch, setTagSearch] = useState('')
  const [showSplitConfirm, setShowSplitConfirm] = useState(false)
  const [splitResult, setSplitResult] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [autoTagging, setAutoTagging] = useState(false)
  const previewRef = useRef(null)
  const tagInputRef = useRef(null)

  // Load note content when active note changes
  useEffect(() => {
    if (activeNote) {
      setBody(activeNote.body || '')
      setTitle(activeNote.frontmatter?.title || activeNote.filename.replace(/\.md$/, ''))
      setTags(getTags(activeNote).join(', '))
      setDirty(false)
      setSaveStatus('')
      setShowSplitConfirm(false)
      setSplitResult(null)
    }
  }, [activeNoteFilename]) // intentionally only depend on filename

  // Build full content from parts — manual frontmatter to avoid matter.stringify failures
  const buildContent = useCallback((bodyText, titleText, tagsText) => {
    const fm = activeNote?.frontmatter || {}
    const tagList = tagsText.split(',').map(t => t.trim()).filter(Boolean)
    const now = new Date().toISOString()
    const created = fm.created || now

    // Preserve extra frontmatter keys
    const extra = Object.entries(fm)
      .filter(([k]) => !['title', 'tags', 'created', 'updated'].includes(k))
      .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
      .join('\n')

    const tagStr = tagList.map(t => t.includes(',') ? `"${t}"` : t).join(', ')
    const frontmatter = [
      '---',
      `title: "${titleText.replace(/"/g, '\\"')}"`,
      `tags: [${tagStr}]`,
      `created: ${created}`,
      `updated: ${now}`,
      extra,
      '---'
    ].filter(Boolean).join('\n')

    return `${frontmatter}\n\n${bodyText}\n`
  }, [activeNote])

  // Manual save
  const handleManualSave = useCallback(async () => {
    if (!activeNoteFilename) return
    try {
      const content = buildContent(body, title, tags)
      await saveNote(activeNoteFilename, content)
      setSaveStatus('Saved!')
      setDirty(false)
      setTimeout(() => setSaveStatus(''), 3000)
    } catch (err) {
      console.error('Save failed:', err)
      setSaveStatus('Save failed')
      setTimeout(() => setSaveStatus(''), 4000)
    }
  }, [activeNoteFilename, body, title, tags, buildContent, saveNote])

  // Auto-save
  const doSave = useCallback(async (bodyText, titleText, tagsText) => {
    if (!activeNoteFilename) return
    try {
      const content = buildContent(bodyText, titleText, tagsText)
      await saveNote(activeNoteFilename, content)
      setSaveStatus('Saved!')
      setDirty(false)
      setTimeout(() => setSaveStatus(''), 3000)
    } catch (err) {
      console.error('Auto-save failed:', err)
    }
  }, [activeNoteFilename, buildContent, saveNote])

  const { triggerSave } = useAutoSave(doSave)

  const handleBodyChange = (e) => {
    const val = e.target.value
    setBody(val)
    setDirty(true)
    triggerSave(val, title, tags)
  }

  const handleTitleChange = (e) => {
    const val = e.target.value
    setTitle(val)
    setDirty(true)
    triggerSave(body, val, tags)
  }

  const handleTagsChange = (e) => {
    const val = e.target.value
    setTags(val)
    setDirty(true)
    triggerSave(body, title, val)
  }

  // Ctrl+S / Cmd+S to save
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleManualSave()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleManualSave])

  // Handle wikilink clicks in preview
  useEffect(() => {
    const preview = previewRef.current
    if (!preview) return
    const handleClick = (e) => {
      const link = e.target.closest('.wikilink')
      if (link) {
        e.preventDefault()
        const target = link.dataset.wikilink
        const targetNote = notes.find(n => {
          const noteTitle = (n.frontmatter?.title || '').toLowerCase()
          const noteName = n.filename.replace(/\.md$/, '').toLowerCase()
          return noteTitle === target.toLowerCase() || noteName === target.toLowerCase()
        })
        if (targetNote) setActiveNote(targetNote.filename)
      }
    }
    preview.addEventListener('click', handleClick)
    return () => preview.removeEventListener('click', handleClick)
  }, [notes, setActiveNote])

  // Tag suggestions
  const currentTagList = useMemo(() =>
    tags.split(',').map(t => t.trim()).filter(Boolean),
    [tags]
  )

  const tagSuggestions = useMemo(() =>
    suggestTags(body, title, currentTagList, notes),
    [body, title, currentTagList, notes]
  )

  const allVaultTags = useMemo(() => {
    const counts = getAllTagsWithCounts(notes)
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .filter(([tag]) => !currentTagList.some(t => t.toLowerCase() === tag.toLowerCase()))
  }, [notes, currentTagList])

  const addTag = (tag) => {
    if (currentTagList.some(t => t.toLowerCase() === tag.toLowerCase())) return
    const newTags = currentTagList.length > 0 ? `${tags}, ${tag}` : tag
    setTags(newTags)
    setDirty(true)
    triggerSave(body, title, newTags)
  }

  // Auto-generate tags from content using AI
  const handleAutoTag = async () => {
    if (!body.trim() || autoTagging) return

    const allTagCounts = getAllTagsWithCounts(notes)
    const existingTags = [...allTagCounts.keys()]

    // If no API key, fall back to keyword extraction
    if (!apiKey) {
      const extracted = suggestTags(body, title, currentTagList, notes)
      if (extracted.length > 0) {
        const newTags = [...currentTagList, ...extracted.map(s => s.tag)]
        const joined = newTags.join(', ')
        setTags(joined)
        setDirty(true)
        triggerSave(body, title, joined)
      }
      return
    }

    setAutoTagging(true)
    try {
      const res = await chatCompletion({
        model,
        max_tokens: 200,
        system: `You are a tag generator for a knowledge vault that uses hierarchical tags.

Rules:
- Return ONLY a comma-separated list of tags, nothing else
- Use hierarchical format: parent/child (e.g., tech/database, business/finance, personal/health)
- Use lowercase
- Prefer reusing existing vault tags when they fit: ${existingTags.slice(0, 50).join(', ')}
- Generate 3-7 tags total
- Mix of broad parent tags and specific parent/child tags
- Do NOT include tags the note already has: ${currentTagList.join(', ')}`,
        messages: [{ role: 'user', content: `Title: ${title}\n\nContent:\n${body.slice(0, 2000)}` }]
      }, apiKey)

      const data = await res.json()
      const aiText = data.content?.[0]?.text || ''
      const aiTags = aiText.split(',').map(t => t.trim().toLowerCase().replace(/[^a-z0-9-/]/g, '').replace(/\/+/g, '/').replace(/^\/|\/$/g, '')).filter(Boolean)

      if (aiTags.length > 0) {
        const combined = [...currentTagList, ...aiTags.filter(t => !currentTagList.some(c => c.toLowerCase() === t))]
        const joined = combined.join(', ')
        setTags(joined)
        setDirty(true)
        triggerSave(body, title, joined)
      }
    } catch (err) {
      console.error('Auto-tag failed:', err)
      // Fall back to keyword extraction
      const extracted = suggestTags(body, title, currentTagList, notes)
      if (extracted.length > 0) {
        const newTags = [...currentTagList, ...extracted.map(s => s.tag)]
        const joined = newTags.join(', ')
        setTags(joined)
        setDirty(true)
        triggerSave(body, title, joined)
      }
    } finally {
      setAutoTagging(false)
    }
  }

  // Close tag dropdown on outside click
  useEffect(() => {
    if (!showTagSuggestions) return
    const handleClick = (e) => {
      if (!e.target.closest('[data-tag-picker]')) setShowTagSuggestions(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showTagSuggestions])

  // Split note by headings
  const detectSections = useMemo(() => {
    if (!body) return []
    const sections = []
    const lines = body.split('\n')
    let currentHeading = null
    let currentLines = []

    for (const line of lines) {
      const headingMatch = line.match(/^##\s+(.+)/)
      if (headingMatch) {
        if (currentHeading !== null) {
          const text = currentLines.join('\n').trim()
          if (text) sections.push({ heading: currentHeading, body: text })
        }
        currentHeading = headingMatch[1].trim()
        currentLines = []
      } else if (currentHeading !== null) {
        currentLines.push(line)
      } else {
        // Content before first heading — goes to intro
        currentLines.push(line)
      }
    }
    // Last section
    if (currentHeading !== null) {
      const text = currentLines.join('\n').trim()
      if (text) sections.push({ heading: currentHeading, body: text })
    }

    return sections
  }, [body])

  const handleSplitNote = async () => {
    if (detectSections.length < 2) return

    const parentTitle = title
    const baseTags = currentTagList
    const results = []

    for (const section of detectSections) {
      const sectionTitle = section.heading
      const slug = sectionTitle.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
      const filename = `${slug}.md`

      // Skip if a note with this name already exists
      if (notes.find(n => n.filename === filename)) {
        results.push({ title: sectionTitle, filename, status: 'exists' })
        continue
      }

      try {
        const now = new Date().toISOString()
        const tagStr = baseTags.length > 0 ? baseTags.map(t => t.includes(',') ? `"${t}"` : t).join(', ') : ''
        const sectionContent = `---\ntitle: "${sectionTitle.replace(/"/g, '\\"')}"\ntags: [${tagStr}]\ncreated: ${now}\nupdated: ${now}\n---\n\n${section.body}\n\n---\n\n*Split from [[${parentTitle}]]*\n`

        // Use API directly to create new file (store.saveNote only updates existing)
        await apiSaveNote(filename, sectionContent)
        results.push({ title: sectionTitle, filename, status: 'created' })
      } catch (err) {
        console.error('Split error for', sectionTitle, ':', err)
        results.push({ title: sectionTitle, filename, status: 'error', error: err.message })
      }
    }

    // Reload all notes to pick up new ones
    await useStore.getState().loadNotes()
    useStore.getState().rebuildIndex()

    setSplitResult(results)
    setShowSplitConfirm(false)
  }

  if (!activeNote) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ color: 'var(--text-muted)' }}>
        <div className="text-center">
          <svg className="mx-auto mb-3 opacity-20" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          <p className="text-xs">Select a note or create a new one</p>
        </div>
      </div>
    )
  }

  const renderedMarkdown = renderMarkdown(body)
  const wordCount = body.split(/\s+/).filter(Boolean).length
  const canSplit = detectSections.length >= 2

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-base)' }}>

      {/* ── Toolbar ─────────────────────────────────────────────── */}
      <div className="shrink-0 px-5 pt-4 pb-0" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)' }}>

        {/* Title row */}
        <div className="flex items-center gap-3 pb-3">
          <input
            type="text"
            value={title}
            onChange={handleTitleChange}
            className="flex-1 min-w-0 bg-transparent font-semibold focus:outline-none"
            style={{
              fontSize: 17,
              color: 'var(--text-primary)',
              borderBottom: '1px solid transparent',
              paddingBottom: 1,
              letterSpacing: '-0.02em'
            }}
            onFocus={e => e.target.style.borderBottomColor = 'var(--accent)'}
            onBlur={e => e.target.style.borderBottomColor = 'transparent'}
            placeholder="Untitled"
          />

          {/* Status */}
          <div className="flex items-center gap-2 shrink-0">
            {saveStatus && (
              <span
                className="text-[11px] font-medium px-2.5 py-1 rounded-md animate-fadeIn"
                style={{
                  color: saveStatus.includes('fail') ? 'var(--red)' : 'var(--green)',
                  background: saveStatus.includes('fail') ? 'rgba(248,113,113,0.1)' : 'rgba(74,222,128,0.1)',
                  border: `1px solid ${saveStatus.includes('fail') ? 'rgba(248,113,113,0.2)' : 'rgba(74,222,128,0.2)'}`
                }}
              >
                {saveStatus}
              </span>
            )}
            {dirty && !saveStatus && (
              <span className="text-[11px] hidden sm:inline px-2 py-0.5 rounded-md" style={{ color: 'var(--amber)', background: 'rgba(251,191,36,0.08)' }}>Unsaved</span>
            )}

            {/* Auto-tag */}
            <button
              onClick={handleAutoTag}
              disabled={autoTagging || !body.trim()}
              className="hidden sm:inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg transition-all"
              style={{
                border: '1px solid var(--border)',
                color: 'var(--accent-hi)',
                background: 'var(--accent-soft)',
                opacity: (autoTagging || !body.trim()) ? 0.35 : 1
              }}
              title="Auto-generate tags from content"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              {autoTagging ? 'Tagging…' : 'Auto-tag'}
            </button>

            {/* Split */}
            {canSplit && (
              <button
                onClick={() => setShowSplitConfirm(true)}
                className="hidden sm:inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg transition-all"
                style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)', background: 'transparent' }}
                title={`Split into ${detectSections.length} notes`}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                Split
              </button>
            )}

            {/* Save */}
            <button
              onClick={handleManualSave}
              className="btn-primary text-[11px]"
              style={{ padding: '6px 14px' }}
            >
              Save
            </button>

            {/* Preview toggle */}
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="hidden sm:inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg transition-all"
              style={{
                border: '1px solid var(--border)',
                color: showPreview ? 'var(--text-primary)' : 'var(--text-muted)',
                background: showPreview ? 'var(--bg-surface-hover)' : 'transparent'
              }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              {showPreview ? 'Preview' : 'Preview'}
            </button>

            {/* Delete */}
            {confirmDelete ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => { deleteNote(activeNoteFilename); setConfirmDelete(false) }}
                  className="text-[11px] px-2.5 py-1.5 rounded-lg font-medium"
                  style={{ background: 'var(--red)', color: '#fff' }}
                >
                  Confirm
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  style={{ color: 'var(--text-muted)', fontSize: 16, padding: '0 6px' }}
                >
                  &times;
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center justify-center rounded-lg transition-all"
                style={{ width: 30, height: 30, border: '1px solid var(--border)', color: 'var(--text-muted)' }}
                onMouseOver={e => { e.currentTarget.style.color = 'var(--red)'; e.currentTarget.style.borderColor = 'var(--red)' }}
                onMouseOut={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border)' }}
                title="Delete note"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Tags + meta row */}
        <div className="flex items-center gap-2 pb-2.5 flex-wrap min-h-[28px]">
          <span className="text-[10px] font-medium tracking-wider uppercase shrink-0" style={{ color: 'var(--text-muted)' }}>Tags</span>

          {currentTagList.map(tag => (
            <TagPill
              key={tag}
              tag={tag}
              onRemove={(t) => {
                const newTags = currentTagList.filter(x => x !== t).join(', ')
                setTags(newTags)
                setDirty(true)
                triggerSave(body, title, newTags)
              }}
            />
          ))}

          {/* Add tag button */}
          <div className="relative" data-tag-picker>
            <button
              onClick={() => setShowTagSuggestions(!showTagSuggestions)}
              className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md transition-colors"
              style={{
                border: '1px dashed var(--border)',
                color: 'var(--text-muted)'
              }}
              onMouseOver={e => e.currentTarget.style.color = 'var(--text-secondary)'}
              onMouseOut={e => e.currentTarget.style.color = 'var(--text-muted)'}
            >
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              tag
            </button>

            {/* Tag picker dropdown */}
            {showTagSuggestions && (
              <div
                data-tag-picker
                className="absolute top-full left-0 mt-1.5 w-64 rounded-xl shadow-2xl z-50 overflow-hidden animate-fadeIn"
                style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-strong)' }}
              >
                <div className="p-2" style={{ borderBottom: '1px solid var(--border)' }}>
                  <input
                    ref={tagInputRef}
                    type="text"
                    value={tagSearch}
                    onChange={e => setTagSearch(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && tagSearch.trim()) { addTag(tagSearch.trim().toLowerCase()); setTagSearch('') }
                      if (e.key === 'Escape') setShowTagSuggestions(false)
                    }}
                    placeholder="Search or create tag…"
                    className="w-full text-xs rounded-lg px-2.5 py-1.5 focus:outline-none"
                    style={{
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-primary)',
                    }}
                    autoFocus
                  />
                </div>

                <div className="max-h-52 overflow-y-auto">
                  {tagSuggestions.length > 0 && (
                    <div className="px-1 pt-1.5">
                      <div className="section-label">Suggested</div>
                      {tagSuggestions.filter(s => !tagSearch || s.tag.toLowerCase().includes(tagSearch.toLowerCase())).map(s => {
                        const parts = getTagParts(s.tag)
                        return (
                          <button
                            key={s.tag}
                            onMouseDown={e => { e.preventDefault(); addTag(s.tag); setTagSearch('') }}
                            className="w-full flex items-center gap-2 px-2 py-1.5 text-left text-xs rounded-lg transition-colors"
                            style={{ color: 'var(--text-secondary)' }}
                            onMouseOver={e => e.currentTarget.style.background = 'var(--bg-surface)'}
                            onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                          >
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: getTagColor(s.tag) }} />
                            <span className="flex-1">
                              {parts.isHierarchical
                                ? <><span style={{ color: 'var(--text-muted)' }}>{parts.parent}/</span>{parts.child}</>
                                : s.tag}
                            </span>
                            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{s.count}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}

                  <div className="px-1 py-1">
                    {tagSuggestions.length > 0 && <div className="section-label">All tags</div>}
                    {(() => {
                      const filtered = allVaultTags.filter(([tag]) => !tagSearch || tag.toLowerCase().includes(tagSearch.toLowerCase()))
                      const tree = buildTagTree(new Map(filtered))
                      const items = []
                      for (const [parent, node] of tree) {
                        const hasChildren = node.children.size > 0
                        if (hasChildren) {
                          items.push(
                            <div key={`hdr-${parent}`} className="flex items-center gap-1.5 px-2 pt-2 pb-0.5">
                              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: getTagColor(parent) }} />
                              <span className="section-label" style={{ padding: 0 }}>{parent}</span>
                              <button
                                onMouseDown={e => { e.preventDefault(); addTag(parent); setTagSearch('') }}
                                className="ml-auto text-[11px] transition-colors"
                                style={{ color: 'var(--text-muted)' }}
                                onMouseOver={e => e.currentTarget.style.color = 'var(--text-secondary)'}
                                onMouseOut={e => e.currentTarget.style.color = 'var(--text-muted)'}
                              >+</button>
                            </div>
                          )
                          for (const [child, count] of node.children) {
                            const fullTag = `${parent}/${child}`
                            items.push(
                              <button
                                key={fullTag}
                                onMouseDown={e => { e.preventDefault(); addTag(fullTag); setTagSearch('') }}
                                className="w-full flex items-center gap-2 pl-5 pr-2 py-1.5 text-left text-xs rounded-lg transition-colors"
                                style={{ color: 'var(--text-secondary)' }}
                                onMouseOver={e => e.currentTarget.style.background = 'var(--bg-surface)'}
                                onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                              >
                                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: getTagColor(fullTag) }} />
                                <span className="flex-1">{child}</span>
                                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{count}</span>
                              </button>
                            )
                          }
                        }
                        if (!hasChildren && node.count > 0) {
                          items.push(
                            <button
                              key={parent}
                              onMouseDown={e => { e.preventDefault(); addTag(parent); setTagSearch('') }}
                              className="w-full flex items-center gap-2 px-2 py-1.5 text-left text-xs rounded-lg transition-colors"
                              style={{ color: 'var(--text-secondary)' }}
                              onMouseOver={e => e.currentTarget.style.background = 'var(--bg-surface)'}
                              onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                            >
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: getTagColor(parent) }} />
                              <span className="flex-1">{parent}</span>
                              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{node.count}</span>
                            </button>
                          )
                        }
                      }
                      return items.slice(0, 20)
                    })()}
                    {tagSearch && !allVaultTags.some(([t]) => t.toLowerCase() === tagSearch.toLowerCase()) && (
                      <button
                        onMouseDown={e => { e.preventDefault(); addTag(tagSearch.trim().toLowerCase()); setTagSearch('') }}
                        className="w-full flex items-center gap-2 px-2 py-1.5 text-left text-xs rounded-lg transition-colors"
                        style={{ color: 'var(--accent-hi)' }}
                        onMouseOver={e => e.currentTarget.style.background = 'var(--bg-surface)'}
                        onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                      >
                        + Create "{tagSearch.trim()}"
                        {tagSearch.includes('/') && (
                          <span className="text-[10px] ml-1" style={{ color: 'var(--text-muted)' }}>hierarchical</span>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Meta info */}
          <div className="ml-auto flex items-center gap-3 shrink-0">
            {wordCount > 0 && (
              <span className="text-[10px] hidden sm:inline" style={{ color: 'var(--text-muted)' }}>
                {wordCount} words
              </span>
            )}
            {activeNote.frontmatter?.updated && (
              <span className="text-[10px] hidden sm:inline" style={{ color: 'var(--text-muted)' }}>
                {new Date(activeNote.frontmatter.updated).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Split confirm banner ─────────────────────────────────── */}
      {showSplitConfirm && (
        <div className="px-5 py-3 shrink-0 animate-fadeIn" style={{ background: 'rgba(212,144,10,0.06)', borderBottom: '1px solid rgba(212,144,10,0.2)' }}>
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Split into {detectSections.length} notes?</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                Each ## section becomes its own note, inheriting current tags and linking back here.
              </p>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5">
                {detectSections.map((s, i) => (
                  <span key={i} className="text-xs flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                    <span className="w-1 h-1 rounded-full" style={{ background: 'var(--accent)' }} />
                    {s.heading}
                  </span>
                ))}
              </div>
              <div className="flex gap-2 mt-3">
                <button onClick={handleSplitNote} className="btn-primary text-xs" style={{ padding: '5px 14px' }}>
                  Split Note
                </button>
                <button onClick={() => setShowSplitConfirm(false)} className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Split result banner ──────────────────────────────────── */}
      {splitResult && (
        <div className="px-5 py-3 shrink-0 animate-fadeIn" style={{ background: 'rgba(74,222,128,0.05)', borderBottom: '1px solid rgba(74,222,128,0.15)' }}>
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Split complete</p>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
                {splitResult.map((r, i) => (
                  <span key={i} className="text-xs">
                    {r.status === 'created' ? (
                      <button onClick={() => setActiveNote(r.filename)} style={{ color: 'var(--accent-hi)' }} className="hover:underline">{r.title}</button>
                    ) : r.status === 'exists' ? (
                      <span style={{ color: 'var(--text-muted)' }}>{r.title} (exists)</span>
                    ) : (
                      <span style={{ color: 'var(--red)' }}>{r.title}: error</span>
                    )}
                  </span>
                ))}
              </div>
              <button onClick={() => setSplitResult(null)} className="text-[11px] mt-2" style={{ color: 'var(--text-muted)' }}>Dismiss</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Editor / Preview ────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        <div className={`${showPreview ? 'hidden sm:flex sm:w-1/2' : 'flex-1'} flex flex-col`}
          style={showPreview ? { borderRight: '1px solid var(--border)' } : {}}>
          <textarea
            value={body}
            onChange={handleBodyChange}
            className="editor-textarea flex-1 w-full focus:outline-none p-5"
            style={{ background: 'var(--bg-base)', color: 'var(--text-primary)' }}
            placeholder="Start writing in Markdown…"
            spellCheck={false}
          />
        </div>
        {showPreview && (
          <div className="flex-1 sm:w-1/2 overflow-y-auto p-5 md:p-7" style={{ background: 'var(--bg-panel)' }}>
            <div ref={previewRef} className="prose-vault max-w-2xl" dangerouslySetInnerHTML={{ __html: renderedMarkdown }} />
          </div>
        )}
      </div>
    </div>
  )
}
