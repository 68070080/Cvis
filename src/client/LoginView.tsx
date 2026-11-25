import { useEffect, useState } from 'react'
import {
  MIN_PASSWORD,
  isEmail,
  normalizeEmail,
  passwordMatches,
  saveAccount,
  type LocalAccount,
} from './account'
import { sendOtp, verifyOtp, type AuthUser } from './auth'

const seconds = (value: number) => `${value} วินาที`

/** Sign-up (e-mail + password, confirmed by OTP) or sign-in with the password. */
export function LoginView({
  account,
  onSignedIn,
}: {
  account: LocalAccount | null
  onSignedIn: (user: AuthUser) => void
}) {
  const [step, setStep] = useState<'login' | 'signup' | 'code' | 'reset'>(
    account ? 'login' : 'signup',
  )
  const [email, setEmail] = useState(account?.email ?? '')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [code, setCode] = useState('')
  const [devCode, setDevCode] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  /** What to finish once the code from the e-mail is accepted. */
  const [intent, setIntent] = useState<'signup' | 'reset'>('signup')

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = window.setInterval(
      () => setCooldown((value) => (value > 0 ? value - 1 : 0)),
      1000,
    )
    return () => window.clearInterval(timer)
  }, [cooldown])

  function passwordProblem(): string {
    if (password.length < MIN_PASSWORD) {
      return `รหัสผ่านต้องมีอย่างน้อย ${MIN_PASSWORD} ตัวอักษร`
    }
    if (password !== confirm) return 'รหัสผ่านทั้งสองช่องไม่ตรงกัน'
    return ''
  }

  async function requestCode(address: string): Promise<boolean> {
    setBusy(true)
    setError('')
    try {
      const result = await sendOtp(address)
      setDevCode(result.devCode ?? '')
      setNote(`ส่งรหัส 6 หลักไปที่ ${result.email} แล้ว ใช้ได้ 5 นาที`)
      setCooldown(30)
      return true
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'ขอรหัสไม่สำเร็จ')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function startVerification(next: 'signup' | 'reset') {
    const address = normalizeEmail(email)
    if (!isEmail(address)) return setError('กรุณากรอกอีเมลให้ถูกต้อง')
    const problem = passwordProblem()
    if (problem) return setError(problem)
    setIntent(next)
    if (await requestCode(address)) setStep('code')
  }

  async function signIn(event: React.FormEvent) {
    event.preventDefault()
    if (!account) return
    if (normalizeEmail(email) !== account.email) {
      return setError('อีเมลนี้ไม่ตรงกับบัญชีที่สร้างไว้ในเครื่องนี้')
    }
    setBusy(true)
    setError('')
    try {
      if (!(await passwordMatches(account, password))) {
        return setError('รหัสผ่านไม่ถูกต้อง')
      }
      onSignedIn({ email: account.email })
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'เข้าสู่ระบบไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  async function confirmCode(event: React.FormEvent) {
    event.preventDefault()
    if (!/^\d{6}$/.test(code)) return setError('กรอกรหัส OTP 6 หลัก')
    setBusy(true)
    setError('')
    try {
      const result = await verifyOtp(code)
      const saved = await saveAccount(result.email, password)
      onSignedIn({ email: saved.email })
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'ยืนยันรหัสไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  const back = (next: 'login' | 'signup' | 'reset') => {
    setError('')
    setNote('')
    setDevCode('')
    setCode('')
    setPassword('')
    setConfirm('')
    setStep(next)
  }

  const addressFields = (autocomplete: string) => (
    <>
      <div className="field">
        <label htmlFor="account-email">อีเมล</label>
        <input
          id="account-email"
          type="email"
          inputMode="email"
          autoComplete={autocomplete}
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          placeholder="you@example.com"
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="account-password">รหัสผ่าน</label>
        <input
          id="account-password"
          type="password"
          autoComplete="new-password"
          value={password}
          placeholder={`อย่างน้อย ${MIN_PASSWORD} ตัวอักษร`}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="account-confirm">ยืนยันรหัสผ่าน</label>
        <input
          id="account-confirm"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
        />
      </div>
    </>
  )

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

      {step === 'login' && account && (
        <form className="card" onSubmit={signIn}>
          <h2>เข้าสู่ระบบ</h2>
          <p className="muted small">
            บัญชีในเครื่องนี้: <strong>{account.email}</strong>
          </p>
          <div className="field">
            <label htmlFor="login-email">อีเมล</label>
            <input
              id="login-email"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="login-password">รหัสผ่าน</label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <button type="submit" className="primary wide" disabled={busy}>
            {busy ? 'กำลังตรวจสอบ…' : 'เข้าสู่ระบบ'}
          </button>
          <div className="loginlinks">
            <button
              type="button"
              className="linkbtn"
              disabled={busy}
              onClick={() => back('reset')}
            >
              ลืมรหัสผ่าน?
            </button>
          </div>
        </form>
      )}

      {(step === 'signup' || step === 'reset') && (
        <form
          className="card"
          onSubmit={(event) => {
            event.preventDefault()
            void startVerification(step === 'reset' ? 'reset' : 'signup')
          }}
        >
          <h2>{step === 'reset' ? 'ตั้งรหัสผ่านใหม่' : 'สร้างบัญชี'}</h2>
          <p className="muted small">
            {step === 'reset'
              ? 'ยืนยันอีเมลด้วยรหัส OTP แล้วตั้งรหัสผ่านใหม่สำหรับบัญชีในเครื่องนี้'
              : 'สมัครด้วยอีเมลและรหัสผ่าน แล้วยืนยันอีเมลด้วยรหัส OTP ที่ส่งไปให้'}
          </p>
          {addressFields(step === 'reset' ? 'username' : 'email')}
          <button type="submit" className="primary wide" disabled={busy}>
            {busy ? 'กำลังส่งรหัส…' : 'รับรหัส OTP'}
          </button>
          <div className="loginlinks">
            {account && (
              <button
                type="button"
                className="linkbtn"
                disabled={busy}
                onClick={() => back('login')}
              >
                กลับไปเข้าสู่ระบบ
              </button>
            )}
          </div>
        </form>
      )}

      {step === 'code' && (
        <form className="card" onSubmit={confirmCode}>
          <h2>ยืนยันอีเมลด้วย OTP</h2>
          <p className="muted small">
            รหัส 6 หลักส่งไปที่ <strong>{normalizeEmail(email)}</strong> —
            ใช้ได้ 5 นาที และใช้ได้ครั้งเดียว
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
            {busy
              ? 'กำลังตรวจสอบ…'
              : intent === 'reset'
                ? 'ยืนยันและตั้งรหัสใหม่'
                : 'ยืนยันและสร้างบัญชี'}
          </button>
          <div className="loginlinks">
            <button
              type="button"
              className="linkbtn"
              disabled={busy || cooldown > 0}
              onClick={() => void requestCode(normalizeEmail(email))}
            >
              {cooldown > 0 ? `ส่งอีกครั้งใน ${seconds(cooldown)}` : 'ส่งรหัสอีกครั้ง'}
            </button>
            <button
              type="button"
              className="linkbtn"
              disabled={busy}
              onClick={() => back(intent === 'reset' ? 'reset' : 'signup')}
            >
              แก้อีเมล
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
