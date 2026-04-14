import { Router } from 'express'
import multer from 'multer'
import fs from 'fs/promises'
import path from 'path'

// Native-heavy deps loaded lazily to avoid SIGILL on older CPUs (Alpine + older Xeon etc.)
let _PDFParse, _XLSX, _mammoth, _simpleParser
async function loadParser(name) {
  try {
    switch (name) {
      case 'pdf':    if (!_PDFParse)    _PDFParse    = (await import('pdf-parse')).PDFParse;    return _PDFParse
      case 'xlsx':   if (!_XLSX)         _XLSX        = (await import('xlsx')).default;          return _XLSX
      case 'mammoth':if (!_mammoth)      _mammoth     = (await import('mammoth')).default;       return _mammoth
      case 'email':  if (!_simpleParser) _simpleParser= (await import('mailparser')).simpleParser;return _simpleParser
    }
  } catch (e) {
    throw new Error(`${name} parser not available on this system: ${e.message}`)
  }
}

const MAX_CHUNK = 6000 // chars per AI chunk

export function createImportRoutes(vaultDir) {
  const router = Router()
  const upload = multer({ dest: '/tmp/vault-uploads', limits: { fileSize: 50 * 1024 * 1024 } })

  // POST /api/import — upload and extract text from a file
  router.post('/', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })

    const { originalname, path: tmpPath, mimetype } = req.file
    const ext = path.extname(originalname).toLowerCase()

    try {
      let extracted
      if (ext === '.pdf') {
        extracted = await extractPDF(tmpPath)
      } else if (ext === '.xlsx' || ext === '.xls' || ext === '.csv') {
        extracted = await extractSpreadsheet(tmpPath, ext)
      } else if (ext === '.docx') {
        extracted = await extractDocx(tmpPath)
      } else if (ext === '.eml' || ext === '.msg') {
        extracted = await extractEmail(tmpPath)
      } else if (ext === '.txt' || ext === '.md') {
        const text = await fs.readFile(tmpPath, 'utf-8')
        extracted = { title: originalname.replace(ext, ''), sections: [{ heading: null, text }] }
      } else {
        return res.status(400).json({ error: `Unsupported file type: ${ext}. Supported: .pdf, .docx, .xlsx, .xls, .csv, .eml, .txt, .md` })
      }

      // Clean up temp file
      await fs.unlink(tmpPath).catch(() => {})

      res.json({
        filename: originalname,
        type: ext,
        title: extracted.title,
        sections: extracted.sections,
        totalChars: extracted.sections.reduce((sum, s) => sum + s.text.length, 0),
        meta: extracted.meta || {}
      })
    } catch (err) {
      await fs.unlink(tmpPath).catch(() => {})
      console.error('[Import] Extraction error:', err)
      res.status(500).json({ error: `Failed to extract: ${err.message}` })
    }
  })

  // POST /api/import/generate — AI generates notes from extracted text
  router.post('/generate', async (req, res) => {
    const { title, sections, meta, apiKey, model } = req.body
    if (!apiKey) return res.status(400).json({ error: 'API key required' })
    if (!sections?.length) return res.status(400).json({ error: 'No content to process' })

    try {
      const allText = sections.map(s => {
        const h = s.heading ? `## ${s.heading}\n` : ''
        return h + s.text
      }).join('\n\n')

      // For large documents, chunk and process separately
      const chunks = chunkText(allText, MAX_CHUNK)
      const notes = []

      for (let i = 0; i < chunks.length; i++) {
        const isFirst = i === 0
        const isOnly = chunks.length === 1

        const systemPrompt = `You are a knowledge vault assistant. Convert the following document content into structured vault notes.

Rules:
- Return valid JSON array of note objects
- Each note: { "title": "...", "tags": ["parent/child", ...], "content": "..." }
- Use hierarchical tags (e.g., "business/finance", "tech/database")
- Content should be clean markdown
- If the text covers multiple distinct topics, create separate notes for each
- ${isOnly ? 'Create 1-5 notes depending on content breadth' : `This is chunk ${i + 1} of ${chunks.length} — create 1-3 notes for this section`}
- ${isFirst ? `Document title: "${title}"` : 'Continue processing the document'}
${meta?.from ? `- Email from: ${meta.from}` : ''}
${meta?.subject ? `- Email subject: ${meta.subject}` : ''}
${meta?.date ? `- Date: ${meta.date}` : ''}

Return ONLY the JSON array, no other text.`

        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: model || 'claude-sonnet-4-6',
            max_tokens: 4096,
            system: systemPrompt,
            messages: [{ role: 'user', content: chunks[i] }]
          })
        })

        if (!response.ok) {
          const errText = await response.text()
          console.error('[Import] AI error:', response.status, errText)
          throw new Error(`AI error (${response.status}): ${errText.slice(0, 200)}`)
        }

        const data = await response.json()
        const aiText = data.content?.[0]?.text || ''

        // Parse JSON from AI response
        try {
          const parsed = JSON.parse(aiText.replace(/^```json?\n?/, '').replace(/\n?```$/, ''))
          if (Array.isArray(parsed)) {
            notes.push(...parsed)
          }
        } catch (parseErr) {
          console.error('[Import] Failed to parse AI response:', aiText.slice(0, 300))
          // Try to salvage — create a single note from the raw text
          notes.push({
            title: `${title} (part ${i + 1})`,
            tags: ['import'],
            content: chunks[i]
          })
        }
      }

      // Save notes to vault
      const results = []
      const now = new Date().toISOString()

      for (const note of notes) {
        const noteTitle = note.title || `Imported: ${title}`
        const slug = noteTitle.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80)
        const filename = `${slug}.md`

        // Check for duplicate filenames
        const files = await fs.readdir(vaultDir).catch(() => [])
        let finalFilename = filename
        if (files.includes(filename)) {
          finalFilename = `${slug}-${Date.now().toString(36)}.md`
        }

        const tags = Array.isArray(note.tags) ? note.tags : ['import']
        const content = `---\ntitle: "${noteTitle.replace(/"/g, '\\"')}"\ntags: [${tags.join(', ')}]\ncreated: ${now}\nupdated: ${now}\nsource: import\n---\n\n${note.content || ''}\n`

        await fs.writeFile(path.join(vaultDir, finalFilename), content, 'utf-8')
        results.push({ filename: finalFilename, title: noteTitle, tags })
      }

      res.json({ notes: results, totalNotes: results.length })
    } catch (err) {
      console.error('[Import] Generate error:', err)
      res.status(500).json({ error: err.message })
    }
  })

  return router
}

// ── Text extraction functions ─────────────────────────────────────────

async function extractPDF(filePath) {
  const PDFParse = await loadParser('pdf')
  const parser = new PDFParse({})
  await parser.load(filePath)
  const info = await parser.getInfo().catch(() => ({}))
  const title = info?.Title || path.basename(filePath, '.pdf')
  const numPages = info?.Pages || 1

  // Extract text page by page
  const sections = []
  for (let i = 1; i <= numPages; i++) {
    try {
      const pageText = await parser.getPageText(i)
      if (pageText?.trim()) {
        sections.push({ heading: numPages > 1 ? `Page ${i}` : null, text: pageText.trim() })
      }
    } catch { /* skip unreadable pages */ }
  }

  // Fallback: try getText for all pages at once
  if (sections.length === 0) {
    try {
      const allText = await parser.getText()
      if (allText?.trim()) sections.push({ heading: null, text: allText.trim() })
    } catch {}
  }

  parser.destroy()
  return { title, sections: sections.length > 0 ? sections : [{ heading: null, text: '' }], meta: { pages: numPages } }
}

async function extractSpreadsheet(filePath, ext) {
  const XLSX = await loadParser('xlsx')
  const workbook = XLSX.readFile(filePath)
  const sections = []
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    // Convert to markdown table
    const json = XLSX.utils.sheet_to_json(sheet, { header: 1 })
    if (json.length === 0) continue
    const header = json[0].map(h => String(h || ''))
    const rows = json.slice(1)
    let md = `| ${header.join(' | ')} |\n| ${header.map(() => '---').join(' | ')} |\n`
    for (const row of rows.slice(0, 200)) { // limit rows
      md += `| ${row.map(c => String(c || '')).join(' | ')} |\n`
    }
    sections.push({ heading: sheetName, text: md })
  }
  const title = path.basename(filePath, ext)
  return { title, sections }
}

async function extractDocx(filePath) {
  const mammoth = await loadParser('mammoth')
  const buffer = await fs.readFile(filePath)
  const result = await mammoth.convertToMarkdown({ buffer })
  const text = result.value
  const title = path.basename(filePath, '.docx')
  // Split by headings
  const parts = text.split(/(?=^#{1,3}\s)/m).filter(t => t.trim())
  const sections = parts.length > 1
    ? parts.map(part => {
        const headingMatch = part.match(/^#{1,3}\s+(.+)/)
        return { heading: headingMatch ? headingMatch[1] : null, text: part.trim() }
      })
    : [{ heading: null, text }]
  return { title, sections }
}

async function extractEmail(filePath) {
  const simpleParser = await loadParser('email')
  const raw = await fs.readFile(filePath)
  const parsed = await simpleParser(raw)
  const title = parsed.subject || 'Untitled Email'
  const body = parsed.text || parsed.html?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') || ''
  const meta = {
    from: parsed.from?.text || '',
    to: parsed.to?.text || '',
    subject: parsed.subject || '',
    date: parsed.date?.toISOString() || ''
  }
  const sections = [{ heading: null, text: body.trim() }]
  // Include attachments info
  if (parsed.attachments?.length) {
    const attList = parsed.attachments.map(a => `- ${a.filename} (${a.contentType})`).join('\n')
    sections.push({ heading: 'Attachments', text: attList })
  }
  return { title, sections, meta }
}

// ── Chunking ─────────────────────────────────────────────────────────

function chunkText(text, maxSize) {
  if (text.length <= maxSize) return [text]
  const chunks = []
  const paragraphs = text.split(/\n\n+/)
  let current = ''
  for (const para of paragraphs) {
    if (current.length + para.length + 2 > maxSize && current) {
      chunks.push(current)
      current = para
    } else {
      current = current ? current + '\n\n' + para : para
    }
  }
  if (current) chunks.push(current)
  return chunks
}
