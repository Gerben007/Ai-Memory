import { useState, useEffect } from 'react'
import { fetchAuthStatus, setOn401Handler, setVaultToken, getVaultToken } from '../lib/api'

// Blocks the UI until the user enters a valid vault access token. Shows up
// either at startup (if the server advertises auth is required and no token
// is stored), or later (if any API call returns 401).
export default function AuthGate({ onUnlock }) {
  const [visible, setVisible] = useState(false)
  const [tokenInput, setTokenInput] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    setOn401Handler(() => setVisible(true))

    fetchAuthStatus().then(({ authRequired }) => {
      if (cancelled) return
      if (authRequired && !getVaultToken()) setVisible(true)
    })

    return () => { cancelled = true; setOn401Handler(null) }
  }, [])

  if (!visible) return null

  const submit = async (e) => {
    e?.preventDefault()
    const t = tokenInput.trim()
    if (!t) { setError('Enter a token'); return }
    setVaultToken(t)

    const res = await fetch('/api/config', { headers: { Authorization: `Bearer ${t}` } })
    if (res.status === 401) {
      setVaultToken('')
      setError('Invalid token')
      return
    }
    setVisible(false)
    setError('')
    onUnlock?.()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
    }}>
      <form onSubmit={submit} style={{
        background: 'var(--bg-panel, #151522)',
        border: '1px solid var(--border, #2a2a3a)',
        borderRadius: 12, padding: 24, maxWidth: 420, width: '100%'
      }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6, color: 'var(--text-primary, #e5e7eb)' }}>
          Vault Access Token Required
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted, #9ca3af)', marginBottom: 16, lineHeight: 1.5 }}>
          This vault is protected. Enter the access token configured on the server
          (<code>VAULT_AUTH_TOKEN</code> env var). It's stored in localStorage on this device.
        </div>
        <input
          type="password"
          autoFocus
          value={tokenInput}
          onChange={e => setTokenInput(e.target.value)}
          placeholder="Paste token"
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 8,
            background: 'var(--bg-base, #0c0c14)', color: 'var(--text-primary, #e5e7eb)',
            border: '1px solid var(--border, #2a2a3a)', fontSize: 13, fontFamily: 'monospace',
            outline: 'none', boxSizing: 'border-box'
          }}
        />
        {error && (
          <div style={{ color: '#f87171', fontSize: 12, marginTop: 8 }}>{error}</div>
        )}
        <button type="submit" style={{
          marginTop: 14, width: '100%', padding: '10px 14px',
          background: 'var(--accent, #4f46e5)', color: '#fff',
          border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer'
        }}>
          Unlock
        </button>
      </form>
    </div>
  )
}
