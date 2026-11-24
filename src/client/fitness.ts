import type { CardioType } from '../shared/types'

export const CARDIO_TYPES: { value: CardioType; label: string }[] = [
  { value: 'running', label: 'วิ่ง' },
  { value: 'cycling', label: 'ปั่นจักรยาน' },
  { value: 'swimming', label: 'ว่ายน้ำ' },
  { value: 'walking', label: 'เดินเร็ว' },
  { value: 'rowing', label: 'พายเรือ' },
  { value: 'hiit', label: 'HIIT' },
  { value: 'other', label: 'อื่น ๆ' },
]

export function cardioLabel(type: CardioType | null): string {
  return (
    CARDIO_TYPES.find((item) => item.value === type)?.label ?? 'คาร์ดิโอ'
  )
}

const trim = (value: number) =>
  value.toLocaleString('th-TH', { maximumFractionDigits: 2 })

export function weightLabel(kg: number): string {
  return `${trim(kg)} กก.`
}

export function volumeLabel(kg: number): string {
  return `${Math.round(kg).toLocaleString('th-TH')} กก.`
}

export function minutesLabel(minutes: number): string {
  if (minutes < 60) return `${trim(minutes)} นาที`
  const hours = Math.floor(minutes / 60)
  const rest = Math.round(minutes - hours * 60)
  return rest > 0 ? `${hours} ชม. ${rest} นาที` : `${hours} ชม.`
}

export function distanceLabel(metres: number): string {
  if (metres <= 0) return ''
  if (metres < 1000) return `${Math.round(metres).toLocaleString('th-TH')} ม.`
  return `${trim(metres / 1000)} กม.`
}

export function stepsLabel(steps: number): string {
  return steps.toLocaleString('th-TH')
}

/** The sleep slider runs 20:00 → 12:00 in 15-minute steps. */
export const SLEEP_AXIS_MIN = 20 * 60
export const SLEEP_STEP_MIN = 15
export const SLEEP_AXIS_STEPS = (16 * 60) / SLEEP_STEP_MIN
/** Index where bedtime stops and wake time starts (04:00). */
export const SLEEP_MID_STEP = SLEEP_AXIS_STEPS / 2

export const DEFAULT_BED_MIN = 23 * 60
export const DEFAULT_WAKE_MIN = 7 * 60

export function clockFromMinutes(minutes: number): string {
  const safe = ((Math.round(minutes) % 1440) + 1440) % 1440
  const hours = Math.floor(safe / 60)
  return `${String(hours).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`
}

/** Slider position (0–64) of a bedtime or wake time stored as minutes after midnight. */
export function sleepAxisIndex(minutes: number): number {
  const offset = (((minutes - SLEEP_AXIS_MIN) % 1440) + 1440) % 1440
  return Math.round(Math.min(offset, 16 * 60) / SLEEP_STEP_MIN)
}

export function sleepIndexMinutes(index: number): number {
  const safe = Math.min(Math.max(index, 0), SLEEP_AXIS_STEPS)
  return (SLEEP_AXIS_MIN + safe * SLEEP_STEP_MIN) % 1440
}

/** Minutes slept between bedtime and wake time. */
export function sleepMinutes(bedMin: number, wakeMin: number): number {
  return (((wakeMin - bedMin) % 1440) + 1440) % 1440
}

export function durationLabel(total: number): string {
  const hours = Math.floor(total / 60)
  const rest = Math.round(total % 60)
  if (rest === 60) return `${hours + 1} ชม.`
  return rest ? `${hours} ชม. ${rest} นาที` : `${hours} ชม.`
}

export function sleepLabel(bedMin: number, wakeMin: number): string {
  return durationLabel(sleepMinutes(bedMin, wakeMin))
}

export const ENERGY_LABELS = [
  'หมดแรง',
  'อ่อนเพลีย',
  'ปานกลาง',
  'กระปรี้กระเปร่า',
  'สดชื่นมาก',
]

export const HUNGER_LABELS = [
  'อิ่มมาก',
  'อิ่ม',
  'ปานกลาง',
  'หิว',
  'หิวมาก',
]

/** `m:ss` for a countdown of at most 99 minutes. */
export function clockLabel(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds))
  const mins = Math.floor(safe / 60)
  const rest = safe % 60
  return `${mins}:${String(rest).padStart(2, '0')}`
}

/** Parses a non-negative decimal typed by the user, e.g. `62.5`. */
export function decimalInput(input: string): number | null {
  const cleaned = input.replace(/[,\s]/g, '')
  if (!/^\d+(\.\d{1,3})?$/.test(cleaned)) return null
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : null
}

export function integerInput(input: string): number | null {
  const cleaned = input.replace(/[,\s]/g, '')
  if (!/^\d+$/.test(cleaned)) return null
  const value = Number(cleaned)
  return Number.isSafeInteger(value) ? value : null
}
