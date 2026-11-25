import type {
  Activity,
  ActivityCategory,
  ReminderMode,
  TimeData,
  TodayData,
} from '../shared/types'
import { fail, hasOnly, isRecord, validDay } from './dataguard'
import * as store from './localstore'

const MAX_TITLE = 60
const MAX_DAYS = 366
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

type ParsedActivity = Omit<Activity, 'id'>

function parseActivity(body: Record<string, unknown>):
  | { error: string }
  | { value: ParsedActivity } {
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!title || title.length > MAX_TITLE)
    return { error: 'ชื่อกิจกรรมต้องมี 1-60 ตัวอักษร' }
  if (
    typeof body.category !== 'string' ||
    !(CATEGORIES as readonly string[]).includes(body.category)
  )
    return { error: 'ประเภทกิจกรรมไม่ถูกต้อง' }
  if (!validDay(body.day)) return { error: 'วันที่ไม่ถูกต้อง' }

  const startMin = body.startMin
  if (
    typeof startMin !== 'number' ||
    !Number.isInteger(startMin) ||
    startMin < 0 ||
    startMin > 1439
  )
    return { error: 'เวลาเริ่มไม่ถูกต้อง' }
  const endMin = body.endMin
  if (
    typeof endMin !== 'number' ||
    !Number.isInteger(endMin) ||
    endMin > 1440 ||
    endMin < startMin + MIN_LENGTH
  )
    return { error: 'เวลาสิ้นสุดต้องหลังเวลาเริ่มอย่างน้อย 15 นาที' }

  const priority = body.priority
  if (
    typeof priority !== 'number' ||
    !Number.isInteger(priority) ||
    priority < 1 ||
    priority > 5
  )
    return { error: 'ระดับความสำคัญต้องอยู่ระหว่าง 1-5' }

  const reminder = body.reminder
  if (
    typeof reminder !== 'string' ||
    !(REMINDERS as readonly string[]).includes(reminder)
  )
    return { error: 'การแจ้งเตือนไม่ถูกต้อง' }

  const reminderMinutes = reminder === 'minutes' ? body.reminderMinutes : 0
  if (
    typeof reminderMinutes !== 'number' ||
    !Number.isInteger(reminderMinutes) ||
    reminderMinutes < 0 ||
    reminderMinutes > 1440 ||
    (reminder === 'minutes' && reminderMinutes < 1)
  )
    return { error: 'แจ้งเตือนก่อนกี่นาทีต้องอยู่ระหว่าง 1-1,440' }

  const shown = 'shown' in body ? body.shown : true
  if (typeof shown !== 'boolean')
    return { error: 'สถานะการแสดงในปฏิทินไม่ถูกต้อง' }

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
    },
  }
}

async function getActivities(from: string, to: string): Promise<Activity[]> {
  const rows = await store.getAll<store.ActivityRecord>('activities')
  return rows
    .filter((row) => row.day >= from && row.day <= to)
    .sort(
      (a, b) =>
        a.day.localeCompare(b.day) ||
        a.startMin - b.startMin ||
        a.createdAt - b.createdAt,
    )
    .map(({ createdAt: _createdAt, ...activity }) => activity)
}

function validRange(from: string | null, to: string | null) {
  if (!validDay(from) || !validDay(to)) fail('เลือกช่วงวันที่ให้ถูกต้อง')
  if (from > to) fail('วันเริ่มต้องไม่เกินวันสิ้นสุด')
  const span =
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1
  if (span > MAX_DAYS) fail('เลือกช่วงได้ไม่เกิน 366 วัน')
  return { from, to }
}

export async function timeRoute(
  method: string,
  segments: string[],
  url: URL,
  body: unknown,
): Promise<unknown | undefined> {
  const [head, second] = segments

  if (head === 'time' && second === 'today' && method === 'GET') {
    const day = url.searchParams.get('day')
    if (!validDay(day)) fail('วันที่ไม่ถูกต้อง')
    const [activities, checkin] = await Promise.all([
      getActivities(day, day),
      store.get<store.CheckinRecord>('checkins', day),
    ])
    return { day, checkedIn: Boolean(checkin), activities } satisfies TodayData
  }

  if (head === 'time' && second === 'checkin' && method === 'POST') {
    if (!isRecord(body) || !hasOnly(body, ['day'])) fail('ข้อมูลเช็คอินไม่ถูกต้อง')
    if (!validDay(body.day)) fail('วันที่ไม่ถูกต้อง')
    await store.writeAll([
      {
        type: 'put',
        store: 'checkins',
        value: { day: body.day, checkedAt: Date.now() } satisfies store.CheckinRecord,
      },
    ])
    return { day: body.day, checkedIn: true }
  }

  if (head === 'time' && !second && method === 'GET') {
    const { from, to } = validRange(
      url.searchParams.get('from'),
      url.searchParams.get('to'),
    )
    return { from, to, activities: await getActivities(from, to) } satisfies TimeData
  }

  if (head === 'activities') {
    const id = second

    if (method === 'POST' || (method === 'PATCH' && id)) {
      if (!isRecord(body)) fail('ข้อมูลกิจกรรมไม่ถูกต้อง')
      const keys = [
        'day',
        'title',
        'category',
        'startMin',
        'endMin',
        'priority',
        'reminder',
        'reminderMinutes',
        'shown',
      ]
      if (!hasOnly(body, keys)) fail('ข้อมูลกิจกรรมไม่ถูกต้อง')

      if (method === 'POST') {
        const parsed = parseActivity(body)
        if ('error' in parsed) fail(parsed.error)
        const record: store.ActivityRecord = {
          id: crypto.randomUUID(),
          ...parsed.value,
          createdAt: Date.now(),
        }
        await store.writeAll([{ type: 'put', store: 'activities', value: record }])
        return { id: record.id }
      }

      if (!Object.keys(body).length) fail('ข้อมูลกิจกรรมไม่ถูกต้อง')
      const rows = await store.getAll<store.ActivityRecord>('activities')
      const existing = rows.find((row) => row.id === id)
      if (!existing) fail('ไม่พบกิจกรรมนี้', 404)
      const merged: Record<string, unknown> = {
        day: 'day' in body ? body.day : existing.day,
        title: 'title' in body ? body.title : existing.title,
        category: 'category' in body ? body.category : existing.category,
        startMin: 'startMin' in body ? body.startMin : existing.startMin,
        endMin: 'endMin' in body ? body.endMin : existing.endMin,
        priority: 'priority' in body ? body.priority : existing.priority,
        reminder: 'reminder' in body ? body.reminder : existing.reminder,
        reminderMinutes:
          'reminderMinutes' in body ? body.reminderMinutes : existing.reminderMinutes,
        shown: 'shown' in body ? body.shown : existing.shown,
      }
      const parsed = parseActivity(merged)
      if ('error' in parsed) fail(parsed.error)
      await store.writeAll([
        { type: 'put', store: 'activities', value: { ...existing, ...parsed.value } },
      ])
      return { ok: true }
    }

    if (method === 'DELETE' && id) {
      const rows = await store.getAll<store.ActivityRecord>('activities')
      if (!rows.some((row) => row.id === id)) fail('ไม่พบกิจกรรมนี้', 404)
      await store.writeAll([{ type: 'delete', store: 'activities', key: id }])
      return { ok: true }
    }
  }

  return undefined
}
