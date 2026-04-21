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
  // Color by root parent so hierarchy shares colors (tech/db and tech/api = same color)
  const root = getTagRoot(tag)
  return TAG_PALETTE[hashCode(root) % TAG_PALETTE.length]
}

// ── Tag hierarchy helpers (separator: /) ────────────────────────────────

// Get root parent: "tech/database" → "tech"
export function getTagRoot(tag) {
  const i = tag.indexOf('/')
  return i > 0 ? tag.slice(0, i) : tag
}

// Get display parts: "tech/database" → { parent: "tech", child: "database" }
export function getTagParts(tag) {
  const i = tag.indexOf('/')
  if (i > 0) return { parent: tag.slice(0, i), child: tag.slice(i + 1), isHierarchical: true }
  return { parent: null, child: tag, isHierarchical: false }
}

// Check if a note's tag matches a target tag or is a child of it
// "tech" matches "tech", "tech/database", "tech/api"
// "tech/database" only matches "tech/database"
export function tagMatchesOrIsChild(noteTag, targetTag) {
  if (noteTag === targetTag) return true
  if (noteTag.startsWith(targetTag + '/')) return true
  return false
}

// Build a tree structure from flat tag list
// Returns: Map<parentOrTag, { count, children: Map<childName, count> }>
export function buildTagTree(tagCounts) {
  const tree = new Map()

  for (const [tag, count] of tagCounts) {
    const { parent, child, isHierarchical } = getTagParts(tag)

    if (isHierarchical) {
      if (!tree.has(parent)) tree.set(parent, { count: 0, children: new Map() })
      const node = tree.get(parent)
      node.children.set(child, (node.children.get(child) || 0) + count)
      node.count += count
    } else {
      if (!tree.has(tag)) tree.set(tag, { count: 0, children: new Map() })
      tree.get(tag).count += count
    }
  }

  return tree
}

// Extract tags from a note — tries frontmatter first, falls back to raw YAML parsing
export function getTags(note) {
  if (note.frontmatter?.tags && Array.isArray(note.frontmatter.tags) && note.frontmatter.tags.length > 0) {
    return note.frontmatter.tags
  }
  // Fallback: parse tags from raw content (handles cases where gray-matter doesn't parse correctly)
  const raw = note.content || ''
  const m = raw.match(/^tags:\s*\[([^\]]*)\]/m)
  if (m) return m[1].split(',').map(t => t.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
  return []
}

// Get note title with regex fallback (gray-matter often fails to parse)
export function getTitle(note) {
  if (note.frontmatter?.title) return note.frontmatter.title
  const raw = note.content || ''
  const m = raw.match(/^title:\s*"?([^"\n]+)"?\s*$/m)
  if (m) return m[1].trim()
  return note.filename?.replace(/\.md$/, '').replace(/-/g, ' ') || 'Untitled'
}

// Get clean body text (strips frontmatter if gray-matter didn't parse it)
export function getBody(note) {
  if (note.body != null && !note.body.startsWith('---')) return note.body
  const raw = note.content || note.body || ''
  // Strip frontmatter block
  const stripped = raw.replace(/^---[\s\S]*?---\s*/, '')
  return stripped
}

// Collect all tags across the vault with usage counts
export function getAllTagsWithCounts(notes) {
  const counts = new Map()
  for (const note of notes) {
    const tags = getTags(note)
    for (const tag of tags) {
      const normalized = tag.trim()
      if (normalized) counts.set(normalized, (counts.get(normalized) || 0) + 1)
    }
  }
  return counts
}

// Normalize tags for a single note against the existing vault tag registry.
// Rules: lowercase, trim, deduplicate, prefer existing vault spelling (most-used variant wins).
export function normalizeTags(tags, vaultTagCounts) {
  if (!tags || tags.length === 0) return tags

  // Build lookup: lowercase -> most-used variant in vault
  const canonical = new Map()
  if (vaultTagCounts) {
    for (const [tag, count] of vaultTagCounts) {
      const lower = tag.toLowerCase()
      const existing = canonical.get(lower)
      if (!existing || count > existing.count) {
        canonical.set(lower, { tag, count })
      }
    }
  }

  const seen = new Set()
  const result = []
  for (const raw of tags) {
    let tag = raw.trim()
    if (!tag) continue

    // Lowercase
    const lower = tag.toLowerCase()

    // Deduplicate
    if (seen.has(lower)) continue
    seen.add(lower)

    // Use canonical vault spelling if it exists, otherwise lowercase
    const vaultVersion = canonical.get(lower)
    result.push(vaultVersion ? vaultVersion.tag : lower)
  }

  return result
}

// Suggest tags for a note based on existing vault tags and note content
// Tags that are too generic to be useful
const BLOCKED_TAGS = new Set([
  'reference', 'document', 'email', 'report', 'note', 'summary', 'overview',
  'general', 'misc', 'info', 'data', 'content', 'source', 'import', 'file',
  'attachment', 'text', 'other', 'draft', 'todo', 'important', 'review'
])

export function isGenericTag(tag) {
  return BLOCKED_TAGS.has(tag.toLowerCase().trim())
}

export function suggestTags(noteBody, noteTitle, currentTags, allNotes) {
  const allTagCounts = getAllTagsWithCounts(allNotes)
  const currentSet = new Set(currentTags.map(t => t.toLowerCase().trim()))
  const suggestions = []

  const text = `${noteTitle} ${noteBody}`.toLowerCase()

  for (const [tag, count] of allTagCounts) {
    if (currentSet.has(tag.toLowerCase())) continue
    if (isGenericTag(tag)) continue // skip useless tags
    const tagLower = tag.toLowerCase()
    if (text.includes(tagLower)) {
      suggestions.push({ tag, count, reason: 'content match' })
    }
  }

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

  // Flag generic/useless tags
  for (const tag of tagList) {
    if (isGenericTag(tag)) {
      issues.push({
        type: 'generic',
        tags: [tag],
        message: `Generic tag "${tag}" — not useful for finding notes`,
        suggestion: ''  // should be deleted or made specific
      })
    }
  }

  // Orphan tags (used only once)
  const orphans = tagList.filter(t => tagCounts.get(t) === 1)

  return { tagCounts, issues, orphans }
}
