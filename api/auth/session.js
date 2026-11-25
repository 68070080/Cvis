import {
  PENDING_COOKIE,
  SESSION_COOKIE,
  cookies,
  json,
  methodNotAllowed,
  readToken,
  secretReady,
} from '../_lib/auth.js'

/** Tells the app who is signed in, and whether a Google step is waiting for OTP. */
export default function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, 'GET')
  if (!secretReady()) {
    return json(res, 500, { error: 'ยังไม่ได้ตั้งค่า AUTH_SECRET ใน environment' })
  }

  const jar = cookies(req)
  const session = readToken(jar.get(SESSION_COOKIE))
  if (session?.email) {
    return json(res, 200, {
      authenticated: true,
      user: { email: session.email, name: session.name || '' },
    })
  }

  const pending = readToken(jar.get(PENDING_COOKIE))
  return json(res, 200, {
    authenticated: false,
    pending: pending?.email ? { email: pending.email } : null,
  })
}
