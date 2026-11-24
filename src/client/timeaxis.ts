import type { Activity, ActivityCategory } from '../shared/types'

export type TimeScale = 'day' | 'week' | 'month'

export const CATEGORY_ORDER: ActivityCategory[] = [
  'routine',
  'study',
  'work',
  'health',
  'rest',
  'other',
]

export const CATEGORY_LABELS: Record<ActivityCategory, string> = {
  routine: 'กิจวัตร',
  study: 'งานนักศึกษา',
  work: 'งาน/ธุระ',
  health: 'สุขภาพ',
  rest: 'พักผ่อน',
  other: 'อื่น ๆ',
}

export const PRIORITY_LABELS = ['', 'น้อยมาก', 'น้อย', 'ปานกลาง', 'มาก', 'มากที่สุด']

export const pad = (value: number) => String(value).padStart(2, '0')

/** Minutes after midnight to `HH:MM`. */
export function minutesToTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(1440, minutes))
  return `${pad(Math.floor(clamped / 60) % 24)}:${pad(clamped % 60)}`
}

/** `HH:MM` to minutes after midnight, or null when malformed. */
export function timeToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 24 || minutes > 59) return null
  const total = hours * 60 + minutes
  return total <= 1440 ? total : null
}

export function reminderLabel(activity: Activity): string {
  if (activity.reminder === 'morning') return 'แจ้งเตือนตอนเช้า 07:00'
  if (activity.reminder === 'minutes')
    return `แจ้งเตือนก่อน ${activity.reminderMinutes} นาที`
  return 'ไม่แจ้งเตือน'
}

/** Local midnight of a day key, in epoch milliseconds. */
export function localMidnight(day: string): number {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year!, month! - 1, date!).getTime()
}

/** When the reminder for an activity should fire, in epoch milliseconds. */
export function reminderAt(activity: Activity): number | null {
  if (activity.reminder === 'none') return null
  const midnight = localMidnight(activity.day)
  if (activity.reminder === 'morning') return midnight + 7 * 60 * 60 * 1000
  return midnight + (activity.startMin - activity.reminderMinutes) * 60_000
}

const shiftDayKey = (day: string, delta: number): string => {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(Date.UTC(year!, month! - 1, date! + delta))
    .toISOString()
    .slice(0, 10)
}

/** First and last day shown for a scale, anchored on one day. */
export function rangeForScale(
  scale: TimeScale,
  anchor: string,
): { from: string; to: string } {
  if (scale === 'day') return { from: anchor, to: anchor }
  if (scale === 'week') {
    const [year, month, date] = anchor.split('-').map(Number)
    const weekday = new Date(Date.UTC(year!, month! - 1, date!)).getUTCDay()
    const from = shiftDayKey(anchor, -weekday)
    return { from, to: shiftDayKey(from, 6) }
  }
  const month = anchor.slice(0, 7)
  const [year, mon] = month.split('-').map(Number)
  const count = new Date(Date.UTC(year!, mon!, 0)).getUTCDate()
  return { from: `${month}-01`, to: `${month}-${pad(count)}` }
}

/** Every day key from `from` to `to`, inclusive. */
export function daysBetween(from: string, to: string): string[] {
  const start = Date.parse(`${from}T00:00:00Z`)
  const end = Date.parse(`${to}T00:00:00Z`)
  const days: string[] = []
  for (let stamp = start; stamp <= end; stamp += 86_400_000) {
    days.push(new Date(stamp).toISOString().slice(0, 10))
  }
  return days
}

/** Moves the anchor by one unit of the current scale. */
export function shiftAnchor(
  scale: TimeScale,
  anchor: string,
  delta: number,
): string {
  if (scale === 'day') return shiftDayKey(anchor, delta)
  if (scale === 'week') return shiftDayKey(anchor, delta * 7)
  const [year, month] = anchor.split('-').map(Number)
  const date = new Date(Date.UTC(year!, month! - 1 + delta, 1))
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-01`
}
