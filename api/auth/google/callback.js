import {
  OAUTH_COOKIE,
  PENDING_COOKIE,
  PENDING_TTL,
  clearCookie,
  cookies,
  issueToken,
  origin,
  readToken,
  setCookie,
} from '../../_lib/auth.js'

/** Step 2: verifies Google's answer and remembers the pending e-mail for OTP. */
export default async function handler(req, res) {
  const base = origin(req)
  const jar = cookies(req)
  const stored = jar.get(OAUTH_COOKIE)
  const state = readToken(stored)
  clearCookie(req, res, OAUTH_COOKIE)

  const fail = (message) => {
    res.writeHead(302, {
      Location: `/?error=${encodeURIComponent(message)}`,
      'Cache-Control': 'no-store',
    })
    res.end()
  }

  const query = new URL(req.url, base).searchParams
  const code = query.get('code')
  const stateParam = query.get('state')
  if (query.get('error')) return fail('ยกเลิกการเข้าสู่ระบบด้วย Google')
  if (!stored || !state || !stateParam || stateParam !== stored) {
    return fail('ลิงก์ยืนยันไม่ถูกต้องหรือหมดอายุ กรุณาเริ่มใหม่')
  }
  if (!code) return fail('ไม่ได้รับรหัสอนุญาตจาก Google กรุณาเริ่มใหม่')

  const clientId = String(process.env.GOOGLE_CLIENT_ID || '')
  const clientSecret = String(process.env.GOOGLE_CLIENT_SECRET || '')
  if (!clientId || !clientSecret) {
    return fail('ยังไม่ได้ตั้งค่า GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET')
  }

  let access
  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${base}/api/auth/google/callback`,
        grant_type: 'authorization_code',
      }),
    })
    access = await tokenResponse.json()
    if (!tokenResponse.ok || !access?.access_token) {
      console.error('google token exchange failed', tokenResponse.status, access)
      return fail('แลก token กับ Google ไม่สำเร็จ กรุณาลองใหม่')
    }

    const infoResponse = await fetch(
      'https://openidconnect.googleapis.com/v1/userinfo',
      { headers: { Authorization: `Bearer ${access.access_token}` } },
    )
    const info = await infoResponse.json()
    if (!infoResponse.ok || !info?.email) {
      return fail('อ่านอีเมลจากบัญชี Google ไม่สำเร็จ')
    }
    if (info.email_verified === false) {
      return fail('อีเมลของบัญชี Google นี้ยังไม่ได้ยืนยัน')
    }

    setCookie(
      req,
      res,
      PENDING_COOKIE,
      issueToken({
        email: String(info.email).toLowerCase(),
        name: info.name || '',
        exp: Date.now() + PENDING_TTL,
      }),
      PENDING_TTL,
    )
    res.writeHead(302, { Location: '/?auth=otp', 'Cache-Control': 'no-store' })
    res.end()
  } catch (error) {
    console.error('google callback failed', error)
    return fail('เชื่อมต่อ Google ไม่สำเร็จ กรุณาลองใหม่')
  }
}
