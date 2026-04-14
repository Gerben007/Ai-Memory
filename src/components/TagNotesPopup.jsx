import { useState, useMemo } from 'react'
import { useStore } from '../lib/store'
import { getTagColor, getTags } from '../lib/tagUtils'

export default function TagNotesPopup({ tag, onClose }) {
  const notes = useStore(s => s.notes)
  const setActiveNote = useStore(s => s.setActiveNote)

  const relatedNotes = useMemo(() => {
    return notes.filter(n => getTags(n).includes(tag)).map(n => {
      const title = n.frontmatter?.title || n.filename.replace(/\.md$/, '').replace(/-/g, ' ')
      const preview = (n.body || '').replace(/^#.*\n/gm, '').trim().slice(0, 120)
      const date = n.frontmatter?.updated || n.frontmatter?.created
      return { filename: n.filename, title, preview, date }
    })
  }, [notes, tag])

  const color = getTagColor(tag)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-md max-h-[70vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-sm font-semibold" style={{ color }}>{tag}</span>
            <span className="text-xs text-gray-500">{relatedNotes.length} note{relatedNotes.length !== 1 ? 's' : ''}</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-200 text-lg leading-none">&times;</button>
        </div>

        {/* Note list */}
        <div className="flex-1 overflow-y-auto">
          {relatedNotes.length === 0 ? (
            <div className="p-6 text-center text-gray-500 text-sm">No notes with this tag</div>
          ) : (
            relatedNotes.map(n => (
              <button
                key={n.filename}
                onClick={() => { setActiveNote(n.filename); onClose() }}
                className="w-full text-left px-4 py-3 border-b border-gray-800/50 hover:bg-gray-800/50 transition-colors"
              >
                <div className="text-sm text-gray-200 font-medium truncate">{n.title}</div>
                {n.preview && (
                  <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.preview}</div>
                )}
                {n.date && (
                  <div className="text-[10px] text-gray-600 mt-1">
                    {new Date(n.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
