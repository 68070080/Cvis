/** Sends the e-mail verification code through Resend's REST API. */
export async function sendOtp(email, code, name = '') {
  const key = String(process.env.RESEND_API_KEY || '')
  if (!key) throw new Error('ยังไม่ได้ตั้งค่า RESEND_API_KEY')

  const from = String(process.env.RESEND_FROM || 'Cvis <onboarding@resend.dev>')
  const greeting = name ? `สวัสดี ${name}` : 'สวัสดี'
  const text = `${greeting}\n\nรหัสยืนยันอีเมลสำหรับบัญชี Cvis ของคุณคือ ${code}\nรหัสนี้ใช้ได้ 5 นาที และใช้ได้ครั้งเดียว\n\nหากคุณไม่ได้เป็นผู้ขอรหัสนี้ ไม่ต้องทำอะไรกับอีเมลนี้`

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: `รหัสยืนยัน Cvis: ${code}`,
      text,
      html: `<div style="font-family:'Noto Sans Thai',system-ui,sans-serif;line-height:1.6;color:#152a3d">
  <p>${greeting}</p>
  <p>รหัสยืนยันอีเมลสำหรับบัญชี Cvis ของคุณคือ</p>
  <p style="font-size:32px;font-weight:700;letter-spacing:8px;color:#17808d">${code}</p>
  <p style="color:#62798a">รหัสนี้ใช้ได้ 5 นาที และใช้ได้ครั้งเดียว หากคุณไม่ได้เป็นผู้ขอรหัสนี้ ไม่ต้องทำอะไรกับอีเมลนี้</p>
</div>`,
    }),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    const reason = detail.slice(0, 200)
    console.error('resend failed', response.status, reason)
    if (response.status === 403 || response.status === 422) {
      throw new Error('ส่งอีเมลไม่สำเร็จ — ตรวจสอบ RESEND_FROM ว่าอีเมลผู้ส่งได้รับอนุญาตใน Resend')
    }
    throw new Error(`ส่งอีเมลไม่สำเร็จ (${response.status})`)
  }
}
