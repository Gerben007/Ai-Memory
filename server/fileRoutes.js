import { Router } from 'express'
import fs from 'fs/promises'
import path from 'path'

export function createFileRoutes(vaultDir) {
  const router = Router()

  function sanitizeFilename(filename) {
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return null
    }
    if (!filename.endsWith('.md')) {
      filename += '.md'
    }
    return filename
  }

  // GET /api/notes — list all notes
  router.get('/', async (req, res) => {
    try {
      const files = await fs.readdir(vaultDir)
      const mdFiles = files.filter(f => f.endsWith('.md'))

      const notes = await Promise.all(
        mdFiles.map(async (filename) => {
          const content = await fs.readFile(path.join(vaultDir, filename), 'utf-8')
          return { filename, content }
        })
      )

      res.json(notes)
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // GET /api/notes/:filename — read single note
  router.get('/:filename', async (req, res) => {
    const filename = sanitizeFilename(req.params.filename)
    if (!filename) return res.status(400).json({ error: 'Invalid filename' })

    try {
      const content = await fs.readFile(path.join(vaultDir, filename), 'utf-8')
      res.json({ filename, content })
    } catch (err) {
      if (err.code === 'ENOENT') {
        return res.status(404).json({ error: 'Note not found' })
      }
      res.status(500).json({ error: err.message })
    }
  })

  // POST /api/notes/:filename — create or update note
  router.post('/:filename', async (req, res) => {
    const filename = sanitizeFilename(req.params.filename)
    if (!filename) return res.status(400).json({ error: 'Invalid filename' })

    try {
      const content = typeof req.body === 'string' ? req.body : req.body.content
      if (content === undefined) {
        return res.status(400).json({ error: 'Content is required' })
      }

      await fs.writeFile(path.join(vaultDir, filename), content, 'utf-8')
      res.json({ filename, saved: true })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // DELETE /api/notes/:filename — delete note
  router.delete('/:filename', async (req, res) => {
    const filename = sanitizeFilename(req.params.filename)
    if (!filename) return res.status(400).json({ error: 'Invalid filename' })

    try {
      await fs.unlink(path.join(vaultDir, filename))
      res.json({ filename, deleted: true })
    } catch (err) {
      if (err.code === 'ENOENT') {
        return res.status(404).json({ error: 'Note not found' })
      }
      res.status(500).json({ error: err.message })
    }
  })

  return router
}
