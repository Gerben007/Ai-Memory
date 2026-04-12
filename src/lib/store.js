import { create } from 'zustand'
import matter from 'gray-matter'
import * as api from './api'
import { chunkAllNotes } from './chunker'
import { BM25Index } from './bm25'

const CHAT_STORAGE_KEY = 'kv-chat-messages'
const API_KEY_STORAGE_KEY = 'kv-anthropic-key'

function parseFrontmatter(content) {
  try {
    const { data, content: body } = matter(content)
    return { frontmatter: data, body }
  } catch {
    return { frontmatter: {}, body: content }
  }
}

export const useStore = create((set, get) => ({
  // Notes
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
    } catch (err) {
      console.error('Failed to load notes:', err)
      set({ notes: [], initialized: true })
    }
  },

  setActiveNote: (filename) => set({ activeNoteFilename: filename, activeView: 'editor' }),

  saveNote: async (filename, content) => {
    try {
      await api.saveNote(filename, content)
      const { frontmatter, body } = parseFrontmatter(content)
      set(state => ({
        notes: state.notes.map(n =>
          n.filename === filename
            ? { ...n, content, body, frontmatter }
            : n
        )
      }))
      get().rebuildIndex()
    } catch (err) {
      console.error('Failed to save note:', err)
    }
  },

  createNote: async (title) => {
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
    const filename = `${slug}.md`

    const now = new Date().toISOString()
    const content = `---\ntitle: "${title}"\ntags: []\ncreated: ${now}\nupdated: ${now}\n---\n\n`

    try {
      await api.saveNote(filename, content)
      const { frontmatter, body } = parseFrontmatter(content)
      set(state => ({
        notes: [...state.notes, { filename, content, body, frontmatter }],
        activeNoteFilename: filename,
        activeView: 'editor'
      }))
      get().rebuildIndex()
    } catch (err) {
      console.error('Failed to create note:', err)
    }
  },

  deleteNote: async (filename) => {
    try {
      await api.deleteNote(filename)
      set(state => {
        const notes = state.notes.filter(n => n.filename !== filename)
        const activeNoteFilename = state.activeNoteFilename === filename
          ? (notes.length > 0 ? notes[0].filename : null)
          : state.activeNoteFilename
        return { notes, activeNoteFilename }
      })
      get().rebuildIndex()
    } catch (err) {
      console.error('Failed to delete note:', err)
    }
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
        chatMessages[chatMessages.length - 1] = {
          ...chatMessages[chatMessages.length - 1],
          ...updates
        }
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
  activeView: 'editor',
  setActiveView: (view) => set({ activeView: view }),

  // Settings
  apiKey: localStorage.getItem(API_KEY_STORAGE_KEY) || '',
  setApiKey: (key) => {
    localStorage.setItem(API_KEY_STORAGE_KEY, key)
    set({ apiKey: key })
  }
}))
