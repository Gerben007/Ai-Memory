const API_BASE = '/api'
const VAULT_TOKEN_STORAGE_KEY = 'kv-vault-token'

// 401 handler installed by the app shell — lets the UI show an auth gate.
let on401Handler = null
export function setOn401Handler(fn) { on401Handler = fn }

export function getVaultToken() {
  try { return localStorage.getItem(VAULT_TOKEN_STORAGE_KEY) || '' } catch { return '' }
}

export function setVaultToken(token) {
  try {
    if (token) localStorage.setItem(VAULT_TOKEN_STORAGE_KEY, token)
    else localStorage.removeItem(VAULT_TOKEN_STORAGE_KEY)
  } catch {}
}

// Public helper for components that build their own fetch() calls (e.g.
// FormData uploads). Returns `{ Authorization: 'Bearer ...' }` or `{}`.
export function authHeader() {
  const token = getVaultToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function withAuth(init = {}) {
  const token = getVaultToken()
  if (!token) return init
  const headers = new Headers(init.headers || {})
  if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`)
  return { ...init, headers }
}

async function authFetch(input, init) {
  const res = await fetch(input, withAuth(init))
  if (res.status === 401 && on401Handler) {
    try {
      const body = await res.clone().json()
      if (body?.authRequired) on401Handler()
    } catch {
      on401Handler()
    }
  }
  return res
}

export async function fetchAuthStatus() {
  try {
    const res = await fetch(`${API_BASE}/auth/status`)
    if (!res.ok) return { authRequired: false }
    return res.json()
  } catch {
    return { authRequired: false }
  }
}

export async function loadConfig() {
  const res = await authFetch(`${API_BASE}/config`)
  if (!res.ok) return {}
  return res.json()
}

export async function saveConfig(updates) {
  await authFetch(`${API_BASE}/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  })
}

export async function fetchNotes() {
  const res = await authFetch(`${API_BASE}/notes`)
  if (!res.ok) throw new Error('Failed to fetch notes')
  return res.json()
}

export async function fetchNote(filename) {
  const res = await authFetch(`${API_BASE}/notes/${encodeURIComponent(filename)}`)
  if (!res.ok) throw new Error('Failed to fetch note')
  return res.json()
}

export async function saveNote(filename, content) {
  const res = await authFetch(`${API_BASE}/notes/${encodeURIComponent(filename)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: content
  })
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try { const j = await res.json(); detail = j.error || detail } catch {}
    throw new Error(`Failed to save "${filename}": ${detail}`)
  }
  return res.json()
}

export async function deleteNote(filename) {
  const res = await authFetch(`${API_BASE}/notes/${encodeURIComponent(filename)}`, {
    method: 'DELETE'
  })
  if (!res.ok) throw new Error('Failed to delete note')
  return res.json()
}

export async function loadContext() {
  const res = await authFetch(`${API_BASE}/context`)
  if (!res.ok) return { content: '' }
  return res.json()
}

export async function generateContext(noteSummaries, apiKey, model) {
  const prompt = `You are analyzing a personal knowledge vault. Based on the note titles, tags, and content snippets below, synthesize a concise vault profile.

Output a markdown document with these sections:
## Key Topics
Bullet list of the main topics/themes across the vault.

## Active Projects
Any projects or ongoing work mentioned in the notes.

## Frequent Tags
The most-used tags and what they represent.

## Important People & Entities
People, organizations, or entities mentioned frequently.

## User Interests Pattern
A short paragraph describing the user's interests, work patterns, and knowledge areas.

---

Here are the notes:

${noteSummaries}

Write ONLY the markdown profile. Be concise but thorough.`

  const res = await authFetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey
    },
    body: JSON.stringify({
      model,
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }]
    })
  })

  if (!res.ok) {
    let errMsg = `API error (${res.status})`
    try {
      const json = await res.json()
      const err = json.error
      if (typeof err === 'object' && err !== null) errMsg = err.message || JSON.stringify(err)
      else if (typeof err === 'string') errMsg = err
    } catch {}
    throw new Error(errMsg)
  }

  const data = await res.json()
  const content = data.content?.[0]?.text || ''

  // Save to server
  await authFetch(`${API_BASE}/context`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  })

  return { content }
}

// Email ingestion
export async function fetchEmailStatus() {
  const res = await fetch(`${API_BASE}/email/status`)
  if (!res.ok) return { enabled: false }
  return res.json()
}

export async function triggerEmailSync() {
  const res = await fetch(`${API_BASE}/email/sync`, { method: 'POST' })
  return res.json()
}

export async function testEmailConnection(cfg) {
  const res = await fetch(`${API_BASE}/email/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cfg)
  })
  return res.json()
}

export async function restartEmailPoller() {
  const res = await fetch(`${API_BASE}/config/email-restart`, { method: 'POST' })
  return res.json()
}

export async function chatCompletion(body, apiKey, { retries = 2 } = {}) {
  let lastError

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      // Exponential backoff: 2s, 4s
      await new Promise(r => setTimeout(r, 2000 * attempt))
    }

    const res = await authFetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify(body)
    })

    if (res.ok) return res

    // Parse error
    let errMsg = `API error (${res.status})`
    let errType = 'api_error'
    let errDetail = ''
    try {
      const json = await res.json()
      const err = json.error
      if (typeof err === 'object' && err !== null) {
        errMsg = err.message || JSON.stringify(err)
        errType = err.type || 'api_error'
        errDetail = err.detail || ''
      } else if (typeof err === 'string') {
        errMsg = err
      }
    } catch {}

    lastError = { message: errMsg, type: errType, status: res.status, detail: errDetail }

    // Only retry on overload (529) or rate limit (429)
    if (res.status !== 529 && res.status !== 429) break
  }

  const err = new Error(lastError.message)
  err.type = lastError.type
  err.status = lastError.status
  err.detail = lastError.detail
  throw err
}
