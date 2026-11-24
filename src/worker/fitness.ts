import type { FreebuffUser } from '@freebuff/auth'
import { Hono } from 'hono'
import type {
  BodyLog,
  CardioType,
  FitnessData,
  Workout,
  WorkoutSet,
  WorkoutSetInput,
} from '../shared/types'
import type { Env } from './auth'

export type FitnessContext = {
  Bindings: Env
  Variables: { user: FreebuffUser; db: D1Database }
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/
const DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/
const MAX_NAME = 60
const MAX_NOTE = 200
const MAX_SETS = 100
/** Weights are stored in grams so whole numbers survive the round trip. */
const MAX_WEIGHT_G = 1_000_000
const MAX_REPS = 1000
const MAX_RIR = 10
const MAX_STEPS = 200_000
const MAX_DURATION_MIN = 1440
const MAX_DISTANCE_M = 1_000_000

const CARDIO_TYPES: readonly CardioType[] = [
  'running',
  'cycling',
  'swimming',
  'walking',
  'rowing',
  'hiit',
  'other',
]

type BodyRow = {
  day: string
  weight_g: number | null
  steps: number | null
  sleep_bed_min: number | null
  sleep_wake_min: number | null
  energy: number | null
  hunger: number | null
}
type WorkoutRow = {
  id: string
  day: string
  kind: string
  title: string
  note: string
  cardio_type: string | null
  duration_min: number
  distance_m: number
}
type SetRow = {
  id: string
  workout_id: string
  exercise: string
  weight_g: number
  reps: number
  rir: number
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasOnly = (body: Record<string, unknown>, keys: string[]) =>
  Object.keys(body).every((key) => keys.includes(key))

function parseName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const name = value.trim()
  return name && name.length <= MAX_NAME ? name : null
}

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

/** Body weight accepts 5–500 kg, or null to clear the value. */
function parseBodyWeight(value: unknown): number | null | undefined {
  if (value === null) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  const grams = Math.round(value * 1000)
  return grams >= 5000 && grams <= 500_000 ? grams : undefined
}

function parseSteps(value: unknown): number | null | undefined {
  if (value === null) return null
  if (typeof value !== 'number' || !Number.isInteger(value)) return undefined
  return value >= 0 && value <= MAX_STEPS ? value : undefined
}

/** Bedtime / wake time as minutes after midnight. */
function parseMinuteOfDay(value: unknown): number | null | undefined {
  if (value === null) return null
  if (typeof value !== 'number' || !Number.isInteger(value)) return undefined
  return value >= 0 && value < 24 * 60 ? value : undefined
}

/** Energy or hunger rating from 1 to 5. */
function parseRating(value: unknown): number | null | undefined {
  if (value === null) return null
  if (typeof value !== 'number' || !Number.isInteger(value)) return undefined
  return value >= 1 && value <= 5 ? value : undefined
}

function parseSetWeight(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const grams = Math.round(value * 1000)
  return grams >= 0 && grams <= MAX_WEIGHT_G ? grams : null
}

type ParsedSet = WorkoutSetInput & { weightG: number }

function parseSets(value: unknown): ParsedSet[] | null {
  if (!Array.isArray(value) || value.length > MAX_SETS) return null
  const sets: ParsedSet[] = []
  for (const raw of value) {
    if (!isRecord(raw) || !hasOnly(raw, ['exercise', 'weightKg', 'reps', 'rir']))
      return null
    const exercise = parseName(raw.exercise)
    if (!exercise) return null
    const weightG = parseSetWeight(raw.weightKg)
    if (weightG === null) return null
    const reps = raw.reps
    if (typeof reps !== 'number' || !Number.isInteger(reps)) return null
    if (reps < 1 || reps > MAX_REPS) return null
    const rir = 'rir' in raw ? raw.rir : 0
    if (
      typeof rir !== 'number' ||
      !Number.isInteger(rir) ||
      rir < 0 ||
      rir > MAX_RIR
    )
      return null
    sets.push({ exercise, weightKg: weightG / 1000, reps, rir, weightG })
  }
  return sets
}

function parseWorkout(body: Record<string, unknown>) {
  const day = body.day
  if (!validDay(day)) return { error: 'วันที่ไม่ถูกต้อง' } as const
  const rawKind = body.kind
  if (rawKind !== 'strength' && rawKind !== 'cardio')
    return { error: 'ประเภทการออกกำลังกายไม่ถูกต้อง' } as const
  const kind = rawKind === 'cardio' ? 'cardio' : 'strength'
  const title = parseName(body.title)
  if (!title)
    return { error: 'ชื่อกิจกรรมต้องมี 1-60 ตัวอักษร' } as const
  const note = 'note' in body ? body.note : ''
  if (typeof note !== 'string' || note.length > MAX_NOTE)
    return { error: 'บันทึกต้องไม่เกิน 200 ตัวอักษร' } as const
  const sets = parseSets('sets' in body ? body.sets : [])
  if (!sets) return { error: 'ข้อมูลเซทไม่ถูกต้อง' } as const

  let cardioType: CardioType | null = null
  let durationMin = 0
  let distanceM = 0
  if (kind === 'cardio') {
    if (
      typeof body.cardioType !== 'string' ||
      !(CARDIO_TYPES as readonly string[]).includes(body.cardioType)
    )
      return { error: 'เลือกประเภทคาร์ดิโอ' } as const
    cardioType = body.cardioType as CardioType
    const duration = 'durationMin' in body ? body.durationMin : 0
    if (
      typeof duration !== 'number' ||
      !Number.isFinite(duration) ||
      duration <= 0 ||
      duration > MAX_DURATION_MIN
    )
      return { error: 'ระยะเวลาต้องอยู่ระหว่าง 1-1,440 นาที' } as const
    durationMin = Math.round(duration * 10) / 10
    const distance = 'distanceM' in body ? body.distanceM : 0
    if (
      typeof distance !== 'number' ||
      !Number.isInteger(distance) ||
      distance < 0 ||
      distance > MAX_DISTANCE_M
    )
      return { error: 'ระยะทางไม่ถูกต้อง' } as const
    distanceM = distance
    if (sets.length) return { error: 'คาร์ดิโอไม่ต้องบันทึกเซท' } as const
  }

  return {
    value: {
      day,
      kind,
      title,
      note: note.trim(),
      cardioType,
      durationMin,
      distanceM,
      sets: kind === 'strength' ? sets : [],
    },
  } as const
}

function nextMonth(month: string): string {
  const [year, mon] = month.split('-').map(Number)
  return mon === 12
    ? `${year! + 1}-01`
    : `${year!}-${String(mon! + 1).padStart(2, '0')}`
}

export async function getFitnessData(
  db: D1Database,
  owner: string,
  month: string,
): Promise<FitnessData> {
  const start = `${month}-01`
  const end = `${nextMonth(month)}-01`
  const [bodyRows, workoutRows, setRows] = await Promise.all([
    db
      .prepare(
        'SELECT day, weight_g, steps, sleep_bed_min, sleep_wake_min, energy, hunger FROM body_logs WHERE owner_sub = ? AND day >= ? AND day < ? ORDER BY day',
      )
      .bind(owner, start, end)
      .all<BodyRow>(),
    db
      .prepare(
        `SELECT id, day, kind, title, note, cardio_type, duration_min, distance_m
         FROM workouts WHERE owner_sub = ? AND day >= ? AND day < ?
         ORDER BY day DESC, created_at DESC`,
      )
      .bind(owner, start, end)
      .all<WorkoutRow>(),
    db
      .prepare(
        `SELECT s.id, s.workout_id, s.exercise, s.weight_g, s.reps, s.rir
         FROM workout_sets s
         JOIN workouts w ON w.id = s.workout_id AND w.owner_sub = s.owner_sub
         WHERE s.owner_sub = ? AND w.day >= ? AND w.day < ?
         ORDER BY s.position`,
      )
      .bind(owner, start, end)
      .all<SetRow>(),
  ])

  const grouped = new Map<string, WorkoutSet[]>()
  for (const row of setRows.results) {
    const list = grouped.get(row.workout_id) ?? []
    list.push({
      id: row.id,
      exercise: row.exercise,
      weightKg: row.weight_g / 1000,
      reps: row.reps,
      rir: row.rir,
    })
    grouped.set(row.workout_id, list)
  }

  const workouts: Workout[] = workoutRows.results.map((row) => {
    const sets = grouped.get(row.id) ?? []
    const volume = sets.reduce(
      (sum, set) => sum + set.weightKg * set.reps,
      0,
    )
    return {
      id: row.id,
      day: row.day,
      kind: row.kind === 'cardio' ? 'cardio' : 'strength',
      title: row.title,
      note: row.note,
      cardioType:
        row.cardio_type &&
        (CARDIO_TYPES as readonly string[]).includes(row.cardio_type)
          ? (row.cardio_type as CardioType)
          : null,
      durationMin: row.duration_min,
      distanceM: row.distance_m,
      sets,
      volume: Math.round(volume),
    }
  })

  const bodyLogs: BodyLog[] = bodyRows.results.map((row) => ({
    day: row.day,
    weightKg: row.weight_g === null ? null : row.weight_g / 1000,
    steps: row.steps,
    sleepBedMin: row.sleep_bed_min,
    sleepWakeMin: row.sleep_wake_min,
    energy: row.energy,
    hunger: row.hunger,
  }))

  return { month, bodyLogs, workouts }
}

export function createFitnessRoutes() {
  const app = new Hono<FitnessContext>()

  app.get('/api/fitness', async (c) => {
    const month = c.req.query('month')
    if (!month || !MONTH.test(month))
      return c.json({ error: 'เลือกเดือนให้ถูกต้อง' }, 400)
    return c.json(await getFitnessData(c.get('db'), c.get('user').sub, month))
  })

  /* ---------------- body weight & steps ---------------- */

  app.put('/api/body', async (c) => {
    const body: unknown = await c.req.json().catch(() => null)
    if (
      !isRecord(body) ||
      !hasOnly(body, [
        'day',
        'weightKg',
        'steps',
        'sleepBedMin',
        'sleepWakeMin',
        'energy',
        'hunger',
      ]) ||
      !('weightKg' in body) ||
      !('steps' in body)
    )
      return c.json({ error: 'ข้อมูลน้ำหนัก/ก้าวเดินไม่ถูกต้อง' }, 400)
    if (!validDay(body.day)) return c.json({ error: 'วันที่ไม่ถูกต้อง' }, 400)
    const weightG = parseBodyWeight(body.weightKg)
    if (weightG === undefined)
      return c.json({ error: 'น้ำหนักต้องอยู่ระหว่าง 5-500 กก.' }, 400)
    const steps = parseSteps(body.steps)
    if (steps === undefined)
      return c.json({ error: 'ก้าวเดินต้องอยู่ระหว่าง 0-200,000' }, 400)
    const sleepBedMin = parseMinuteOfDay(
      'sleepBedMin' in body ? body.sleepBedMin : null,
    )
    if (sleepBedMin === undefined)
      return c.json({ error: 'เวลาเข้านอนไม่ถูกต้อง' }, 400)
    const sleepWakeMin = parseMinuteOfDay(
      'sleepWakeMin' in body ? body.sleepWakeMin : null,
    )
    if (sleepWakeMin === undefined)
      return c.json({ error: 'เวลาตื่นไม่ถูกต้อง' }, 400)
    const energy = parseRating('energy' in body ? body.energy : null)
    if (energy === undefined)
      return c.json({ error: 'คะแนนพลังงานต้องอยู่ระหว่าง 1-5' }, 400)
    const hunger = parseRating('hunger' in body ? body.hunger : null)
    if (hunger === undefined)
      return c.json({ error: 'คะแนนความหิวต้องอยู่ระหว่าง 1-5' }, 400)

    const db = c.get('db')
    const owner = c.get('user').sub
    if (
      weightG === null &&
      steps === null &&
      sleepBedMin === null &&
      sleepWakeMin === null &&
      energy === null &&
      hunger === null
    ) {
      await db
        .prepare('DELETE FROM body_logs WHERE owner_sub = ? AND day = ?')
        .bind(owner, body.day)
        .run()
      return c.json({ ok: true })
    }

    await db
      .prepare(
        `INSERT INTO body_logs
           (id, owner_sub, day, weight_g, steps, sleep_bed_min, sleep_wake_min, energy, hunger, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(owner_sub, day) DO UPDATE SET
           weight_g = excluded.weight_g,
           steps = excluded.steps,
           sleep_bed_min = excluded.sleep_bed_min,
           sleep_wake_min = excluded.sleep_wake_min,
           energy = excluded.energy,
           hunger = excluded.hunger,
           updated_at = excluded.updated_at`,
      )
      .bind(
        crypto.randomUUID(),
        owner,
        body.day,
        weightG,
        steps,
        sleepBedMin,
        sleepWakeMin,
        energy,
        hunger,
        Date.now(),
      )
      .run()
    return c.json({ ok: true })
  })

  /* ---------------- workouts ---------------- */

  app.post('/api/workouts', async (c) => {
    const body: unknown = await c.req.json().catch(() => null)
    if (
      !isRecord(body) ||
      !hasOnly(body, [
        'day',
        'kind',
        'title',
        'note',
        'cardioType',
        'durationMin',
        'distanceM',
        'sets',
      ])
    )
      return c.json({ error: 'ข้อมูลการออกกำลังกายไม่ถูกต้อง' }, 400)
    const parsed = parseWorkout(body)
    if ('error' in parsed) return c.json({ error: parsed.error }, 400)

    const db = c.get('db')
    const owner = c.get('user').sub
    const id = crypto.randomUUID()
    await db.batch([
      db
        .prepare(
          `INSERT INTO workouts (id, owner_sub, day, kind, title, note, cardio_type, duration_min, distance_m, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          owner,
          parsed.value.day,
          parsed.value.kind,
          parsed.value.title,
          parsed.value.note,
          parsed.value.cardioType,
          parsed.value.durationMin,
          parsed.value.distanceM,
          Date.now(),
        ),
      ...parsed.value.sets.map((set, index) =>
        db
          .prepare(
            `INSERT INTO workout_sets (id, workout_id, owner_sub, exercise, weight_g, reps, rir, position)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            id,
            owner,
            set.exercise,
            set.weightG,
            set.reps,
            set.rir,
            index,
          ),
      ),
    ])
    return c.json({ id }, 201)
  })

  app.patch('/api/workouts/:id', async (c) => {
    const body: unknown = await c.req.json().catch(() => null)
    if (
      !isRecord(body) ||
      !hasOnly(body, [
        'day',
        'kind',
        'title',
        'note',
        'cardioType',
        'durationMin',
        'distanceM',
        'sets',
      ])
    )
      return c.json({ error: 'ข้อมูลการออกกำลังกายไม่ถูกต้อง' }, 400)
    const parsed = parseWorkout(body)
    if ('error' in parsed) return c.json({ error: parsed.error }, 400)

    const db = c.get('db')
    const owner = c.get('user').sub
    const id = c.req.param('id')
    const existing = await db
      .prepare('SELECT id FROM workouts WHERE id = ? AND owner_sub = ?')
      .bind(id, owner)
      .first()
    if (!existing) return c.json({ error: 'ไม่พบรายการนี้' }, 404)

    await db.batch([
      db
        .prepare(
          `UPDATE workouts SET day = ?, kind = ?, title = ?, note = ?, cardio_type = ?,
             duration_min = ?, distance_m = ? WHERE id = ? AND owner_sub = ?`,
        )
        .bind(
          parsed.value.day,
          parsed.value.kind,
          parsed.value.title,
          parsed.value.note,
          parsed.value.cardioType,
          parsed.value.durationMin,
          parsed.value.distanceM,
          id,
          owner,
        ),
      db
        .prepare('DELETE FROM workout_sets WHERE workout_id = ? AND owner_sub = ?')
        .bind(id, owner),
      ...parsed.value.sets.map((set, index) =>
        db
          .prepare(
            `INSERT INTO workout_sets (id, workout_id, owner_sub, exercise, weight_g, reps, rir, position)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            id,
            owner,
            set.exercise,
            set.weightG,
            set.reps,
            set.rir,
            index,
          ),
      ),
    ])
    return c.json({ ok: true })
  })

  app.delete('/api/workouts/:id', async (c) => {
    const db = c.get('db')
    const owner = c.get('user').sub
    const id = c.req.param('id')
    const removed = await db
      .prepare('DELETE FROM workouts WHERE id = ? AND owner_sub = ? RETURNING id')
      .bind(id, owner)
      .first()
    if (!removed) return c.json({ error: 'ไม่พบรายการนี้' }, 404)
    await db
      .prepare('DELETE FROM workout_sets WHERE workout_id = ? AND owner_sub = ?')
      .bind(id, owner)
      .run()
    return c.json({ ok: true })
  })

  return app
}
