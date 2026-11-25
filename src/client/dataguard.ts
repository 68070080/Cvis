import type { BaseUnit, Unit } from '../shared/types'

export const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/
export const DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/
export const UNITS: readonly Unit[] = ['g', 'kg', 'ml', 'l', 'piece']
export const MAX_NAME = 60
export const MAX_NOTE = 200
export const MAX_MONEY = 10_000_000_000
export const MAX_SERVINGS = 1000
export const MAX_QUANTITY = 1_000_000

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function fail(message: string, status = 400): never {
  throw new ApiError(message, status)
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const hasOnly = (body: Record<string, unknown>, keys: string[]) =>
  Object.keys(body).every((key) => keys.includes(key))

export function validDay(value: unknown): value is string {
  if (typeof value !== 'string' || !DAY.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year!, month! - 1, day!))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month! - 1 &&
    date.getUTCDate() === day
  )
}

export function parseName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const name = value.trim()
  return name && name.length <= MAX_NAME ? name : null
}

export function parseMoney(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null
  return value >= 0 && value <= MAX_MONEY ? value : null
}

export function parseQuantity(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  if (value <= 0 || value > MAX_QUANTITY) return null
  return Math.round(value * 1000) / 1000
}

export function parseServings(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  if (value <= 0 || value > MAX_SERVINGS) return null
  return Math.round(value * 100) / 100
}

export function parseUnit(value: unknown): Unit | null {
  return typeof value === 'string' && (UNITS as readonly string[]).includes(value)
    ? (value as Unit)
    : null
}

export const unitFactor = (unit: Unit): number =>
  unit === 'kg' || unit === 'l' ? 1000 : 1

export const baseUnit = (unit: Unit): BaseUnit =>
  unit === 'kg' || unit === 'g' ? 'g' : unit === 'l' || unit === 'ml' ? 'ml' : 'piece'

/** First day of the following month, used as an exclusive upper bound. */
export function nextMonth(month: string): string {
  const [year, mon] = month.split('-').map(Number)
  return mon === 12
    ? `${year! + 1}-01`
    : `${year!}-${String(mon! + 1).padStart(2, '0')}`
}
