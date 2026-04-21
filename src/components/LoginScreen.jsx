import { useState, useRef, useEffect } from 'react'
import { login } from '../lib/auth'

export default function LoginScreen({ onAuthenticated }) {
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (submitting || !password) return
    setSubmitting(true)
    setError('')
    const result = await login(password)
    if (result.ok) {
      setPassword('')
      onAuthenticated()
    } else {
      setError(result.message || 'Login failed')
      setSubmitting(false)
    }
  }

  return (
    <div className="h-dvh flex items-center justify-center app-bg px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div
            className="w-12 h-12 mx-auto mb-4 rounded-xl flex items-center justify-center text-sm font-bold"
            style={{
              background: 'var(--accent-soft)',
              color: 'var(--accent-hi)',
              border: '1px solid rgba(59,130,246,0.25)'
            }}
          >
            KV
          </div>
          <h1 className="text-gradient text-2xl font-semibold tracking-tight mb-1">
            Knowledge Vault
          </h1>
          <p className="text-xs text-[var(--text-muted)] tracking-widest uppercase">
            Sign in to continue
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-xl p-6 space-y-4"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
        >
          <div>
            <label
              htmlFor="password"
              className="block text-xs font-medium mb-2"
              style={{ color: 'var(--text-secondary)' }}
            >
              Password
            </label>
            <input
              id="password"
              ref={inputRef}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
              className="w-full bg-gray-800 text-gray-200 text-sm rounded-lg px-4 py-2.5 border border-gray-700 focus:border-indigo-500 focus:outline-none placeholder-gray-500 disabled:opacity-60"
              placeholder="Enter password"
            />
          </div>

          {error && (
            <div className="text-xs text-amber-400" role="alert">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !password}
            className="w-full text-sm font-medium bg-indigo-600 text-white px-4 py-2.5 rounded-lg hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-[10px] text-[var(--text-muted)] mt-6 tracking-wide">
          Protected vault · session stays active for 30 days
        </p>
      </div>
    </div>
  )
}
