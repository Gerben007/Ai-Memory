const WIKILINK_REGEX = /\[\[([^\]]+)\]\]/g

export function extractWikilinks(markdown) {
  const links = []
  let match

  while ((match = WIKILINK_REGEX.exec(markdown)) !== null) {
    const raw = match[0]
    const inner = match[1]

    // Support [[target|display]] format
    const pipeIndex = inner.indexOf('|')
    const target = pipeIndex >= 0 ? inner.slice(0, pipeIndex).trim() : inner.trim()
    const display = pipeIndex >= 0 ? inner.slice(pipeIndex + 1).trim() : inner.trim()

    links.push({ raw, target, display })
  }

  return links
}

export function slugifyTitle(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function findNoteByWikilink(notes, target) {
  const targetLower = target.toLowerCase()
  return notes.find(note => {
    const title = note.frontmatter?.title?.toLowerCase() || ''
    const nameWithoutExt = note.filename.replace(/\.md$/, '').toLowerCase()
    return title === targetLower || nameWithoutExt === targetLower
  })
}
