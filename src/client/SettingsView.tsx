import { useEffect, useRef, useState } from 'react'
import type { AppData, Session, SettingsInput, Theme } from '../shared/types'
import { downloadBackup } from './backup'
import { DEFAULT_THEME, applyTheme, isHexColor } from './theme'

/** Water goal slider limits, in millilitres. */
const WATER_MIN = 500
const WATER_MAX = 5000
const WATER_STEP = 50

const FIELDS: { key: keyof Theme; label: string; hint: string }[] = [
  { key: 'accent', label: 'สีหลัก', hint: 'ปุ่ม เน้น ตัวเลขสำคัญ' },
  { key: 'expense', label: 'สีรายจ่าย', hint: 'ใช้กับยอดรายจ่าย' },
  { key: 'income', label: 'สีรายรับ', hint: 'ใช้กับยอดรายรับและเงินเก็บ' },
  { key: 'background', label: 'สีพื้นหลัง', hint: 'พื้นหลังทั้งแอพ' },
]

export function SettingsView({
  data,
  session,
  accountEmail,
  onSignOut,
  onSave,
  onRestore,
  busy,
}: {
  data: AppData
  session: Session
  /** Google account used to sign in. */
  accountEmail: string
  onSignOut: () => void
  onSave: (input: SettingsInput) => Promise<void>
  onRestore: (text: string) => Promise<void>
  busy: boolean
}) {
  const [name, setName] = useState(data.settings.displayName)
  const [cycleDay, setCycleDay] = useState(String(data.settings.cycleDay))
  const [waterGoal, setWaterGoal] = useState(
    String(data.settings.waterGoalMl),
  )
  const [theme, setTheme] = useState<Theme>(data.settings.theme)
  const [error, setError] = useState('')
  const [backupNote, setBackupNote] = useState('')
  const [backupBusy, setBackupBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setName(data.settings.displayName)
    setCycleDay(String(data.settings.cycleDay))
    setWaterGoal(String(data.settings.waterGoalMl))
    setTheme(data.settings.theme)
  }, [data.settings])

  // Live preview while the colours are being picked.
  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const day = Number(cycleDay)
  const goal = Number(waterGoal)
  const waterSlider = Number.isFinite(goal)
    ? Math.min(WATER_MAX, Math.max(WATER_MIN, goal))
    : WATER_MIN
  const dirty =
    name !== data.settings.displayName ||
    day !== data.settings.cycleDay ||
    goal !== data.settings.waterGoalMl ||
    JSON.stringify(theme) !== JSON.stringify(data.settings.theme)

  function updateColor(key: keyof Theme, value: string) {
    const next = value.toLowerCase()
    setTheme((current) => ({ ...current, [key]: next }))
    if (isHexColor(next)) applyTheme({ ...theme, [key]: next })
  }

  async function backup() {
    setBackupNote('')
    try {
      await downloadBackup()
      setBackupNote('ดาวน์โหลดไฟล์สำรองแล้ว — เก็บไว้ในที่ปลอดภัย')
    } catch (problem) {
      setBackupNote(
        problem instanceof Error ? problem.message : 'สำรองข้อมูลไม่สำเร็จ',
      )
    }
  }

  async function restore(file: File) {
    if (
      !window.confirm(
        'นำเข้าข้อมูลสำรองจะแทนที่ข้อมูลทั้งหมดในเครื่องนี้ ดำเนินการต่อหรือไม่?',
      )
    ) {
      if (fileRef.current) fileRef.current.value = ''
      return
    }
    setBackupBusy(true)
    setBackupNote('')
    try {
      await onRestore(await file.text())
      setBackupNote('นำเข้าข้อมูลสำรองเรียบร้อยแล้ว')
    } catch (problem) {
      setBackupNote(
        problem instanceof Error ? problem.message : 'นำเข้าข้อมูลไม่สำเร็จ',
      )
    } finally {
      setBackupBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (FIELDS.some((field) => !isHexColor(theme[field.key])))
      return setError('สีต้องเป็นรหัส hex 6 หลัก เช่น #c2185b')
    if (!Number.isInteger(day) || day < 1 || day > 28)
      return setError('วันเริ่มรอบงบต้องอยู่ระหว่าง 1-28')
    if (!Number.isInteger(goal) || goal < WATER_MIN || goal > WATER_MAX)
      return setError(
        `เป้าหมายน้ำต่อวันต้องอยู่ระหว่าง ${WATER_MIN.toLocaleString('th-TH')}-${WATER_MAX.toLocaleString('th-TH')} มล.`,
      )
    setError('')
    await onSave({
      displayName: name.trim(),
      theme,
      cycleDay: day,
      waterGoalMl: goal,
    })
  }

  return (
    <form onSubmit={submit}>
      <section className="card profile">
        <div className="avatar" aria-hidden="true">
          {(name || session.user?.name || 'C').trim().charAt(0)}
        </div>
        <div className="grow">
          <h1>ตั้งค่า</h1>
          <p className="muted small">{accountEmail || 'โหมดทดลองในเครื่อง'}</p>
        </div>
      </section>

      <section className="card">
        <h2>โปรไฟล์</h2>
        <div className="field">
          <label htmlFor="set-name">ชื่อที่แสดง</label>
          <input
            id="set-name"
            maxLength={40}
            value={name}
            placeholder="ชื่อของคุณ"
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="set-cycle">วันเริ่มรอบงบ (1-28)</label>
          <input
            id="set-cycle"
            type="number"
            min={1}
            max={28}
            value={cycleDay}
            onChange={(event) => setCycleDay(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="set-water">เป้าหมายน้ำดื่มต่อวัน</label>
          <div className="sliderhead">
            <span>เลื่อนเพื่อเลือก</span>
            <strong>{waterSlider.toLocaleString('th-TH')} มล.</strong>
          </div>
          <input
            id="set-water"
            type="range"
            min={WATER_MIN}
            max={WATER_MAX}
            step={WATER_STEP}
            value={waterSlider}
            onChange={(event) => setWaterGoal(event.target.value)}
          />
          <div className="sliderends">
            <span>{WATER_MIN.toLocaleString('th-TH')} มล.</span>
            <span>{WATER_MAX.toLocaleString('th-TH')} มล.</span>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>ธีมสี</h2>
          <button
            type="button"
            className="chip"
            onClick={() => {
              setTheme(DEFAULT_THEME)
              applyTheme(DEFAULT_THEME)
            }}
          >
            ค่าเริ่มต้น
          </button>
        </div>
        <p className="muted small">เลือกสีได้เองด้วยรหัส hex 6 หลัก</p>
        {FIELDS.map((field) => (
          <div className="colorfield" key={field.key}>
            <input
              type="color"
              aria-label={field.label}
              value={isHexColor(theme[field.key]) ? theme[field.key] : '#000000'}
              onChange={(event) => updateColor(field.key, event.target.value)}
            />
            <div className="grow">
              <label htmlFor={`theme-${field.key}`}>{field.label}</label>
              <p className="muted small">{field.hint}</p>
            </div>
            <input
              id={`theme-${field.key}`}
              className="hex"
              maxLength={7}
              spellCheck={false}
              value={theme[field.key]}
              onChange={(event) => updateColor(field.key, event.target.value)}
            />
          </div>
        ))}
        <div className="themepreview" aria-hidden="true">
          <span style={{ background: theme.background }} />
          <span style={{ background: theme.accent }} />
          <span style={{ background: theme.expense }} />
          <span style={{ background: theme.income }} />
        </div>
      </section>

      <section className="card">
        <h2>สำรองข้อมูล</h2>
        <p className="muted small">
          ข้อมูลทั้งหมดอยู่ในเบราว์เซอร์นี้เท่านั้น — แนะนำให้ดาวน์โหลดไฟล์สำรอง
          เก็บไว้ก่อนล้างข้อมูลเบราว์เซอร์ เปลี่ยนเครื่อง หรือย้ายไปเครื่องอื่น
        </p>
        <div className="backupactions">
          <button type="button" className="ghost wide" onClick={backup}>
            ดาวน์โหลดไฟล์สำรอง (.json)
          </button>
          <button
            type="button"
            className="ghost wide"
            disabled={backupBusy}
            onClick={() => fileRef.current?.click()}
          >
            {backupBusy ? 'กำลังนำเข้า…' : 'นำเข้าไฟล์สำรอง'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void restore(file)
            }}
          />
        </div>
        {backupNote && (
          <p className="muted small" role="status">
            {backupNote}
          </p>
        )}
      </section>

      {error && (
        <p role="alert" className="formerror">
          {error}
        </p>
      )}

      <button type="submit" className="primary" disabled={busy || !dirty}>
        {busy ? 'กำลังบันทึก…' : dirty ? 'บันทึกการตั้งค่า' : 'บันทึกแล้ว'}
      </button>

      <div className="signout">
        <button type="button" className="ghost wide" onClick={onSignOut}>
          ออกจากระบบ
        </button>
      </div>
    </form>
  )
}
