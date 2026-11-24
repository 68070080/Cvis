export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init)
  const body = (await response.json().catch(() => {
    throw new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่')
  })) as T & { error?: string }
  if (!response.ok) throw new Error(body.error || 'คำขอล้มเหลว กรุณาลองใหม่')
  return body
}

export const jsonRequest = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})
