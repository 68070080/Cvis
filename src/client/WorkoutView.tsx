import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  CardioType,
  FitnessData,
  Workout,
  WorkoutInput,
  WorkoutSetInput,
} from '../shared/types'
import { cardioLabel, distanceLabel, decimalInput, integerInput, minutesLabel, volumeLabel } from './fitness'
import { currentMonth, dayLabel, daysOfMonth, todayKey } from './format'
import { MiniGraph } from './Graph'
import { RestTimer } from './RestTimer'
import { Sheet } from './ui'

type Handlers = {
  data: FitnessData
  busy: boolean
  restTimerSec: number
  onRestTimer: (seconds: number) => void
  onSave: (input: WorkoutInput, id?: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

type SetRow = {
  key: string
  weight: string
  reps: string
  rir: number
  done: boolean
}

type ExerciseGroup = {
  key: string
  name: string
  sets: SetRow[]
}

const emptySet = (source?: SetRow): SetRow => ({
  key: crypto.randomUUID(),
  weight: source?.weight ?? '',
  reps: source?.reps ?? '',
  rir: source?.rir ?? 0,
  done: false,
})

const emptyExercise = (): ExerciseGroup => ({
  key: crypto.randomUUID(),
  name: '',
  sets: [emptySet()],
})

const RIR_OPTIONS = [0, 1, 2, 3, 4]
const RIR_ITEM = 20

/** Vertical scroll wheel that picks an RIR from 0 to 4. */
function RirPicker({
  value,
  onChange,
  label,
}: {
  value: number
  onChange: (value: number) => void
  label: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const initial = useRef(value)

  useEffect(() => {
    const element = ref.current
    if (element) element.scrollTop = initial.current * RIR_ITEM
  }, [])

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const target = value * RIR_ITEM
    if (Math.abs(element.scrollTop - target) > 2) element.scrollTop = target
  }, [value])

  return (
    <div
      ref={ref}
      className="rirwheel"
      role="group"
      aria-label={label}
      onScroll={(event) => {
        const next = Math.min(
          RIR_OPTIONS.length - 1,
          Math.max(0, Math.round(event.currentTarget.scrollTop / RIR_ITEM)),
        )
        if (next !== value) onChange(next)
      }}
    >
      {RIR_OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          className={option === value ? 'rirnum active' : 'rirnum'}
          aria-pressed={option === value}
          onClick={() => onChange(option)}
        >
          {option}
        </button>
      ))}
    </div>
  )
}

function groupByDay(workouts: Workout[]) {
  const map = new Map<string, Workout[]>()
  for (const workout of workouts) {
    const list = map.get(workout.day) ?? []
    list.push(workout)
    map.set(workout.day, list)
  }
  return [...map.entries()]
}

function defaultDay(month: string): string {
  return month === currentMonth() ? todayKey() : `${month}-01`
}

function setPreview(workout: Workout): string {
  return workout.sets
    .slice(0, 3)
    .map(
      (set) =>
        `${set.exercise} ${set.weightKg > 0 ? `${set.weightKg} กก. × ` : ''}${set.reps}`,
    )
    .join(' · ')
}

export function StrengthView(props: Handlers) {
  const [editing, setEditing] = useState<Workout | 'new' | null>(null)
  const workouts = props.data.workouts.filter(
    (workout) => workout.kind === 'strength',
  )
  const groups = useMemo(() => groupByDay(workouts), [workouts])

  return (
    <>
      <section className="card">
        <div className="card-head">
          <div>
            <h2>ตารางออกกำลังกาย</h2>
            <p className="muted small">
              จดชื่อท่า น้ำหนัก เรพ และ RIR ทุกเซท พร้อมจับเวลาพัก
            </p>
          </div>
          <button
            type="button"
            className="chip"
            onClick={() => setEditing('new')}
          >
            + สร้าง
          </button>
        </div>
        {workouts.length === 0 && (
          <p className="empty">
            ยังไม่มีตารางเวท — กด “+ สร้าง” เพื่อเริ่มจดเซทแรก
          </p>
        )}
      </section>

      {groups.map(([day, list]) => (
        <section className="card" key={day}>
          <h3 className="workoutday">{dayLabel(day)}</h3>
          {list.map((workout) => (
            <button
              key={workout.id}
              type="button"
              className="catrow"
              onClick={() => setEditing(workout)}
            >
              <span className="catmain">
                <span>{workout.title}</span>
                <span className="muted small">
                  {workout.sets.length} เซท · ปริมาณรวม{' '}
                  {volumeLabel(workout.volume)}
                </span>
                {workout.sets.length > 0 && (
                  <span className="muted small">{setPreview(workout)}</span>
                )}
                {workout.note && (
                  <span className="muted small">{workout.note}</span>
                )}
              </span>
              <span aria-hidden="true" className="muted">
                ›
              </span>
            </button>
          ))}
        </section>
      ))}

      {editing && (
        <WorkoutSheet
          key={editing === 'new' ? 'new' : editing.id}
          initial={editing === 'new' ? null : editing}
          kind="strength"
          data={props.data}
          busy={props.busy}
          restTimerSec={props.restTimerSec}
          onRestTimer={props.onRestTimer}
          onClose={() => setEditing(null)}
          onSave={async (input, id) => {
            await props.onSave(input, id)
            setEditing(null)
          }}
          onDelete={async (id) => {
            await props.onDelete(id)
            setEditing(null)
          }}
        />
      )}
    </>
  )
}

export function CardioView(props: Handlers) {
  const [editing, setEditing] = useState<Workout | 'new' | null>(null)
  const workouts = props.data.workouts.filter(
    (workout) => workout.kind === 'cardio',
  )
  const groups = useMemo(() => groupByDay(workouts), [workouts])

  const recent = daysOfMonth(props.data.month).slice(-14)
  const minutesByDay = new Map<string, number>()
  for (const workout of workouts) {
    if (workout.durationMin <= 0) continue
    minutesByDay.set(
      workout.day,
      (minutesByDay.get(workout.day) ?? 0) + workout.durationMin,
    )
  }
  const cardioTotal = [...minutesByDay.values()].reduce(
    (sum, value) => sum + value,
    0,
  )
  const cardioMax = Math.max(30, ...minutesByDay.values())

  return (
    <>
      <section className="card">
        <div className="card-head">
          <div>
            <h2>คาร์ดิโอ</h2>
            <p className="muted small">
              แยกประเภท ระยะเวลา และระยะทางของแต่ละครั้ง
            </p>
          </div>
          <button
            type="button"
            className="chip"
            onClick={() => setEditing('new')}
          >
            + บันทึก
          </button>
        </div>
        {workouts.length === 0 && (
          <p className="empty">ยังไม่มีบันทึกคาร์ดิโอ — เริ่มจากการเดินเร็วก็ได้</p>
        )}
        <MiniGraph
          title="เวลาคาร์ดิโอ (นาที)"
          average={
            minutesByDay.size
              ? `เฉลี่ย ${minutesLabel(Math.round(cardioTotal / minutesByDay.size))}`
              : 'ยังไม่มีข้อมูล'
          }
          unit={(value) => minutesLabel(value)}
          max={cardioMax}
          days={recent}
          values={minutesByDay}
        />
        <p className="muted small">14 วันล่าสุด · แท่งเต็ม {minutesLabel(cardioMax)}</p>
      </section>

      {groups.map(([day, list]) => (
        <section className="card" key={day}>
          <h3 className="workoutday">{dayLabel(day)}</h3>
          {list.map((workout) => (
            <button
              key={workout.id}
              type="button"
              className="catrow"
              onClick={() => setEditing(workout)}
            >
              <span className="catmain">
                <span>{workout.title}</span>
                <span className="muted small">
                  {cardioLabel(workout.cardioType)} ·{' '}
                  {minutesLabel(workout.durationMin)}
                  {workout.distanceM > 0
                    ? ` · ${distanceLabel(workout.distanceM)}`
                    : ''}
                </span>
                {workout.note && (
                  <span className="muted small">{workout.note}</span>
                )}
              </span>
              <span aria-hidden="true" className="muted">
                ›
              </span>
            </button>
          ))}
        </section>
      ))}

      {editing && (
        <WorkoutSheet
          key={editing === 'new' ? 'new' : editing.id}
          initial={editing === 'new' ? null : editing}
          kind="cardio"
          data={props.data}
          busy={props.busy}
          restTimerSec={props.restTimerSec}
          onRestTimer={props.onRestTimer}
          onClose={() => setEditing(null)}
          onSave={async (input, id) => {
            await props.onSave(input, id)
            setEditing(null)
          }}
          onDelete={async (id) => {
            await props.onDelete(id)
            setEditing(null)
          }}
        />
      )}
    </>
  )
}

function WorkoutSheet({
  initial,
  kind,
  data,
  busy,
  restTimerSec,
  onRestTimer,
  onClose,
  onSave,
  onDelete,
}: {
  initial: Workout | null
  kind: 'strength' | 'cardio'
  data: FitnessData
  busy: boolean
  restTimerSec: number
  onRestTimer: (seconds: number) => void
  onClose: () => void
  onSave: (input: WorkoutInput, id?: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [day, setDay] = useState(initial?.day ?? defaultDay(data.month))
  const [title, setTitle] = useState(initial?.title ?? '')
  const [note, setNote] = useState(initial?.note ?? '')
  const [cardioType, setCardioType] = useState<CardioType>(
    initial?.cardioType ?? 'running',
  )
  const [duration, setDuration] = useState(
    initial && initial.durationMin > 0 ? String(initial.durationMin) : '',
  )
  const [distance, setDistance] = useState(
    initial && initial.distanceM > 0
      ? String(Math.round((initial.distanceM / 1000) * 100) / 100)
      : '',
  )
  const [exercises, setExercises] = useState<ExerciseGroup[]>(() => {
    if (!initial || initial.sets.length === 0) return [emptyExercise()]
    const groups: ExerciseGroup[] = []
    for (const set of initial.sets) {
      const row: SetRow = {
        key: crypto.randomUUID(),
        weight: set.weightKg > 0 ? String(set.weightKg) : '',
        reps: String(set.reps),
        rir: Math.min(4, Math.max(0, set.rir)),
        done: false,
      }
      const last = groups[groups.length - 1]
      if (last && last.name === set.exercise) last.sets.push(row)
      else
        groups.push({ key: crypto.randomUUID(), name: set.exercise, sets: [row] })
    }
    return groups
  })
  const [error, setError] = useState('')
  // เพิ่มค่าเมื่อบันทึกเซท → RestTimer เริ่มนับถอยหลังทันที
  const [restStart, setRestStart] = useState(0)

  useEffect(() => {
    setError('')
  }, [kind])

  const allSets = exercises.flatMap((group) => group.sets)
  const volume = allSets.reduce((sum, row) => {
    const weight = row.weight.trim() ? (decimalInput(row.weight) ?? 0) : 0
    const reps = integerInput(row.reps) ?? 0
    return sum + weight * reps
  }, 0)

  function updateSet(
    groupKey: string,
    setKey: string,
    patch: Partial<SetRow>,
  ) {
    setExercises((current) =>
      current.map((group) =>
        group.key === groupKey
          ? {
              ...group,
              sets: group.sets.map((row) =>
                row.key === setKey ? { ...row, ...patch } : row,
              ),
            }
          : group,
      ),
    )
  }

  function renameExercise(groupKey: string, name: string) {
    setExercises((current) =>
      current.map((group) =>
        group.key === groupKey ? { ...group, name } : group,
      ),
    )
  }

  /** ตรวจเซทนี้แล้วบันทึก → เริ่มนับเวลาพักตามที่ตั้งไว้ */
  function logSet(groupKey: string, row: SetRow) {
    const weight = row.weight.trim() ? decimalInput(row.weight) : 0
    if (weight === null || weight > 1000)
      return setError('น้ำหนักต้องอยู่ระหว่าง 0-1,000 กก.')
    const reps = integerInput(row.reps)
    if (reps === null || reps < 1 || reps > 1000)
      return setError('ใส่เรพของเซทนี้ก่อนบันทึก (1-1,000)')
    setError('')
    updateSet(groupKey, row.key, { done: true })
    setRestStart((current) => current + 1)
  }

  /** Adds a set to one exercise, pre-filled from its previous set. */
  function addSet(groupKey: string) {
    setExercises((current) =>
      current.map((group) =>
        group.key === groupKey
          ? { ...group, sets: [...group.sets, emptySet(group.sets[group.sets.length - 1])] }
          : group,
      ),
    )
  }

  function addExercise() {
    setExercises((current) => [...current, emptyExercise()])
  }

  function removeSet(groupKey: string, setKey: string) {
    setExercises((current) => {
      const group = current.find((item) => item.key === groupKey)
      if (!group) return current
      if (group.sets.length === 1) {
        // ลบเซทสุดท้ายของท่า = ลบท่านี้ทั้งท่า (เว้นไว้อย่างน้อยหนึ่งท่า)
        if (current.length === 1) return [emptyExercise()]
        return current.filter((item) => item.key !== groupKey)
      }
      return current.map((item) =>
        item.key === groupKey
          ? { ...item, sets: item.sets.filter((row) => row.key !== setKey) }
          : item,
      )
    })
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return setError('เลือกวันที่ให้ถูกต้อง')

    const sets: WorkoutSetInput[] = []
    if (kind === 'strength') {
      for (const group of exercises) {
        const exercise = group.name.trim()
        const filled = group.sets.filter(
          (row) => row.weight.trim() || row.reps.trim(),
        )
        if (!exercise) {
          if (filled.length) return setError('ใส่ชื่อท่าให้ครบทุกท่า')
          continue
        }
        if (filled.length === 0)
          return setError(`ใส่เรพของท่า “${exercise}” อย่างน้อย 1 เซท`)
        for (const row of filled) {
          const weight = row.weight.trim() ? decimalInput(row.weight) : 0
          if (weight === null || weight > 1000)
            return setError('น้ำหนักต้องอยู่ระหว่าง 0-1,000 กก.')
          const reps = integerInput(row.reps)
          if (reps === null || reps < 1 || reps > 1000)
            return setError('เรพต้องอยู่ระหว่าง 1-1,000')
          sets.push({ exercise, weightKg: weight, reps, rir: row.rir })
        }
      }
      if (sets.length === 0) return setError('เพิ่มอย่างน้อย 1 เซทก่อนบันทึก')
    }

    let durationMin = 0
    let distanceM = 0
    if (kind === 'cardio') {
      const minutes = duration.trim() ? decimalInput(duration) : null
      if (minutes === null || minutes <= 0 || minutes > 1440)
        return setError('ระยะเวลาต้องอยู่ระหว่าง 1-1,440 นาที')
      durationMin = minutes
      const km = distance.trim() ? decimalInput(distance) : 0
      if (km === null) return setError('ระยะทางไม่ถูกต้อง')
      distanceM = Math.round(km * 1000)
    }

    const finalTitle =
      title.trim() ||
      (kind === 'cardio' ? cardioLabel(cardioType) : 'เวทเทรนนิ่ง')
    setError('')
    await onSave(
      {
        day,
        kind,
        title: finalTitle,
        note: note.trim(),
        cardioType: kind === 'cardio' ? cardioType : null,
        durationMin,
        distanceM,
        sets,
      },
      initial?.id,
    )
  }

  return (
    <Sheet
      title={
        initial
          ? kind === 'strength'
            ? 'แก้ไขตารางเวท'
            : 'แก้ไขคาร์ดิโอ'
          : kind === 'strength'
            ? 'สร้างตารางเวท'
            : 'บันทึกคาร์ดิโอ'
      }
      onClose={onClose}
    >
      <form onSubmit={submit}>
        {kind === 'cardio' && (
          <div className="field">
            <label>ประเภทคาร์ดิโอ</label>
            <div className="chips">
              {(
                [
                  'running',
                  'cycling',
                  'swimming',
                  'walking',
                  'rowing',
                  'hiit',
                  'other',
                ] as CardioType[]
              ).map((type) => (
                <button
                  key={type}
                  type="button"
                  className={cardioType === type ? 'chip active' : 'chip'}
                  onClick={() => setCardioType(type)}
                >
                  {cardioLabel(type)}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="field">
          <label htmlFor="workout-title">
            {kind === 'strength' ? 'ชื่อตาราง / วันซ้อม' : 'ชื่อกิจกรรม'}
          </label>
          <input
            id="workout-title"
            autoFocus
            maxLength={60}
            value={title}
            placeholder={
              kind === 'strength' ? 'เช่น Push day' : 'เช่น วิ่งเช้า'
            }
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="workout-day">วันที่</label>
          <input
            id="workout-day"
            type="date"
            value={day}
            onChange={(event) => setDay(event.target.value)}
          />
        </div>

        {kind === 'strength' && (
          <>
            <div className="field">
              <label>ท่าและเซท — แต่ละท่าเก็บหลายเซทได้</label>
              <div className="setgroups">
                {exercises.map((group, index) => (
                  <div className="setgroup" key={group.key}>
                    <div className="setgroup-head">
                      <input
                        aria-label="ชื่อท่า"
                        maxLength={60}
                        placeholder="ชื่อท่า เช่น Bench press"
                        value={group.name}
                        autoFocus={index > 0}
                        onChange={(event) =>
                          renameExercise(group.key, event.target.value)
                        }
                      />
                      {exercises.length > 1 && (
                        <button
                          type="button"
                          className="iconbtn"
                          aria-label="ลบท่านี้"
                          onClick={() =>
                            setExercises((current) =>
                              current.filter((item) => item.key !== group.key),
                            )
                          }
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    <div className="setcolhead">
                      <span>น้ำหนัก (กก.)</span>
                      <span>เรพ</span>
                      <span>RIR</span>
                      <span aria-hidden="true" />
                    </div>
                    {group.sets.map((row, setIndex) => (
                      <div
                        className={row.done ? 'setline done' : 'setline'}
                        key={row.key}
                      >
                        <input
                          aria-label={`น้ำหนักของท่า ${group.name || index + 1}`}
                          inputMode="decimal"
                          placeholder="—"
                          value={row.weight}
                          onChange={(event) =>
                            updateSet(group.key, row.key, {
                              weight: event.target.value,
                            })
                          }
                        />
                        <input
                          aria-label={`จำนวนเรพของท่า ${group.name || index + 1}`}
                          inputMode="numeric"
                          placeholder="—"
                          value={row.reps}
                          onChange={(event) =>
                            updateSet(group.key, row.key, {
                              reps: event.target.value,
                            })
                          }
                        />
                        <RirPicker
                          value={row.rir}
                          label={`RIR ของท่า ${group.name || index + 1}`}
                          onChange={(rir) =>
                            updateSet(group.key, row.key, { rir })
                          }
                        />
                        <button
                          type="button"
                          className={row.done ? 'setdone active' : 'setdone'}
                          aria-pressed={row.done}
                          aria-label={`บันทึกเซทที่ ${setIndex + 1} ของท่า ${group.name || index + 1} แล้วเริ่มเวลาพัก`}
                          onClick={() => logSet(group.key, row)}
                        >
                          ✓
                        </button>
                        <button
                          type="button"
                          className="iconbtn"
                          aria-label="ลบเซทนี้"
                          onClick={() => removeSet(group.key, row.key)}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="ghost smallbtn"
                      onClick={() => addSet(group.key)}
                    >
                      + เพิ่มเซท
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="ghost wide"
                onClick={addExercise}
              >
                + เพิ่มท่า
              </button>
            </div>

            <div className="costsummary">
              <div>
                <span className="muted small">จำนวนเซท</span>
                <strong>{allSets.length} เซท</strong>
              </div>
              <div className="right">
                <span className="muted small">ปริมาณรวม</span>
                <strong>{volumeLabel(volume)}</strong>
              </div>
            </div>

            <RestTimer
              seconds={restTimerSec}
              startToken={restStart}
              onChange={onRestTimer}
            />
          </>
        )}

        {kind === 'cardio' && (
          <div className="bodygrid">
            <div className="field">
              <label htmlFor="cardio-duration">ระยะเวลา (นาที)</label>
              <input
                id="cardio-duration"
                inputMode="decimal"
                placeholder="เช่น 30"
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="cardio-distance">ระยะทาง (กม. — ไม่บังคับ)</label>
              <input
                id="cardio-distance"
                inputMode="decimal"
                placeholder="เช่น 5.2"
                value={distance}
                onChange={(event) => setDistance(event.target.value)}
              />
            </div>
          </div>
        )}

        <div className="field">
          <label htmlFor="workout-note">บันทึก (ไม่บังคับ)</label>
          <input
            id="workout-note"
            maxLength={200}
            value={note}
            placeholder={
              kind === 'strength'
                ? 'เช่น รู้สึกหนักช่วงไหล่ขวา'
                : 'เช่น  tempo ช้า 6:00/กม.'
            }
            onChange={(event) => setNote(event.target.value)}
          />
        </div>

        {error && (
          <p role="alert" className="formerror">
            {error}
          </p>
        )}
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'กำลังบันทึก…' : 'บันทึก'}
        </button>
        {initial && (
          <button
            type="button"
            className="danger wide"
            disabled={busy}
            onClick={() => void onDelete(initial.id)}
          >
            ลบรายการนี้
          </button>
        )}
      </form>
    </Sheet>
  )
}
