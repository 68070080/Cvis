import {
  CHALLENGE_COOKIE,
  OTP_TTL,
  PENDING_COOKIE,
  RESEND_GAP,
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

/** Step 3: e-mails a fresh 6-digit code for the pending Google account. */
export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, 'POST')
  if (!secretReady()) {
    return json(res, 500, { error: 'ยังไม่ได้ตั้งค่า AUTH_SECRET ใน environment' })
  }

  const jar = cookies(req)
  const pending = readToken(jar.get(PENDING_COOKIE))
  if (!pending?.email) {
    return json(res, 401, { error: 'กรุณาเข้าสู่ระบบด้วย Google ก่อนขอรหัส OTP' })
  }

  const previous = readToken(jar.get(CHALLENGE_COOKIE))
  const sentAt = Number(previous?.sentAt || 0)
  if (previous?.email === pending.email && Date.now() - sentAt < RESEND_GAP) {
    const wait = Math.ceil((RESEND_GAP - (Date.now() - sentAt)) / 1000)
    return json(res, 429, { error: `ขอรหัสใหม่ได้ในอีก ${wait} วินาที` })
  }

  // Only the local development server sets CVIS_DEV_OTP, so production never
  // skips the e-mail or returns the code to the browser.
  const dev = process.env.CVIS_DEV_OTP === '1'
  const code = newOtp()

  if (!dev || process.env.RESEND_API_KEY) {
    try {
      await sendOtp(pending.email, code, pending.name || '')
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
      email: pending.email,
      name: pending.name || '',
      otp: otpDigest(pending.email, code),
      exp: now + OTP_TTL,
      sentAt: now,
      tries: 0,
    }),
    OTP_TTL,
  )

  return json(res, 200, {
    ok: true,
    email: pending.email,
    expiresInSec: OTP_TTL / 1000,
    ...(dev ? { devCode: code } : {}),
  })
}
