// Shared tag utilities

const TAG_PALETTE = [
  '#818cf8', '#f472b6', '#34d399', '#fbbf24', '#60a5fa',
  '#a78bfa', '#fb923c', '#2dd4bf', '#f87171', '#a3e635'
]

function hashCode(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) { hash = ((hash << 5) - hash) + str.charCodeAt(i); hash |= 0 }
  return Math.abs(hash)
}

export function getTagColor(tag) {
  if (!tag) return '#64748b'
  return TAG_PALETTE[hashCode(tag) % TAG_PALETTE.length]
}

// Collect all tags across the vault with usage counts
export function getAllTagsWithCounts(notes) {
  const counts = new Map()
  for (const note of notes) {
    const tags = note.frontmatter?.tags
    if (Array.isArray(tags)) {
      for (const tag of tags) {
        const normalized = tag.trim()
        if (normalized) counts.set(normalized, (counts.get(normalized) || 0) + 1)
      }
    }
  }
  return counts
}

// Suggest tags for a note based on existing vault tags and note content
export function suggestTags(noteBody, noteTitle, currentTags, allNotes) {
  const allTagCounts = getAllTagsWithCounts(allNotes)
  const currentSet = new Set(currentTags.map(t => t.toLowerCase().trim()))
  const suggestions = []

  // Combine title + body for keyword matching
  const text = `${noteTitle} ${noteBody}`.toLowerCase()

  for (const [tag, count] of allTagCounts) {
    if (currentSet.has(tag.toLowerCase())) continue
    // Check if the tag (or related words) appear in the note content
    const tagLower = tag.toLowerCase()
    if (text.includes(tagLower)) {
      suggestions.push({ tag, count, reason: 'content match' })
    }
  }

  // Sort by count descending (more used = more likely to be relevant)
  suggestions.sort((a, b) => b.count - a.count)
  return suggestions.slice(0, 8)
}

// Find tag issues for cleanup
export function analyzeTagHealth(notes) {
  const tagCounts = getAllTagsWithCounts(notes)
  const issues = []

  const tagList = [...tagCounts.keys()]

  // Check for case inconsistencies (e.g., "JavaScript" vs "javascript")
  const lowerMap = new Map()
  for (const tag of tagList) {
    const lower = tag.toLowerCase()
    if (!lowerMap.has(lower)) lowerMap.set(lower, [])
    lowerMap.get(lower).push(tag)
  }
  for (const [, variants] of lowerMap) {
    if (variants.length > 1) {
      issues.push({
        type: 'case',
        tags: variants,
        message: `Case variants: ${variants.join(', ')}`,
        suggestion: variants[0].toLowerCase()
      })
    }
  }

  // Check for singular/plural pairs
  for (const tag of tagList) {
    const lower = tag.toLowerCase()
    if (lower.endsWith('s') && tagCounts.has(lower.slice(0, -1))) {
      const singular = lower.slice(0, -1)
      // Skip if already reported as case issue
      if (!issues.some(i => i.tags.includes(tag) && i.tags.includes(singular))) {
        issues.push({
          type: 'plural',
          tags: [singular, tag],
          message: `Singular/plural: ${singular} & ${tag}`,
          suggestion: singular
        })
      }
    }
  }

  // Check for hyphen vs space variants
  for (const tag of tagList) {
    const withHyphen = tag.replace(/\s+/g, '-')
    const withSpace = tag.replace(/-/g, ' ')
    if (withHyphen !== tag && tagCounts.has(withHyphen)) {
      issues.push({
        type: 'format',
        tags: [tag, withHyphen],
        message: `Format variants: "${tag}" & "${withHyphen}"`,
        suggestion: withHyphen
      })
    } else if (withSpace !== tag && tagCounts.has(withSpace)) {
      issues.push({
        type: 'format',
        tags: [tag, withSpace],
        message: `Format variants: "${tag}" & "${withSpace}"`,
        suggestion: tag.includes('-') ? tag : withSpace
      })
    }
  }

  // Orphan tags (used only once)
  const orphans = tagList.filter(t => tagCounts.get(t) === 1)

  return { tagCounts, issues, orphans }
}
