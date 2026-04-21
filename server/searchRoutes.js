// Server-side BM25 + chunker + search endpoint
// Self-contained — no imports from src/lib (those use browser-style paths)

import { Router } from 'express'
import fs from 'fs/promises'
import path from 'path'
import matter from 'gray-matter'

// ── Stopwords ───────────────────────────────────────────────────────────
const STOPWORDS = new Set([
  'a','an','the','is','are','was','were','be','been','being','have','has',
  'had','do','does','did','will','would','could','should','may','might',
  'shall','can','need','dare','ought','used','to','of','in','for','on',
  'with','at','by','from','as','into','through','during','before','after',
  'above','below','between','out','off','over','under','again','further',
  'then','once','here','there','when','where','why','how','all','each',
  'every','both','few','more','most','other','some','such','no','nor',
  'not','only','own','same','so','than','too','very','just','because',
  'but','and','or','if','while','about','up','this','that','these',
  'those','i','me','my','myself','we','our','ours','ourselves','you',
  'your','yours','yourself','yourselves','he','him','his','himself','she',
  'her','hers','herself','it','its','itself','they','them','their',
  'theirs','themselves','what','which','who','whom','whose','am','get',
  'got','gets','getting','go','goes','going','gone','went','come','came',
  'comes','coming','make','makes','made','making','take','takes','took',
  'taken','taking','give','gives','gave','given','giving','say','says',
  'said','saying','know','knows','knew','known','knowing','think','thinks',
  'thought','thinking','see','sees','saw','seen','seeing','want','wants',
  'wanted','wanting','use','uses','using','find','finds','found','finding',
  'also','back','still','well','way','even','new','now','old','much',
  'many','any','like','really','already','since','until','upon','against',
  'among','within','without','along','around','behind','beside','beyond',
  'down','near','toward','towards','across','enough','another','anything',
  'everything','nothing','something','someone','everyone','anyone','nobody',
  'one','two','three','first','last','next','long','great','little',
  'right','high','small','large','big','different','important','good',
  'bad','best','worst','better','worse','able','possible','likely','less',
  'least','always','never','often','sometimes','usually','rather','quite',
  'however','therefore','thus','hence','instead','meanwhile','yet',
  'perhaps','maybe','almost','though','although','whether','either',
  'neither','else','per','etc','via'
])

// ── Tokenizer ───────────────────────────────────────────────────────────
function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOPWORDS.has(t))
}

// ── BM25 ────────────────────────────────────────────────────────────────
class BM25Index {
  constructor(k1 = 1.5, b = 0.75) {
    this.k1 = k1
    this.b = b
    this.chunks = []
    this.docCount = 0
    this.avgDocLength = 0
    this.docLengths = []
    this.termFreqs = []
    this.docFreqs = new Map()
    this.buildTimeMs = 0
  }

  build(chunks) {
    const start = performance.now()
    this.chunks = chunks
    this.docCount = chunks.length
    this.docLengths = []
    this.termFreqs = []
    this.docFreqs = new Map()

    if (this.docCount === 0) {
      this.avgDocLength = 0
      this.buildTimeMs = performance.now() - start
      return
    }

    let totalLength = 0
    for (let i = 0; i < this.docCount; i++) {
      const tokens = tokenize(this.chunks[i].text)
      this.docLengths[i] = tokens.length
      totalLength += tokens.length
      const freqs = new Map()
      for (const token of tokens) {
        freqs.set(token, (freqs.get(token) || 0) + 1)
      }
      this.termFreqs[i] = freqs
      for (const term of freqs.keys()) {
        this.docFreqs.set(term, (this.docFreqs.get(term) || 0) + 1)
      }
    }

    this.avgDocLength = totalLength / this.docCount
    this.buildTimeMs = performance.now() - start
    console.log(`BM25 index built: ${this.docCount} chunks, ${this.docFreqs.size} terms, ${this.buildTimeMs.toFixed(1)}ms`)
  }

  search(query, topK = 5) {
    if (this.docCount === 0) return []
    const queryTokens = [...new Set(tokenize(query))]
    if (queryTokens.length === 0) return []

    const scores = []
    for (let i = 0; i < this.docCount; i++) {
      let score = 0
      for (const term of queryTokens) {
        const df = this.docFreqs.get(term)
        if (!df) continue
        const tf = this.termFreqs[i].get(term) || 0
        if (tf === 0) continue
        const idf = Math.log((this.docCount - df + 0.5) / (df + 0.5) + 1)
        const tfNorm = (tf * (this.k1 + 1)) /
          (tf + this.k1 * (1 - this.b + this.b * this.docLengths[i] / this.avgDocLength))
        score += idf * tfNorm
      }
      if (score > 0) scores.push({ chunk: this.chunks[i], score })
    }

    scores.sort((a, b) => b.score - a.score)
    return scores.slice(0, topK)
  }

  getStats() {
    return {
      totalChunks: this.docCount,
      totalTerms: this.docFreqs.size,
      avgDocLength: Math.round(this.avgDocLength * 10) / 10,
      buildTimeMs: Math.round(this.buildTimeMs * 10) / 10
    }
  }
}

// ── Chunker ─────────────────────────────────────────────────────────────
const HEADING_REGEX = /^(#{2,3})\s+(.+)$/gm
const MAX_CHUNK = 400
const OVERLAP = 50

function splitSmall(text, max) {
  if (text.length <= max) return [text]
  const chunks = []
  const paras = text.split(/\n\n+/)
  let cur = ''
  for (const p of paras) {
    if (cur && cur.length + p.length + 2 > max) { chunks.push(cur.trim()); cur = p }
    else cur = cur ? cur + '\n\n' + p : p
  }
  if (cur.trim()) chunks.push(cur.trim())

  const result = []
  for (const c of chunks) {
    if (c.length <= max) { result.push(c); continue }
    const sents = c.split(/(?<=[.!?])\s+/)
    let sc = ''
    for (const s of sents) {
      if (sc && sc.length + s.length + 1 > max) { result.push(sc.trim()); sc = s }
      else sc = sc ? sc + ' ' + s : s
    }
    if (sc.trim()) result.push(sc.trim())
  }
  return result
}

function chunkNote(filename, rawContent) {
  const { data: frontmatter, content: body } = matter(rawContent)
  if (!body.trim()) return { frontmatter, chunks: [] }

  const noteTitle = frontmatter?.title || filename.replace(/\.md$/, '')
  const tags = frontmatter?.tags || []

  const headings = []
  let m
  const re = new RegExp(HEADING_REGEX.source, HEADING_REGEX.flags)
  while ((m = re.exec(body)) !== null) {
    headings.push({ text: m[2].trim(), index: m.index })
  }

  const sections = []
  if (headings.length === 0) {
    sections.push({ heading: null, text: body.trim(), startPos: 0 })
  } else {
    if (headings[0].index > 0) {
      const t = body.slice(0, headings[0].index).trim()
      if (t) sections.push({ heading: null, text: t, startPos: 0 })
    }
    for (let i = 0; i < headings.length; i++) {
      const start = headings[i].index
      const end = i + 1 < headings.length ? headings[i + 1].index : body.length
      const t = body.slice(start, end).trim()
      if (t) sections.push({ heading: headings[i].text, text: t, startPos: start })
    }
  }

  const chunks = []
  for (const sec of sections) {
    const parts = splitSmall(sec.text, MAX_CHUNK)
    for (let i = 0; i < parts.length; i++) {
      let text = parts[i]
      if (i > 0 && parts[i - 1].length >= OVERLAP) {
        text = parts[i - 1].slice(-OVERLAP) + text
      }
      const startPos = sec.startPos + sec.text.indexOf(parts[i])
      chunks.push({
        id: `${filename}:${startPos}`,
        text,
        noteFilename: filename,
        noteTitle,
        heading: sec.heading,
        tags,
        startPos,
        endPos: startPos + parts[i].length
      })
    }
  }

  return { frontmatter, body, chunks }
}

// ── Search service (singleton, rebuilds on demand) ──────────────────────
let index = new BM25Index()
let allChunks = []
let allNotes = []
let lastBuildTime = 0

async function rebuildIndex(vaultDir) {
  const files = await fs.readdir(vaultDir)
  // Skip dotfiles (.vault-context.md etc.) — those aren't regular notes.
  const mdFiles = files.filter(f => f.endsWith('.md') && !f.startsWith('.'))

  allNotes = []
  allChunks = []

  for (const filename of mdFiles) {
    const raw = await fs.readFile(path.join(vaultDir, filename), 'utf-8')
    const { frontmatter, body, chunks } = chunkNote(filename, raw)
    allNotes.push({ filename, content: raw, body, frontmatter })
    allChunks.push(...chunks)
  }

  index.build(allChunks)
  lastBuildTime = Date.now()
}

// ── Router ──────────────────────────────────────────────────────────────
export function createSearchRoutes(vaultDir) {
  const router = Router()

  // Rebuild index on first request and then cache for 5 seconds
  async function ensureIndex() {
    if (Date.now() - lastBuildTime > 5000 || allNotes.length === 0) {
      await rebuildIndex(vaultDir)
    }
  }

  // POST /api/search  { query, top_k? }
  router.post('/search', async (req, res) => {
    try {
      await ensureIndex()
      const { query, top_k = 5 } = req.body
      if (!query) return res.status(400).json({ error: 'query is required' })

      const results = index.search(query, top_k)
      res.json({
        query,
        results: results.map(r => ({
          text: r.chunk.text,
          source: r.chunk.noteFilename,
          heading: r.chunk.heading,
          tags: r.chunk.tags,
          score: Math.round(r.score * 1000) / 1000,
          position: { start: r.chunk.startPos, end: r.chunk.endPos }
        })),
        stats: index.getStats()
      })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // GET /api/search/stats
  router.get('/search/stats', async (req, res) => {
    try {
      await ensureIndex()
      res.json(index.getStats())
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // POST /api/search/rebuild  (force rebuild)
  router.post('/search/rebuild', async (req, res) => {
    try {
      await rebuildIndex(vaultDir)
      res.json({ rebuilt: true, stats: index.getStats() })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  return router
}
