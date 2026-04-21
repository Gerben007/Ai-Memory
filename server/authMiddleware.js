import crypto from 'crypto'

// Opt-in bearer-token auth. If VAULT_AUTH_TOKEN is set, every /api request must
// carry `Authorization: Bearer <token>` matching it. If unset, the middleware
// logs one startup warning and passes all requests through (keeps local-dev
// single-user setups working without friction).
//
// Comparison is constant-time to avoid leaking the token via timing.
export function createAuthMiddleware() {
  const token = process.env.VAULT_AUTH_TOKEN || ''

  if (!token) {
    console.warn('[auth] VAULT_AUTH_TOKEN is not set — API endpoints are UNPROTECTED.')
    console.warn('[auth] Set VAULT_AUTH_TOKEN to a long random string before exposing this server.')
    return (req, res, next) => next()
  }

  console.log('[auth] Bearer-token auth enabled on /api/*')
  const expected = Buffer.from(token, 'utf8')

  return function requireAuth(req, res, next) {
    const header = req.headers['authorization'] || ''
    const m = /^Bearer\s+(.+)$/i.exec(header)
    if (!m) return res.status(401).json({ error: 'Authorization required', authRequired: true })

    const provided = Buffer.from(m[1], 'utf8')
    if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
      return res.status(401).json({ error: 'Invalid token', authRequired: true })
    }
    next()
  }
}

// Health/auth-status endpoint. Always accessible (mounted BEFORE the auth
// middleware). Lets the frontend learn whether a token is required without
// needing to already have one.
export function authStatusHandler(req, res) {
  res.json({ authRequired: Boolean(process.env.VAULT_AUTH_TOKEN) })
}
