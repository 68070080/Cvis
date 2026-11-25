import type {
  AppData,
  Category,
  Kind,
  MonthSummary,
  Session,
  Settings,
  Theme,
  Transaction,
} from '../shared/types'
import { ApiError, MONTH, fail, hasOnly, isRecord } from './dataguard'
import { foodRoute } from './localfood'
import { fitnessRoute } from './localfitness'
import { reportRoute } from './localreport'
import * as store from './localstore'
import { timeRoute } from './localtime'

const HEX = /^#[0-9a-fA-F]{6}$/
const MAX_AMOUNT = 10_000_000_000
const MAX_NOTE = 200

function monthRange(month: string): [number, number] {
  const [year, mon] = month.split('-').map(Number)
  return [Date.UTC(year!, mon! - 1, 1), Date.UTC(year!, mon!, 1)]
}

const asKind = (value: string): Kind => (value === 'income' ? 'income' : 'expense')

async function getAppData(month: string): Promise<AppData> {
  const [settings, categoryRows, txRows] = await Promise.all([
    store.readSettings(),
    store.getAll<store.CategoryRecord>('categories'),
    store.getAll<store.TransactionRecord>('transactions'),
  ])
  const [start, end] = monthRange(month)

  const categories: Category[] = categoryRows
    .slice()
    .sort((a, b) => a.position - b.position || a.createdAt - b.createdAt)
    .map((row) => ({
      id: row.id,
      name: row.name,
      kind: row.kind,
      budget: row.budget,
      position: row.position,
    }))

  const monthly = txRows.filter(
    (row) => row.occurredAt >= start && row.occurredAt < end,
  )
  const names = new Map(categories.map((category) => [category.id, category.name]))
  const transactions: Transaction[] = monthly
    .slice()
    .sort((a, b) => b.occurredAt - a.occurredAt || b.createdAt - a.createdAt)
    .slice(0, 500)
    .map((row) => ({
      id: row.id,
      kind: row.kind,
      amount: row.amount,
      categoryId: row.categoryId,
      categoryName: row.categoryId ? (names.get(row.categoryId) ?? '') : '',
      note: row.note,
      occurredAt: row.occurredAt,
    }))

  const income = monthly
    .filter((row) => row.kind === 'income')
    .reduce((total, row) => total + row.amount, 0)
  const expense = monthly
    .filter((row) => row.kind === 'expense')
    .reduce((total, row) => total + row.amount, 0)
  const budgetTotal = categories
    .filter((category) => category.kind === 'expense')
    .reduce((total, category) => total + category.budget, 0)
  const budgetIds = new Set(
    categories.filter((category) => category.budget > 0).map((category) => category.id),
  )
  const budgetUsed = monthly
    .filter((row) => row.categoryId && budgetIds.has(row.categoryId))
    .reduce((total, row) => total + row.amount, 0)

  const summary: MonthSummary = {
    month,
    income,
    expense,
    savings: income - expense,
    budgetTotal,
    budgetUsed,
  }

  return { settings, categories, transactions, summary }
}

function validateTransaction(
  categories: Category[],
  body: Record<string, unknown>,
  existing: store.TransactionRecord | null,
): Omit<store.TransactionRecord, 'id' | 'createdAt'> {
  const kind = 'kind' in body ? body.kind : existing?.kind
  if (kind !== 'expense' && kind !== 'income') fail('ประเภทรายการไม่ถูกต้อง')
  const amount = 'amount' in body ? body.amount : existing?.amount
  if (
    typeof amount !== 'number' ||
    !Number.isInteger(amount) ||
    amount <= 0 ||
    amount > MAX_AMOUNT
  )
    fail('จำนวนเงินไม่ถูกต้อง')

  let categoryId: string | null = existing?.categoryId ?? null
  if ('categoryId' in body) {
    if (body.categoryId === null || body.categoryId === '') categoryId = null
    else if (typeof body.categoryId === 'string') categoryId = body.categoryId
    else fail('หมวดไม่ถูกต้อง')
  }
  if (categoryId) {
    const category = categories.find((item) => item.id === categoryId)
    if (!category || category.kind !== kind) fail('ไม่พบหมวดที่เลือก')
  }

  const note = 'note' in body ? body.note : (existing?.note ?? '')
  if (typeof note !== 'string' || note.length > MAX_NOTE)
    fail('บันทึกต้องไม่เกิน 200 ตัวอักษร')

  const occurredAt =
    'occurredAt' in body ? body.occurredAt : (existing?.occurredAt ?? Date.now())
  if (
    typeof occurredAt !== 'number' ||
    !Number.isFinite(occurredAt) ||
    occurredAt < Date.UTC(2000, 0, 1) ||
    occurredAt > Date.now() + 366 * 86_400_000
  )
    fail('วันที่ไม่ถูกต้อง')

  return { kind, amount, categoryId, note: note.trim(), occurredAt }
}

async function saveSettings(body: Record<string, unknown>): Promise<Settings> {
  if (
    !hasOnly(body, [
      'displayName',
      'theme',
      'cycleDay',
      'waterGoalMl',
      'restTimerSec',
    ])
  )
    fail('ข้อมูลตั้งค่าไม่ถูกต้อง')

  const current = await store.readSettings()
  const next: Settings = {
    ...current,
    theme: { ...current.theme },
  }

  if ('displayName' in body) {
    if (typeof body.displayName !== 'string' || body.displayName.trim().length > 40)
      fail('ชื่อต้องไม่เกิน 40 ตัวอักษร')
    next.displayName = body.displayName.trim()
  }
  if ('cycleDay' in body) {
    const day = body.cycleDay
    if (typeof day !== 'number' || !Number.isInteger(day) || day < 1 || day > 28)
      fail('วันเริ่มรอบงบต้องอยู่ระหว่าง 1-28')
    next.cycleDay = day
  }
  if ('waterGoalMl' in body) {
    const goal = body.waterGoalMl
    if (typeof goal !== 'number' || !Number.isInteger(goal) || goal < 0 || goal > 20000)
      fail('เป้าหมายน้ำต่อวันต้องอยู่ระหว่าง 0-20,000 มล.')
    next.waterGoalMl = goal
  }
  if ('restTimerSec' in body) {
    const rest = body.restTimerSec
    if (typeof rest !== 'number' || !Number.isInteger(rest) || rest < 5 || rest > 900)
      fail('เวลาพักระหว่างเซทต้องอยู่ระหว่าง 5-900 วินาที')
    next.restTimerSec = rest
  }
  if ('theme' in body) {
    const theme = body.theme
    if (
      !isRecord(theme) ||
      !hasOnly(theme, ['accent', 'income', 'expense', 'background'])
    )
      fail('ธีมไม่ถูกต้อง')
    const fields: (keyof Theme)[] = ['accent', 'income', 'expense', 'background']
    for (const field of fields) {
      const value = theme[field]
      if (typeof value !== 'string' || !HEX.test(value))
        fail('สีต้องเป็นรหัส hex 6 หลัก เช่น #c2185b')
      next.theme[field] = value.toLowerCase()
    }
  }

  if (!Object.keys(body).length) fail('ไม่มีข้อมูลที่ต้องบันทึก')
  await store.writeAll([
    {
      type: 'put',
      store: 'meta',
      value: { key: 'settings', value: next } satisfies store.SettingsRecord,
    },
  ])
  return next
}

async function financeRoute(
  method: string,
  segments: string[],
  url: URL,
  body: unknown,
): Promise<unknown | undefined> {
  const [head, id] = segments

  if (head === 'session' && method === 'GET') {
    const settings = await store.readSettings()
    return {
      user: { sub: 'local', name: settings.displayName || 'ฉัน' },
      mode: 'local',
      database: true,
    } satisfies Session
  }

  if (head === 'data' && method === 'GET') {
    const month = url.searchParams.get('month')
    if (!month || !MONTH.test(month)) fail('เลือกเดือนให้ถูกต้อง')
    return getAppData(month)
  }

  if (head === 'settings' && method === 'PATCH') {
    if (!isRecord(body)) fail('ข้อมูลตั้งค่าไม่ถูกต้อง')
    return { settings: await saveSettings(body) }
  }

  /* ---------------- categories ---------------- */

  if (head === 'categories') {
    if (method === 'POST') {
      if (!isRecord(body) || !hasOnly(body, ['name', 'kind', 'budget']))
        fail('ข้อมูลหมวดไม่ถูกต้อง')
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      if (!name || name.length > 40) fail('ชื่อหมวดต้องมี 1-40 ตัวอักษร')
      if (body.kind !== 'expense' && body.kind !== 'income')
        fail('ประเภทหมวดไม่ถูกต้อง')
      const budget = 'budget' in body ? body.budget : 0
      if (
        typeof budget !== 'number' ||
        !Number.isInteger(budget) ||
        budget < 0 ||
        budget > MAX_AMOUNT
      )
        fail('งบไม่ถูกต้อง')

      const rows = await store.getAll<store.CategoryRecord>('categories')
      const position = rows.reduce((max, row) => Math.max(max, row.position), 0) + 1
      const record: store.CategoryRecord = {
        id: crypto.randomUUID(),
        name,
        kind: body.kind,
        budget,
        position,
        createdAt: Date.now(),
      }
      await store.writeAll([{ type: 'put', store: 'categories', value: record }])
      const category: Category = {
        id: record.id,
        name: record.name,
        kind: record.kind,
        budget: record.budget,
        position: record.position,
      }
      return { category }
    }

    if (method === 'PATCH' && id) {
      if (
        !isRecord(body) ||
        !hasOnly(body, ['name', 'budget']) ||
        !Object.keys(body).length
      )
        fail('ข้อมูลหมวดไม่ถูกต้อง')
      const rows = await store.getAll<store.CategoryRecord>('categories')
      const existing = rows.find((row) => row.id === id)
      if (!existing) fail('ไม่พบหมวดนี้', 404)
      const next = { ...existing }
      if ('name' in body) {
        const name = typeof body.name === 'string' ? body.name.trim() : ''
        if (!name || name.length > 40) fail('ชื่อหมวดต้องมี 1-40 ตัวอักษร')
        next.name = name
      }
      if ('budget' in body) {
        const budget = body.budget
        if (
          typeof budget !== 'number' ||
          !Number.isInteger(budget) ||
          budget < 0 ||
          budget > MAX_AMOUNT
        )
          fail('งบไม่ถูกต้อง')
        next.budget = budget
      }
      await store.writeAll([{ type: 'put', store: 'categories', value: next }])
      const category: Category = {
        id: next.id,
        name: next.name,
        kind: next.kind,
        budget: next.budget,
        position: next.position,
      }
      return { category }
    }

    if (method === 'DELETE' && id) {
      const rows = await store.getAll<store.CategoryRecord>('categories')
      if (!rows.some((row) => row.id === id)) fail('ไม่พบหมวดนี้', 404)
      const transactions = await store.getAll<store.TransactionRecord>('transactions')
      await store.writeAll([
        { type: 'delete', store: 'categories', key: id },
        ...transactions
          .filter((row) => row.categoryId === id)
          .map((row) => ({
            type: 'put' as const,
            store: 'transactions' as const,
            value: { ...row, categoryId: null },
          })),
      ])
      return { ok: true }
    }
  }

  /* ---------------- transactions ---------------- */

  if (head === 'transactions') {
    const categoryRows = await store.getAll<store.CategoryRecord>('categories')
    const categories: Category[] = categoryRows.map((row) => ({
      id: row.id,
      name: row.name,
      kind: row.kind,
      budget: row.budget,
      position: row.position,
    }))

    if (method === 'POST') {
      if (
        !isRecord(body) ||
        !hasOnly(body, ['kind', 'amount', 'categoryId', 'note', 'occurredAt'])
      )
        fail('ข้อมูลรายการไม่ถูกต้อง')
      const value = validateTransaction(categories, body, null)
      const record: store.TransactionRecord = {
        id: crypto.randomUUID(),
        ...value,
        createdAt: Date.now(),
      }
      await store.writeAll([{ type: 'put', store: 'transactions', value: record }])
      return { id: record.id }
    }

    if (method === 'PATCH' && id) {
      if (
        !isRecord(body) ||
        !hasOnly(body, ['kind', 'amount', 'categoryId', 'note', 'occurredAt']) ||
        !Object.keys(body).length
      )
        fail('ข้อมูลรายการไม่ถูกต้อง')
      const rows = await store.getAll<store.TransactionRecord>('transactions')
      const existing = rows.find((row) => row.id === id)
      if (!existing) fail('ไม่พบรายการนี้', 404)
      const value = validateTransaction(categories, body, existing)
      await store.writeAll([
        { type: 'put', store: 'transactions', value: { ...existing, ...value } },
      ])
      return { ok: true }
    }

    if (method === 'DELETE' && id) {
      const rows = await store.getAll<store.TransactionRecord>('transactions')
      if (!rows.some((row) => row.id === id)) fail('ไม่พบรายการนี้', 404)
      await store.writeAll([{ type: 'delete', store: 'transactions', key: id }])
      return { ok: true }
    }
  }

  return undefined
}

async function route(
  method: string,
  segments: string[],
  url: URL,
  body: unknown,
): Promise<unknown> {
  for (const handler of [financeRoute, foodRoute, fitnessRoute, timeRoute]) {
    const result = await handler(method, segments, url, body)
    if (result !== undefined) return result
  }
  const report = await reportRoute(method, segments, url)
  if (report !== undefined) return report
  throw new ApiError('ไม่พบคำขอนี้', 404)
}

/**
 * Drop-in replacement for the old fetch helper: every call is served from
 * IndexedDB, so the whole app runs as a static bundle with no server.
 */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const url = new URL(path, window.location.href)
  const method = (init?.method ?? 'GET').toUpperCase()
  let body: unknown = null
  if (typeof init?.body === 'string') {
    try {
      body = JSON.parse(init.body)
    } catch {
      throw new Error('ข้อมูลที่ส่งไม่ถูกต้อง')
    }
  }
  await store.ensureSeeded()
  const segments = url.pathname.split('/').filter(Boolean)
  if (segments[0] === 'api') segments.shift()
  try {
    return (await route(method, segments, url, body)) as T
  } catch (error) {
    if (error instanceof ApiError) throw new Error(error.message)
    if (error instanceof Error) throw error
    throw new Error('บันทึกข้อมูลในเครื่องไม่สำเร็จ กรุณาลองใหม่')
  }
}

export const jsonRequest = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

