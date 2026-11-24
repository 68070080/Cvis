import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  Activity,
  ActivityCategory,
  ActivityInput,
  ReminderMode,
  TimeData,
  TodayData,
} from '../shared/types'
import { api, jsonRequest } from './api'
import { dayLabel, monthLabel, todayKey } from './format'
import { MonthNav, Sheet } from './ui'
import { TimeCalendar } from './TimeCalendar'
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  PRIORITY_LABELS,
  minutesToTime,
  rangeForScale,
  reminderAt,
  reminderLabel,
  shiftAnchor,
  timeToMinutes,
  type TimeScale,
} from './timeaxis'

type Tab = 'calendar' | 'list'

const PRIORITIES = [1, 2, 3, 4, 5]
const WHEEL_ITEM = 20
const REMINDER_MINUTES = [5, 10, 15, 30, 60, 120]
const SCALES: { id: TimeScale; label: string }[] = [
  { id: 'day', label: '1 วัน' },
  { id: 'week', label: '1 สัปดาห์' },
  { id: 'month', label: '1 เดือน' },
]

const message = (error: unknown) =>
  error instanceof Error ? error.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่'

/** Vertical wheel that picks a priority from 1 to 5. */
function PriorityWheel({
  value,
  onChange,
}: {
  value: number
  onChange: (value: number) => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = ref.current
    if (element) element.scrollTop = (value - 1) * WHEEL_ITEM
  }, [])

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const target = (value - 1) * WHEEL_ITEM
    if (Math.abs(element.scrollTop - target) > 2) element.scrollTop = target
  }, [value])

  return (
    <div
      ref={ref}
      className="rirwheel"
      role="group"
      aria-label="ระดับความสำคัญ 1 ถึง 5"
      onScroll={(event) => {
        const next =
          Math.min(
            PRIORITIES.length - 1,
            Math.max(0, Math.round(event.currentTarget.scrollTop / WHEEL_ITEM)),
          ) + 1
        if (next !== value) onChange(next)
      }}
    >
      {PRIORITIES.map((option) => (
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

function ActivitySheet({
  initial,
  busy,
  onClose,
  onSave,
  onDelete,
}: {
  initial: Activity | null
  busy: boolean
  onClose: () => void
  onSave: (input: ActivityInput, id?: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [category, setCategory] = useState<ActivityCategory>(
    initial?.category ?? 'routine',
  )
  const [day, setDay] = useState(initial?.day ?? todayKey())
  const [start, setStart] = useState(
    initial ? minutesToTime(initial.startMin) : '08:00',
  )
  const [end, setEnd] = useState(
    initial ? minutesToTime(initial.endMin) : '09:00',
  )
  const [priority, setPriority] = useState(initial?.priority ?? 3)
  const [reminder, setReminder] = useState<ReminderMode>(
    initial?.reminder ?? 'none',
  )
  const [reminderMinutes, setReminderMinutes] = useState(
    initial && initial.reminderMinutes > 0 ? initial.reminderMinutes : 10,
  )
  const [error, setError] = useState('')

  function changeStart(value: string) {
    setStart(value)
    const nextStart = timeToMinutes(value)
    const nextEnd = timeToMinutes(end)
    if (nextStart !== null && (nextEnd === null || nextEnd <= nextStart)) {
      const pushed = Math.min(1440, nextStart + 60)
      setEnd(minutesToTime(pushed))
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const startMin = timeToMinutes(start)
    const endMin = timeToMinutes(end)
    if (!title.trim()) return setError('ใส่ชื่อกิจกรรมก่อนบันทึก')
    if (startMin === null || endMin === null) return setError('เวลาไม่ถูกต้อง')
    if (endMin <= startMin) return setError('เวลาสิ้นสุดต้องหลังเวลาเริ่ม')
    setError('')
    await onSave(
      {
        day,
        title: title.trim(),
        category,
        startMin,
        endMin,
        priority,
        reminder,
        reminderMinutes: reminder === 'minutes' ? reminderMinutes : 0,
        shown: initial?.shown ?? true,
      },
      initial?.id,
    )
  }

  return (
    <Sheet title={initial ? 'แก้ไขกิจกรรม' : 'เพิ่มกิจกรรม'} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="activity-title">ชื่อกิจกรรม</label>
          <input
            id="activity-title"
            autoFocus
            maxLength={60}
            value={title}
            placeholder="เช่น อ่านหนังสือสอบ"
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>

        <div className="field">
          <label>ประเภทกิจกรรม</label>
          <div className="chips">
            {CATEGORY_ORDER.map((item) => (
              <button
                key={item}
                type="button"
                className={category === item ? 'chip active' : 'chip'}
                onClick={() => setCategory(item)}
              >
                {CATEGORY_LABELS[item]}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label htmlFor="activity-day">วันที่</label>
          <input
            id="activity-day"
            type="date"
            value={day}
            onChange={(event) => setDay(event.target.value)}
          />
        </div>

        <div className="bodygrid">
          <div className="field">
            <label htmlFor="activity-start">เริ่ม</label>
            <input
              id="activity-start"
              type="time"
              step={300}
              value={start}
              onChange={(event) => changeStart(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="activity-end">สิ้นสุด</label>
            <input
              id="activity-end"
              type="time"
              step={300}
              value={end}
              onChange={(event) => setEnd(event.target.value)}
            />
          </div>
        </div>

        <div className="field">
          <label>ระดับความสำคัญ — {PRIORITY_LABELS[priority]}</label>
          <div className="prio-row">
            <PriorityWheel value={priority} onChange={setPriority} />
            <p className="muted small">1 = สำคัญน้อย · 5 = สำคัญที่สุด</p>
          </div>
        </div>

        <div className="field">
          <label>การแจ้งเตือน</label>
          <div className="chips">
            <button
              type="button"
              className={reminder === 'none' ? 'chip active' : 'chip'}
              onClick={() => setReminder('none')}
            >
              ไม่แจ้งเตือน
            </button>
            <button
              type="button"
              className={reminder === 'minutes' ? 'chip active' : 'chip'}
              onClick={() => setReminder('minutes')}
            >
              ก่อนเริ่ม
            </button>
            <button
              type="button"
              className={reminder === 'morning' ? 'chip active' : 'chip'}
              onClick={() => setReminder('morning')}
            >
              ตอนเช้าวันนั้น
            </button>
          </div>
          {reminder === 'minutes' && (
            <div className="chips">
              {REMINDER_MINUTES.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={reminderMinutes === value ? 'chip active' : 'chip'}
                  onClick={() => setReminderMinutes(value)}
                >
                  {value} นาที
                </button>
              ))}
            </div>
          )}
          {reminder === 'morning' && (
            <p className="muted small">
              จะแจ้งเตือนเมื่อเช็คอินตอนเช้า และเวลา 07:00 ของวันนั้น
            </p>
          )}
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
            ลบกิจกรรมนี้
          </button>
        )}
      </form>
    </Sheet>
  )
}

export function TimeModule() {
  const [tab, setTab] = useState<Tab>('calendar')
  const [scale, setScale] = useState<TimeScale>('week')
  const [anchor, setAnchor] = useState(todayKey())
  const [data, setData] = useState<TimeData | null>(null)
  const [today, setToday] = useState<TodayData | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [editing, setEditing] = useState<Activity | 'new' | null>(null)
  const fired = useRef(new Set<string>())

  const range = useMemo(
    () =>
      tab === 'list'
        ? rangeForScale('month', anchor)
        : rangeForScale(scale, anchor),
    [tab, scale, anchor],
  )

  const load = useCallback(
    async () =>
      setData(
        await api<TimeData>(`/api/time?from=${range.from}&to=${range.to}`),
      ),
    [range.from, range.to],
  )

  const loadToday = useCallback(async () => {
    setToday(await api<TodayData>(`/api/time/today?day=${todayKey()}`))
  }, [])

  useEffect(() => {
    let live = true
    setData(null)
    api<TimeData>(`/api/time?from=${range.from}&to=${range.to}`)
      .then((next) => {
        if (live) setData(next)
      })
      .catch((problem) => {
        if (live) setError(message(problem))
      })
    return () => {
      live = false
    }
  }, [range.from, range.to])

  useEffect(() => {
    void loadToday().catch((problem) => setError(message(problem)))
  }, [loadToday])

  // Morning check-in gates the reminders, so only schedule after it is done.
  useEffect(() => {
    if (!today?.checkedIn) return
    const tick = () => {
      const now = Date.now()
      for (const activity of today.activities) {
        const at = reminderAt(activity)
        if (at === null) continue
        const key = `${activity.id}:${at}`
        if (fired.current.has(key)) continue
        if (now >= at && now < at + 5 * 60_000) {
          fired.current.add(key)
          if (
            typeof Notification !== 'undefined' &&
            Notification.permission === 'granted'
          ) {
            new Notification(`กิจกรรม: ${activity.title}`, {
              body: `${minutesToTime(activity.startMin)}–${minutesToTime(activity.endMin)} · ${CATEGORY_LABELS[activity.category]}`,
              tag: `cvis-activity-${activity.id}`,
            })
          }
        }
      }
    }
    tick()
    const id = window.setInterval(tick, 20_000)
    return () => window.clearInterval(id)
  }, [today])

  const mutate = async (action: () => Promise<unknown>) => {
    setBusy(true)
    setError('')
    try {
      await action()
      await Promise.all([load(), loadToday()])
    } catch (problem) {
      setError(message(problem))
    } finally {
      setBusy(false)
    }
  }

  const saveActivity = (input: ActivityInput, id?: string) =>
    mutate(() =>
      api(
        id ? `/api/activities/${id}` : '/api/activities',
        jsonRequest(id ? 'PATCH' : 'POST', input),
      ),
    )
  const deleteActivity = (id: string) =>
    mutate(() => api(`/api/activities/${id}`, { method: 'DELETE' }))
  const toggleShown = (activity: Activity) =>
    mutate(() =>
      api(
        `/api/activities/${activity.id}`,
        jsonRequest('PATCH', { shown: !activity.shown }),
      ),
    )
  const resizeActivity = (id: string, endMin: number) =>
    mutate(() =>
      api(`/api/activities/${id}`, jsonRequest('PATCH', { endMin })),
    )

  const checkIn = () => {
    if (
      typeof Notification !== 'undefined' &&
      Notification.permission === 'default'
    ) {
      void Notification.requestPermission()
    }
    void mutate(async () => {
      await api('/api/time/checkin', jsonRequest('POST', { day: todayKey() }))
      setNote(
        'เช็คอินแล้ววันนี้ — ระบบจะแจ้งเตือนกิจกรรมตามเวลาที่ตั้งไว้ (ต้องอนุญาตการแจ้งเตือนของเบราว์เซอร์)',
      )
    })
  }

  const groups = useMemo(() => {
    const map = new Map<string, Activity[]>()
    for (const activity of data?.activities ?? []) {
      const list = map.get(activity.day) ?? []
      list.push(activity)
      map.set(activity.day, list)
    }
    return [...map.entries()]
  }, [data])

  const permission =
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
  const heading =
    scale === 'day'
      ? dayLabel(anchor)
      : scale === 'week'
        ? `${dayLabel(range.from)} – ${dayLabel(range.to)}`
        : monthLabel(anchor.slice(0, 7))

  const todayCount = today?.activities.length ?? 0

  return (
    <>
      {error && (
        <p role="alert" className="error">
          <span>{error}</span>
          <button
            type="button"
            className="iconbtn"
            aria-label="ปิดข้อความ"
            onClick={() => setError('')}
          >
            ✕
          </button>
        </p>
      )}

      <section className="card checkin">
        <div className="row-between">
          <div>
            <h3>เช็คอินเช้า</h3>
            <p className="muted small">
              {today?.checkedIn
                ? `เช็คอินแล้ววันนี้ · กิจกรรมวันนี้ ${todayCount} รายการ`
                : 'กดเช็คอินตอนเช้าเพื่อรับแจ้งเตือนกิจกรรมของวันนี้'}
            </p>
            <p className="muted small">
              {permission === 'granted'
                ? 'อนุญาตการแจ้งเตือนแล้ว'
                : permission === 'denied'
                  ? 'เบราว์เซอร์ปิดการแจ้งเตือนอยู่ — เปิดในการตั้งค่าเบราว์เซอร์'
                  : permission === 'unsupported'
                    ? 'เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน'
                    : 'ยังไม่ได้อนุญาตการแจ้งเตือน'}
            </p>
          </div>
          {today && !today.checkedIn ? (
            <button type="button" className="chip" onClick={checkIn}>
              เช็คอินวันนี้
            </button>
          ) : (
            <span className="chip active">เช็คอินแล้ว</span>
          )}
        </div>
        {note && (
          <p className="muted small" role="status">
            {note}
          </p>
        )}
      </section>

      {tab === 'calendar' && (
        <section className="card">
          <div className="card-head">
            <div>
              <h2>ปฏิทินเวลา</h2>
              <p className="muted small">
                แกนตั้งคือวัน แกนนอนคือเวลา 00:00–24:00
              </p>
            </div>
            <button
              type="button"
              className="chip"
              onClick={() => setEditing('new')}
            >
              + กิจกรรม
            </button>
          </div>

          <div className="chips">
            {SCALES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={scale === item.id ? 'chip active' : 'chip'}
                onClick={() => setScale(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="row-between timenav">
            <button
              type="button"
              className="iconbtn"
              aria-label="ช่วงก่อนหน้า"
              onClick={() => setAnchor(shiftAnchor(scale, anchor, -1))}
            >
              ‹
            </button>
            <strong className="timenav-label">{heading}</strong>
            <button
              type="button"
              className="iconbtn"
              aria-label="ช่วงถัดไป"
              onClick={() => setAnchor(shiftAnchor(scale, anchor, 1))}
            >
              ›
            </button>
          </div>

          <input
            aria-label="เลือกวันที่ของปฏิทิน"
            type="date"
            value={anchor}
            onChange={(event) => {
              if (event.target.value) setAnchor(event.target.value)
            }}
          />

          {!data ? (
            <p className="empty">กำลังโหลดตารางเวลา…</p>
          ) : data.activities.filter((activity) => activity.shown).length === 0 ? (
            <p className="empty">
              ยังไม่มีกิจกรรมที่แสดงในช่วงนี้ — กด “+ กิจกรรม” หรือเปิดการแสดง
              ในหน้า “กิจกรรม”
            </p>
          ) : null}

          {data && (
            <TimeCalendar
              scale={scale}
              from={range.from}
              to={range.to}
              activities={data.activities}
              onOpen={setEditing}
              onResize={(id, endMin) => void resizeActivity(id, endMin)}
            />
          )}
        </section>
      )}

      {tab === 'list' && (
        <section className="card">
          <div className="card-head">
            <div>
              <h2>กิจกรรม</h2>
              <p className="muted small">
                เลือกได้ว่าจะให้กิจกรรมไหนขึ้นบนปฏิทิน
              </p>
            </div>
            <button
              type="button"
              className="chip"
              onClick={() => setEditing('new')}
            >
              + เพิ่มกิจกรรม
            </button>
          </div>

          <MonthNav
            month={anchor.slice(0, 7)}
            onChange={(month) => setAnchor(`${month}-01`)}
          />

          {!data ? (
            <p className="empty">กำลังโหลดกิจกรรม…</p>
          ) : groups.length === 0 ? (
            <p className="empty">ยังไม่มีกิจกรรมในเดือนนี้</p>
          ) : (
            groups.map(([day, list]) => (
              <div key={day} className="activitygroup">
                <h3 className="workoutday">{dayLabel(day)}</h3>
                {list.map((activity) => (
                  <div className="activityrow" key={activity.id}>
                    <button
                      type="button"
                      className="activitymain"
                      onClick={() => setEditing(activity)}
                    >
                      <span className={`activitytitle cat-${activity.category}`}>
                        {activity.title}
                      </span>
                      <span className="muted small">
                        {minutesToTime(activity.startMin)}–
                        {minutesToTime(activity.endMin)} ·{' '}
                        {CATEGORY_LABELS[activity.category]} · สำคัญ{' '}
                        {activity.priority}/5
                      </span>
                      <span className="muted small">
                        {reminderLabel(activity)}
                      </span>
                    </button>
                    <button
                      type="button"
                      className={activity.shown ? 'chip active' : 'chip'}
                      aria-pressed={activity.shown}
                      aria-label={`${activity.shown ? 'ซ่อน' : 'แสดง'} ${activity.title} บนปฏิทิน`}
                      onClick={() => void toggleShown(activity)}
                    >
                      {activity.shown ? 'แสดง' : 'ซ่อน'}
                    </button>
                  </div>
                ))}
              </div>
            ))
          )}
        </section>
      )}

      <nav className="tabbar two" aria-label="เมนูจัดการเวลา">
        <button
          type="button"
          className={tab === 'calendar' ? 'tab active' : 'tab'}
          aria-current={tab === 'calendar' ? 'page' : undefined}
          onClick={() => setTab('calendar')}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M3 10h18M8 3v4M16 3v4" />
          </svg>
          <span>ปฏิทิน</span>
        </button>
        <button
          type="button"
          className={tab === 'list' ? 'tab active' : 'tab'}
          aria-current={tab === 'list' ? 'page' : undefined}
          onClick={() => setTab('list')}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
          </svg>
          <span>กิจกรรม</span>
        </button>
      </nav>

      {editing && (
        <ActivitySheet
          key={editing === 'new' ? 'new' : editing.id}
          initial={editing === 'new' ? null : editing}
          busy={busy}
          onClose={() => setEditing(null)}
          onSave={async (input, id) => {
            await saveActivity(input, id)
            setEditing(null)
          }}
          onDelete={async (id) => {
            await deleteActivity(id)
            setEditing(null)
          }}
        />
      )}
    </>
  )
}
