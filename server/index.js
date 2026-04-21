import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import { createFileRoutes } from './fileRoutes.js'
import { createAnthropicProxy } from './anthropicProxy.js'
import { createSearchRoutes } from './searchRoutes.js'
import crypto from 'crypto'
import { createEmailPoller } from './emailPoller.js'
import { createAuth } from './auth.js'
import { createAuthMiddleware, authStatusHandler } from './authMiddleware.js'
import { createMcpRoutes } from './mcpRoutes.js'
// Import routes loaded dynamically — native deps (pdf-parse) may crash on some CPUs
let createImportRoutes = null
try {
  const mod = await import('./importRoutes.js')
  createImportRoutes = mod.createImportRoutes
} catch (err) {
  console.warn('[Import] File import disabled — native dependency error:', err.message)
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3001
const HOST = process.env.HOST || '0.0.0.0'
const VAULT_DIR = process.env.VAULT_DIR || path.join(__dirname, '..', 'vault')
const CONFIG_PATH = path.join(VAULT_DIR, '.vault-config.json')
const CONTEXT_PATH = path.join(VAULT_DIR, '.vault-context.md')

// Ensure vault directory exists
if (!fs.existsSync(VAULT_DIR)) {
  fs.mkdirSync(VAULT_DIR, { recursive: true })
}

app.set('trust proxy', 1)

const allowedOrigins = (process.env.VAULT_ALLOWED_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean)
const allowAllOrigins = allowedOrigins.includes('*')
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true)
    if (allowAllOrigins) return cb(null, true)
    if (allowedOrigins.includes(origin)) return cb(null, true)
    return cb(null, false)
  },
  credentials: true
}))
app.use(express.json())
app.use(express.text())

// Internal bypass secret — lets MCP routes call /api/* without auth
const INTERNAL_BYPASS = crypto.randomBytes(32).toString('hex')

// Auth: login screen (cookie-based) + bearer token middleware
const auth = createAuth({ vaultDir: VAULT_DIR })
app.use('/api/auth', auth.router)
app.get('/api/auth/status', authStatusHandler)
app.use('/api', (req, res, next) => {
  if (req.headers['x-internal-bypass'] === INTERNAL_BYPASS) return next()
  createAuthMiddleware()(req, res, next)
})
app.use('/api', (req, res, next) => {
  if (req.headers['x-internal-bypass'] === INTERNAL_BYPASS) return next()
  auth.middleware(req, res, next)
})

// Config endpoints — persists settings in the vault directory (survives Docker rebuilds)
app.get('/api/config', (req, res) => {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'))
      res.json(config)
    } else {
      res.json({})
    }
  } catch {
    res.json({})
  }
})

app.post('/api/config', (req, res) => {
  try {
    let existing = {}
    if (fs.existsSync(CONFIG_PATH)) {
      existing = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'))
    }
    const updated = { ...existing, ...req.body }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2), 'utf-8')
    res.json({ saved: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Vault context endpoints — persistent vault profile at .vault-context.md
app.get('/api/context', (req, res) => {
  try {
    if (fs.existsSync(CONTEXT_PATH)) {
      const content = fs.readFileSync(CONTEXT_PATH, 'utf-8')
      res.json({ content })
    } else {
      res.json({ content: '' })
    }
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/context', (req, res) => {
  try {
    const { content } = req.body
    if (typeof content !== 'string') {
      return res.status(400).json({ error: 'content must be a string' })
    }
    fs.writeFileSync(CONTEXT_PATH, content, 'utf-8')
    res.json({ saved: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Escape a value for use inside a YAML double-quoted scalar. Prevents frontmatter
// injection when the value contains quotes, backslashes, or newlines.
function yamlQuote(value) {
  const s = String(value ?? '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
  const escaped = s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
  return `"${escaped}"`
}

// Keep tag values to a safe shape so we never break out of the YAML list.
function sanitizeTag(tag) {
  return String(tag ?? '').replace(/[^A-Za-z0-9/_-]/g, '').slice(0, 64)
}

// Web clipper — POST /api/clip to capture content from bookmarklet/extension
app.post('/api/clip', (req, res) => {
  try {
    const { title, content, url, tags } = req.body
    if (!title || !content) return res.status(400).json({ error: 'title and content required' })

    const now = new Date().toISOString()
    const slug = title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80)
    let filename = `clip-${slug}.md`
    const filePath = path.join(VAULT_DIR, filename)
    if (fs.existsSync(filePath)) filename = `clip-${slug}-${Date.now().toString(36)}.md`

    const safeTags = (Array.isArray(tags) && tags.length ? tags : ['clip']).map(sanitizeTag).filter(Boolean)
    const tagStr = safeTags.join(', ')
    const urlLine = url ? `source: ${yamlQuote(url)}\n` : ''
    const noteContent = `---\ntitle: ${yamlQuote(title)}\ntags: [${tagStr}]\ncreated: ${now}\nupdated: ${now}\n${urlLine}---\n\n${content}\n`

    fs.writeFileSync(path.join(VAULT_DIR, filename), noteContent, 'utf-8')
    res.json({ filename, title })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// Serve attachment files (images, PDFs, etc.)
const ATTACHMENTS_DIR = path.join(VAULT_DIR, 'attachments')
if (!fs.existsSync(ATTACHMENTS_DIR)) {
  fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true })
}
app.use('/api/attachments', express.static(ATTACHMENTS_DIR))

// List available attachments
app.get('/api/attachments-list', (req, res) => {
  try {
    if (!fs.existsSync(ATTACHMENTS_DIR)) return res.json([])
    const files = fs.readdirSync(ATTACHMENTS_DIR).filter(f => !f.startsWith('.'))
    const list = files.map(f => {
      const stat = fs.statSync(path.join(ATTACHMENTS_DIR, f))
      return { name: f, size: stat.size, modified: stat.mtime.toISOString() }
    })
    res.json(list)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Read attachment content as base64 (for MCP tool access)
app.get('/api/attachment-content/:filename', (req, res) => {
  const filename = req.params.filename
  if (!filename || filename.includes('..') || filename.includes('/')) {
    return res.status(400).json({ error: 'Invalid filename' })
  }
  const filePath = path.join(ATTACHMENTS_DIR, filename)
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Attachment not found' })
  try {
    const stat = fs.statSync(filePath)
    const ext = path.extname(filename).toLowerCase()
    const isText = ['.txt', '.md', '.json', '.xml', '.csv', '.html', '.htm'].includes(ext)
    if (isText) {
      const text = fs.readFileSync(filePath, 'utf-8')
      return res.json({ name: filename, size: stat.size, type: 'text', content: text.slice(0, 50000) })
    }
    const buffer = fs.readFileSync(filePath)
    const base64 = buffer.toString('base64')
    const mimeTypes = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' }
    const mime = mimeTypes[ext] || 'application/octet-stream'
    res.json({ name: filename, size: stat.size, type: mime, base64 })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// API routes
app.use('/api/notes', createFileRoutes(VAULT_DIR))
app.use('/api/chat', createAnthropicProxy())
app.use('/api', createSearchRoutes(VAULT_DIR))
if (createImportRoutes) {
  app.use('/api/import', createImportRoutes(VAULT_DIR))
}

// Email poller
const emailPoller = createEmailPoller(VAULT_DIR, CONFIG_PATH)

app.get('/api/email/status', (req, res) => {
  res.json(emailPoller.getStatus())
})

app.post('/api/email/sync', async (req, res) => {
  try {
    const result = await emailPoller.poll()
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/email/test', async (req, res) => {
  try {
    const result = await emailPoller.testConnection(req.body)
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/config/email-restart', (req, res) => {
  emailPoller.restart()
  res.json({ restarted: true })
})

// Remote MCP endpoint (Streamable HTTP, bearer-guarded)
app.use('/mcp', createMcpRoutes({
  vaultBaseUrl: `http://127.0.0.1:${PORT}`,
  bearerToken: process.env.MCP_BEARER_TOKEN || '',
  internalAuthBypass: INTERNAL_BYPASS
}))

// In production, serve the built frontend
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '..', 'dist')
  app.use(express.static(distPath))
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

app.listen(PORT, HOST, () => {
  console.log(`Knowledge Vault server running on http://${HOST}:${PORT}`)
  console.log(`Vault directory: ${VAULT_DIR}`)
  emailPoller.start()
})
