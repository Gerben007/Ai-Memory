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
  const previewRef = useRef(null)

  // Load note content when active note changes
  useEffect(() => {
    if (activeNote) {
      setBody(activeNote.body || '')
      setTitle(activeNote.frontmatter?.title || activeNote.filename.replace(/\.md$/, ''))
      setTags((activeNote.frontmatter?.tags || []).join(', '))
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

  // Auto-save
  const doSave = useCallback(async (bodyText, titleText, tagsText) => {
    if (!activeNoteFilename) return
    const content = buildContent(bodyText, titleText, tagsText)
    await saveNote(activeNoteFilename, content)
    setSaveStatus('Saved')
    setTimeout(() => setSaveStatus(''), 2000)
  }, [activeNoteFilename, buildContent, saveNote])

  const { triggerSave } = useAutoSave(doSave)

  const handleBodyChange = (e) => {
    const newBody = e.target.value
    setBody(newBody)
    triggerSave(newBody, title, tags)
  }

  const handleTitleChange = (e) => {
    const newTitle = e.target.value
    setTitle(newTitle)
    triggerSave(body, newTitle, tags)
  }

  const handleTagsChange = (e) => {
    const newTags = e.target.value
    setTags(newTags)
    triggerSave(body, title, newTags)
  }

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
        if (targetNote) {
          setActiveNote(targetNote.filename)
        }
      }
    }

    preview.addEventListener('click', handleClick)
    return () => preview.removeEventListener('click', handleClick)
  }, [notes, setActiveNote])

  if (!activeNote) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        <div className="text-center">
          <div className="text-4xl mb-4">📝</div>
          <p>Select a note or create a new one</p>
        </div>
      </div>
    )
  }

  const renderedMarkdown = renderMarkdown(body)

  return (
    <div className="flex flex-col h-full">
      {/* Metadata bar */}
      <div className="border-b border-gray-800 p-4 bg-gray-900/50">
        <div className="flex items-center gap-4">
          <input
            type="text"
            value={title}
            onChange={handleTitleChange}
            className="flex-1 bg-transparent text-xl font-bold text-gray-100 focus:outline-none border-b border-transparent focus:border-indigo-500 pb-1"
            placeholder="Note title"
          />
          <div className="flex items-center gap-2">
            {saveStatus && (
              <span className="text-xs text-green-400 animate-pulse">{saveStatus}</span>
            )}
            <button
              onClick={() => setShowPreview(!showPreview)}
              className={`text-sm px-3 py-1 rounded-lg ${
                showPreview
                  ? 'bg-indigo-600/20 text-indigo-400'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Preview
            </button>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs text-gray-500">Tags:</span>
          <input
            type="text"
            value={tags}
            onChange={handleTagsChange}
            className="flex-1 bg-transparent text-sm text-gray-300 focus:outline-none placeholder-gray-600"
            placeholder="tag1, tag2, tag3"
          />
        </div>
        {activeNote.frontmatter?.created && (
          <div className="mt-1 text-[10px] text-gray-600">
            Created: {new Date(activeNote.frontmatter.created).toLocaleDateString()}
            {activeNote.frontmatter.updated && (
              <> &middot; Updated: {new Date(activeNote.frontmatter.updated).toLocaleDateString()}</>
            )}
          </div>
        )}
      </div>

      {/* Editor / Preview */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor pane */}
        <div className={`${showPreview ? 'w-1/2 border-r border-gray-800' : 'w-full'} flex flex-col`}>
          <textarea
            value={body}
            onChange={handleBodyChange}
            className="editor-textarea flex-1 w-full bg-gray-950 text-gray-200 p-4 focus:outline-none text-sm leading-relaxed"
            placeholder="Start writing in Markdown..."
            spellCheck={false}
          />
        </div>

        {/* Preview pane */}
        {showPreview && (
          <div className="w-1/2 overflow-y-auto p-6 bg-gray-950/50">
            <div
              ref={previewRef}
              className="prose-vault max-w-none"
              dangerouslySetInnerHTML={{ __html: renderedMarkdown }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
