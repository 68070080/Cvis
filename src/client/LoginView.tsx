import { useState } from 'react'
import {
  MIN_PASSWORD,
  isEmail,
  normalizeEmail,
  passwordMatches,
  readAccount,
  saveAccount,
  type AuthUser,
  type LocalAccount,
} from './account'

/**
 * Sign-up with an e-mail and a password, sign-in with the password, and a
 * password reset — all checked in this browser, no e-mail is ever sent.
 */
export function LoginView({
  account,
  onSignedIn,
}: {
  account: LocalAccount | null
  onSignedIn: (user: AuthUser) => void
}) {
  const [step, setStep] = useState<'login' | 'signup' | 'reset'>(
    account ? 'login' : 'signup',
  )
  const [email, setEmail] = useState(account?.email ?? '')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function passwordProblem() {
    if (password.length < MIN_PASSWORD) {
      return `รหัสผ่านต้องมีอย่างน้อย ${MIN_PASSWORD} ตัวอักษร`
    }
    if (password !== confirm) return 'รหัสผ่านทั้งสองช่องไม่ตรงกัน'
    return ''
  }

  async function signUp(event: React.FormEvent) {
    event.preventDefault()
    const address = normalizeEmail(email)
    if (!isEmail(address)) return setError('กรุณากรอกอีเมลให้ถูกต้อง')
    const problem = passwordProblem()
    if (problem) return setError(problem)
    setBusy(true)
    setError('')
    try {
      const saved = await saveAccount(address, password)
      onSignedIn({ email: saved.email })
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'สร้างบัญชีไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
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
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'เข้าสู่ระบบไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  async function resetPassword(event: React.FormEvent) {
    event.preventDefault()
    const current = await readAccount().catch(() => null)
    if (!current) return setError('ยังไม่มีบัญชีในเครื่องนี้ กรุณาสร้างบัญชีใหม่')
    if (normalizeEmail(email) !== current.email) {
      return setError('อีเมลนี้ไม่ตรงกับบัญชีที่สร้างไว้ในเครื่องนี้')
    }
    const problem = passwordProblem()
    if (problem) return setError(problem)
    setBusy(true)
    setError('')
    try {
      const saved = await saveAccount(current.email, password)
      onSignedIn({ email: saved.email })
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'ตั้งรหัสผ่านใหม่ไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  const back = (next: 'login' | 'signup' | 'reset') => {
    setError('')
    setPassword('')
    setConfirm('')
    setStep(next)
  }

  const passwordFields = (autoComplete: string) => (
    <>
      <div className="field">
        <label htmlFor="account-password">
          {autoComplete === 'current-password' ? 'รหัสผ่าน' : 'รหัสผ่านใหม่'}
        </label>
        <input
          id="account-password"
          type="password"
          autoComplete={autoComplete}
          value={password}
          placeholder={
            autoComplete === 'current-password'
              ? undefined
              : `อย่างน้อย ${MIN_PASSWORD} ตัวอักษร`
          }
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      {autoComplete !== 'current-password' && (
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
      )}
    </>
  )

  const emailField = (autoComplete: string) => (
    <div className="field">
      <label htmlFor="account-email">อีเมล</label>
      <input
        id="account-email"
        type="email"
        inputMode="email"
        autoComplete={autoComplete}
        autoCapitalize="none"
        spellCheck={false}
        value={email}
        placeholder="you@example.com"
        onChange={(event) => setEmail(event.target.value)}
      />
    </div>
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
          {emailField('username')}
          {passwordFields('current-password')}
          <button type="submit" className="primary wide" disabled={busy}>
            {busy ? 'กำลังตรวจสอบ…' : 'เข้าสู่ระบบ'}
          </button>
          <div className="loginlinks">
            <button
              type="button"
              className="linkbtn"
              disabled={busy}
              onClick={() => {
                setEmail(account.email)
                back('reset')
              }}
            >
              ลืมรหัสผ่าน?
            </button>
          </div>
        </form>
      )}

      {step === 'signup' && (
        <form className="card" onSubmit={signUp}>
          <h2>สร้างบัญชี</h2>
          <p className="muted small">
            บัญชีนี้ใช้ปลดล็อกแอพในเบราว์เซอร์นี้เท่านั้น ไม่มีการส่งอีเมล
            และไม่มีข้อมูลใดถูกอัปโหลดขึ้นเซิร์ฟเวอร์
          </p>
          {emailField('email')}
          {passwordFields('new-password')}
          <button type="submit" className="primary wide" disabled={busy}>
            {busy ? 'กำลังสร้างบัญชี…' : 'สร้างบัญชี'}
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

      {step === 'reset' && (
        <form className="card" onSubmit={resetPassword}>
          <h2>ตั้งรหัสผ่านใหม่</h2>
          <p className="muted small">
            ตั้งรหัสผ่านใหม่ให้บัญชีในเครื่องนี้ — ข้อมูลเดิมยังอยู่ครบ
            และไม่ต้องยืนยันทางอีเมล
          </p>
          {emailField('username')}
          {passwordFields('new-password')}
          <button type="submit" className="primary wide" disabled={busy}>
            {busy ? 'กำลังบันทึก…' : 'บันทึกรหัสผ่านใหม่'}
          </button>
          <div className="loginlinks">
            <button
              type="button"
              className="linkbtn"
              disabled={busy}
              onClick={() => back(account ? 'login' : 'signup')}
            >
              {account ? 'กลับไปเข้าสู่ระบบ' : 'กลับไปสร้างบัญชี'}
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
