import type { FreebuffUser } from '@freebuff/auth'
import { Hono } from 'hono'
import type { Activity, ActivityCategory, ReminderMode, TimeData } from '../shared/types'
import type { Env } from './auth'

export type TimeContext = {
  Bindings: Env
  Variables: { user: FreebuffUser; db: D1Database }
}

const DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/
const MAX_TITLE = 60
const MAX_DAYS = 366
/** Shortest activity we allow, in minutes. */
const MIN_LENGTH = 15

const CATEGORIES: readonly ActivityCategory[] = [
  'routine',
  'study',
  'work',
  'health',
  'rest',
  'other',
]
const REMINDERS: readonly ReminderMode[] = ['none', 'minutes', 'morning']

type ActivityRow = {
  id: string
  day: string
  title: string
  category: string
  start_min: number
  end_min: number
  priority: number
  reminder: string
  reminder_minutes: number
  shown: number
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasOnly = (body: Record<string, unknown>, keys: string[]) =>
  Object.keys(body).every((key) => keys.includes(key))

function validDay(value: unknown): value is string {
  if (typeof value !== 'string' || !DAY.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year!, month! - 1, day!))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month! - 1 &&
    date.getUTCDate() === day
  )
}

function mapActivity(row: ActivityRow): Activity {
  return {
    id: row.id,
    day: row.day,
    title: row.title,
    category: (CATEGORIES as readonly string[]).includes(row.category)
      ? (row.category as ActivityCategory)
      : 'other',
    startMin: row.start_min,
    endMin: row.end_min,
    priority: row.priority,
    reminder: (REMINDERS as readonly string[]).includes(row.reminder)
      ? (row.reminder as ReminderMode)
      : 'none',
    reminderMinutes: row.reminder_minutes,
    shown: Boolean(row.shown),
  }
}

type ParsedActivity = Omit<Activity, 'id'>

/** Validates a full activity payload, or reports the first problem. */
function parseActivity(body: Record<string, unknown>) {
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!title || title.length > MAX_TITLE)
    return { error: 'ชื่อกิจกรรมต้องมี 1-60 ตัวอักษร' } as const
  if (typeof body.category !== 'string' || !(CATEGORIES as readonly string[]).includes(body.category))
    return { error: 'ประเภทกิจกรรมไม่ถูกต้อง' } as const
  if (!validDay(body.day)) return { error: 'วันที่ไม่ถูกต้อง' } as const

  const startMin = body.startMin
  if (
    typeof startMin !== 'number' ||
    !Number.isInteger(startMin) ||
    startMin < 0 ||
    startMin > 1439
  )
    return { error: 'เวลาเริ่มไม่ถูกต้อง' } as const
  const endMin = body.endMin
  if (
    typeof endMin !== 'number' ||
    !Number.isInteger(endMin) ||
    endMin > 1440 ||
    endMin < startMin + MIN_LENGTH
  )
    return { error: 'เวลาสิ้นสุดต้องหลังเวลาเริ่มอย่างน้อย 15 นาที' } as const

  const priority = body.priority
  if (
    typeof priority !== 'number' ||
    !Number.isInteger(priority) ||
    priority < 1 ||
    priority > 5
  )
    return { error: 'ระดับความสำคัญต้องอยู่ระหว่าง 1-5' } as const

  const reminder = body.reminder
  if (
    typeof reminder !== 'string' ||
    !(REMINDERS as readonly string[]).includes(reminder)
  )
    return { error: 'การแจ้งเตือนไม่ถูกต้อง' } as const

  const reminderMinutes = reminder === 'minutes' ? body.reminderMinutes : 0
  if (
    typeof reminderMinutes !== 'number' ||
    !Number.isInteger(reminderMinutes) ||
    reminderMinutes < 0 ||
    reminderMinutes > 1440 ||
    (reminder === 'minutes' && reminderMinutes < 1)
  )
    return { error: 'แจ้งเตือนก่อนกี่นาทีต้องอยู่ระหว่าง 1-1,440' } as const

  const shown = 'shown' in body ? body.shown : true
  if (typeof shown !== 'boolean')
    return { error: 'สถานะการแสดงในปฏิทินไม่ถูกต้อง' } as const

  return {
    value: {
      day: body.day,
      title,
      category: body.category as ActivityCategory,
      startMin,
      endMin,
      priority,
      reminder: reminder as ReminderMode,
      reminderMinutes,
      shown,
    } satisfies ParsedActivity,
  } as const
}

async function getActivities(
  db: D1Database,
  owner: string,
  from: string,
  to: string,
): Promise<Activity[]> {
  const rows = await db
    .prepare(
      `SELECT id, day, title, category, start_min, end_min, priority, reminder, reminder_minutes, shown
       FROM activities WHERE owner_sub = ? AND day >= ? AND day <= ?
       ORDER BY day, start_min, created_at`,
    )
    .bind(owner, from, to)
    .all<ActivityRow>()
  return rows.results.map(mapActivity)
}

export function createTimeRoutes() {
  const app = new Hono<TimeContext>()

  app.get('/api/time', async (c) => {
    const from = c.req.query('from')
    const to = c.req.query('to')
    if (!validDay(from) || !validDay(to))
      return c.json({ error: 'เลือกช่วงวันที่ให้ถูกต้อง' }, 400)
    if (from > to) return c.json({ error: 'วันเริ่มต้องไม่เกินวันสิ้นสุด' }, 400)
    const span =
      (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
        86_400_000 +
      1
    if (span > MAX_DAYS) return c.json({ error: 'เลือกช่วงได้ไม่เกิน 366 วัน' }, 400)
    const data: TimeData = {
      from,
      to,
      activities: await getActivities(c.get('db'), c.get('user').sub, from, to),
    }
    return c.json(data)
  })

  /** Today's activities and the morning check-in state for that local day. */
  app.get('/api/time/today', async (c) => {
    const day = c.req.query('day')
    if (!validDay(day)) return c.json({ error: 'วันที่ไม่ถูกต้อง' }, 400)
    const db = c.get('db')
    const owner = c.get('user').sub
    const [activities, checkin] = await Promise.all([
      getActivities(db, owner, day, day),
      db
        .prepare('SELECT day FROM time_checkins WHERE owner_sub = ? AND day = ?')
        .bind(owner, day)
        .first<{ day: string }>(),
    ])
    return c.json({ day, checkedIn: Boolean(checkin), activities })
  })

  app.post('/api/time/checkin', async (c) => {
    const body: unknown = await c.req.json().catch(() => null)
    if (!isRecord(body) || !hasOnly(body, ['day']))
      return c.json({ error: 'ข้อมูลเช็คอินไม่ถูกต้อง' }, 400)
    if (!validDay(body.day)) return c.json({ error: 'วันที่ไม่ถูกต้อง' }, 400)
    await c
      .get('db')
      .prepare(
        `INSERT INTO time_checkins (owner_sub, day, checked_at) VALUES (?, ?, ?)
         ON CONFLICT(owner_sub, day) DO UPDATE SET checked_at = excluded.checked_at`,
      )
      .bind(c.get('user').sub, body.day, Date.now())
      .run()
    return c.json({ day: body.day, checkedIn: true })
  })

  app.post('/api/activities', async (c) => {
    const body: unknown = await c.req.json().catch(() => null)
    if (!isRecord(body)) return c.json({ error: 'ข้อมูลกิจกรรมไม่ถูกต้อง' }, 400)
    const parsed = parseActivity(body)
    if ('error' in parsed) return c.json({ error: parsed.error }, 400)
    const id = crypto.randomUUID()
    const value = parsed.value
    await c
      .get('db')
      .prepare(
        `INSERT INTO activities
           (id, owner_sub, day, title, category, start_min, end_min, priority, reminder, reminder_minutes, shown, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        c.get('user').sub,
        value.day,
        value.title,
        value.category,
        value.startMin,
        value.endMin,
        value.priority,
        value.reminder,
        value.reminderMinutes,
        value.shown ? 1 : 0,
        Date.now(),
      )
      .run()
    return c.json({ id }, 201)
  })

  app.patch('/api/activities/:id', async (c) => {
    const body: unknown = await c.req.json().catch(() => null)
    if (
      !isRecord(body) ||
      !hasOnly(body, [
        'day',
        'title',
        'category',
        'startMin',
        'endMin',
        'priority',
        'reminder',
        'reminderMinutes',
        'shown',
      ]) ||
      !Object.keys(body).length
    )
      return c.json({ error: 'ข้อมูลกิจกรรมไม่ถูกต้อง' }, 400)

    const db = c.get('db')
    const owner = c.get('user').sub
    const id = c.req.param('id')
    const existing = await db
      .prepare(
        `SELECT id, day, title, category, start_min, end_min, priority, reminder, reminder_minutes, shown
         FROM activities WHERE id = ? AND owner_sub = ?`,
      )
      .bind(id, owner)
      .first<ActivityRow>()
    if (!existing) return c.json({ error: 'ไม่พบกิจกรรมนี้' }, 404)

    const merged = {
      day: 'day' in body ? body.day : existing.day,
      title: 'title' in body ? body.title : existing.title,
      category: 'category' in body ? body.category : existing.category,
      startMin: 'startMin' in body ? body.startMin : existing.start_min,
      endMin: 'endMin' in body ? body.endMin : existing.end_min,
      priority: 'priority' in body ? body.priority : existing.priority,
      reminder: 'reminder' in body ? body.reminder : existing.reminder,
      reminderMinutes:
        'reminderMinutes' in body ? body.reminderMinutes : existing.reminder_minutes,
      shown: 'shown' in body ? body.shown : Boolean(existing.shown),
    }
    const parsed = parseActivity(merged)
    if ('error' in parsed) return c.json({ error: parsed.error }, 400)

    const value = parsed.value
    await db
      .prepare(
        `UPDATE activities SET day = ?, title = ?, category = ?, start_min = ?, end_min = ?,
           priority = ?, reminder = ?, reminder_minutes = ?, shown = ?
         WHERE id = ? AND owner_sub = ?`,
      )
      .bind(
        value.day,
        value.title,
        value.category,
        value.startMin,
        value.endMin,
        value.priority,
        value.reminder,
        value.reminderMinutes,
        value.shown ? 1 : 0,
        id,
        owner,
      )
      .run()
    return c.json({ ok: true })
  })

  app.delete('/api/activities/:id', async (c) => {
    const removed = await c
      .get('db')
      .prepare('DELETE FROM activities WHERE id = ? AND owner_sub = ? RETURNING id')
      .bind(c.req.param('id'), c.get('user').sub)
      .first()
    return removed
      ? c.json({ ok: true })
      : c.json({ error: 'ไม่พบกิจกรรมนี้' }, 404)
  })

  return app
}
