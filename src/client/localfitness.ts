import type {
  BodyLog,
  CardioType,
  FitnessData,
  Workout,
  WorkoutKind,
  WorkoutSet,
  WorkoutSetInput,
} from '../shared/types'
import {
  MONTH,
  fail,
  hasOnly,
  isRecord,
  nextMonth,
  parseName,
  validDay,
} from './dataguard'
import * as store from './localstore'

const MAX_SETS = 100
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

function parseBodyWeight(value: unknown): number | null | undefined {
  if (value === null) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  const grams = Math.round(value * 1000)
  return grams >= 5000 && grams <= 500_000 ? grams / 1000 : undefined
}

function parseSteps(value: unknown): number | null | undefined {
  if (value === null) return null
  if (typeof value !== 'number' || !Number.isInteger(value)) return undefined
  return value >= 0 && value <= MAX_STEPS ? value : undefined
}

function parseMinuteOfDay(value: unknown): number | null | undefined {
  if (value === null) return null
  if (typeof value !== 'number' || !Number.isInteger(value)) return undefined
  return value >= 0 && value < 24 * 60 ? value : undefined
}

function parseRating(value: unknown): number | null | undefined {
  if (value === null) return null
  if (typeof value !== 'number' || !Number.isInteger(value)) return undefined
  return value >= 1 && value <= 5 ? value : undefined
}

function parseSetWeight(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const grams = Math.round(value * 1000)
  return grams >= 0 && grams <= MAX_WEIGHT_G ? grams / 1000 : null
}

function parseSets(value: unknown): WorkoutSetInput[] | null {
  if (!Array.isArray(value) || value.length > MAX_SETS) return null
  const sets: WorkoutSetInput[] = []
  for (const raw of value) {
    if (!isRecord(raw) || !hasOnly(raw, ['exercise', 'weightKg', 'reps', 'rir']))
      return null
    const exercise = parseName(raw.exercise)
    if (!exercise) return null
    const weightKg = parseSetWeight(raw.weightKg)
    if (weightKg === null) return null
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
    sets.push({ exercise, weightKg, reps, rir })
  }
  return sets
}

function parseWorkout(body: Record<string, unknown>):
  | { error: string }
  | {
      value: {
        day: string
        kind: WorkoutKind
        title: string
        note: string
        cardioType: CardioType | null
        durationMin: number
        distanceM: number
        sets: WorkoutSetInput[]
      }
    } {
  const day = body.day
  if (!validDay(day)) return { error: 'วันที่ไม่ถูกต้อง' }
  const rawKind = body.kind
  if (rawKind !== 'strength' && rawKind !== 'cardio')
    return { error: 'ประเภทการออกกำลังกายไม่ถูกต้อง' }
  const kind: WorkoutKind = rawKind === 'cardio' ? 'cardio' : 'strength'
  const title = parseName(body.title)
  if (!title) return { error: 'ชื่อกิจกรรมต้องมี 1-60 ตัวอักษร' }
  const note = 'note' in body ? body.note : ''
  if (typeof note !== 'string' || note.length > 200)
    return { error: 'บันทึกต้องไม่เกิน 200 ตัวอักษร' }
  const sets = parseSets('sets' in body ? body.sets : [])
  if (!sets) return { error: 'ข้อมูลเซทไม่ถูกต้อง' }

  let cardioType: CardioType | null = null
  let durationMin = 0
  let distanceM = 0
  if (kind === 'cardio') {
    if (
      typeof body.cardioType !== 'string' ||
      !(CARDIO_TYPES as readonly string[]).includes(body.cardioType)
    )
      return { error: 'เลือกประเภทคาร์ดิโอ' }
    cardioType = body.cardioType as CardioType
    const duration = 'durationMin' in body ? body.durationMin : 0
    if (
      typeof duration !== 'number' ||
      !Number.isFinite(duration) ||
      duration <= 0 ||
      duration > MAX_DURATION_MIN
    )
      return { error: 'ระยะเวลาต้องอยู่ระหว่าง 1-1,440 นาที' }
    durationMin = Math.round(duration * 10) / 10
    const distance = 'distanceM' in body ? body.distanceM : 0
    if (
      typeof distance !== 'number' ||
      !Number.isInteger(distance) ||
      distance < 0 ||
      distance > MAX_DISTANCE_M
    )
      return { error: 'ระยะทางไม่ถูกต้อง' }
    distanceM = distance
    if (sets.length) return { error: 'คาร์ดิโอไม่ต้องบันทึกเซท' }
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
  }
}

export async function getFitnessDataLocal(month: string): Promise<FitnessData> {
  const start = `${month}-01`
  const end = nextMonth(month)
  const [bodyRows, workoutRows] = await Promise.all([
    store.getAll<store.BodyRecord>('body'),
    store.getAll<store.WorkoutRecord>('workouts'),
  ])

  const bodyLogs: BodyLog[] = bodyRows
    .filter((row) => row.day >= start && row.day < end)
    .sort((a, b) => a.day.localeCompare(b.day))
    .map((row) => ({
      day: row.day,
      weightKg: row.weightKg,
      steps: row.steps,
      sleepBedMin: row.sleepBedMin,
      sleepWakeMin: row.sleepWakeMin,
      energy: row.energy,
      hunger: row.hunger,
    }))

  const workouts: Workout[] = workoutRows
    .filter((row) => row.day >= start && row.day < end)
    .sort((a, b) => b.day.localeCompare(a.day) || b.createdAt - a.createdAt)
    .map((row) => {
      const sets = row.sets.map<WorkoutSet>((set, index) => ({
        id: `${row.id}:${index}`,
        exercise: set.exercise,
        weightKg: set.weightKg,
        reps: set.reps,
        rir: set.rir,
      }))
      const volume = sets.reduce((sum, set) => sum + set.weightKg * set.reps, 0)
      return {
        id: row.id,
        day: row.day,
        kind: row.kind,
        title: row.title,
        note: row.note,
        cardioType: row.cardioType,
        durationMin: row.durationMin,
        distanceM: row.distanceM,
        sets,
        volume: Math.round(volume),
      }
    })

  return { month, bodyLogs, workouts }
}

export async function fitnessRoute(
  method: string,
  segments: string[],
  url: URL,
  body: unknown,
): Promise<unknown | undefined> {
  const [head, id] = segments

  if (head === 'fitness' && method === 'GET') {
    const month = url.searchParams.get('month')
    if (!month || !MONTH.test(month)) fail('เลือกเดือนให้ถูกต้อง')
    return getFitnessDataLocal(month)
  }

  if (head === 'body' && method === 'PUT') {
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
      fail('ข้อมูลน้ำหนัก/ก้าวเดินไม่ถูกต้อง')
    if (!validDay(body.day)) fail('วันที่ไม่ถูกต้อง')
    const weightKg = parseBodyWeight(body.weightKg)
    if (weightKg === undefined) fail('น้ำหนักต้องอยู่ระหว่าง 5-500 กก.')
    const steps = parseSteps(body.steps)
    if (steps === undefined) fail('ก้าวเดินต้องอยู่ระหว่าง 0-200,000')
    const sleepBedMin = parseMinuteOfDay('sleepBedMin' in body ? body.sleepBedMin : null)
    if (sleepBedMin === undefined) fail('เวลาเข้านอนไม่ถูกต้อง')
    const sleepWakeMin = parseMinuteOfDay('sleepWakeMin' in body ? body.sleepWakeMin : null)
    if (sleepWakeMin === undefined) fail('เวลาตื่นไม่ถูกต้อง')
    const energy = parseRating('energy' in body ? body.energy : null)
    if (energy === undefined) fail('คะแนนพลังงานต้องอยู่ระหว่าง 1-5')
    const hunger = parseRating('hunger' in body ? body.hunger : null)
    if (hunger === undefined) fail('คะแนนความหิวต้องอยู่ระหว่าง 1-5')

    const day = body.day
    if (
      weightKg === null &&
      steps === null &&
      sleepBedMin === null &&
      sleepWakeMin === null &&
      energy === null &&
      hunger === null
    ) {
      await store.writeAll([{ type: 'delete', store: 'body', key: day }])
      return { ok: true }
    }
    const record: store.BodyRecord = {
      day,
      weightKg,
      steps,
      sleepBedMin,
      sleepWakeMin,
      energy,
      hunger,
      updatedAt: Date.now(),
    }
    await store.writeAll([{ type: 'put', store: 'body', value: record }])
    return { ok: true }
  }

  if (head === 'workouts') {
    if (method === 'POST' || (method === 'PATCH' && id)) {
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
        fail('ข้อมูลการออกกำลังกายไม่ถูกต้อง')
      const parsed = parseWorkout(body)
      if ('error' in parsed) fail(parsed.error)

      if (method === 'POST') {
        const record: store.WorkoutRecord = {
          id: crypto.randomUUID(),
          ...parsed.value,
          createdAt: Date.now(),
        }
        await store.writeAll([{ type: 'put', store: 'workouts', value: record }])
        return { id: record.id }
      }
      const rows = await store.getAll<store.WorkoutRecord>('workouts')
      const existing = rows.find((row) => row.id === id)
      if (!existing) fail('ไม่พบรายการนี้', 404)
      await store.writeAll([
        {
          type: 'put',
          store: 'workouts',
          value: { ...existing, ...parsed.value },
        },
      ])
      return { ok: true }
    }

    if (method === 'DELETE' && id) {
      const rows = await store.getAll<store.WorkoutRecord>('workouts')
      if (!rows.some((row) => row.id === id)) fail('ไม่พบรายการนี้', 404)
      await store.writeAll([{ type: 'delete', store: 'workouts', key: id }])
      return { ok: true }
    }
  }

  return undefined
}
