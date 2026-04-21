import { useState } from 'react'
import { getTagColor, getTagParts } from '../lib/tagUtils'
import TagNotesPopup from './TagNotesPopup'

export default function TagPill({ tag, onRemove, className = '' }) {
  const [showPopup, setShowPopup] = useState(false)
  const color = getTagColor(tag)
  const { parent, child, isHierarchical } = getTagParts(tag)

  return (
    <>
      <span
        className={`text-[10px] px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5 shrink-0 cursor-pointer hover:opacity-80 ${className}`}
        style={{ backgroundColor: color + '20', color }}
        onClick={(e) => { e.stopPropagation(); setShowPopup(true) }}
      >
        {isHierarchical ? (
          <>
            <span style={{ opacity: 0.5 }}>{parent}/</span>
            <span>{child}</span>
          </>
        ) : (
          tag
        )}
        {onRemove && (
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(tag) }}
            className="hover:opacity-70 leading-none ml-0.5"
          >&times;</button>
        )}
      </span>
      {showPopup && <TagNotesPopup tag={tag} onClose={() => setShowPopup(false)} />}
    </>
  )
}
