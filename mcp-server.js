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

const VAULT_URL = process.env.VAULT_URL || 'http://localhost:3001'

// ── Helpers ─────────────────────────────────────────────────────────────

async function vaultFetch(path, options = {}) {
  const url = `${VAULT_URL}${path}`
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': options.body ? 'application/json' : undefined, ...options.headers }
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
    headers: { 'Content-Type': 'text/plain', ...options.headers }
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

    await vaultFetchText(`/api/notes/${encodeURIComponent(filename)}`, {
      method: 'POST',
      body: fullContent
    })

    return {
      content: [{ type: 'text', text: `Created note: ${filename}\nTitle: ${title}\nTags: ${tags.join(', ') || 'none'}` }]
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

// ── Tool: Log decision ──────────────────────────────────────────────────

server.tool(
  'vault_log_decision',
  'Log a decision with full context, reasoning, and alternatives. Creates a structured decision note in the vault.',
  {
    title: z.string().describe('Short title of the decision (e.g. "Use PostgreSQL over MongoDB")'),
    decision: z.string().describe('What was decided'),
    context: z.string().describe('What situation or problem prompted this decision'),
    alternatives: z.array(z.object({
      name: z.string(),
      pros: z.array(z.string()),
      cons: z.array(z.string())
    })).optional().describe('Alternative options considered, each with pros and cons'),
    rationale: z.string().describe('Why this option was chosen over alternatives'),
    consequences: z.array(z.string()).optional().describe('Expected consequences of the decision'),
    tags: z.array(z.string()).optional().describe('Additional tags beyond "decision"')
  },
  async ({ title, decision, context, alternatives = [], rationale, consequences = [], tags = [] }) => {
    const slug = title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
    const filename = `decision-${slug}.md`
    const now = new Date().toISOString()
    const allTags = ['decision', ...tags.filter(t => t !== 'decision')]

    let altSection = ''
    for (const alt of alternatives) {
      altSection += `\n### ${alt.name}\n`
      for (const p of alt.pros) altSection += `- Pro: ${p}\n`
      for (const c of alt.cons) altSection += `- Con: ${c}\n`
    }

    const consSection = consequences.map(c => `- ${c}`).join('\n')

    const content = `---\ntitle: "${title}"\ntags: [${allTags.join(', ')}]\nstatus: active\ncreated: ${now}\nupdated: ${now}\n---\n\n## Decision\n\n${decision}\n\n## Context\n\n${context}\n\n## Alternatives Considered\n${altSection || '\n(none documented)\n'}\n\n## Rationale\n\n${rationale}\n\n## Consequences\n\n${consSection || '- (none documented)'}\n\n## Related Notes\n\n`

    await vaultFetchText(`/api/notes/${encodeURIComponent(filename)}`, { method: 'POST', body: content })

    return {
      content: [{ type: 'text', text: `Decision logged: ${filename}\nTitle: ${title}\nStatus: active\nTags: ${allTags.join(', ')}` }]
    }
  }
)

// ── Start ───────────────────────────────────────────────────────────────

const transport = new StdioServerTransport()
await server.connect(transport)
