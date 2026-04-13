const API_BASE = '/api'

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
  if (!res.ok) throw new Error('Failed to save note')
  return res.json()
}

export async function deleteNote(filename) {
  const res = await fetch(`${API_BASE}/notes/${encodeURIComponent(filename)}`, {
    method: 'DELETE'
  })
  if (!res.ok) throw new Error('Failed to delete note')
  return res.json()
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
    try {
      const json = await res.json()
      const err = json.error
      if (typeof err === 'object' && err !== null) {
        errMsg = err.message || JSON.stringify(err)
        errType = err.type || 'api_error'
      } else if (typeof err === 'string') {
        errMsg = err
      }
    } catch {}

    lastError = { message: errMsg, type: errType, status: res.status }

    // Only retry on overload (529) or rate limit (429)
    if (res.status !== 529 && res.status !== 429) break
  }

  const err = new Error(lastError.message)
  err.type = lastError.type
  err.status = lastError.status
  throw err
}
