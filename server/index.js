import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import { createFileRoutes } from './fileRoutes.js'
import { createAnthropicProxy } from './anthropicProxy.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3001
const VAULT_DIR = path.join(__dirname, '..', 'vault')

// Ensure vault directory exists
if (!fs.existsSync(VAULT_DIR)) {
  fs.mkdirSync(VAULT_DIR, { recursive: true })
}

app.use(cors())
app.use(express.json())
app.use(express.text())

// API routes
app.use('/api/notes', createFileRoutes(VAULT_DIR))
app.use('/api/chat', createAnthropicProxy())

// In production, serve the built frontend
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '..', 'dist')
  app.use(express.static(distPath))
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

app.listen(PORT, () => {
  console.log(`Knowledge Vault server running on http://localhost:${PORT}`)
  console.log(`Vault directory: ${VAULT_DIR}`)
})
