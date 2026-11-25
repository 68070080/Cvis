import {
  OAUTH_COOKIE,
  issueToken,
  json,
  methodNotAllowed,
  newState,
  origin,
  secretReady,
  setCookie,
} from '../../_lib/auth.js'

/** Step 1: hands the browser to Google's consent screen. */
export default function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, 'GET')
  if (!secretReady()) {
    return json(res, 500, { error: 'ยังไม่ได้ตั้งค่า AUTH_SECRET ใน environment' })
  }

  const clientId = String(process.env.GOOGLE_CLIENT_ID || '')
  if (!clientId) {
    return json(res, 500, { error: 'ยังไม่ได้ตั้งค่า GOOGLE_CLIENT_ID ใน environment' })
  }

  const state = issueToken({
    nonce: newState(),
    exp: Date.now() + 10 * 60_000,
  })
  setCookie(req, res, OAUTH_COOKIE, state, 10 * 60_000)

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', `${origin(req)}/api/auth/google/callback`)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'openid email profile')
  url.searchParams.set('state', state)
  url.searchParams.set('prompt', 'select_account')

  res.writeHead(302, { Location: url.toString(), 'Cache-Control': 'no-store' })
  res.end()
}
