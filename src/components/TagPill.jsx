import { useState } from 'react'
import { getTagColor } from '../lib/tagUtils'
import TagNotesPopup from './TagNotesPopup'

export default function TagPill({ tag, onRemove, className = '' }) {
  const [showPopup, setShowPopup] = useState(false)
  const color = getTagColor(tag)

  return (
    <>
      <span
        className={`text-[10px] px-1.5 py-0.5 rounded-full inline-flex items-center gap-1 shrink-0 cursor-pointer hover:opacity-80 ${className}`}
        style={{ backgroundColor: color + '20', color }}
        onClick={(e) => { e.stopPropagation(); setShowPopup(true) }}
      >
        {tag}
        {onRemove && (
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(tag) }}
            className="hover:opacity-70 leading-none"
          >&times;</button>
        )}
      </span>
      {showPopup && <TagNotesPopup tag={tag} onClose={() => setShowPopup(false)} />}
    </>
  )
}
