export const WEEKDAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.']

const pad = (value: number) => String(value).padStart(2, '0')

const MONTHS = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
]

export function todayKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** Every day key (`YYYY-MM-DD`) in a month. */
export function daysOfMonth(month: string): string[] {
  const [year, mon] = month.split('-').map(Number)
  const count = new Date(Date.UTC(year!, mon!, 0)).getUTCDate()
  return Array.from(
    { length: count },
    (_, index) => `${month}-${pad(index + 1)}`,
  )
}

export function dayLabel(day: string): string {
  const [year, mon, date] = day.split('-').map(Number)
  return `${date} ${MONTHS[mon! - 1]} ${year! + 543}`
}

export function timeLabel(ms: number): string {
  const date = new Date(ms)
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function shiftMonth(month: string, delta: number): string {
  const [year, mon] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year!, mon! - 1 + delta, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

export function monthLabel(month: string): string {
  const [year, mon] = month.split('-').map(Number)
  return `${MONTHS[mon! - 1]} ${year! + 543}`
}

export function periodLabel(month: string): string {
  const [year, mon] = month.split('-').map(Number)
  const days = new Date(Date.UTC(year!, mon!, 0)).getUTCDate()
  return `1 ${MONTHS[mon! - 1]} – ${days} ${MONTHS[mon! - 1]} ${year! + 543}`
}

export function money(satang: number, compact = false): string {
  const value = satang / 100
  const digits = compact && Number.isInteger(value) ? 0 : 2
  return `฿${value.toLocaleString('th-TH', {
    minimumFractionDigits: digits,
    maximumFractionDigits: 2,
  })}`
}

export function parseAmount(input: string): number | null {
  const cleaned = input.replace(/[,\s฿]/g, '')
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null
  const value = Math.round(Number(cleaned) * 100)
  return Number.isFinite(value) && value > 0 ? value : null
}

export function parseQuantityInput(input: string): number | null {
  const cleaned = input.replace(/[,\s]/g, '')
  if (!/^\d+(\.\d{0,3})?$/.test(cleaned)) return null
  const value = Number(cleaned)
  return Number.isFinite(value) && value > 0 ? value : null
}

export function amountInput(satang: number): string {
  return satang > 0 ? (satang / 100).toFixed(2) : ''
}

export function formatDate(ms: number): string {
  const date = new Date(ms)
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear() + 543}`
}

export function dateInput(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

export function parseDateInput(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, mon, day] = value.split('-').map(Number)
  const stamp = Date.UTC(year!, mon! - 1, day!, 12)
  return Number.isFinite(stamp) ? stamp : null
}

/** A sensible default date: today when the month is current, else its 1st. */
export function defaultDate(month: string): number {
  const [year, mon] = month.split('-').map(Number)
  if (month === currentMonth()) {
    const now = new Date()
    return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 12)
  }
  return Date.UTC(year!, mon! - 1, 1, 12)
}
