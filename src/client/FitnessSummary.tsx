import { useEffect, useMemo, useState } from 'react'
import type { BodyInput, FitnessData } from '../shared/types'
import { daysOfMonth, todayKey } from './format'
import {
  DEFAULT_BED_MIN,
  DEFAULT_WAKE_MIN,
  ENERGY_LABELS,
  HUNGER_LABELS,
  SLEEP_AXIS_STEPS,
  SLEEP_MID_STEP,
  clockFromMinutes,
  decimalInput,
  durationLabel,
  integerInput,
  sleepAxisIndex,
  minutesLabel,
  sleepIndexMinutes,
  sleepLabel,
  sleepMinutes,
  stepsLabel,
} from './fitness'
import { MiniGraph } from './Graph'
import { MonthNav } from './ui'

export function FitnessSummary({
  data,
  month,
  busy,
  onMonth,
  onSaveBody,
}: {
  data: FitnessData
  month: string
  busy: boolean
  onMonth: (value: string) => void
  onSaveBody: (input: BodyInput) => Promise<void>
}) {
  const days = useMemo(() => daysOfMonth(month), [month])
  const [day, setDay] = useState(() =>
    todayKey().startsWith(`${month}-`) ? todayKey() : `${month}-01`,
  )
  const [weight, setWeight] = useState('')
  const [steps, setSteps] = useState('')
  const [bedMin, setBedMin] = useState<number | null>(null)
  const [wakeMin, setWakeMin] = useState<number | null>(null)
  const [energy, setEnergy] = useState<number | null>(null)
  const [hunger, setHunger] = useState<number | null>(null)
  const [error, setError] = useState('')

  const byDay = useMemo(
    () => new Map(data.bodyLogs.map((log) => [log.day, log])),
    [data.bodyLogs],
  )

  useEffect(() => {
    if (todayKey().startsWith(`${month}-`)) setDay(todayKey())
    else setDay(`${month}-01`)
  }, [month])

  useEffect(() => {
    const log = byDay.get(day)
    setWeight(log?.weightKg != null ? String(log.weightKg) : '')
    setSteps(log?.steps != null ? String(log.steps) : '')
    setBedMin(log?.sleepBedMin ?? null)
    setWakeMin(log?.sleepWakeMin ?? null)
    setEnergy(log?.energy ?? null)
    setHunger(log?.hunger ?? null)
  }, [day, byDay])

  const weights = data.bodyLogs
    .filter((log) => log.weightKg !== null)
    .map((log) => ({ day: log.day, weightKg: log.weightKg as number }))
  const latestWeight = weights[weights.length - 1]
  const firstWeight = weights[0]
  const delta =
    latestWeight && firstWeight && latestWeight.day !== firstWeight.day
      ? Math.round((latestWeight.weightKg - firstWeight.weightKg) * 10) / 10
      : null

  const stepLogs = data.bodyLogs.filter((log) => log.steps !== null)
  const stepsTotal = stepLogs.reduce((sum, log) => sum + (log.steps ?? 0), 0)
  const stepsAvg = stepLogs.length ? Math.round(stepsTotal / stepLogs.length) : 0

  const recent = days.slice(-14)
  const maxSteps = Math.max(
    ...recent.map((key) => byDay.get(key)?.steps ?? 0),
    1,
  )

  /* ---------- sleep & feeling graphs ---------- */
  const sleepPoints = data.bodyLogs.flatMap((log) =>
    log.sleepBedMin !== null && log.sleepWakeMin !== null
      ? [{ day: log.day, minutes: sleepMinutes(log.sleepBedMin, log.sleepWakeMin) }]
      : [],
  )
  const energyPoints = data.bodyLogs.flatMap((log) =>
    log.energy === null ? [] : [{ day: log.day, value: log.energy }],
  )
  const hungerPoints = data.bodyLogs.flatMap((log) =>
    log.hunger === null ? [] : [{ day: log.day, value: log.hunger }],
  )

  const sleepMap = new Map(
    sleepPoints.map((point) => [point.day, point.minutes / 60]),
  )
  const energyMap = new Map(
    energyPoints.map((point) => [point.day, point.value]),
  )
  const hungerMap = new Map(
    hungerPoints.map((point) => [point.day, point.value]),
  )

  const cardioMap = new Map<string, number>()
  for (const workout of data.workouts) {
    if (workout.kind !== 'cardio' || workout.durationMin <= 0) continue
    cardioMap.set(
      workout.day,
      (cardioMap.get(workout.day) ?? 0) + workout.durationMin,
    )
  }
  const cardioDays = cardioMap.size
  const cardioTotal = [...cardioMap.values()].reduce((sum, value) => sum + value, 0)
  const cardioMax = Math.max(30, ...cardioMap.values())

  const average = (total: number, count: number) =>
    count ? Math.round((total / count) * 10) / 10 : null
  const sleepAvgMin = average(
    sleepPoints.reduce((sum, point) => sum + point.minutes, 0),
    sleepPoints.length,
  )
  const energyAvg = average(
    energyPoints.reduce((sum, point) => sum + point.value, 0),
    energyPoints.length,
  )
  const hungerAvg = average(
    hungerPoints.reduce((sum, point) => sum + point.value, 0),
    hungerPoints.length,
  )
  const rating = (value: number) =>
    `${value.toLocaleString('th-TH', { maximumFractionDigits: 1 })} / 5`

  const bed = bedMin ?? DEFAULT_BED_MIN
  const wake = wakeMin ?? DEFAULT_WAKE_MIN
  const sleepReady = bedMin !== null && wakeMin !== null
  const bedIndex = Math.min(sleepAxisIndex(bed), SLEEP_MID_STEP)
  const wakeIndex = Math.max(sleepAxisIndex(wake), SLEEP_MID_STEP)
  const axisPercent = (index: number) => (index / SLEEP_AXIS_STEPS) * 100

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const weightText = weight.trim()
    const stepsText = steps.trim()
    const nextWeight = weightText ? decimalInput(weightText) : null
    if (weightText && (nextWeight === null || nextWeight < 5 || nextWeight > 500))
      return setError('น้ำหนักต้องอยู่ระหว่าง 5-500 กก.')
    const nextSteps = stepsText ? integerInput(stepsText) : null
    if (stepsText && (nextSteps === null || nextSteps > 200000))
      return setError('ก้าวเดินต้องอยู่ระหว่าง 0-200,000')
    setError('')
    await onSaveBody({
      day,
      weightKg: nextWeight,
      steps: nextSteps,
      sleepBedMin: bedMin,
      sleepWakeMin: wakeMin,
      energy,
      hunger,
    })
  }

  return (
    <>
      <section className="card">
        <div className="card-head">
          <h2>น้ำหนักและก้าวเดิน</h2>
          <MonthNav month={month} onChange={onMonth} />
        </div>
        <div className="sumtiles">
          <div className="sumtile">
            <span>น้ำหนักล่าสุด</span>
            <strong>
              {latestWeight
                ? `${latestWeight.weightKg.toLocaleString('th-TH')} กก.`
                : '—'}
            </strong>
          </div>
          <div className="sumtile">
            <span>เปลี่ยนแปลงในเดือนนี้</span>
            <strong
              className={
                delta === null ? '' : delta > 0 ? 'expense-text' : 'income-text'
              }
            >
              {delta === null
                ? '—'
                : `${delta > 0 ? '+' : ''}${delta.toLocaleString('th-TH')} กก.`}
            </strong>
          </div>
          <div className="sumtile">
            <span>ก้าวเดินรวม</span>
            <strong>{stepsTotal ? stepsLabel(stepsTotal) : '—'}</strong>
          </div>
          <div className="sumtile">
            <span>เฉลี่ยต่อวัน</span>
            <strong>{stepsAvg ? stepsLabel(stepsAvg) : '—'}</strong>
          </div>
        </div>

        <form onSubmit={submit} className="bodyform">
          <div className="field">
            <label htmlFor="body-day">วันที่</label>
            <input
              id="body-day"
              type="date"
              value={day}
              min={`${month}-01`}
              max={`${month}-${String(days.length).padStart(2, '0')}`}
              onChange={(event) => setDay(event.target.value || day)}
            />
          </div>
          <div className="bodygrid">
            <div className="field">
              <label htmlFor="body-weight">น้ำหนัก (กก.)</label>
              <input
                id="body-weight"
                inputMode="decimal"
                placeholder="เช่น 68.5"
                value={weight}
                onChange={(event) => setWeight(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="body-steps">ก้าวเดิน (ก้าว)</label>
              <input
                id="body-steps"
                inputMode="numeric"
                placeholder="เช่น 8500"
                value={steps}
                onChange={(event) => setSteps(event.target.value)}
              />
            </div>
          </div>

          <p className="subhead">การนอน</p>
          <div className="sliderfield">
            <div className="sliderhead">
              <span>เข้านอน → ตื่น</span>
              <strong>
                {bedMin === null && wakeMin === null
                  ? 'ยังไม่ระบุ'
                  : `${clockFromMinutes(bed)} → ${clockFromMinutes(wake)}`}
              </strong>
            </div>
            <div className="dualslider">
              <div className="dualrail" aria-hidden="true">
                <span className="dualtrack" />
                <span
                  className="dualfill"
                  style={{
                    left: `${axisPercent(bedIndex)}%`,
                    width: `${axisPercent(wakeIndex - bedIndex)}%`,
                  }}
                />
              </div>
              <input
                type="range"
                min={0}
                max={SLEEP_AXIS_STEPS}
                step={1}
                value={bedIndex}
                aria-label="เวลาเข้านอน"
                onChange={(event) =>
                  setBedMin(
                    sleepIndexMinutes(
                      Math.min(
                        Math.max(Number(event.target.value), 0),
                        SLEEP_MID_STEP,
                      ),
                    ),
                  )
                }
              />
              <input
                type="range"
                min={0}
                max={SLEEP_AXIS_STEPS}
                step={1}
                value={wakeIndex}
                aria-label="เวลาตื่น"
                onChange={(event) =>
                  setWakeMin(
                    sleepIndexMinutes(
                      Math.max(
                        Math.min(Number(event.target.value), SLEEP_AXIS_STEPS),
                        SLEEP_MID_STEP,
                      ),
                    ),
                  )
                }
              />
            </div>
            <div className="sliderends three">
              <span>20:00</span>
              <span>04:00</span>
              <span>12:00</span>
            </div>
            <p className="sleepsum">
              {sleepReady
                ? `นอน ${sleepLabel(bed, wake)}`
                : 'เลื่อนหัวสไลเดอร์ทั้งสองเพื่อบันทึกชั่วโมงการนอน'}
            </p>
          </div>

          <p className="subhead">ความรู้สึกในวันนั้น</p>
          <div className="bodygrid">
            <div className="sliderfield">
              <div className="sliderhead">
                <span>พลังงาน</span>
                <strong>{energy === null ? '—' : `${energy} / 5`}</strong>
              </div>
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                value={energy ?? 3}
                aria-label="คะแนนพลังงาน 1 ถึง 5"
                onChange={(event) => setEnergy(Number(event.target.value))}
              />
              <div className="sliderends">
                <span>หมดแรง</span>
                <span>สดชื่น</span>
              </div>
              <p className="sliderword">
                {energy === null ? 'ยังไม่ให้คะแนน' : ENERGY_LABELS[energy - 1]}
              </p>
            </div>
            <div className="sliderfield">
              <div className="sliderhead">
                <span>ความหิว</span>
                <strong>{hunger === null ? '—' : `${hunger} / 5`}</strong>
              </div>
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                value={hunger ?? 3}
                aria-label="คะแนนความหิว 1 ถึง 5"
                onChange={(event) => setHunger(Number(event.target.value))}
              />
              <div className="sliderends">
                <span>อิ่ม</span>
                <span>หิว</span>
              </div>
              <p className="sliderword">
                {hunger === null ? 'ยังไม่ให้คะแนน' : HUNGER_LABELS[hunger - 1]}
              </p>
            </div>
          </div>

          {error && (
            <p role="alert" className="formerror">
              {error}
            </p>
          )}
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'กำลังบันทึก…' : 'บันทึกข้อมูลของวันนี้'}
          </button>
        </form>
      </section>

      <section className="card">
        <h2>ก้าวเดิน 14 วันล่าสุด</h2>
        <div className="stepsbars">
          {recent.map((key) => {
            const value = byDay.get(key)?.steps ?? 0
            return (
              <div
                key={key}
                className={key === todayKey() ? 'stepsbar today' : 'stepsbar'}
                title={`${key} · ${value ? stepsLabel(value) : 'ไม่มีข้อมูล'}`}
              >
                <i
                  style={{
                    height: `${value ? Math.max(4, Math.round((value / maxSteps) * 64)) : 2}px`,
                  }}
                />
                <span>{Number(key.slice(-2))}</span>
              </div>
            )
          })}
        </div>
        <p className="muted small">แท่งสูงสุด {stepsLabel(maxSteps)} ก้าว</p>
      </section>

      <section className="card">
        <h2>การนอนและความรู้สึก 14 วันล่าสุด</h2>
        <MiniGraph
          title="การนอน (ชม.)"
          average={
            sleepAvgMin === null
              ? 'ยังไม่มีข้อมูล'
              : `เฉลี่ย ${durationLabel(sleepAvgMin)}`
          }
          unit={(value) => durationLabel(Math.round(value * 60))}
          max={12}
          days={recent}
          values={sleepMap}
        />
        <MiniGraph
          title="พลังงาน"
          average={energyAvg === null ? 'ยังไม่มีข้อมูล' : `เฉลี่ย ${rating(energyAvg)}`}
          unit={(value) => `${value} / 5`}
          max={5}
          days={recent}
          values={energyMap}
        />
        <MiniGraph
          title="ความหิว"
          average={hungerAvg === null ? 'ยังไม่มีข้อมูล' : `เฉลี่ย ${rating(hungerAvg)}`}
          unit={(value) => `${value} / 5`}
          max={5}
          days={recent}
          values={hungerMap}
        />
        <MiniGraph
          title="คาร์ดิโอ (นาที)"
          average={
            cardioDays
              ? `เฉลี่ย ${minutesLabel(Math.round(cardioTotal / cardioDays))}`
              : 'ยังไม่มีข้อมูล'
          }
          unit={(value) => minutesLabel(value)}
          max={cardioMax}
          days={recent}
          values={cardioMap}
        />
        <p className="muted small">
          แท่งกราฟการนอนเต็มที่ 12 ชม. · คะแนนเต็ม 5 · คาร์ดิโอเต็มแท่ง{' '}
          {minutesLabel(cardioMax)}
        </p>
      </section>
    </>
  )
}
