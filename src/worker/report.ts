import type { FreebuffUser } from '@freebuff/auth'
import { Hono } from 'hono'
import type { ReportData, ReportDay, ReportTotals } from '../shared/types'
import type { Env } from './auth'
import { getFitnessData } from './fitness'
import { getFoodData } from './food'

export type ReportContext = {
  Bindings: Env
  Variables: { user: FreebuffUser; db: D1Database }
}

const DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/
/** Longest range we compute in one request. */
const MAX_DAYS = 366

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

function dayKey(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${date.getUTCFullYear()}-${month}-${day}`
}

/** Every day key between two days, inclusive. */
function dayRange(from: string, to: string): string[] {
  const start = Date.parse(`${from}T00:00:00Z`)
  const end = Date.parse(`${to}T00:00:00Z`)
  const days: string[] = []
  for (let stamp = start; stamp <= end; stamp += 86_400_000) {
    days.push(dayKey(new Date(stamp)))
  }
  return days
}

/** Hours slept between bedtime and wake time, in minutes. */
function sleepLength(bed: number | null, wake: number | null): number | null {
  if (bed === null || wake === null) return null
  const minutes = wake >= bed ? wake - bed : 1440 - bed + wake
  return minutes > 0 && minutes <= 1440 ? minutes : null
}

const emptyDay = (day: string): ReportDay => ({
  day,
  waterMl: 0,
  foodCost: 0,
  mealsEaten: 0,
  weightKg: null,
  steps: null,
  sleepMin: null,
  energy: null,
  hunger: null,
  strengthSets: 0,
  strengthVolume: 0,
  cardioMin: 0,
  cardioM: 0,
})

function logged(row: ReportDay): boolean {
  return (
    row.waterMl > 0 ||
    row.foodCost > 0 ||
    row.weightKg !== null ||
    row.steps !== null ||
    row.sleepMin !== null ||
    row.energy !== null ||
    row.hunger !== null ||
    row.strengthSets > 0 ||
    row.cardioMin > 0
  )
}

/** Combines the food, body and workout data of every day in the range. */
export async function getReport(
  db: D1Database,
  owner: string,
  from: string,
  to: string,
): Promise<ReportData> {
  const days = dayRange(from, to)
  const months = [...new Set(days.map((day) => day.slice(0, 7)))]
  const [food, fitness] = await Promise.all([
    Promise.all(months.map((month) => getFoodData(db, owner, month))),
    Promise.all(months.map((month) => getFitnessData(db, owner, month))),
  ])

  const rows = new Map<string, ReportDay>()
  for (const day of days) rows.set(day, emptyDay(day))

  for (const data of food) {
    for (const entry of data.plan) {
      if (!entry.eaten) continue
      const row = rows.get(entry.day)
      if (!row) continue
      row.foodCost += entry.cost
      row.mealsEaten += 1
    }
    for (const log of data.water) {
      const row = rows.get(log.day)
      if (!row) continue
      row.waterMl += log.amountMl
    }
  }

  for (const data of fitness) {
    for (const log of data.bodyLogs) {
      const row = rows.get(log.day)
      if (!row) continue
      row.weightKg = log.weightKg
      row.steps = log.steps
      row.energy = log.energy
      row.hunger = log.hunger
      row.sleepMin = sleepLength(log.sleepBedMin, log.sleepWakeMin)
    }
    for (const workout of data.workouts) {
      const row = rows.get(workout.day)
      if (!row) continue
      if (workout.kind === 'strength') {
        row.strengthSets += workout.sets.length
        row.strengthVolume += workout.volume
      } else {
        row.cardioMin += workout.durationMin
        row.cardioM += workout.distanceM
      }
    }
  }

  const list = [...rows.values()]
  const loggedDays = list.filter(logged)
  const weights = list.filter(
    (row): row is ReportDay & { weightKg: number } => row.weightKg !== null,
  )
  const sleeps = list.filter(
    (row): row is ReportDay & { sleepMin: number } => row.sleepMin !== null,
  )

  const sum = (pick: (row: ReportDay) => number) =>
    list.reduce((total, row) => total + pick(row), 0)

  const totals: ReportTotals = {
    days: list.length,
    loggedDays: loggedDays.length,
    waterMl: sum((row) => row.waterMl),
    waterAvgMl: loggedDays.length
      ? Math.round(sum((row) => row.waterMl) / loggedDays.length)
      : 0,
    foodCost: sum((row) => row.foodCost),
    mealsEaten: sum((row) => row.mealsEaten),
    steps: sum((row) => row.steps ?? 0),
    sleepAvgMin: sleeps.length
      ? Math.round(
          sleeps.reduce((total, row) => total + row.sleepMin, 0) / sleeps.length,
        )
      : null,
    weightStart: weights[0]?.weightKg ?? null,
    weightEnd: weights[weights.length - 1]?.weightKg ?? null,
    weightChange:
      weights.length > 1
        ? Math.round(
            (weights[weights.length - 1]!.weightKg - weights[0]!.weightKg) * 100,
          ) / 100
        : null,
    strengthSets: sum((row) => row.strengthSets),
    strengthVolume: Math.round(sum((row) => row.strengthVolume)),
    cardioMin: Math.round(sum((row) => row.cardioMin) * 10) / 10,
    cardioM: sum((row) => row.cardioM),
  }

  return { from, to, days: list, totals }
}

export function createReportRoutes() {
  const app = new Hono<ReportContext>()

  app.get('/api/report', async (c) => {
    const from = c.req.query('from')
    const to = c.req.query('to')
    if (!validDay(from) || !validDay(to))
      return c.json({ error: 'เลือกช่วงวันที่ให้ถูกต้อง' }, 400)
    if (from > to)
      return c.json({ error: 'วันเริ่มต้องไม่เกินวันสิ้นสุด' }, 400)
    const span =
      (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
        86_400_000 +
      1
    if (span > MAX_DAYS)
      return c.json({ error: 'เลือกช่วงได้ไม่เกิน 366 วัน' }, 400)
    return c.json(await getReport(c.get('db'), c.get('user').sub, from, to))
  })

  return app
}
