/** Talks to the small auth API in /api/auth (Vercel functions). */
export type AuthUser = { email: string }

export type OtpSent = {
  ok: true
  email: string
  expiresInSec: number
  /** Only present when the local dev API server runs without Resend. */
  devCode?: string
}

export type OtpVerified = { verified: true; email: string }

function parse(text: string): Record<string, unknown> {
  try {
    return text ? (JSON.parse(text) as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...init,
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init?.headers || {}),
      },
    })
  } catch {
    throw new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ต')
  }

  const payload = parse(await response.text())
  if (!response.ok) {
    const detail = payload.error
    throw new Error(
      typeof detail === 'string' ? detail : 'เซิร์ฟเวอร์ตอบกลับผิดพลาด',
    )
  }
  return payload as T
}

export const sendOtp = (email: string) =>
  call<OtpSent>('/api/auth/otp/send', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })

export const verifyOtp = (code: string) =>
  call<OtpVerified>('/api/auth/otp/verify', {
    method: 'POST',
    body: JSON.stringify({ code }),
  })
