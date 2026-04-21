// Remote MCP endpoint for the Knowledge Vault.
//
// Exposes the same tools as mcp-server.js, but over Streamable HTTP so
// Claude mobile / claude.ai custom connectors can reach it through the
// Cloudflare Tunnel. Mounted at POST/GET/DELETE /mcp in server/index.js.
//
// Auth: requires `Authorization: Bearer <MCP_BEARER_TOKEN>`.

import { Router } from 'express'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'

function timingSafeEqualStr(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function buildMcpServer(vaultBaseUrl) {
  const server = new McpServer({ name: 'knowledge-vault', version: '1.0.0' })

  async function vaultFetchJson(path, options = {}) {
    const res = await fetch(`${vaultBaseUrl}${path}`, {
      ...options,
      headers: { 'Content-Type': options.body ? 'application/json' : undefined, ...options.headers }
    })
    if (!res.ok) throw new Error(`Vault API error (${res.status}): ${await res.text().catch(() => res.statusText)}`)
    return res.json()
  }

  async function vaultFetchText(path, options = {}) {
    const res = await fetch(`${vaultBaseUrl}${path}`, {
      ...options,
      headers: { 'Content-Type': 'text/plain', ...options.headers }
    })
    if (!res.ok) throw new Error(`Vault API error (${res.status}): ${await res.text().catch(() => res.statusText)}`)
    return res.json()
  }

  server.tool(
    'vault_list_notes',
    'List all notes in the Knowledge Vault with their titles and tags',
    {},
    async () => {
      const notes = await vaultFetchJson('/api/notes')
      const summary = notes.map(n => {
        const fmMatch = n.content.match(/^---\n([\s\S]*?)\n---/)
        let title = n.filename
        let tags = []
        if (fmMatch) {
          const titleMatch = fmMatch[1].match(/title:\s*"?([^"\n]+)"?/)
          const tagsMatch = fmMatch[1].match(/tags:\s*\[([^\]]*)\]/)
          if (titleMatch) title = titleMatch[1].trim()
          if (tagsMatch) tags = tagsMatch[1].split(',').map(t => t.trim()).filter(Boolean)
        }
        return `- ${title} (${n.filename}) [${tags.join(', ')}]`
      })
      return { content: [{ type: 'text', text: `Knowledge Vault: ${notes.length} notes\n\n${summary.join('\n')}` }] }
    }
  )

  server.tool(
    'vault_read_note',
    'Read the full content of a specific note from the Knowledge Vault',
    { filename: z.string().describe('Filename of the note (e.g. "my-note.md"). Use vault_list_notes to see available files.') },
    async ({ filename }) => {
      const note = await vaultFetchJson(`/api/notes/${encodeURIComponent(filename)}`)
      return { content: [{ type: 'text', text: note.content }] }
    }
  )

  server.tool(
    'vault_create_note',
    'Create a new note in the Knowledge Vault. Provide title and markdown content. Tags are optional.',
    {
      title: z.string().describe('Title of the note'),
      content: z.string().describe('Markdown body content (without frontmatter — it will be generated)'),
      tags: z.array(z.string()).optional().describe('Optional tags for categorization, e.g. ["ai", "notes"]')
    },
    async ({ title, content, tags = [] }) => {
      const slug = title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
      const filename = `${slug}.md`
      const now = new Date().toISOString()
      const tagStr = tags.length > 0 ? `[${tags.join(', ')}]` : '[]'
      const fullContent = `---\ntitle: "${title}"\ntags: ${tagStr}\ncreated: ${now}\nupdated: ${now}\n---\n\n${content}`
      await vaultFetchText(`/api/notes/${encodeURIComponent(filename)}`, { method: 'POST', body: fullContent })
      return { content: [{ type: 'text', text: `Created note: ${filename}\nTitle: ${title}\nTags: ${tags.join(', ') || 'none'}` }] }
    }
  )

  server.tool(
    'vault_update_note',
    'Update an existing note in the Knowledge Vault. Send the full markdown content including frontmatter.',
    {
      filename: z.string().describe('Filename of the note to update (e.g. "my-note.md")'),
      content: z.string().describe('Full markdown content including frontmatter')
    },
    async ({ filename, content }) => {
      await vaultFetchText(`/api/notes/${encodeURIComponent(filename)}`, { method: 'POST', body: content })
      return { content: [{ type: 'text', text: `Updated note: ${filename}` }] }
    }
  )

  server.tool(
    'vault_delete_note',
    'Delete a note from the Knowledge Vault',
    { filename: z.string().describe('Filename of the note to delete (e.g. "my-note.md")') },
    async ({ filename }) => {
      await vaultFetchJson(`/api/notes/${encodeURIComponent(filename)}`, { method: 'DELETE' })
      return { content: [{ type: 'text', text: `Deleted note: ${filename}` }] }
    }
  )

  server.tool(
    'vault_search',
    'Search the Knowledge Vault using BM25 full-text search. Returns ranked chunks with source metadata.',
    {
      query: z.string().describe('Natural language search query'),
      top_k: z.number().optional().describe('Number of results to return (default 5, max 20)')
    },
    async ({ query, top_k = 5 }) => {
      const data = await vaultFetchJson('/api/search', {
        method: 'POST',
        body: JSON.stringify({ query, top_k: Math.min(top_k, 20) })
      })
      if (data.results.length === 0) return { content: [{ type: 'text', text: `No results found for: "${query}"` }] }
      let text = `Search results for: "${query}" (${data.results.length} hits)\n\n`
      for (const r of data.results) {
        text += `--- [${r.source}${r.heading ? ' > ' + r.heading : ''}] (score: ${r.score}) ---\n`
        text += `${r.text}\n\n`
      }
      text += `\nIndex stats: ${data.stats.totalChunks} chunks, ${data.stats.totalTerms} terms`
      return { content: [{ type: 'text', text }] }
    }
  )

  server.tool(
    'vault_stats',
    'Get statistics about the Knowledge Vault: note count, chunk count, index info',
    {},
    async () => {
      const [notes, stats] = await Promise.all([
        vaultFetchJson('/api/notes'),
        vaultFetchJson('/api/search/stats')
      ])
      const totalSize = notes.reduce((sum, n) => sum + n.content.length, 0)
      const text = [
        `Knowledge Vault Statistics`,
        `─────────────────────────`,
        `Notes: ${notes.length}`,
        `Total size: ${(totalSize / 1024).toFixed(1)} KB`,
        `BM25 chunks: ${stats.totalChunks}`,
        `Unique terms: ${stats.totalTerms}`,
        `Avg chunk length: ${stats.avgDocLength} tokens`,
        `Last index build: ${stats.buildTimeMs} ms`
      ].join('\n')
      return { content: [{ type: 'text', text }] }
    }
  )

  server.tool(
    'vault_quick_capture',
    "Quickly capture a thought or idea. Appends to today's daily note with a timestamp, creating it if needed.",
    { text: z.string().describe('The thought or idea to capture') },
    async ({ text }) => {
      const d = new Date()
      const slug = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const filename = `daily-${slug}.md`
      const timestamp = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      let existing = null
      try { existing = await vaultFetchJson(`/api/notes/${encodeURIComponent(filename)}`) } catch {}
      if (!existing) {
        const now = d.toISOString()
        const content = `---\ntitle: "Daily Note — ${slug}"\ntags: [daily]\ncreated: ${now}\nupdated: ${now}\n---\n\n## What's on my mind\n\n\n\n## Tasks\n\n- [ ] \n\n## Ideas\n\n\n\n## Notes\n\n- **${timestamp}** — ${text}`
        await vaultFetchText(`/api/notes/${encodeURIComponent(filename)}`, { method: 'POST', body: content })
      } else {
        const newContent = existing.content + `\n- **${timestamp}** — ${text}`
        await vaultFetchText(`/api/notes/${encodeURIComponent(filename)}`, { method: 'POST', body: newContent })
      }
      return { content: [{ type: 'text', text: `Captured to daily note (${slug}): "${text}"` }] }
    }
  )

  server.tool(
    'vault_daily_note',
    "Get or create today's daily note.",
    {},
    async () => {
      const d = new Date()
      const slug = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const filename = `daily-${slug}.md`
      try {
        const note = await vaultFetchJson(`/api/notes/${encodeURIComponent(filename)}`)
        return { content: [{ type: 'text', text: `Daily note for ${slug}:\n\n${note.content}` }] }
      } catch {
        const now = d.toISOString()
        const content = `---\ntitle: "Daily Note — ${slug}"\ntags: [daily]\ncreated: ${now}\nupdated: ${now}\n---\n\n## What's on my mind\n\n\n\n## Tasks\n\n- [ ] \n\n## Ideas\n\n\n\n## Notes\n\n`
        await vaultFetchText(`/api/notes/${encodeURIComponent(filename)}`, { method: 'POST', body: content })
        return { content: [{ type: 'text', text: `Created new daily note for ${slug}` }] }
      }
    }
  )

  server.tool(
    'vault_random_note',
    'Get a random note from the vault for serendipitous discovery.',
    {},
    async () => {
      const notes = await vaultFetchJson('/api/notes')
      if (notes.length === 0) return { content: [{ type: 'text', text: 'Vault is empty — no notes to show.' }] }
      const note = notes[Math.floor(Math.random() * notes.length)]
      return { content: [{ type: 'text', text: `Random note: ${note.filename}\n\n${note.content}` }] }
    }
  )

  return server
}

export function createMcpRoutes({ vaultBaseUrl, bearerToken }) {
  if (!bearerToken) {
    console.warn('[MCP] MCP_BEARER_TOKEN is not set — /mcp endpoint is DISABLED')
  }

  const router = Router()

  router.use((req, res, next) => {
    if (!bearerToken) return res.status(503).json({ error: 'MCP disabled: MCP_BEARER_TOKEN not configured' })
    const header = req.get('authorization') || ''
    const prefix = 'Bearer '
    const headerOk = header.startsWith(prefix) && timingSafeEqualStr(header.slice(prefix.length), bearerToken)
    // Fallback: accept token as ?token=... query param. claude.ai's custom connector UI
    // couples its "client secret" field to an OAuth client ID, so plain bearer auth via
    // Advanced settings fails validation. Embedding the token in the URL sidesteps that.
    const queryToken = typeof req.query.token === 'string' ? req.query.token : ''
    const queryOk = queryToken.length > 0 && timingSafeEqualStr(queryToken, bearerToken)
    if (!headerOk && !queryOk) {
      res.set('WWW-Authenticate', 'Bearer realm="knowledge-vault"')
      return res.status(401).json({ error: 'Unauthorized' })
    }
    next()
  })

  router.post('/', async (req, res) => {
    try {
      const server = buildMcpServer(vaultBaseUrl)
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
      res.on('close', () => { transport.close(); server.close() })
      await server.connect(transport)
      await transport.handleRequest(req, res, req.body)
    } catch (err) {
      console.error('[MCP] request error:', err)
      if (!res.headersSent) res.status(500).json({ error: err.message })
    }
  })

  router.get('/', (req, res) => {
    res.set('Allow', 'POST').status(405).json({ error: 'Use POST for Streamable HTTP MCP' })
  })

  router.delete('/', (req, res) => {
    res.set('Allow', 'POST').status(405).json({ error: 'Use POST for Streamable HTTP MCP' })
  })

  return router
}
