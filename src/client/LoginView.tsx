import { useEffect, useRef, useState } from 'react'
import { sendOtp, signOut, verifyOtp, type AuthState, type AuthUser } from './auth'

const seconds = (value: number) => `${value} วินาที`

export function LoginView({
  state,
  onVerified,
}: {
  state: AuthState
  onVerified: (user: AuthUser) => void
}) {
  const pendingEmail = state.pending?.email ?? ''
  const [step, setStep] = useState<'google' | 'code'>(
    pendingEmail ? 'code' : 'google',
  )
  const [code, setCode] = useState('')
  const [devCode, setDevCode] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('error') || ''
  })
  const [busy, setBusy] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const requested = useRef(false)

  // Keep the URL clean once the message has been read.
  useEffect(() => {
    if (window.location.search) {
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [])

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = window.setInterval(
      () => setCooldown((value) => (value > 0 ? value - 1 : 0)),
      1000,
    )
    return () => window.clearInterval(timer)
  }, [cooldown])

  async function request() {
    if (busy || !pendingEmail) return
    setBusy(true)
    setError('')
    try {
      const result = await sendOtp()
      setDevCode(result.devCode ?? '')
      setNote(`ส่งรหัส 6 หลักไปที่ ${result.email} แล้ว ใช้ได้ 5 นาที`)
      setCooldown(30)
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'ขอรหัสไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  // Coming back from Google: send the code straight away.
  useEffect(() => {
    if (step !== 'code' || requested.current) return
    requested.current = true
    void request()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!/^\d{6}$/.test(code)) return setError('กรอกรหัส OTP 6 หลัก')
    setBusy(true)
    setError('')
    try {
      const result = await verifyOtp(code)
      onVerified(result.user)
    } catch (problem) {
      setError(
        problem instanceof Error ? problem.message : 'ยืนยันรหัสไม่สำเร็จ',
      )
    } finally {
      setBusy(false)
    }
  }

  async function restart() {
    setBusy(true)
    try {
      await signOut()
    } catch {
      // A failed sign-out still means the browser can start over.
    } finally {
      window.location.assign('/')
    }
  }

  return (
    <section className="login">
      <div className="loginhead">
        <div className="logobadge" aria-hidden="true">
          C
        </div>
        <h1>Cvis</h1>
        <p className="muted small">
          รายรับรายจ่าย สุขภาพ และตารางเวลา — เก็บไว้ในเครื่องนี้
        </p>
      </div>

      {error && (
        <p role="alert" className="formerror">
          {error}
        </p>
      )}

      {step === 'google' ? (
        <div className="card">
          <h2>เข้าสู่ระบบ</h2>
          <p className="muted small">
            ใช้อีเมล Google แล้วยืนยันอีกขั้นด้วยรหัส OTP ที่ส่งไปยังอีเมลของคุณ
          </p>
          <a className="primary wide googlebtn" href="/api/auth/google/start">
            <span className="googlemark" aria-hidden="true">
              G
            </span>
            ดำเนินการต่อด้วย Google
          </a>
        </div>
      ) : (
        <form className="card" onSubmit={submit}>
          <h2>ยืนยันตัวตนด้วย OTP</h2>
          <p className="muted small">
            รหัส 6 หลักส่งไปที่ <strong>{pendingEmail}</strong> — ใช้ได้ 5 นาที
            และใช้ได้ครั้งเดียว
          </p>
          <div className="field">
            <label htmlFor="otp-code">รหัส OTP</label>
            <input
              id="otp-code"
              className="otpinput"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(event) =>
                setCode(event.target.value.replace(/\D/g, '').slice(0, 6))
              }
            />
          </div>
          {devCode && (
            <p className="muted small" role="status">
              โหมดทดสอบในเครื่อง (ไม่ได้ส่งอีเมลจริง): รหัสคือ {devCode}
            </p>
          )}
          {note && (
            <p className="muted small" role="status">
              {note}
            </p>
          )}
          <button
            type="submit"
            className="primary wide"
            disabled={busy || code.length !== 6}
          >
            {busy ? 'กำลังตรวจสอบ…' : 'ยืนยันรหัส'}
          </button>
          <div className="loginlinks">
            <button
              type="button"
              className="linkbtn"
              disabled={busy || cooldown > 0}
              onClick={request}
            >
              {cooldown > 0 ? `ส่งอีกครั้งใน ${seconds(cooldown)}` : 'ส่งรหัสอีกครั้ง'}
            </button>
            <button
              type="button"
              className="linkbtn"
              disabled={busy}
              onClick={restart}
            >
              ใช้บัญชีอื่น
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
