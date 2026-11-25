import {
  CHALLENGE_COOKIE,
  MAX_TRIES,
  PENDING_COOKIE,
  SESSION_COOKIE,
  SESSION_TTL,
  body,
  clearCookie,
  cookies,
  issueToken,
  json,
  methodNotAllowed,
  otpDigest,
  readToken,
  sameDigest,
  secretReady,
  setCookie,
} from '../../_lib/auth.js'

/** Step 4: checks the code and issues the 12-hour session cookie. */
export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, 'POST')
  if (!secretReady()) {
    return json(res, 500, { error: 'ยังไม่ได้ตั้งค่า AUTH_SECRET ใน environment' })
  }

  const payload = await body(req)
  const code = String(payload?.code ?? '').trim()
  if (!/^\d{6}$/.test(code)) {
    return json(res, 400, { error: 'กรอกรหัส OTP 6 หลัก' })
  }

  const jar = cookies(req)
  const challenge = readToken(jar.get(CHALLENGE_COOKIE))
  if (!challenge?.email || !challenge?.otp) {
    clearCookie(req, res, CHALLENGE_COOKIE)
    clearCookie(req, res, PENDING_COOKIE)
    return json(res, 400, {
      error: 'รหัสหมดอายุแล้ว กรุณาเข้าสู่ระบบด้วย Google ใหม่',
    })
  }

  const tries = Number(challenge.tries || 0) + 1
  if (!sameDigest(otpDigest(challenge.email, code), challenge.otp)) {
    if (tries >= MAX_TRIES) {
      clearCookie(req, res, CHALLENGE_COOKIE)
      clearCookie(req, res, PENDING_COOKIE)
      return json(res, 429, {
        error: 'กรอกรหัสผิดหลายครั้งเกินไป กรุณาเริ่มเข้าสู่ระบบใหม่',
      })
    }
    setCookie(
      req,
      res,
      CHALLENGE_COOKIE,
      issueToken({ ...challenge, tries }),
      Math.max(1000, challenge.exp - Date.now()),
    )
    return json(res, 400, {
      error: `รหัสไม่ถูกต้อง (เหลืออีก ${MAX_TRIES - tries} ครั้ง)`,
    })
  }

  clearCookie(req, res, CHALLENGE_COOKIE)
  clearCookie(req, res, PENDING_COOKIE)
  const user = { email: challenge.email, name: challenge.name || '' }
  setCookie(
    req,
    res,
    SESSION_COOKIE,
    issueToken({ ...user, exp: Date.now() + SESSION_TTL }),
    SESSION_TTL,
  )
  return json(res, 200, { authenticated: true, user })
}
