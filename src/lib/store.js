import { create } from 'zustand'
import matter from 'gray-matter'
import * as api from './api'
import { chunkAllNotes } from './chunker'
import { BM25Index } from './bm25'
import { getTags, getAllTagsWithCounts, normalizeTags } from './tagUtils'

const CHAT_STORAGE_KEY = 'kv-chat-messages'
const API_KEY_STORAGE_KEY = 'kv-anthropic-key'
const MODEL_STORAGE_KEY = 'kv-model'

function parseFrontmatter(content) {
  try {
    const { data, content: body } = matter(content)
    return { frontmatter: data, body }
  } catch {
    return { frontmatter: {}, body: content }
  }
}

function todaySlug() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const TEMPLATES = {
  daily: {
    label: 'Daily Note',
    icon: '📅',
    create: () => {
      const slug = todaySlug()
      const now = new Date().toISOString()
      const title = `Daily Note — ${slug}`
      return {
        filename: `daily-${slug}.md`,
        content: `---\ntitle: "${title}"\ntags: [daily]\ncreated: ${now}\nupdated: ${now}\n---\n\n## What's on my mind\n\n\n\n## Tasks\n\n- [ ] \n\n## Ideas\n\n\n\n## Notes\n\n`
      }
    }
  },
  meeting: {
    label: 'Meeting Notes',
    icon: '🤝',
    create: (title) => {
      const now = new Date().toISOString()
      const slug = title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-')
      return {
        filename: `meeting-${slug}.md`,
        content: `---\ntitle: "${title}"\ntags: [meeting]\ncreated: ${now}\nupdated: ${now}\n---\n\n## Attendees\n\n- \n\n## Agenda\n\n1. \n\n## Discussion\n\n\n\n## Action Items\n\n- [ ] \n\n## Key Decisions\n\n`
      }
    }
  },
  idea: {
    label: 'Project Idea',
    icon: '💡',
    create: (title) => {
      const now = new Date().toISOString()
      const slug = title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-')
      return {
        filename: `idea-${slug}.md`,
        content: `---\ntitle: "${title}"\ntags: [idea]\ncreated: ${now}\nupdated: ${now}\n---\n\n## The Problem\n\nWhat problem does this solve?\n\n## The Idea\n\n\n\n## Why Now?\n\nWhy is this the right time?\n\n## Target Audience\n\n\n\n## Key Features\n\n- \n\n## Open Questions\n\n- \n\n## Related Notes\n\n`
      }
    }
  },
  book: {
    label: 'Book Summary',
    icon: '📚',
    create: (title) => {
      const now = new Date().toISOString()
      const slug = title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-')
      return {
        filename: `book-${slug}.md`,
        content: `---\ntitle: "${title}"\ntags: [book]\ncreated: ${now}\nupdated: ${now}\n---\n\n## Key Takeaways\n\n1. \n\n## Summary\n\n\n\n## Favorite Quotes\n\n> \n\n## How This Applies to Me\n\n\n\n## Related Notes\n\n`
      }
    }
  },
  research: {
    label: 'Research Log',
    icon: '🔬',
    create: (title) => {
      const now = new Date().toISOString()
      const slug = title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-')
      return {
        filename: `research-${slug}.md`,
        content: `---\ntitle: "${title}"\ntags: [research]\ncreated: ${now}\nupdated: ${now}\n---\n\n## Research Question\n\n\n\n## Sources\n\n- \n\n## Findings\n\n\n\n## Analysis\n\n\n\n## Next Steps\n\n- \n\n## Related Notes\n\n`
      }
    }
  }
}

export const useStore = create((set, get) => ({
  notes: [],
  activeNoteFilename: null,
  initialized: false,

  loadNotes: async () => {
    try {
      const raw = await api.fetchNotes()
      const notes = raw.map(n => {
        const { frontmatter, body } = parseFrontmatter(n.content)
        return { filename: n.filename, content: n.content, body, frontmatter }
      })
      set({ notes, initialized: true })

      // Auto-cleanup tags on startup (runs in background, doesn't block UI)
      setTimeout(() => get().autoCleanupTags(), 500)
    } catch (err) {
      console.error('Failed to load notes:', err)
      set({ notes: [], initialized: true })
    }
  },

  // Automatically normalize all tags across the vault
  autoCleanupTags: async () => {
    const notes = get().notes
    const tagCounts = getAllTagsWithCounts(notes)
    let fixed = 0

    for (const note of notes) {
      const currentTags = getTags(note)
      if (currentTags.length === 0) continue

      const normalized = normalizeTags(currentTags, tagCounts)

      // Check if anything changed
      if (currentTags.length === normalized.length && currentTags.every((t, i) => t === normalized[i])) continue

      // Rewrite the note with normalized tags
      const fm = { ...(note.frontmatter || {}), tags: normalized, updated: new Date().toISOString() }
      const content = matter.stringify(note.body || '', fm)
      await api.saveNote(note.filename, content)
      fixed++
    }

    if (fixed > 0) {
      console.log(`[Tag cleanup] Auto-normalized tags in ${fixed} note(s)`)
      // Reload to reflect changes
      const raw = await api.fetchNotes()
      const updatedNotes = raw.map(n => {
        const { frontmatter, body } = parseFrontmatter(n.content)
        return { filename: n.filename, content: n.content, body, frontmatter }
      })
      set({ notes: updatedNotes })
      get().rebuildIndex()
    }
  },

  setActiveNote: (filename) => set({ activeNoteFilename: filename, activeView: 'editor' }),

  saveNote: async (filename, content) => {
    await api.saveNote(filename, content)
    const { frontmatter, body } = parseFrontmatter(content)
    set(state => ({
      notes: state.notes.map(n => n.filename === filename ? { ...n, content, body, frontmatter } : n)
    }))
    get().rebuildIndex()
  },

  createNote: async (title) => {
    const slug = title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
    const filename = `${slug}.md`
    const now = new Date().toISOString()
    const content = `---\ntitle: "${title}"\ntags: []\ncreated: ${now}\nupdated: ${now}\n---\n\n`
    try {
      await api.saveNote(filename, content)
      const { frontmatter, body } = parseFrontmatter(content)
      set(state => ({ notes: [...state.notes, { filename, content, body, frontmatter }], activeNoteFilename: filename, activeView: 'editor' }))
      get().rebuildIndex()
    } catch (err) { console.error('Failed to create note:', err) }
  },

  createFromTemplate: async (templateKey, title) => {
    const template = TEMPLATES[templateKey]
    if (!template) return
    const { filename, content } = templateKey === 'daily' ? template.create() : template.create(title || 'Untitled')
    // Check if already exists (for daily notes)
    const existing = get().notes.find(n => n.filename === filename)
    if (existing) {
      set({ activeNoteFilename: filename, activeView: 'editor' })
      return
    }
    try {
      await api.saveNote(filename, content)
      const { frontmatter, body } = parseFrontmatter(content)
      set(state => ({ notes: [...state.notes, { filename, content, body, frontmatter }], activeNoteFilename: filename, activeView: 'editor' }))
      get().rebuildIndex()
    } catch (err) { console.error('Failed to create from template:', err) }
  },

  // Quick capture — appends to today's daily note
  quickCapture: async (text) => {
    const slug = todaySlug()
    const filename = `daily-${slug}.md`
    let note = get().notes.find(n => n.filename === filename)

    if (!note) {
      // Create daily note first
      const { filename: fn, content } = TEMPLATES.daily.create()
      await api.saveNote(fn, content)
      const { frontmatter, body } = parseFrontmatter(content)
      note = { filename: fn, content, body, frontmatter }
      set(state => ({ notes: [...state.notes, note] }))
    }

    // Append quick capture
    const timestamp = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    const appendText = `\n- **${timestamp}** — ${text}`
    const newContent = note.content + appendText
    await api.saveNote(filename, newContent)
    const { frontmatter, body } = parseFrontmatter(newContent)
    set(state => ({
      notes: state.notes.map(n => n.filename === filename ? { ...n, content: newContent, body, frontmatter } : n)
    }))
    get().rebuildIndex()
  },

  // Random note
  getRandomNote: () => {
    const { notes } = get()
    if (notes.length === 0) return null
    return notes[Math.floor(Math.random() * notes.length)]
  },

  deleteNote: async (filename) => {
    try {
      await api.deleteNote(filename)
      set(state => {
        const notes = state.notes.filter(n => n.filename !== filename)
        const activeNoteFilename = state.activeNoteFilename === filename ? (notes.length > 0 ? notes[0].filename : null) : state.activeNoteFilename
        return { notes, activeNoteFilename }
      })
      get().rebuildIndex()
    } catch (err) { console.error('Failed to delete note:', err) }
  },

  // BM25
  bm25Index: new BM25Index(),
  chunks: [],

  rebuildIndex: () => {
    const { notes, bm25Index } = get()
    const chunks = chunkAllNotes(notes)
    bm25Index.build(chunks)
    set({ chunks })
  },

  search: (query, topK = 5) => {
    const { bm25Index } = get()
    return bm25Index.search(query, topK)
  },

  // Chat
  chatMessages: JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY) || '[]'),

  addMessage: (msg) => {
    set(state => {
      const chatMessages = [...state.chatMessages, msg]
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(chatMessages))
      return { chatMessages }
    })
  },

  updateLastMessage: (updates) => {
    set(state => {
      const chatMessages = [...state.chatMessages]
      if (chatMessages.length > 0) {
        chatMessages[chatMessages.length - 1] = { ...chatMessages[chatMessages.length - 1], ...updates }
        localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(chatMessages))
      }
      return { chatMessages }
    })
  },

  clearChat: () => {
    localStorage.removeItem(CHAT_STORAGE_KEY)
    set({ chatMessages: [] })
  },

  // UI
  activeView: 'graph',
  setActiveView: (view) => set({ activeView: view }),

  // Settings — stored both in localStorage (fast) and server config (persists across Docker rebuilds)
  apiKey: localStorage.getItem(API_KEY_STORAGE_KEY) || '',
  setApiKey: (key) => {
    localStorage.setItem(API_KEY_STORAGE_KEY, key)
    set({ apiKey: key })
    api.saveConfig({ apiKey: key }).catch(() => {})
  },

  model: localStorage.getItem(MODEL_STORAGE_KEY) || 'claude-sonnet-4-6',
  setModel: (m) => {
    localStorage.setItem(MODEL_STORAGE_KEY, m)
    set({ model: m })
    api.saveConfig({ model: m }).catch(() => {})
  },

  // Load persisted config from server (called on app init)
  loadConfig: async () => {
    try {
      const config = await api.loadConfig()
      if (config.apiKey && !localStorage.getItem(API_KEY_STORAGE_KEY)) {
        localStorage.setItem(API_KEY_STORAGE_KEY, config.apiKey)
        set({ apiKey: config.apiKey })
      }
      if (config.model && !localStorage.getItem(MODEL_STORAGE_KEY)) {
        localStorage.setItem(MODEL_STORAGE_KEY, config.model)
        set({ model: config.model })
      }
    } catch {}
  }
}))
