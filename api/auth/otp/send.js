import {
  CHALLENGE_COOKIE,
  OTP_TTL,
  RESEND_GAP,
  body,
  cookies,
  issueToken,
  json,
  methodNotAllowed,
  newOtp,
  otpDigest,
  readToken,
  secretReady,
  setCookie,
} from '../../_lib/auth.js'
import { sendOtp } from '../../_lib/mail.js'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** E-mails a fresh 6-digit code to the address being signed up or reset. */
export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, 'POST')
  if (!secretReady()) {
    return json(res, 500, { error: 'ยังไม่ได้ตั้งค่า AUTH_SECRET ใน environment' })
  }

  const payload = await body(req)
  const email = String(payload?.email ?? '').trim().toLowerCase()
  if (!EMAIL.test(email)) {
    return json(res, 400, { error: 'กรุณากรอกอีเมลให้ถูกต้อง' })
  }

  const jar = cookies(req)
  const previous = readToken(jar.get(CHALLENGE_COOKIE))
  const sentAt = Number(previous?.sentAt || 0)
  if (previous?.email === email && Date.now() - sentAt < RESEND_GAP) {
    const wait = Math.ceil((RESEND_GAP - (Date.now() - sentAt)) / 1000)
    return json(res, 429, { error: `ขอรหัสใหม่ได้ในอีก ${wait} วินาที` })
  }

  // Only the local development server sets CVIS_DEV_OTP, so production never
  // skips the e-mail or returns the code to the browser.
  const dev = process.env.CVIS_DEV_OTP === '1'
  const code = newOtp()

  if (!dev || process.env.RESEND_API_KEY) {
    try {
      await sendOtp(email, code)
    } catch (error) {
      console.error('otp mail failed', error)
      return json(res, 502, {
        error: error instanceof Error ? error.message : 'ส่งอีเมลไม่สำเร็จ',
      })
    }
  }

  // The challenge is only remembered once the code actually reached the user.
  const now = Date.now()
  setCookie(
    req,
    res,
    CHALLENGE_COOKIE,
    issueToken({
      email,
      otp: otpDigest(email, code),
      exp: now + OTP_TTL,
      sentAt: now,
      tries: 0,
    }),
    OTP_TTL,
  )

  return json(res, 200, {
    ok: true,
    email,
    expiresInSec: OTP_TTL / 1000,
    ...(dev ? { devCode: code } : {}),
  })
}
