import { useState, useEffect, useCallback, useRef } from 'react'
import { useStore } from '../lib/store'
import { renderMarkdown } from '../lib/markdownParser'
import { useAutoSave } from '../hooks/useAutoSave'
import matter from 'gray-matter'

export default function Editor() {
  const notes = useStore(s => s.notes)
  const activeNoteFilename = useStore(s => s.activeNoteFilename)
  const saveNote = useStore(s => s.saveNote)
  const setActiveNote = useStore(s => s.setActiveNote)

  const activeNote = notes.find(n => n.filename === activeNoteFilename)

  const [body, setBody] = useState('')
  const [title, setTitle] = useState('')
  const [tags, setTags] = useState('')
  const [showPreview, setShowPreview] = useState(true)
  const [saveStatus, setSaveStatus] = useState('')
  const [dirty, setDirty] = useState(false)
  const previewRef = useRef(null)

  // Load note content when active note changes
  useEffect(() => {
    if (activeNote) {
      setBody(activeNote.body || '')
      setTitle(activeNote.frontmatter?.title || activeNote.filename.replace(/\.md$/, ''))
      setTags((activeNote.frontmatter?.tags || []).join(', '))
      setDirty(false)
      setSaveStatus('')
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

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="border-b border-gray-800 px-5 py-3 bg-gray-900/50">
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={title}
            onChange={handleTitleChange}
            className="flex-1 bg-transparent text-lg font-semibold text-gray-100 focus:outline-none border-b border-transparent focus:border-indigo-500 pb-0.5"
            placeholder="Note title"
          />
          <div className="flex items-center gap-2 shrink-0">
            {saveStatus && (
              <span className="text-xs text-green-400">{saveStatus}</span>
            )}
            {dirty && !saveStatus && (
              <span className="text-xs text-amber-400">Unsaved</span>
            )}
            <button
              onClick={handleManualSave}
              className="text-xs bg-indigo-600 text-white px-4 py-1.5 rounded-lg hover:bg-indigo-500 font-medium"
            >
              Save
            </button>
            <button
              onClick={() => setShowPreview(!showPreview)}
              className={`text-xs px-3 py-1.5 rounded-lg border ${
                showPreview
                  ? 'bg-gray-800 border-gray-600 text-gray-300'
                  : 'border-gray-700 text-gray-500 hover:text-gray-300'
              }`}
            >
              Preview
            </button>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <div className="flex items-center gap-2 flex-1">
            <span className="text-[11px] text-gray-500 shrink-0">Tags:</span>
            <input
              type="text"
              value={tags}
              onChange={handleTagsChange}
              className="flex-1 bg-gray-800/50 text-sm text-gray-300 focus:outline-none placeholder-gray-600 rounded px-2 py-0.5"
              placeholder="tag1, tag2, tag3"
            />
          </div>
          {activeNote.frontmatter?.created && (
            <span className="text-[10px] text-gray-600 shrink-0">
              {new Date(activeNote.frontmatter.updated || activeNote.frontmatter.created).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>

      {/* Editor / Preview */}
      <div className="flex-1 flex overflow-hidden">
        <div className={`${showPreview ? 'w-1/2 border-r border-gray-800' : 'w-full'} flex flex-col`}>
          <textarea
            value={body}
            onChange={handleBodyChange}
            className="editor-textarea flex-1 w-full bg-gray-950 text-gray-200 p-5 focus:outline-none text-sm leading-relaxed"
            placeholder="Start writing in Markdown..."
            spellCheck={false}
          />
        </div>
        {showPreview && (
          <div className="w-1/2 overflow-y-auto p-6 bg-gray-950/50">
            <div ref={previewRef} className="prose-vault max-w-none" dangerouslySetInnerHTML={{ __html: renderedMarkdown }} />
          </div>
        )}
      </div>
    </div>
  )
}
