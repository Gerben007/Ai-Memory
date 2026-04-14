import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import { createFileRoutes } from './fileRoutes.js'
import { createAnthropicProxy } from './anthropicProxy.js'
import { createSearchRoutes } from './searchRoutes.js'
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

// Ensure vault directory exists
if (!fs.existsSync(VAULT_DIR)) {
  fs.mkdirSync(VAULT_DIR, { recursive: true })
}

app.use(cors())
app.use(express.json())
app.use(express.text())

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

// API routes
app.use('/api/notes', createFileRoutes(VAULT_DIR))
app.use('/api/chat', createAnthropicProxy())
app.use('/api', createSearchRoutes(VAULT_DIR))
if (createImportRoutes) {
  app.use('/api/import', createImportRoutes(VAULT_DIR))
}

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
})
