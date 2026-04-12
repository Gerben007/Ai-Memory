const HEADING_REGEX = /^(#{2,3})\s+(.+)$/gm
const MAX_CHUNK_SIZE = 400
const OVERLAP_SIZE = 50

export function chunkNote({ filename, content, frontmatter }) {
  const body = content || ''
  if (!body.trim()) return []

  const noteTitle = frontmatter?.title || filename.replace(/\.md$/, '')
  const tags = frontmatter?.tags || []

  // Find all heading positions
  const headings = []
  let match
  while ((match = HEADING_REGEX.exec(body)) !== null) {
    headings.push({
      level: match[1].length,
      text: match[2].trim(),
      index: match.index
    })
  }

  // Split body into sections by headings
  const sections = []
  if (headings.length === 0) {
    // No headings — entire body is one section
    sections.push({ heading: null, text: body.trim(), startPos: 0 })
  } else {
    // Content before first heading
    if (headings[0].index > 0) {
      const text = body.slice(0, headings[0].index).trim()
      if (text) {
        sections.push({ heading: null, text, startPos: 0 })
      }
    }

    // Each heading section
    for (let i = 0; i < headings.length; i++) {
      const start = headings[i].index
      const end = i + 1 < headings.length ? headings[i + 1].index : body.length
      const sectionText = body.slice(start, end).trim()
      if (sectionText) {
        sections.push({
          heading: headings[i].text,
          text: sectionText,
          startPos: start
        })
      }
    }
  }

  // Split sections into chunks
  const chunks = []
  for (const section of sections) {
    const sectionChunks = splitIntoChunks(section.text, MAX_CHUNK_SIZE)

    for (let i = 0; i < sectionChunks.length; i++) {
      let chunkText = sectionChunks[i]

      // Apply overlap from previous chunk (within same section)
      if (i > 0 && sectionChunks[i - 1].length >= OVERLAP_SIZE) {
        const overlap = sectionChunks[i - 1].slice(-OVERLAP_SIZE)
        chunkText = overlap + chunkText
      }

      const startPos = section.startPos + section.text.indexOf(sectionChunks[i])

      chunks.push({
        id: `${filename}:${startPos}`,
        text: chunkText,
        noteFilename: filename,
        noteTitle,
        heading: section.heading,
        tags,
        startPos,
        endPos: startPos + sectionChunks[i].length
      })
    }
  }

  return chunks
}

function splitIntoChunks(text, maxSize) {
  if (text.length <= maxSize) return [text]

  const chunks = []

  // Try splitting by paragraphs first
  const paragraphs = text.split(/\n\n+/)
  let current = ''

  for (const para of paragraphs) {
    if (current && (current.length + para.length + 2) > maxSize) {
      chunks.push(current.trim())
      current = para
    } else {
      current = current ? current + '\n\n' + para : para
    }
  }

  if (current.trim()) {
    chunks.push(current.trim())
  }

  // If any chunk is still too large, split by sentences
  const result = []
  for (const chunk of chunks) {
    if (chunk.length <= maxSize) {
      result.push(chunk)
    } else {
      const sentences = chunk.split(/(?<=[.!?])\s+/)
      let sentCurrent = ''
      for (const sent of sentences) {
        if (sentCurrent && (sentCurrent.length + sent.length + 1) > maxSize) {
          result.push(sentCurrent.trim())
          sentCurrent = sent
        } else {
          sentCurrent = sentCurrent ? sentCurrent + ' ' + sent : sent
        }
      }
      if (sentCurrent.trim()) {
        result.push(sentCurrent.trim())
      }
    }
  }

  return result
}

export function chunkAllNotes(notes) {
  return notes.flatMap(note => chunkNote(note))
}
