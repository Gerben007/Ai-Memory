#!/usr/bin/env node

// Knowledge Vault MCP Server
// Exposes vault tools to Claude Code via Model Context Protocol (stdio transport).
//
// Configure in ~/.claude/settings.json:
// {
//   "mcpServers": {
//     "knowledge-vault": {
//       "command": "node",
//       "args": ["/path/to/Ai-Memory/mcp-server.js"],
//       "env": { "VAULT_URL": "http://<homelab-ip>:3001" }
//     }
//   }
// }

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { filterTags } from './server/tagRules.js'

const VAULT_URL = process.env.VAULT_URL || 'http://localhost:3001'
const VAULT_AUTH_TOKEN = process.env.VAULT_AUTH_TOKEN || ''

// ── Helpers ─────────────────────────────────────────────────────────────

function authHeaders() {
  return VAULT_AUTH_TOKEN ? { Authorization: `Bearer ${VAULT_AUTH_TOKEN}` } : {}
}

async function vaultFetch(path, options = {}) {
  const url = `${VAULT_URL}${path}`
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': options.body ? 'application/json' : undefined,
      ...authHeaders(),
      ...options.headers
    }
  })
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText)
    throw new Error(`Vault API error (${res.status}): ${err}`)
  }
  return res.json()
}

async function vaultFetchText(path, options = {}) {
  const url = `${VAULT_URL}${path}`
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'text/plain', ...authHeaders(), ...options.headers }
  })
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText)
    throw new Error(`Vault API error (${res.status}): ${err}`)
  }
  return res.json()
}

// ── MCP Server ──────────────────────────────────────────────────────────

const server = new McpServer({
  name: 'knowledge-vault',
  version: '1.0.0'
})

// ── Tool: List notes ────────────────────────────────────────────────────

server.tool(
  'vault_list_notes',
  'List all notes in the Knowledge Vault with their titles and tags',
  {},
  async () => {
    const notes = await vaultFetch('/api/notes')
    const summary = notes.map(n => {
      // Parse frontmatter from content
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

    return {
      content: [{ type: 'text', text: `Knowledge Vault: ${notes.length} notes\n\n${summary.join('\n')}` }]
    }
  }
)

// ── Tool: Read note ─────────────────────────────────────────────────────

server.tool(
  'vault_read_note',
  'Read the full content of a specific note from the Knowledge Vault',
  { filename: z.string().describe('Filename of the note (e.g. "my-note.md"). Use vault_list_notes to see available files.') },
  async ({ filename }) => {
    const note = await vaultFetch(`/api/notes/${encodeURIComponent(filename)}`)
    return {
      content: [{ type: 'text', text: note.content }]
    }
  }
)

// ── Tool: Create note ───────────────────────────────────────────────────

server.tool(
  'vault_create_note',
  'Create a new note in the Knowledge Vault. Provide title and markdown content. Tags are optional — prefer reusing existing canonical tags from vault_list_tags over inventing new ones. Generic tags (reference, document, email, note, summary, general, misc, import, etc.) are rejected.',
  {
    title: z.string().describe('Title of the note'),
    content: z.string().describe('Markdown body content (without frontmatter — it will be generated)'),
    tags: z.array(z.string()).optional().describe('Optional hierarchical tags (parent/child), e.g. ["finance/vat", "project/ai-memory"]')
  },
  async ({ title, content, tags = [] }) => {
    const slug = title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
    const filename = `${slug}.md`

    // Refuse to clobber an existing note — AI should use vault_update_note
    // or pick a more specific title instead of silently overwriting.
    try {
      await vaultFetch(`/api/notes/${encodeURIComponent(filename)}`)
      throw new Error(`Note "${filename}" already exists. Use vault_update_note to modify it, or choose a more specific title.`)
    } catch (err) {
      if (!/404|not found/i.test(err.message)) throw err
    }

    const now = new Date().toISOString()
    const safeTags = filterTags(tags)
    const tagStr = safeTags.length > 0 ? `[${safeTags.join(', ')}]` : '[]'
    const safeTitle = String(title ?? '')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\r/g, '\\r')
      .replace(/\n/g, '\\n')
      .replace(/\t/g, '\\t')
    const fullContent = `---\ntitle: "${safeTitle}"\ntags: ${tagStr}\ncreated: ${now}\nupdated: ${now}\n---\n\n${content}`

    await vaultFetchText(`/api/notes/${encodeURIComponent(filename)}`, {
      method: 'POST',
      body: fullContent
    })

    const droppedCount = tags.length - safeTags.length
    const droppedNote = droppedCount > 0 ? `\n(${droppedCount} tag${droppedCount > 1 ? 's' : ''} dropped — blocked as too generic)` : ''
    return {
      content: [{ type: 'text', text: `Created note: ${filename}\nTitle: ${title}\nTags: ${safeTags.join(', ') || 'none'}${droppedNote}` }]
    }
  }
)

// ── Tool: Update note ───────────────────────────────────────────────────

server.tool(
  'vault_update_note',
  'Update an existing note in the Knowledge Vault. Send the full markdown content including frontmatter.',
  {
    filename: z.string().describe('Filename of the note to update (e.g. "my-note.md")'),
    content: z.string().describe('Full markdown content including frontmatter (---\\ntitle: ...\\n---\\n\\nbody)')
  },
  async ({ filename, content }) => {
    await vaultFetchText(`/api/notes/${encodeURIComponent(filename)}`, {
      method: 'POST',
      body: content
    })

    return {
      content: [{ type: 'text', text: `Updated note: ${filename}` }]
    }
  }
)

// ── Tool: Delete note ───────────────────────────────────────────────────

server.tool(
  'vault_delete_note',
  'Delete a note from the Knowledge Vault',
  { filename: z.string().describe('Filename of the note to delete (e.g. "my-note.md")') },
  async ({ filename }) => {
    await vaultFetch(`/api/notes/${encodeURIComponent(filename)}`, { method: 'DELETE' })
    return {
      content: [{ type: 'text', text: `Deleted note: ${filename}` }]
    }
  }
)

// ── Tool: Search vault ──────────────────────────────────────────────────

server.tool(
  'vault_search',
  'Search the Knowledge Vault using BM25 full-text search. Returns ranked chunks with source metadata.',
  {
    query: z.string().describe('Natural language search query'),
    top_k: z.number().optional().describe('Number of results to return (default 5, max 20)')
  },
  async ({ query, top_k = 5 }) => {
    const data = await vaultFetch('/api/search', {
      method: 'POST',
      body: JSON.stringify({ query, top_k: Math.min(top_k, 20) })
    })

    if (data.results.length === 0) {
      return { content: [{ type: 'text', text: `No results found for: "${query}"` }] }
    }

    let text = `Search results for: "${query}" (${data.results.length} hits)\n\n`
    for (const r of data.results) {
      text += `--- [${r.source}${r.heading ? ' > ' + r.heading : ''}] (score: ${r.score}) ---\n`
      text += `${r.text}\n\n`
    }
    text += `\nIndex stats: ${data.stats.totalChunks} chunks, ${data.stats.totalTerms} terms`

    return { content: [{ type: 'text', text }] }
  }
)

// ── Tool: Vault stats ───────────────────────────────────────────────────

server.tool(
  'vault_stats',
  'Get statistics about the Knowledge Vault: note count, chunk count, index info',
  {},
  async () => {
    const [notes, stats] = await Promise.all([
      vaultFetch('/api/notes'),
      vaultFetch('/api/search/stats')
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

// ── Tool: Quick capture ─────────────────────────────────────────────────

server.tool(
  'vault_quick_capture',
  'Quickly capture a thought, idea, or note. Appends to today\'s daily note with a timestamp. Creates the daily note if it doesn\'t exist.',
  { text: z.string().describe('The thought or idea to capture') },
  async ({ text }) => {
    const d = new Date()
    const slug = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const filename = `daily-${slug}.md`
    const timestamp = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })

    // Check if daily note exists
    let existing = null
    try { existing = await vaultFetch(`/api/notes/${encodeURIComponent(filename)}`) } catch {}

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

// ── Tool: Daily note ────────────────────────────────────────────────────

server.tool(
  'vault_daily_note',
  'Get or create today\'s daily note. Returns the content if it exists, or creates a fresh one.',
  {},
  async () => {
    const d = new Date()
    const slug = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const filename = `daily-${slug}.md`

    try {
      const note = await vaultFetch(`/api/notes/${encodeURIComponent(filename)}`)
      return { content: [{ type: 'text', text: `Daily note for ${slug}:\n\n${note.content}` }] }
    } catch {
      const now = d.toISOString()
      const content = `---\ntitle: "Daily Note — ${slug}"\ntags: [daily]\ncreated: ${now}\nupdated: ${now}\n---\n\n## What's on my mind\n\n\n\n## Tasks\n\n- [ ] \n\n## Ideas\n\n\n\n## Notes\n\n`
      await vaultFetchText(`/api/notes/${encodeURIComponent(filename)}`, { method: 'POST', body: content })
      return { content: [{ type: 'text', text: `Created new daily note for ${slug}` }] }
    }
  }
)

// ── Tool: List tags ─────────────────────────────────────────────────────

server.tool(
  'vault_list_tags',
  'List all tags currently used in the vault with usage counts, sorted by frequency. Use this before vault_create_note to reuse canonical tag names instead of creating orphans.',
  {},
  async () => {
    const notes = await vaultFetch('/api/notes')
    const counts = new Map()
    for (const n of notes) {
      const fm = n.content.match(/^---\n([\s\S]*?)\n---/)
      if (!fm) continue
      const tagsMatch = fm[1].match(/tags:\s*\[([^\]]*)\]/)
      if (!tagsMatch) continue
      for (const raw of tagsMatch[1].split(',')) {
        const tag = raw.trim().replace(/^["']|["']$/g, '')
        if (tag) counts.set(tag, (counts.get(tag) || 0) + 1)
      }
    }
    if (counts.size === 0) {
      return { content: [{ type: 'text', text: 'No tags in vault yet.' }] }
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])
    const lines = sorted.map(([tag, n]) => `- ${tag} (${n})`)
    return {
      content: [{ type: 'text', text: `Vault tags (${counts.size} unique, sorted by usage):\n\n${lines.join('\n')}` }]
    }
  }
)

// ── Tool: Random note ───────────────────────────────────────────────────

server.tool(
  'vault_random_note',
  'Get a random note from the vault for serendipitous discovery. Great for sparking new connections.',
  {},
  async () => {
    const notes = await vaultFetch('/api/notes')
    if (notes.length === 0) return { content: [{ type: 'text', text: 'Vault is empty — no notes to show.' }] }
    const note = notes[Math.floor(Math.random() * notes.length)]
    return { content: [{ type: 'text', text: `Random note: ${note.filename}\n\n${note.content}` }] }
  }
)

// ── Start ───────────────────────────────────────────────────────────────

const transport = new StdioServerTransport()
await server.connect(transport)
