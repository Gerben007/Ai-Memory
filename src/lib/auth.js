const API = '/api/auth'

export async function fetchAuthStatus() {
  try {
    const res = await fetch(`${API}/status`, { credentials: 'same-origin' })
    if (!res.ok) return { required: false, authenticated: true }
    return await res.json()
  } catch {
    return { required: false, authenticated: true }
  }
}

export async function login(password) {
  const res = await fetch(`${API}/login`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  })
  if (res.ok) return { ok: true }
  let message = 'Login failed'
  if (res.status === 429) message = 'Too many attempts. Try again later.'
  else if (res.status === 401) message = 'Invalid password'
  try {
    const j = await res.json()
    if (j?.error) message = j.error
  } catch {}
  return { ok: false, message, status: res.status }
}

export async function logout() {
  try {
    await fetch(`${API}/logout`, { method: 'POST', credentials: 'same-origin' })
  } catch {}
}
