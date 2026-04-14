import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useStore } from '../lib/store'
import { renderMarkdown } from '../lib/markdownParser'
import { useAutoSave } from '../hooks/useAutoSave'
import { getTagColor, suggestTags, getAllTagsWithCounts } from '../lib/tagUtils'
import { saveNote as apiSaveNote } from '../lib/api'
import matter from 'gray-matter'

export default function Editor() {
  const notes = useStore(s => s.notes)
  const activeNoteFilename = useStore(s => s.activeNoteFilename)
  const saveNote = useStore(s => s.saveNote)
  const setActiveNote = useStore(s => s.setActiveNote)
  const createNote = useStore(s => s.createNote)

  const activeNote = notes.find(n => n.filename === activeNoteFilename)

  const [body, setBody] = useState('')
  const [title, setTitle] = useState('')
  const [tags, setTags] = useState('')
  const [showPreview, setShowPreview] = useState(true)
  const [saveStatus, setSaveStatus] = useState('')
  const [dirty, setDirty] = useState(false)
  const [showTagSuggestions, setShowTagSuggestions] = useState(false)
  const [showSplitConfirm, setShowSplitConfirm] = useState(false)
  const [splitResult, setSplitResult] = useState(null)
  const previewRef = useRef(null)
  const tagInputRef = useRef(null)

  // Load note content when active note changes
  useEffect(() => {
    if (activeNote) {
      setBody(activeNote.body || '')
      setTitle(activeNote.frontmatter?.title || activeNote.filename.replace(/\.md$/, ''))
      setTags((activeNote.frontmatter?.tags || []).join(', '))
      setDirty(false)
      setSaveStatus('')
      setShowSplitConfirm(false)
      setSplitResult(null)
    }
  }, [activeNoteFilename]) // intentionally only depend on filename

  // Build full content from parts
  const buildContent = useCallback((bodyText, titleText, tagsText) => {
    const fm = activeNote?.frontmatter || {}
    const tagList = tagsText.split(',').map(t => t.trim()).filter(Boolean)
    const now = new Date().toISOString()

    const frontmatter = {
      title: titleText,
      tags: tagList,
      created: fm.created || now,
      updated: now
    }

    // Preserve extra frontmatter fields
    for (const [key, val] of Object.entries(fm)) {
      if (!frontmatter.hasOwnProperty(key)) {
        frontmatter[key] = val
      }
    }

    return matter.stringify(bodyText, frontmatter)
  }, [activeNote])

  // Manual save
  const handleManualSave = useCallback(async () => {
    if (!activeNoteFilename) return
    const content = buildContent(body, title, tags)
    await saveNote(activeNoteFilename, content)
    setSaveStatus('Saved')
    setDirty(false)
    setTimeout(() => setSaveStatus(''), 2000)
  }, [activeNoteFilename, body, title, tags, buildContent, saveNote])

  // Auto-save
  const doSave = useCallback(async (bodyText, titleText, tagsText) => {
    if (!activeNoteFilename) return
    const content = buildContent(bodyText, titleText, tagsText)
    await saveNote(activeNoteFilename, content)
    setSaveStatus('Saved')
    setDirty(false)
    setTimeout(() => setSaveStatus(''), 2000)
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
    const newTags = currentTagList.length > 0 ? `${tags}, ${tag}` : tag
    setTags(newTags)
    setDirty(true)
    triggerSave(body, title, newTags)
  }

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
      <div className="flex-1 flex items-center justify-center text-gray-500">
        <div className="text-center">
          <div className="text-5xl mb-4 opacity-30">📝</div>
          <p className="text-sm">Select a note or create a new one</p>
        </div>
      </div>
    )
  }

  const renderedMarkdown = renderMarkdown(body)
  const wordCount = body.split(/\s+/).filter(Boolean).length
  const canSplit = detectSections.length >= 2

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="border-b border-gray-800 px-3 py-2 md:px-5 md:py-3 bg-gray-900/50">
        <div className="flex items-center gap-2 md:gap-3">
          <input
            type="text"
            value={title}
            onChange={handleTitleChange}
            className="flex-1 min-w-0 bg-transparent text-base md:text-lg font-semibold text-gray-100 focus:outline-none border-b border-transparent focus:border-indigo-500 pb-0.5"
            placeholder="Note title"
          />
          <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
            {saveStatus && (
              <span className="text-[10px] md:text-xs text-green-400">{saveStatus}</span>
            )}
            {dirty && !saveStatus && (
              <span className="text-[10px] md:text-xs text-amber-400 hidden sm:inline">Unsaved</span>
            )}
            {canSplit && (
              <button
                onClick={() => setShowSplitConfirm(true)}
                className="text-[11px] md:text-xs px-2 md:px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:text-amber-400 hover:border-amber-500/50 hidden sm:inline-flex items-center gap-1"
                title={`Split into ${detectSections.length} notes`}
              >
                ✂ Split
              </button>
            )}
            <button
              onClick={handleManualSave}
              className="text-[11px] md:text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-500 font-medium"
            >
              Save
            </button>
            <button
              onClick={() => setShowPreview(!showPreview)}
              className={`text-[11px] md:text-xs px-2 md:px-3 py-1.5 rounded-lg border hidden sm:inline-flex ${
                showPreview
                  ? 'bg-gray-800 border-gray-600 text-gray-300'
                  : 'border-gray-700 text-gray-500 hover:text-gray-300'
              }`}
            >
              Preview
            </button>
          </div>
        </div>

        {/* Tags row with suggestions */}
        <div className="mt-1.5 md:mt-2 flex items-center gap-2 md:gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-0 relative">
            <span className="text-[10px] md:text-[11px] text-gray-500 shrink-0">Tags:</span>
            <div className="flex-1 flex items-center gap-1 flex-wrap min-w-0">
              {/* Tag pills */}
              {currentTagList.map(tag => (
                <span
                  key={tag}
                  className="text-[10px] px-1.5 py-0.5 rounded-full inline-flex items-center gap-1"
                  style={{ backgroundColor: getTagColor(tag) + '20', color: getTagColor(tag) }}
                >
                  {tag}
                  <button
                    onClick={() => {
                      const newTags = currentTagList.filter(t => t !== tag).join(', ')
                      setTags(newTags)
                      setDirty(true)
                      triggerSave(body, title, newTags)
                    }}
                    className="hover:opacity-70 leading-none"
                  >&times;</button>
                </span>
              ))}
              <input
                ref={tagInputRef}
                type="text"
                value={tags.includes(',') ? tags.split(',').pop().trim() : (currentTagList.length === 0 ? tags : '')}
                onChange={(e) => {
                  const base = currentTagList.length > 0
                    ? currentTagList.join(', ') + (e.target.value ? ', ' + e.target.value : '')
                    : e.target.value
                  setTags(base)
                  setDirty(true)
                  triggerSave(body, title, base)
                }}
                onFocus={() => setShowTagSuggestions(true)}
                onBlur={() => setTimeout(() => setShowTagSuggestions(false), 200)}
                className="flex-1 min-w-[80px] bg-transparent text-xs md:text-sm text-gray-300 focus:outline-none placeholder-gray-600"
                placeholder={currentTagList.length === 0 ? 'Add tags...' : '+ tag'}
              />
            </div>

            {/* Tag suggestions dropdown */}
            {showTagSuggestions && (tagSuggestions.length > 0 || allVaultTags.length > 0) && (
              <div className="absolute top-full left-0 right-0 mt-1 glass rounded-lg border border-white/10 shadow-xl z-50 max-h-52 overflow-y-auto">
                {tagSuggestions.length > 0 && (
                  <div className="p-2">
                    <div className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] mb-1.5 px-1">Suggested for this note</div>
                    <div className="flex flex-wrap gap-1">
                      {tagSuggestions.map(s => (
                        <button
                          key={s.tag}
                          onMouseDown={(e) => { e.preventDefault(); addTag(s.tag) }}
                          className="text-[10px] px-2 py-0.5 rounded-full border border-white/10 hover:border-[var(--accent)]/50 transition-colors"
                          style={{ color: getTagColor(s.tag) }}
                        >
                          + {s.tag} <span className="text-[var(--text-muted)] ml-0.5">({s.count})</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {allVaultTags.length > 0 && (
                  <div className="p-2 border-t border-white/5">
                    <div className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] mb-1.5 px-1">All vault tags</div>
                    <div className="flex flex-wrap gap-1">
                      {allVaultTags.slice(0, 20).map(([tag, count]) => (
                        <button
                          key={tag}
                          onMouseDown={(e) => { e.preventDefault(); addTag(tag) }}
                          className="text-[10px] px-2 py-0.5 rounded-full border border-white/5 hover:border-white/20 transition-colors text-[var(--text-secondary)]"
                        >
                          {tag} <span className="text-[var(--text-muted)]">({count})</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {wordCount > 0 && (
              <span className="text-[10px] text-gray-600 hidden sm:inline">{wordCount}w</span>
            )}
            {activeNote.frontmatter?.created && (
              <span className="text-[10px] text-gray-600 shrink-0 hidden sm:inline">
                {new Date(activeNote.frontmatter.updated || activeNote.frontmatter.created).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Split confirmation modal */}
      {showSplitConfirm && (
        <div className="border-b border-amber-500/30 bg-amber-500/5 px-4 py-3 animate-fadeIn">
          <div className="flex items-start gap-3">
            <span className="text-lg">✂️</span>
            <div className="flex-1">
              <p className="text-sm text-[var(--text-primary)] font-medium">Split into {detectSections.length} notes?</p>
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                Each ## section becomes its own note, inheriting current tags and linking back to this note.
              </p>
              <div className="mt-2 space-y-1">
                {detectSections.map((s, i) => (
                  <div key={i} className="text-xs text-[var(--text-muted)] flex items-center gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-[var(--accent)]" />
                    {s.heading}
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-3">
                <button onClick={handleSplitNote} className="text-xs bg-amber-600 text-white px-3 py-1.5 rounded-lg hover:bg-amber-500 font-medium">
                  Split Note
                </button>
                <button onClick={() => setShowSplitConfirm(false)} className="text-xs text-gray-400 hover:text-gray-200 px-2">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Split result */}
      {splitResult && (
        <div className="border-b border-green-500/30 bg-green-500/5 px-4 py-3 animate-fadeIn">
          <div className="flex items-start gap-3">
            <span className="text-lg">✅</span>
            <div className="flex-1">
              <p className="text-sm text-[var(--text-primary)] font-medium">Split complete</p>
              <div className="mt-1 space-y-1">
                {splitResult.map((r, i) => (
                  <div key={i} className="text-xs flex items-center gap-1.5">
                    {r.status === 'created' ? (
                      <button onClick={() => setActiveNote(r.filename)} className="text-[var(--accent)] hover:underline">{r.title}</button>
                    ) : r.status === 'exists' ? (
                      <span className="text-[var(--text-muted)]">{r.title} (already exists)</span>
                    ) : (
                      <span className="text-red-400">{r.title}: {r.error || 'unknown error'}</span>
                    )}
                  </div>
                ))}
              </div>
              <button onClick={() => setSplitResult(null)} className="text-xs text-gray-400 hover:text-gray-200 mt-2">&times; Dismiss</button>
            </div>
          </div>
        </div>
      )}

      {/* Editor / Preview — stacked on mobile, side-by-side on desktop */}
      <div className="flex-1 flex flex-col sm:flex-row overflow-hidden">
        <div className={`${showPreview ? 'hidden sm:flex sm:w-1/2 sm:border-r sm:border-gray-800' : 'flex-1'} flex flex-col`}>
          <textarea
            value={body}
            onChange={handleBodyChange}
            className="editor-textarea flex-1 w-full bg-gray-950 text-gray-200 p-4 md:p-5 focus:outline-none text-sm leading-relaxed"
            placeholder="Start writing in Markdown..."
            spellCheck={false}
          />
        </div>
        {showPreview && (
          <div className="flex-1 sm:w-1/2 overflow-y-auto p-4 md:p-6 bg-gray-950/50">
            <div ref={previewRef} className="prose-vault max-w-none" dangerouslySetInnerHTML={{ __html: renderedMarkdown }} />
          </div>
        )}
      </div>
    </div>
  )
}
