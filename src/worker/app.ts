import { isSameOriginRequest } from '@freebuff/auth'
import type { FreebuffUser } from '@freebuff/auth'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import type { Kind, Theme } from '../shared/types'
import { appOrigin, currentUser, isLocalPreview, type Env } from './auth'
import { createFitnessRoutes } from './fitness'
import { createFoodRoutes } from './food'
import { createReportRoutes } from './report'
import { createTimeRoutes } from './time'
import {
  ensureSchema,
  ensureUser,
  getData,
  mapCategory,
  mapSettings,
  type CategoryRow,
  type SettingsRow,
  type TransactionRow,
} from './db'

type AppContext = {
  Bindings: Env
  Variables: { user: FreebuffUser; db: D1Database }
}
type Authenticate = (request: Request, env: Env) => Promise<FreebuffUser | null>

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/
const HEX = /^#[0-9a-fA-F]{6}$/
/** 100,000,000 baht, stored in satang. */
const MAX_AMOUNT = 10_000_000_000
const MAX_NOTE = 200
const MAX_NAME = 40

type TxInput = {
  kind: Kind
  amount: number
  categoryId: string | null
  note: string
  occurredAt: number
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasOnly = (body: Record<string, unknown>, keys: string[]) =>
  Object.keys(body).every((key) => keys.includes(key))

async function validateTransaction(
  db: D1Database,
  owner: string,
  body: Record<string, unknown>,
  existing: TransactionRow | null,
): Promise<{ value: TxInput } | { error: string }> {
  const kind = 'kind' in body ? body.kind : existing?.kind
  if (kind !== 'expense' && kind !== 'income')
    return { error: 'ประเภทรายการไม่ถูกต้อง' }
  const amount = 'amount' in body ? body.amount : existing?.amount
  if (
    typeof amount !== 'number' ||
    !Number.isInteger(amount) ||
    amount <= 0 ||
    amount > MAX_AMOUNT
  )
    return { error: 'จำนวนเงินไม่ถูกต้อง' }

  let categoryId: string | null
  if ('categoryId' in body) {
    if (body.categoryId === null || body.categoryId === '') categoryId = null
    else if (typeof body.categoryId === 'string') categoryId = body.categoryId
    else return { error: 'หมวดไม่ถูกต้อง' }
  } else categoryId = existing?.category_id ?? null
  if (categoryId) {
    const category = await db
      .prepare('SELECT id, kind FROM categories WHERE id = ? AND owner_sub = ?')
      .bind(categoryId, owner)
      .first<{ id: string; kind: string }>()
    if (!category || category.kind !== kind)
      return { error: 'ไม่พบหมวดที่เลือก' }
  }

  const note = 'note' in body ? body.note : (existing?.note ?? '')
  if (typeof note !== 'string' || note.length > MAX_NOTE)
    return { error: 'บันทึกต้องไม่เกิน 200 ตัวอักษร' }

  const occurredAt =
    'occurredAt' in body ? body.occurredAt : (existing?.occurred_at ?? Date.now())
  if (
    typeof occurredAt !== 'number' ||
    !Number.isFinite(occurredAt) ||
    occurredAt < Date.UTC(2000, 0, 1) ||
    occurredAt > Date.now() + 366 * 86_400_000
  )
    return { error: 'วันที่ไม่ถูกต้อง' }

  return {
    value: { kind, amount, categoryId, note: note.trim(), occurredAt },
  }
}

/** Tests inject identities; production always uses the Freebuff SDK. */
export function createApp(authenticate: Authenticate = currentUser) {
  const app = new Hono<AppContext>()

  app.get('/api/health', (c) => c.json({ ok: true }))
  app.use('/api/*', async (c, next) => {
    c.header('Cache-Control', 'private, no-store')
    await next()
  })
  app.get('/api/session', async (c) =>
    c.json({
      user: await authenticate(c.req.raw, c.env),
      mode: isLocalPreview(c.req.raw, c.env)
        ? 'local'
        : c.env.FREEBUFF_CLIENT_ID && c.env.APP_ORIGIN
          ? 'freebuff'
          : 'setup',
      database: Boolean(c.env.DB),
    }),
  )

  app.use(
    '/api/*',
    bodyLimit({
      maxSize: 16 * 1024,
      onError: (c) => c.json({ error: 'Request is too large.' }, 413),
    }),
  )

  // Everything past this point is private to the authenticated owner.
  app.use('/api/*', async (c, next) => {
    const user = await authenticate(c.req.raw, c.env)
    if (!user) return c.json({ error: 'Sign in required.' }, 401)
    if (!['GET', 'HEAD'].includes(c.req.method)) {
      const origin = appOrigin(c.req.raw, c.env)
      if (!origin || !isSameOriginRequest(c.req.raw, origin))
        return c.json({ error: 'Cross-origin request refused.' }, 403)
    }
    if (!c.env.DB)
      return c.json(
        { error: 'This app is still being set up. Please try again later.' },
        503,
      )
    await ensureSchema(c.env.DB)
    await ensureUser(c.env.DB, user.sub, user.name)
    c.set('user', user)
    c.set('db', c.env.DB)
    await next()
  })

  app.get('/api/data', async (c) => {
    const month = c.req.query('month')
    if (!month || !MONTH.test(month))
      return c.json({ error: 'เลือกเดือนให้ถูกต้อง' }, 400)
    return c.json(await getData(c.get('db'), c.get('user').sub, month))
  })

  app.patch('/api/settings', async (c) => {
    const body: unknown = await c.req.json().catch(() => null)
    if (
      !isRecord(body) ||
      !hasOnly(body, [
        'displayName',
        'theme',
        'cycleDay',
        'waterGoalMl',
        'restTimerSec',
      ])
    )
      return c.json({ error: 'ข้อมูลตั้งค่าไม่ถูกต้อง' }, 400)
    const columns: string[] = []
    const values: (string | number)[] = []

    if ('displayName' in body) {
      if (
        typeof body.displayName !== 'string' ||
        body.displayName.trim().length > MAX_NAME
      )
        return c.json({ error: 'ชื่อต้องไม่เกิน 40 ตัวอักษร' }, 400)
      columns.push('display_name = ?')
      values.push(body.displayName.trim())
    }
    if ('cycleDay' in body) {
      const day = body.cycleDay
      if (
        typeof day !== 'number' ||
        !Number.isInteger(day) ||
        day < 1 ||
        day > 28
      )
        return c.json({ error: 'วันเริ่มรอบงบต้องอยู่ระหว่าง 1-28' }, 400)
      columns.push('cycle_day = ?')
      values.push(day)
    }
    if ('waterGoalMl' in body) {
      const goal = body.waterGoalMl
      if (
        typeof goal !== 'number' ||
        !Number.isInteger(goal) ||
        goal < 0 ||
        goal > 20000
      )
        return c.json(
          { error: 'เป้าหมายน้ำต่อวันต้องอยู่ระหว่าง 0-20,000 มล.' },
          400,
        )
      columns.push('water_goal_ml = ?')
      values.push(goal)
    }
    if ('restTimerSec' in body) {
      const rest = body.restTimerSec
      if (
        typeof rest !== 'number' ||
        !Number.isInteger(rest) ||
        rest < 5 ||
        rest > 900
      )
        return c.json(
          { error: 'เวลาพักระหว่างเซทต้องอยู่ระหว่าง 5-900 วินาที' },
          400,
        )
      columns.push('rest_timer_sec = ?')
      values.push(rest)
    }
    if ('theme' in body) {
      const theme = body.theme
      if (
        !isRecord(theme) ||
        !hasOnly(theme, ['accent', 'income', 'expense', 'background'])
      )
        return c.json({ error: 'ธีมไม่ถูกต้อง' }, 400)
      const fields: [keyof Theme, string][] = [
        ['accent', 'accent'],
        ['income', 'income_color'],
        ['expense', 'expense_color'],
        ['background', 'background_color'],
      ]
      for (const [input, column] of fields) {
        const value = theme[input]
        if (typeof value !== 'string' || !HEX.test(value))
          return c.json(
            { error: 'สีต้องเป็นรหัส hex 6 หลัก เช่น #c2185b' },
            400,
          )
        columns.push(`${column} = ?`)
        values.push(value.toLowerCase())
      }
    }
    if (!columns.length) return c.json({ error: 'ไม่มีข้อมูลที่ต้องบันทึก' }, 400)

    const db = c.get('db')
    const owner = c.get('user').sub
    await db
      .prepare(`UPDATE settings SET ${columns.join(', ')} WHERE owner_sub = ?`)
      .bind(...values, owner)
      .run()
    const row = await db
      .prepare('SELECT * FROM settings WHERE owner_sub = ?')
      .bind(owner)
      .first<SettingsRow>()
    return c.json({ settings: row ? mapSettings(row) : null })
  })

  app.post('/api/categories', async (c) => {
    const body: unknown = await c.req.json().catch(() => null)
    if (!isRecord(body) || !hasOnly(body, ['name', 'kind', 'budget']))
      return c.json({ error: 'ข้อมูลหมวดไม่ถูกต้อง' }, 400)
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name || name.length > MAX_NAME)
      return c.json({ error: 'ชื่อหมวดต้องมี 1-40 ตัวอักษร' }, 400)
    if (body.kind !== 'expense' && body.kind !== 'income')
      return c.json({ error: 'ประเภทหมวดไม่ถูกต้อง' }, 400)
    const budget = 'budget' in body ? body.budget : 0
    if (
      typeof budget !== 'number' ||
      !Number.isInteger(budget) ||
      budget < 0 ||
      budget > MAX_AMOUNT
    )
      return c.json({ error: 'งบไม่ถูกต้อง' }, 400)

    const db = c.get('db')
    const owner = c.get('user').sub
    const last = await db
      .prepare('SELECT MAX(position) AS position FROM categories WHERE owner_sub = ?')
      .bind(owner)
      .first<{ position: number | null }>()
    const id = crypto.randomUUID()
    await db
      .prepare(
        'INSERT INTO categories (id, owner_sub, name, kind, budget, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(
        id,
        owner,
        name,
        body.kind,
        budget,
        (last?.position ?? 0) + 1,
        Date.now(),
      )
      .run()
    const row = await db
      .prepare(
        'SELECT id, name, kind, budget, position FROM categories WHERE id = ? AND owner_sub = ?',
      )
      .bind(id, owner)
      .first<CategoryRow>()
    return c.json({ category: row ? mapCategory(row) : null }, 201)
  })

  app.patch('/api/categories/:id', async (c) => {
    const body: unknown = await c.req.json().catch(() => null)
    if (!isRecord(body) || !hasOnly(body, ['name', 'budget']) || !Object.keys(body).length)
      return c.json({ error: 'ข้อมูลหมวดไม่ถูกต้อง' }, 400)
    const columns: string[] = []
    const values: (string | number)[] = []
    if ('name' in body) {
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      if (!name || name.length > MAX_NAME)
        return c.json({ error: 'ชื่อหมวดต้องมี 1-40 ตัวอักษร' }, 400)
      columns.push('name = ?')
      values.push(name)
    }
    if ('budget' in body) {
      const budget = body.budget
      if (
        typeof budget !== 'number' ||
        !Number.isInteger(budget) ||
        budget < 0 ||
        budget > MAX_AMOUNT
      )
        return c.json({ error: 'งบไม่ถูกต้อง' }, 400)
      columns.push('budget = ?')
      values.push(budget)
    }
    const db = c.get('db')
    const owner = c.get('user').sub
    const row = await db
      .prepare(
        `UPDATE categories SET ${columns.join(', ')} WHERE id = ? AND owner_sub = ?
         RETURNING id, name, kind, budget, position`,
      )
      .bind(...values, c.req.param('id'), owner)
      .first<CategoryRow>()
    return row
      ? c.json({ category: mapCategory(row) })
      : c.json({ error: 'ไม่พบหมวดนี้' }, 404)
  })

  app.delete('/api/categories/:id', async (c) => {
    const db = c.get('db')
    const owner = c.get('user').sub
    const id = c.req.param('id')
    const removed = await db
      .prepare('DELETE FROM categories WHERE id = ? AND owner_sub = ? RETURNING id')
      .bind(id, owner)
      .first()
    if (!removed) return c.json({ error: 'ไม่พบหมวดนี้' }, 404)
    // Keep the money history; the category just becomes unlabelled.
    await db
      .prepare('UPDATE transactions SET category_id = NULL WHERE category_id = ? AND owner_sub = ?')
      .bind(id, owner)
      .run()
    return c.json({ ok: true })
  })

  app.post('/api/transactions', async (c) => {
    const body: unknown = await c.req.json().catch(() => null)
    if (
      !isRecord(body) ||
      !hasOnly(body, ['kind', 'amount', 'categoryId', 'note', 'occurredAt'])
    )
      return c.json({ error: 'ข้อมูลรายการไม่ถูกต้อง' }, 400)
    const db = c.get('db')
    const owner = c.get('user').sub
    const parsed = await validateTransaction(db, owner, body, null)
    if ('error' in parsed) return c.json({ error: parsed.error }, 400)
    const id = crypto.randomUUID()
    const now = Date.now()
    await db
      .prepare(
        'INSERT INTO transactions (id, owner_sub, kind, amount, category_id, note, occurred_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(
        id,
        owner,
        parsed.value.kind,
        parsed.value.amount,
        parsed.value.categoryId,
        parsed.value.note,
        parsed.value.occurredAt,
        now,
      )
      .run()
    return c.json({ id }, 201)
  })

  app.patch('/api/transactions/:id', async (c) => {
    const body: unknown = await c.req.json().catch(() => null)
    if (
      !isRecord(body) ||
      !hasOnly(body, ['kind', 'amount', 'categoryId', 'note', 'occurredAt']) ||
      !Object.keys(body).length
    )
      return c.json({ error: 'ข้อมูลรายการไม่ถูกต้อง' }, 400)
    const db = c.get('db')
    const owner = c.get('user').sub
    const existing = await db
      .prepare(
        'SELECT id, kind, amount, category_id, note, occurred_at FROM transactions WHERE id = ? AND owner_sub = ?',
      )
      .bind(c.req.param('id'), owner)
      .first<TransactionRow>()
    if (!existing) return c.json({ error: 'ไม่พบรายการนี้' }, 404)
    const parsed = await validateTransaction(db, owner, body, existing)
    if ('error' in parsed) return c.json({ error: parsed.error }, 400)
    await db
      .prepare(
        'UPDATE transactions SET kind = ?, amount = ?, category_id = ?, note = ?, occurred_at = ? WHERE id = ? AND owner_sub = ?',
      )
      .bind(
        parsed.value.kind,
        parsed.value.amount,
        parsed.value.categoryId,
        parsed.value.note,
        parsed.value.occurredAt,
        c.req.param('id'),
        owner,
      )
      .run()
    return c.json({ ok: true })
  })

  app.delete('/api/transactions/:id', async (c) => {
    const removed = await c
      .get('db')
      .prepare(
        'DELETE FROM transactions WHERE id = ? AND owner_sub = ? RETURNING id',
      )
      .bind(c.req.param('id'), c.get('user').sub)
      .first()
    return removed
      ? c.json({ ok: true })
      : c.json({ error: 'ไม่พบรายการนี้' }, 404)
  })

  app.route('/', createFoodRoutes())
  app.route('/', createFitnessRoutes())
  app.route('/', createReportRoutes())
  app.route('/', createTimeRoutes())

  app.notFound((c) =>
    c.req.path === '/api' || c.req.path.startsWith('/api/')
      ? c.json({ error: 'Endpoint not found.' }, 404)
      : c.env.ASSETS.fetch(c.req.raw),
  )
  app.onError((_error, c) =>
    c.json({ error: 'Something went wrong. Please try again.' }, 500),
  )
  return app
}
