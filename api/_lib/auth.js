import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'

/** Cookie that binds a sign-up or password-reset code to its address. */
export const CHALLENGE_COOKIE = 'cvis_challenge'

const MINUTE = 60_000
export const OTP_TTL = 5 * MINUTE
export const RESEND_GAP = 30_000
export const MAX_TRIES = 5

const secret = () => String(process.env.AUTH_SECRET || '')

/** A signing secret is required; refuse to run on a guessable default. */
export const secretReady = () => secret().length >= 32

const mac = (value) =>
  createHmac('sha256', secret()).update(value).digest('base64url')

/** Signed, expiring, self-contained token: `<json>.<hmac>`. */
export function issueToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${mac(body)}`
}

export function readToken(raw) {
  if (!raw) return null
  const [body, signature] = String(raw).split('.')
  if (!body || !signature) return null
  const expected = mac(body)
  const given = Buffer.from(signature)
  const wanted = Buffer.from(expected)
  if (given.length !== wanted.length) return null
  if (!timingSafeEqual(given, wanted)) return null
  let payload
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (!payload || typeof payload !== 'object') return null
  if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null
  return payload
}

/** The OTP itself is never stored, only a keyed digest of it. */
export const otpDigest = (email, code) =>
  createHmac('sha256', secret()).update(`otp:${email}:${code}`).digest('base64url')

export function sameDigest(a, b) {
  const left = Buffer.from(String(a))
  const right = Buffer.from(String(b))
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

export const newOtp = () =>
  String(randomInt(0, 1_000_000)).padStart(6, '0')

export function cookies(req) {
  const jar = new Map()
  const header = req?.headers?.cookie
  if (!header) return jar
  for (const part of String(header).split(';')) {
    const index = part.indexOf('=')
    if (index < 0) continue
    const name = part.slice(0, index).trim()
    if (!name) continue
    try {
      jar.set(name, decodeURIComponent(part.slice(index + 1).trim()))
    } catch {
      jar.set(name, part.slice(index + 1).trim())
    }
  }
  return jar
}

function isHttps(req) {
  const proto = req?.headers?.['x-forwarded-proto']
  if (proto) return String(proto).split(',')[0].trim() === 'https'
  return Boolean(process.env.VERCEL)
}

function pushCookie(res, cookie) {
  const current = res.getHeader?.('Set-Cookie')
  const list = Array.isArray(current)
    ? current
    : current
      ? [String(current)]
      : []
  res.setHeader('Set-Cookie', [...list, cookie])
}

export function setCookie(req, res, name, value, maxAgeMs) {
  const age = Math.max(0, Math.floor(maxAgeMs / 1000))
  const secure = isHttps(req) ? '; Secure' : ''
  pushCookie(
    res,
    `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${age}; HttpOnly; SameSite=Lax${secure}`,
  )
}

export function clearCookie(req, res, name) {
  const secure = isHttps(req) ? '; Secure' : ''
  pushCookie(
    res,
    `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`,
  )
}

export function json(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(payload))
}

/** Works with Vercel (parsed body) and with the local test server. */
export async function body(req) {
  if (req?.body && typeof req.body === 'object') return req.body
  if (typeof req?.body === 'string') {
    try {
      return JSON.parse(req.body)
    } catch {
      return {}
    }
  }
  let raw = ''
  for await (const chunk of req) raw += chunk
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

export function methodNotAllowed(res, allowed) {
  res.setHeader('Allow', allowed)
  return json(res, 405, { error: `ใช้ ${allowed} เท่านั้น` })
}
