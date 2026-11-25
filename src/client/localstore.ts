import type {
  Activity,
  BodyLog,
  CardioType,
  Category,
  Kind,
  PlanKind,
  Settings,
  Theme,
  Unit,
  WaterLog,
  WorkoutKind,
  WorkoutSetInput,
} from '../shared/types'
import { DEFAULT_THEME } from './theme'

/** Everything Cvis keeps lives in this browser database. */
const DB_NAME = 'cvis'
const DB_VERSION = 1

export const STORES = [
  'meta',
  'categories',
  'transactions',
  'ingredients',
  'recipes',
  'supplements',
  'plan',
  'water',
  'body',
  'workouts',
  'activities',
  'checkins',
] as const

export type StoreName = (typeof STORES)[number]

const KEY_PATH: Record<StoreName, string> = {
  meta: 'key',
  categories: 'id',
  transactions: 'id',
  ingredients: 'id',
  recipes: 'id',
  supplements: 'id',
  plan: 'id',
  water: 'id',
  body: 'day',
  workouts: 'id',
  activities: 'id',
  checkins: 'day',
}

export const DEFAULT_SETTINGS: Settings = {
  displayName: '',
  theme: DEFAULT_THEME,
  cycleDay: 1,
  waterGoalMl: 2000,
  restTimerSec: 90,
}

const DEFAULT_CATEGORIES: { name: string; kind: Kind }[] = [
  { name: 'อาหาร', kind: 'expense' },
  { name: 'เดินทาง', kind: 'expense' },
  { name: 'ค่าโทรศัพท์', kind: 'expense' },
  { name: 'ค่าเน็ต', kind: 'expense' },
  { name: 'ค่าน้ำค่าไฟ', kind: 'expense' },
  { name: 'ชอปปิ้ง', kind: 'expense' },
  { name: 'ที่พัก', kind: 'expense' },
  { name: 'อาหารเสริม', kind: 'expense' },
  { name: 'ของใช้', kind: 'expense' },
  { name: 'รองเท้า', kind: 'expense' },
  { name: 'อื่นๆ', kind: 'expense' },
  { name: 'เงินเดือน', kind: 'income' },
  { name: 'รายได้เสริม', kind: 'income' },
  { name: 'โบนัส', kind: 'income' },
]

export type SettingsRecord = { key: 'settings'; value: Settings }
export type CategoryRecord = Category & { createdAt: number }
export type TransactionRecord = {
  id: string
  kind: Kind
  amount: number
  categoryId: string | null
  note: string
  occurredAt: number
  createdAt: number
}
export type IngredientRecord = {
  id: string
  name: string
  purchaseQuantity: number
  purchaseUnit: Unit
  purchasePrice: number
  createdAt: number
}
export type RecipeItemRecord = {
  ingredientId: string
  quantity: number
  unit: Unit
}
export type RecipeRecord = {
  id: string
  name: string
  servings: number
  note: string
  items: RecipeItemRecord[]
  createdAt: number
}
export type SupplementRecord = {
  id: string
  name: string
  price: number
  servings: number
  createdAt: number
}
export type PlanRecord = {
  id: string
  day: string
  kind: PlanKind
  refId: string
  servings: number
  eaten: boolean
  createdAt: number
}
export type WaterRecord = WaterLog
export type BodyRecord = BodyLog & { updatedAt: number }
export type WorkoutRecord = {
  id: string
  day: string
  kind: WorkoutKind
  title: string
  note: string
  cardioType: CardioType | null
  durationMin: number
  distanceM: number
  sets: WorkoutSetInput[]
  createdAt: number
}
export type ActivityRecord = Activity & { createdAt: number }
export type CheckinRecord = { day: string; checkedAt: number }

let dbPromise: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('เบราว์เซอร์นี้ไม่รองรับการเก็บข้อมูลในเครื่อง'))
        return
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        for (const name of STORES) {
          if (!db.objectStoreNames.contains(name))
            db.createObjectStore(name, { keyPath: KEY_PATH[name] })
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () =>
        reject(request.error ?? new Error('เปิดที่เก็บข้อมูลในเครื่องไม่ได้'))
      request.onblocked = () =>
        reject(new Error('มีแท็บอื่นเปิดแอพค้างอยู่ กรุณาปิดแท็บนั้นแล้วลองใหม่'))
    }).catch((error) => {
      dbPromise = null
      throw error
    })
  }
  return dbPromise
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('อ่านข้อมูลในเครื่องไม่ได้'))
  })
}

export function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('บันทึกข้อมูลในเครื่องไม่ได้'))
    tx.onabort = () => reject(tx.error ?? new Error('บันทึกข้อมูลไม่สำเร็จ'))
  })
}

export async function getAll<T>(name: StoreName): Promise<T[]> {
  const db = await open()
  return request(db.transaction(name, 'readonly').objectStore(name).getAll() as IDBRequest<T[]>)
}

export async function get<T>(name: StoreName, key: string): Promise<T | undefined> {
  const db = await open()
  return request(
    db.transaction(name, 'readonly').objectStore(name).get(key) as IDBRequest<T | undefined>,
  )
}

export type WriteOp =
  | { type: 'put'; store: StoreName; value: unknown }
  | { type: 'delete'; store: StoreName; key: string }

/** Applies every write in one transaction so a failure changes nothing. */
export async function writeAll(ops: WriteOp[]): Promise<void> {
  if (!ops.length) return
  const db = await open()
  const names = [...new Set(ops.map((op) => op.store))]
  const tx = db.transaction(names, 'readwrite')
  for (const op of ops) {
    const objectStore = tx.objectStore(op.store)
    if (op.type === 'put') objectStore.put(op.value)
    else objectStore.delete(op.key)
  }
  await done(tx)
}

/** Replaces every store with the given rows, atomically. */
export async function replaceAll(
  entries: { store: StoreName; values: unknown[] }[],
): Promise<void> {
  const db = await open()
  const names = [...new Set(entries.map((entry) => entry.store))]
  const tx = db.transaction(names, 'readwrite')
  for (const name of names) tx.objectStore(name).clear()
  for (const entry of entries) {
    const objectStore = tx.objectStore(entry.store)
    for (const value of entry.values) objectStore.put(value)
  }
  await done(tx)
}

export async function readSettings(): Promise<Settings> {
  const record = await get<SettingsRecord>('meta', 'settings')
  return record?.value ?? DEFAULT_SETTINGS
}

let seeding: Promise<void> | null = null

/** Creates settings and the starter categories the first time Cvis opens. */
export function ensureSeeded(): Promise<void> {
  if (!seeding) {
    seeding = (async () => {
      const existing = await get<SettingsRecord>('meta', 'settings')
      if (existing) return
      const now = Date.now()
      const ops: WriteOp[] = [
        {
          type: 'put',
          store: 'meta',
          value: { key: 'settings', value: DEFAULT_SETTINGS } satisfies SettingsRecord,
        },
        ...DEFAULT_CATEGORIES.map((category, index) => ({
          type: 'put' as const,
          store: 'categories' as const,
          value: {
            id: crypto.randomUUID(),
            name: category.name,
            kind: category.kind,
            budget: 0,
            position: index,
            createdAt: now,
          } satisfies CategoryRecord,
        })),
      ]
      await writeAll(ops)
    })().catch((error) => {
      seeding = null
      throw error
    })
  }
  return seeding
}
