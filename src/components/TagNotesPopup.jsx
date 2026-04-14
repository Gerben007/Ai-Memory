import { useMemo } from 'react'
import { useStore } from '../lib/store'
import { getTagColor, getTags, getTagParts, tagMatchesOrIsChild } from '../lib/tagUtils'

export default function TagNotesPopup({ tag, onClose }) {
  const notes = useStore(s => s.notes)
  const setActiveNote = useStore(s => s.setActiveNote)

  const { relatedNotes, childTags } = useMemo(() => {
    const matched = []
    const children = new Set()

    for (const n of notes) {
      const noteTags = getTags(n)
      const matches = noteTags.some(t => tagMatchesOrIsChild(t, tag))
      if (!matches) continue

      // Collect child tags for display
      for (const t of noteTags) {
        if (t !== tag && tagMatchesOrIsChild(t, tag)) children.add(t)
      }

      const title = n.frontmatter?.title || n.filename.replace(/\.md$/, '').replace(/-/g, ' ')
      const preview = (n.body || '').replace(/^#.*\n/gm, '').trim().slice(0, 120)
      const date = n.frontmatter?.updated || n.frontmatter?.created
      // Show which specific tag matched
      const matchedTag = noteTags.find(t => tagMatchesOrIsChild(t, tag))
      matched.push({ filename: n.filename, title, preview, date, matchedTag })
    }

    return { relatedNotes: matched, childTags: [...children] }
  }, [notes, tag])

  const color = getTagColor(tag)
  const { parent, child, isHierarchical } = getTagParts(tag)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-md max-h-[70vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-sm font-semibold" style={{ color }}>
                {isHierarchical ? (
                  <><span style={{ opacity: 0.5 }}>{parent}/</span>{child}</>
                ) : tag}
              </span>
              <span className="text-xs text-gray-500">{relatedNotes.length} note{relatedNotes.length !== 1 ? 's' : ''}</span>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-200 text-lg leading-none">&times;</button>
          </div>
          {/* Show child tags if this is a parent */}
          {childTags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {childTags.map(ct => {
                const parts = getTagParts(ct)
                return (
                  <span key={ct} className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: getTagColor(ct) + '15', color: getTagColor(ct) }}>
                    {parts.child}
                  </span>
                )
              })}
            </div>
          )}
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
                <div className="flex items-center gap-2">
                  <div className="text-sm text-gray-200 font-medium truncate flex-1">{n.title}</div>
                  {n.matchedTag !== tag && (
                    <span className="text-[9px] px-1 py-0.5 rounded-full shrink-0" style={{ backgroundColor: color + '15', color }}>
                      {getTagParts(n.matchedTag).child}
                    </span>
                  )}
                </div>
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
