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

export async function chatCompletion(body, apiKey) {
  const res = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey
    },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    let errMsg = `API error (${res.status})`
    try {
      const text = await res.text()
      // Try to parse as JSON
      try {
        const json = JSON.parse(text)
        errMsg = json.error?.message || json.error || json.message || text
      } catch {
        errMsg = text || errMsg
      }
    } catch {}
    throw new Error(errMsg)
  }
  return res
}
