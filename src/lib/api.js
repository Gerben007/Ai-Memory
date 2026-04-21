const API_BASE = '/api'

export async function loadConfig() {
  const res = await fetch(`${API_BASE}/config`)
  if (!res.ok) return {}
  return res.json()
}

export async function saveConfig(updates) {
  await fetch(`${API_BASE}/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  })
}

export async function fetchNotes() {
  const res = await fetch(`${API_BASE}/notes`)
  if (!res.ok) throw new Error('Failed to fetch notes')
  return res.json()
}

export async function fetchNote(filename) {
  const res = await fetch(`${API_BASE}/notes/${encodeURIComponent(filename)}`)
  if (!res.ok) throw new Error('Failed to fetch note')
  return res.json()
}

export async function saveNote(filename, content) {
  const res = await fetch(`${API_BASE}/notes/${encodeURIComponent(filename)}`, {
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
  const res = await fetch(`${API_BASE}/notes/${encodeURIComponent(filename)}`, {
    method: 'DELETE'
  })
  if (!res.ok) throw new Error('Failed to delete note')
  return res.json()
}

export async function loadContext() {
  const res = await fetch(`${API_BASE}/context`)
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

  const res = await fetch(`${API_BASE}/chat`, {
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
  await fetch(`${API_BASE}/context`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  })

  return { content }
}

export async function chatCompletion(body, apiKey, { retries = 2 } = {}) {
  let lastError

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      // Exponential backoff: 2s, 4s
      await new Promise(r => setTimeout(r, 2000 * attempt))
    }

    const res = await fetch(`${API_BASE}/chat`, {
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
