// Single source of truth for tag hygiene rules.
// Imported by server routes, the MCP tools, and the client via src/lib/tagUtils.js.

export const BLOCKED_TAGS = new Set([
  'reference', 'document', 'email', 'report', 'note', 'summary', 'overview',
  'general', 'misc', 'info', 'data', 'content', 'source', 'import', 'file',
  'attachment', 'text', 'other', 'draft', 'todo', 'important', 'review'
])

// Only bare generic words are blocked. Hierarchical tags whose child is
// specific (e.g. "todo/invoices") are allowed — the parent token gives
// context, the child gives specificity.
export function isGenericTag(tag) {
  if (!tag) return false
  return BLOCKED_TAGS.has(String(tag).toLowerCase().trim())
}

// Strip unsafe chars so tags can't break out of YAML lists.
export function sanitizeTagChars(tag) {
  return String(tag ?? '').toLowerCase().trim().replace(/[^a-z0-9/_-]/g, '').slice(0, 64)
}

// Full cleanup: sanitize chars, drop blocked/empty, deduplicate.
// Returns [] rather than falling back to a generic tag — better untagged
// than clobbered with a blocklisted label.
export function filterTags(tags) {
  if (!Array.isArray(tags)) return []
  const seen = new Set()
  const out = []
  for (const raw of tags) {
    const clean = sanitizeTagChars(raw)
    if (!clean) continue
    if (isGenericTag(clean)) continue
    if (seen.has(clean)) continue
    seen.add(clean)
    out.push(clean)
  }
  return out
}
