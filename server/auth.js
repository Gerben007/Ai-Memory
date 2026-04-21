import { Router } from 'express'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

const COOKIE_NAME = 'kv_session'
const DEFAULT_SESSION_DAYS = 30

function parseCookies(header) {
  const out = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx < 0) continue
    const k = part.slice(0, idx).trim()
    const v = part.slice(idx + 1).trim()
    if (k) out[k] = decodeURIComponent(v)
  }
  return out
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/')
  while (str.length % 4) str += '='
  return Buffer.from(str, 'base64')
}

function sign(payload, secret) {
  const data = b64url(JSON.stringify(payload))
  const sig = b64url(crypto.createHmac('sha256', secret).update(data).digest())
  return `${data}.${sig}`
}

function verify(token, secret) {
  if (typeof token !== 'string' || !token.includes('.')) return null
  const [data, sig] = token.split('.')
  if (!data || !sig) return null
  const expected = b64url(crypto.createHmac('sha256', secret).update(data).digest())
  // timing-safe compare
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    return JSON.parse(b64urlDecode(data).toString('utf-8'))
  } catch {
    return null
  }
}

function timingSafeStringEqual(a, b) {
  const ab = Buffer.from(a, 'utf-8')
  const bb = Buffer.from(b, 'utf-8')
  if (ab.length !== bb.length) {
    // Still do a compare to keep timing roughly constant
    crypto.timingSafeEqual(ab, ab)
    return false
  }
  return crypto.timingSafeEqual(ab, bb)
}

// Simple per-IP rate limit on login attempts
function createLoginRateLimiter({ max = 8, windowMs = 15 * 60 * 1000 } = {}) {
  const attempts = new Map()
  return {
    check(ip) {
      const now = Date.now()
      const entry = attempts.get(ip)
      if (!entry || now - entry.start > windowMs) {
        attempts.set(ip, { start: now, count: 1 })
        return { ok: true }
      }
      entry.count += 1
      if (entry.count > max) {
        const retryMs = windowMs - (now - entry.start)
        return { ok: false, retryMs }
      }
      return { ok: true }
    },
    reset(ip) { attempts.delete(ip) }
  }
}

function loadOrCreateSecret(vaultDir) {
  if (process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 16) {
    return process.env.AUTH_SECRET
  }
  const secretPath = path.join(vaultDir, '.vault-secret')
  try {
    if (fs.existsSync(secretPath)) {
      const s = fs.readFileSync(secretPath, 'utf-8').trim()
      if (s.length >= 16) return s
    }
  } catch {}
  const generated = crypto.randomBytes(32).toString('hex')
  try {
    fs.mkdirSync(vaultDir, { recursive: true })
    fs.writeFileSync(secretPath, generated, { encoding: 'utf-8', mode: 0o600 })
  } catch (err) {
    console.warn('[Auth] Could not persist session secret:', err.message)
  }
  return generated
}

export function createAuth({ vaultDir }) {
  const password = process.env.AUTH_PASSWORD || ''
  const required = password.length > 0
  const secret = required ? loadOrCreateSecret(vaultDir) : ''
  const sessionDays = Number(process.env.AUTH_SESSION_DAYS) || DEFAULT_SESSION_DAYS
  const sessionMs = sessionDays * 24 * 60 * 60 * 1000
  const limiter = createLoginRateLimiter()

  if (required) {
    console.log(`[Auth] Login required (session lifetime: ${sessionDays} days)`)
  } else {
    console.log('[Auth] No AUTH_PASSWORD set — vault is open. Set AUTH_PASSWORD to require login.')
  }

  function isAuthenticated(req) {
    if (!required) return true
    const cookies = parseCookies(req.headers.cookie)
    const token = cookies[COOKIE_NAME]
    if (!token) return false
    const payload = verify(token, secret)
    if (!payload) return false
    if (typeof payload.exp !== 'number' || Date.now() > payload.exp) return false
    return true
  }

  function setSessionCookie(req, res) {
    const now = Date.now()
    const payload = {
      iat: now,
      exp: now + sessionMs,
      jti: crypto.randomBytes(8).toString('hex')
    }
    const token = sign(payload, secret)
    const secure = req.secure || req.headers['x-forwarded-proto'] === 'https'
    const maxAgeSec = Math.floor(sessionMs / 1000)
    const parts = [
      `${COOKIE_NAME}=${token}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      `Max-Age=${maxAgeSec}`
    ]
    if (secure) parts.push('Secure')
    res.setHeader('Set-Cookie', parts.join('; '))
  }

  function clearSessionCookie(req, res) {
    const secure = req.secure || req.headers['x-forwarded-proto'] === 'https'
    const parts = [
      `${COOKIE_NAME}=`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      'Max-Age=0'
    ]
    if (secure) parts.push('Secure')
    res.setHeader('Set-Cookie', parts.join('; '))
  }

  // Middleware for /api/* — blocks unauthenticated requests except /api/auth/*
  function middleware(req, res, next) {
    if (!required) return next()
    if (req.path.startsWith('/auth/') || req.path === '/auth') return next()
    if (isAuthenticated(req)) return next()
    return res.status(401).json({ error: 'Authentication required' })
  }

  const router = Router()

  router.get('/status', (req, res) => {
    res.json({ required, authenticated: isAuthenticated(req) })
  })

  router.post('/login', (req, res) => {
    if (!required) {
      return res.json({ authenticated: true, required: false })
    }
    const ip = req.ip || req.socket?.remoteAddress || 'unknown'
    const limit = limiter.check(ip)
    if (!limit.ok) {
      res.setHeader('Retry-After', Math.ceil(limit.retryMs / 1000))
      return res.status(429).json({ error: 'Too many attempts. Try again later.' })
    }
    const submitted = typeof req.body?.password === 'string' ? req.body.password : ''
    if (!submitted || !timingSafeStringEqual(submitted, password)) {
      return res.status(401).json({ error: 'Invalid password' })
    }
    limiter.reset(ip)
    setSessionCookie(req, res)
    res.json({ authenticated: true, required: true })
  })

  router.post('/logout', (req, res) => {
    clearSessionCookie(req, res)
    res.json({ ok: true })
  })

  return { required, middleware, router, isAuthenticated }
}
