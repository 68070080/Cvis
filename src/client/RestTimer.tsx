import { useEffect, useRef, useState } from 'react'
import { clockLabel, integerInput } from './fitness'

const PRESETS = [45, 60, 90, 120, 180]

/** Two short tones plus a vibration; audio is best-effort. */
function alertRestDone() {
  try {
    const ctx = new AudioContext()
    const gain = ctx.createGain()
    gain.gain.value = 0.12
    gain.connect(ctx.destination)
    ;[880, 1180].forEach((frequency, index) => {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = frequency
      osc.connect(gain)
      const start = ctx.currentTime + index * 0.24
      osc.start(start)
      osc.stop(start + 0.18)
    })
    window.setTimeout(() => void ctx.close(), 1400)
  } catch {
    // Browsers without audio support still get the vibration and banner.
  }
  navigator.vibrate?.([180, 90, 180])
}

export function RestTimer({
  seconds,
  onChange,
  startToken = 0,
}: {
  seconds: number
  onChange: (value: number) => void
  /** เปลี่ยนค่า = สั่งเริ่มนับถอยหลังทันที (ใช้เมื่อบันทึกเซท) */
  startToken?: number
}) {
  const [duration, setDuration] = useState(seconds)
  const [text, setText] = useState(String(seconds))
  const [endsAt, setEndsAt] = useState<number | null>(null)
  const [remaining, setRemaining] = useState(0)
  const [done, setDone] = useState(false)
  const lastToken = useRef(startToken)

  useEffect(() => {
    setDuration(seconds)
    setText(String(seconds))
  }, [seconds])

  // บันทึกเซทแล้วให้เริ่มนับเวลาพักตามที่ตั้งไว้ทันที
  useEffect(() => {
    if (startToken === lastToken.current) return
    lastToken.current = startToken
    if (startToken === 0) return
    if ('Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission()
    }
    setDone(false)
    setRemaining(duration)
    setEndsAt(Date.now() + duration * 1000)
  }, [startToken, duration])

  useEffect(() => {
    if (endsAt === null) return
    const tick = () => {
      const left = Math.ceil((endsAt - Date.now()) / 1000)
      if (left <= 0) {
        setRemaining(0)
        setEndsAt(null)
        setDone(true)
        return
      }
      setRemaining(left)
    }
    tick()
    const id = window.setInterval(tick, 250)
    return () => window.clearInterval(id)
  }, [endsAt])

  useEffect(() => {
    if (!done) return
    alertRestDone()
    if (
      typeof Notification !== 'undefined' &&
      Notification.permission === 'granted'
    ) {
      new Notification('หมดเวลาพักแล้ว', {
        body: 'เริ่มเซทต่อไปได้เลย',
        tag: 'cvis-rest',
      })
    }
  }, [done])

  const running = endsAt !== null
  const shown = running ? remaining : done ? 0 : duration
  const ratio =
    running && duration > 0
      ? Math.min(1, Math.max(0, 1 - remaining / duration))
      : done
        ? 1
        : 0

  function start() {
    if ('Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission()
    }
    setDone(false)
    setRemaining(duration)
    setEndsAt(Date.now() + duration * 1000)
  }

  function stop() {
    setEndsAt(null)
    setRemaining(0)
    setDone(false)
  }

  function apply(value: number) {
    setDuration(value)
    setText(String(value))
    onChange(value)
  }

  function commitText() {
    const value = integerInput(text)
    if (value !== null && value >= 5 && value <= 900) apply(value)
    else setText(String(duration))
  }

  return (
    <section className="resttimer">
      <div className="row-between">
        <div>
          <h3>เวลาพักระหว่างเซท</h3>
          <p className="muted small">นับถอยหลังและแจ้งเตือนเมื่อหมดเวลา</p>
        </div>
        <span className="restclock" aria-live="off">
          {clockLabel(shown)}
        </span>
      </div>

      <div
        className="waterbar restbar"
        role="progressbar"
        aria-label="เวลาพักคงเหลือ"
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={shown}
        aria-hidden="true"
      >
        <span style={{ width: `${ratio * 100}%` }} />
      </div>

      <div className="restpresets">
        {PRESETS.map((value) => (
          <button
            key={value}
            type="button"
            className={duration === value ? 'chip active' : 'chip'}
            onClick={() => apply(value)}
          >
            {value} วิ
          </button>
        ))}
        <input
          aria-label="กำหนดเวลาพักเอง (วินาที)"
          inputMode="numeric"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={commitText}
          onKeyDown={(event) => {
            // Enter here must not submit the workout form.
            if (event.key === 'Enter') {
              event.preventDefault()
              commitText()
            }
          }}
        />
      </div>

      <div className="restbtns">
        {running ? (
          <>
            <button type="button" className="ghost2" onClick={stop}>
              หยุด
            </button>
            <button
              type="button"
              onClick={() =>
                setEndsAt((current) => (current ? current + 30_000 : current))
              }
            >
              +30 วิ
            </button>
          </>
        ) : (
          <button type="button" onClick={start}>
            เริ่มพัก {clockLabel(duration)}
          </button>
        )}
      </div>

      {done && (
        <p className="restdone" role="status">
          หมดเวลาพักแล้ว — เริ่มเซทต่อไปได้เลย
        </p>
      )}
    </section>
  )
}
