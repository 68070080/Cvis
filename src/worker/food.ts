import type { FreebuffUser } from '@freebuff/auth'
import { Hono } from 'hono'
import type {
  BaseUnit,
  FoodData,
  Ingredient,
  PlanEntry,
  PlanKind,
  Recipe,
  RecipeItem,
  Supplement,
  Unit,
  WaterLog,
} from '../shared/types'
import type { Env } from './auth'

export type FoodContext = {
  Bindings: Env
  Variables: { user: FreebuffUser; db: D1Database }
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/
const DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/
const UNITS: readonly Unit[] = ['g', 'kg', 'ml', 'l', 'piece']
const MAX_NAME = 60
const MAX_NOTE = 200
const MAX_MONEY = 10_000_000_000
const MAX_SERVINGS = 1000
const MAX_QUANTITY = 1_000_000
const MAX_WATER = 5000

type RecipeRow = { id: string; name: string; servings: number; note: string }
type ItemRow = {
  id: string
  recipe_id: string
  name: string
  quantity: number
  unit: string
  price: number
  ingredient_id: string | null
}
type IngredientRow = {
  id: string
  name: string
  purchase_quantity: number
  purchase_unit: string
  purchase_price: number
}
type SupplementRow = {
  id: string
  name: string
  price: number
  servings: number
}
type PlanRow = {
  id: string
  day: string
  kind: string
  ref_id: string
  servings: number
  eaten: number
}
type WaterRow = { id: string; day: string; amount_ml: number; logged_at: number }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasOnly = (body: Record<string, unknown>, keys: string[]) =>
  Object.keys(body).every((key) => keys.includes(key))

export const unitFactor = (unit: Unit): number =>
  unit === 'kg' || unit === 'l' ? 1000 : 1

export const baseUnit = (unit: Unit): BaseUnit =>
  unit === 'kg' || unit === 'g' ? 'g' : unit === 'l' || unit === 'ml' ? 'ml' : 'piece'

function parseName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const name = value.trim()
  return name && name.length <= MAX_NAME ? name : null
}

function parseServings(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  if (value <= 0 || value > MAX_SERVINGS) return null
  return Math.round(value * 100) / 100
}

function parseMoney(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null
  return value >= 0 && value <= MAX_MONEY ? value : null
}

function parseQuantity(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  if (value <= 0 || value > MAX_QUANTITY) return null
  return Math.round(value * 1000) / 1000
}

function parseUnit(value: unknown): Unit | null {
  return typeof value === 'string' && (UNITS as readonly string[]).includes(value)
    ? (value as Unit)
    : null
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

type ItemInput = {
  ingredientId: string
  name: string
  quantity: number
  unit: Unit
}

function parseItems(
  value: unknown,
  ingredients: Map<string, Ingredient>,
): ItemInput[] | null {
  if (!Array.isArray(value) || value.length > 50) return null
  const items: ItemInput[] = []
  for (const raw of value) {
    if (!isRecord(raw) || !hasOnly(raw, ['ingredientId', 'quantity', 'unit']))
      return null
    if (typeof raw.ingredientId !== 'string') return null
    const ingredient = ingredients.get(raw.ingredientId)
    if (!ingredient) return null
    const quantity = parseQuantity(raw.quantity)
    const unit = parseUnit(raw.unit)
    if (!quantity || !unit) return null
    items.push({
      ingredientId: ingredient.id,
      name: ingredient.name,
      quantity,
      unit,
    })
  }
  return items
}

function parseRecipe(
  body: Record<string, unknown>,
  ingredients: Map<string, Ingredient>,
) {
  const name = parseName(body.name)
  if (!name) return { error: 'ชื่อเมนูต้องมี 1-60 ตัวอักษร' } as const
  const servings = parseServings(body.servings)
  if (!servings) return { error: 'จำนวนเสิร์ฟต้องมากกว่า 0' } as const
  const note = 'note' in body ? body.note : ''
  if (typeof note !== 'string' || note.length > MAX_NOTE)
    return { error: 'บันทึกต้องไม่เกิน 200 ตัวอักษร' } as const
  const items = parseItems('items' in body ? body.items : [], ingredients)
  if (!items)
    return {
      error: 'วัตถุดิบไม่ถูกต้อง — เลือกวัตถุดิบจากคลังและใส่ปริมาณ',
    } as const
  return { value: { name, servings, note: note.trim(), items } } as const
}

async function loadIngredients(
  db: D1Database,
  owner: string,
): Promise<Ingredient[]> {
  const rows = await db
    .prepare(
      'SELECT id, name, purchase_quantity, purchase_unit, purchase_price FROM ingredients WHERE owner_sub = ? ORDER BY created_at DESC, name',
    )
    .bind(owner)
    .all<IngredientRow>()
  return rows.results.map((row) => {
    const unit = parseUnit(row.purchase_unit) ?? 'g'
    const baseQuantity = row.purchase_quantity * unitFactor(unit)
    return {
      id: row.id,
      name: row.name,
      purchaseQuantity: row.purchase_quantity,
      purchaseUnit: unit,
      purchasePrice: row.purchase_price,
      unitPrice: baseQuantity > 0 ? row.purchase_price / baseQuantity : 0,
    }
  })
}

async function loadRecipes(
  db: D1Database,
  owner: string,
  ingredients: Map<string, Ingredient>,
): Promise<Recipe[]> {
  const [recipeRows, itemRows] = await Promise.all([
    db
      .prepare(
        'SELECT id, name, servings, note FROM recipes WHERE owner_sub = ? ORDER BY created_at DESC',
      )
      .bind(owner)
      .all<RecipeRow>(),
    db
      .prepare(
        'SELECT id, recipe_id, name, quantity, unit, price, ingredient_id FROM recipe_items WHERE owner_sub = ? ORDER BY position',
      )
      .bind(owner)
      .all<ItemRow>(),
  ])

  const grouped = new Map<string, RecipeItem[]>()
  for (const row of itemRows.results) {
    const list = grouped.get(row.recipe_id) ?? []
    const unit = parseUnit(row.unit) ?? 'g'
    const ingredient = row.ingredient_id
      ? ingredients.get(row.ingredient_id)
      : undefined
    list.push({
      id: row.id,
      ingredientId: ingredient?.id ?? '',
      name: ingredient?.name ?? row.name,
      quantity: row.quantity,
      unit,
      cost: ingredient
        ? Math.round(row.quantity * unitFactor(unit) * ingredient.unitPrice)
        : Math.round(row.quantity * row.price),
    })
    grouped.set(row.recipe_id, list)
  }

  return recipeRows.results.map((row) => {
    const items = grouped.get(row.id) ?? []
    const cost = items.reduce((sum, item) => sum + item.cost, 0)
    return {
      id: row.id,
      name: row.name,
      servings: row.servings,
      note: row.note,
      items,
      cost,
      costPerServing: row.servings > 0 ? Math.round(cost / row.servings) : 0,
    }
  })
}

function nextMonth(month: string): string {
  const [year, mon] = month.split('-').map(Number)
  return mon === 12
    ? `${year! + 1}-01`
    : `${year!}-${String(mon! + 1).padStart(2, '0')}`
}

export async function getFoodData(
  db: D1Database,
  owner: string,
  month: string,
): Promise<FoodData> {
  const start = `${month}-01`
  const end = `${nextMonth(month)}-01`
  const ingredients = await loadIngredients(db, owner)
  const ingredientMap = new Map(
    ingredients.map((ingredient) => [ingredient.id, ingredient]),
  )
  const [recipes, supplementRows, planRows, waterRows, goalRow] =
    await Promise.all([
      loadRecipes(db, owner, ingredientMap),
      db
        .prepare(
          'SELECT id, name, price, servings FROM supplements WHERE owner_sub = ? ORDER BY created_at DESC',
        )
        .bind(owner)
        .all<SupplementRow>(),
      db
        .prepare(
          'SELECT id, day, kind, ref_id, servings, eaten FROM plan_entries WHERE owner_sub = ? AND day >= ? AND day < ? ORDER BY day, created_at',
        )
        .bind(owner, start, end)
        .all<PlanRow>(),
      db
        .prepare(
          'SELECT id, day, amount_ml, logged_at FROM water_logs WHERE owner_sub = ? AND day >= ? AND day < ? ORDER BY day, logged_at',
        )
        .bind(owner, start, end)
        .all<WaterRow>(),
      db
        .prepare('SELECT water_goal_ml FROM settings WHERE owner_sub = ?')
        .bind(owner)
        .first<{ water_goal_ml: number }>(),
    ])

  const supplements: Supplement[] = supplementRows.results.map((row) => ({
    id: row.id,
    name: row.name,
    price: row.price,
    servings: row.servings,
    costPerServing:
      row.servings > 0 ? Math.round(row.price / row.servings) : 0,
  }))

  const recipeMap = new Map(recipes.map((recipe) => [recipe.id, recipe]))
  const supplementMap = new Map(
    supplements.map((supplement) => [supplement.id, supplement]),
  )
  const plan: PlanEntry[] = []
  for (const row of planRows.results) {
    if (row.kind === 'meal') {
      const recipe = recipeMap.get(row.ref_id)
      if (!recipe) continue
      plan.push({
        id: row.id,
        day: row.day,
        kind: 'meal',
        refId: row.ref_id,
        name: recipe.name,
        servings: row.servings,
        cost: Math.round(recipe.costPerServing * row.servings),
        eaten: Boolean(row.eaten),
      })
    } else if (row.kind === 'supplement') {
      const supplement = supplementMap.get(row.ref_id)
      if (!supplement) continue
      plan.push({
        id: row.id,
        day: row.day,
        kind: 'supplement',
        refId: row.ref_id,
        name: supplement.name,
        servings: row.servings,
        cost: Math.round(supplement.costPerServing * row.servings),
        eaten: Boolean(row.eaten),
      })
    }
  }

  return {
    month,
    ingredients,
    recipes,
    supplements,
    plan,
    water: waterRows.results.map<WaterLog>((row) => ({
      id: row.id,
      day: row.day,
      amountMl: row.amount_ml,
      loggedAt: row.logged_at,
    })),
    waterGoalMl: goalRow?.water_goal_ml ?? 2000,
  }
}

export function createFoodRoutes() {
  const app = new Hono<FoodContext>()

  app.get('/api/food', async (c) => {
    const month = c.req.query('month')
    if (!month || !MONTH.test(month))
      return c.json({ error: 'เลือกเดือนให้ถูกต้อง' }, 400)
    return c.json(await getFoodData(c.get('db'), c.get('user').sub, month))
  })

  /* ---------------- ingredients ---------------- */

  app.post('/api/ingredients', async (c) => {
    const body: unknown = await c.req.json().catch(() => null)
    if (
      !isRecord(body) ||
      !hasOnly(body, ['name', 'purchaseQuantity', 'purchaseUnit', 'purchasePrice'])
    )
      return c.json({ error: 'ข้อมูลวัตถุดิบไม่ถูกต้อง' }, 400)
    const name = parseName(body.name)
    if (!name) return c.json({ error: 'ชื่อวัตถุดิบต้องมี 1-60 ตัวอักษร' }, 400)
    const purchaseQuantity = parseQuantity(body.purchaseQuantity)
    if (!purchaseQuantity)
      return c.json({ error: 'ปริมาณที่ซื้อต้องมากกว่า 0' }, 400)
    const purchaseUnit = parseUnit(body.purchaseUnit)
    if (!purchaseUnit) return c.json({ error: 'หน่วยไม่ถูกต้อง' }, 400)
    const purchasePrice = parseMoney(body.purchasePrice)
    if (purchasePrice === null)
      return c.json({ error: 'ราคาที่ซื้อไม่ถูกต้อง' }, 400)

    const id = crypto.randomUUID()
    await c
      .get('db')
      .prepare(
        'INSERT INTO ingredients (id, owner_sub, name, purchase_quantity, purchase_unit, purchase_price, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(
        id,
        c.get('user').sub,
        name,
        purchaseQuantity,
        purchaseUnit,
        purchasePrice,
        Date.now(),
      )
      .run()
    return c.json({ id }, 201)
  })

  app.patch('/api/ingredients/:id', async (c) => {
    const body: unknown = await c.req.json().catch(() => null)
    if (
      !isRecord(body) ||
      !hasOnly(body, ['name', 'purchaseQuantity', 'purchaseUnit', 'purchasePrice'])
    )
      return c.json({ error: 'ข้อมูลวัตถุดิบไม่ถูกต้อง' }, 400)
    const name = parseName(body.name)
    if (!name) return c.json({ error: 'ชื่อวัตถุดิบต้องมี 1-60 ตัวอักษร' }, 400)
    const purchaseQuantity = parseQuantity(body.purchaseQuantity)
    if (!purchaseQuantity)
      return c.json({ error: 'ปริมาณที่ซื้อต้องมากกว่า 0' }, 400)
    const purchaseUnit = parseUnit(body.purchaseUnit)
    if (!purchaseUnit) return c.json({ error: 'หน่วยไม่ถูกต้อง' }, 400)
    const purchasePrice = parseMoney(body.purchasePrice)
    if (purchasePrice === null)
      return c.json({ error: 'ราคาที่ซื้อไม่ถูกต้อง' }, 400)

    const row = await c
      .get('db')
      .prepare(
        'UPDATE ingredients SET name = ?, purchase_quantity = ?, purchase_unit = ?, purchase_price = ? WHERE id = ? AND owner_sub = ? RETURNING id',
      )
      .bind(
        name,
        purchaseQuantity,
        purchaseUnit,
        purchasePrice,
        c.req.param('id'),
        c.get('user').sub,
      )
      .first()
    return row
      ? c.json({ ok: true })
      : c.json({ error: 'ไม่พบวัตถุดิบนี้' }, 404)
  })

  app.delete('/api/ingredients/:id', async (c) => {
    const db = c.get('db')
    const owner = c.get('user').sub
    const id = c.req.param('id')
    const used = await db
      .prepare(
        'SELECT COUNT(*) AS count FROM recipe_items WHERE ingredient_id = ? AND owner_sub = ?',
      )
      .bind(id, owner)
      .first<{ count: number }>()
    if ((used?.count ?? 0) > 0)
      return c.json(
        { error: 'วัตถุดิบนี้ถูกใช้ในเมนูอยู่ — แก้หรือลบเมนูก่อน' },
        409,
      )
    const removed = await db
      .prepare('DELETE FROM ingredients WHERE id = ? AND owner_sub = ? RETURNING id')
      .bind(id, owner)
      .first()
    return removed
      ? c.json({ ok: true })
      : c.json({ error: 'ไม่พบวัตถุดิบนี้' }, 404)
  })

  /* ---------------- meal prep ---------------- */

  app.post('/api/recipes', async (c) => {
    const body: unknown = await c.req.json().catch(() => null)
    if (
      !isRecord(body) ||
      !hasOnly(body, ['name', 'servings', 'note', 'items'])
    )
      return c.json({ error: 'ข้อมูลเมนูไม่ถูกต้อง' }, 400)
    const db = c.get('db')
    const owner = c.get('user').sub
    const ingredients = await loadIngredients(db, owner)
    const parsed = parseRecipe(
      body,
      new Map(ingredients.map((item) => [item.id, item])),
    )
    if ('error' in parsed) return c.json({ error: parsed.error }, 400)

    const id = crypto.randomUUID()
    const statements = [
      db
        .prepare(
          'INSERT INTO recipes (id, owner_sub, name, servings, note, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .bind(
          id,
          owner,
          parsed.value.name,
          parsed.value.servings,
          parsed.value.note,
          Date.now(),
        ),
      ...parsed.value.items.map((item, index) =>
        db
          .prepare(
            'INSERT INTO recipe_items (id, recipe_id, owner_sub, name, quantity, unit, price, position, ingredient_id) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)',
          )
          .bind(
            crypto.randomUUID(),
            id,
            owner,
            item.name,
            item.quantity,
            item.unit,
            index,
            item.ingredientId,
          ),
      ),
    ]
    await db.batch(statements)
    return c.json({ id }, 201)
  })

  app.patch('/api/recipes/:id', async (c) => {
    const body: unknown = await c.req.json().catch(() => null)
    if (
      !isRecord(body) ||
      !hasOnly(body, ['name', 'servings', 'note', 'items'])
    )
      return c.json({ error: 'ข้อมูลเมนูไม่ถูกต้อง' }, 400)
    const db = c.get('db')
    const owner = c.get('user').sub
    const ingredients = await loadIngredients(db, owner)
    const parsed = parseRecipe(
      body,
      new Map(ingredients.map((item) => [item.id, item])),
    )
    if ('error' in parsed) return c.json({ error: parsed.error }, 400)

    const id = c.req.param('id')
    const existing = await db
      .prepare('SELECT id FROM recipes WHERE id = ? AND owner_sub = ?')
      .bind(id, owner)
      .first()
    if (!existing) return c.json({ error: 'ไม่พบเมนูนี้' }, 404)

    await db.batch([
      db
        .prepare(
          'UPDATE recipes SET name = ?, servings = ?, note = ? WHERE id = ? AND owner_sub = ?',
        )
        .bind(parsed.value.name, parsed.value.servings, parsed.value.note, id, owner),
      db
        .prepare('DELETE FROM recipe_items WHERE recipe_id = ? AND owner_sub = ?')
        .bind(id, owner),
      ...parsed.value.items.map((item, index) =>
        db
          .prepare(
            'INSERT INTO recipe_items (id, recipe_id, owner_sub, name, quantity, unit, price, position, ingredient_id) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)',
          )
          .bind(
            crypto.randomUUID(),
            id,
            owner,
            item.name,
            item.quantity,
            item.unit,
            index,
            item.ingredientId,
          ),
      ),
    ])
    return c.json({ ok: true })
  })

  app.delete('/api/recipes/:id', async (c) => {
    const db = c.get('db')
    const owner = c.get('user').sub
    const id = c.req.param('id')
    const removed = await db
      .prepare('DELETE FROM recipes WHERE id = ? AND owner_sub = ? RETURNING id')
      .bind(id, owner)
      .first()
    if (!removed) return c.json({ error: 'ไม่พบเมนูนี้' }, 404)
    await db.batch([
      db
        .prepare(
          "DELETE FROM plan_entries WHERE kind = 'meal' AND ref_id = ? AND owner_sub = ?",
        )
        .bind(id, owner),
      db
        .prepare('DELETE FROM recipe_items WHERE recipe_id = ? AND owner_sub = ?')
        .bind(id, owner),
    ])
    return c.json({ ok: true })
  })

  /* ---------------- supplements ---------------- */

  app.post('/api/supplements', async (c) => {
    const body: unknown = await c.req.json().catch(() => null)
    if (!isRecord(body) || !hasOnly(body, ['name', 'price', 'servings']))
      return c.json({ error: 'ข้อมูลอาหารเสริมไม่ถูกต้อง' }, 400)
    const name = parseName(body.name)
    if (!name) return c.json({ error: 'ชื่ออาหารเสริมต้องมี 1-60 ตัวอักษร' }, 400)
    const price = parseMoney(body.price)
    if (price === null) return c.json({ error: 'ราคาไม่ถูกต้อง' }, 400)
    const servings = parseServings(body.servings)
    if (!servings)
      return c.json({ error: 'จำนวนเสิร์ฟต่อภาชนะต้องมากกว่า 0' }, 400)

    const db = c.get('db')
    const id = crypto.randomUUID()
    await db
      .prepare(
        'INSERT INTO supplements (id, owner_sub, name, price, servings, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .bind(id, c.get('user').sub, name, price, servings, Date.now())
      .run()
    return c.json({ id }, 201)
  })

  app.patch('/api/supplements/:id', async (c) => {
    const body: unknown = await c.req.json().catch(() => null)
    if (!isRecord(body) || !hasOnly(body, ['name', 'price', 'servings']))
      return c.json({ error: 'ข้อมูลอาหารเสริมไม่ถูกต้อง' }, 400)
    const name = parseName(body.name)
    if (!name) return c.json({ error: 'ชื่ออาหารเสริมต้องมี 1-60 ตัวอักษร' }, 400)
    const price = parseMoney(body.price)
    if (price === null) return c.json({ error: 'ราคาไม่ถูกต้อง' }, 400)
    const servings = parseServings(body.servings)
    if (!servings)
      return c.json({ error: 'จำนวนเสิร์ฟต่อภาชนะต้องมากกว่า 0' }, 400)

    const row = await c
      .get('db')
      .prepare(
        'UPDATE supplements SET name = ?, price = ?, servings = ? WHERE id = ? AND owner_sub = ? RETURNING id',
      )
      .bind(name, price, servings, c.req.param('id'), c.get('user').sub)
      .first()
    return row
      ? c.json({ ok: true })
      : c.json({ error: 'ไม่พบอาหารเสริมนี้' }, 404)
  })

  app.delete('/api/supplements/:id', async (c) => {
    const db = c.get('db')
    const owner = c.get('user').sub
    const id = c.req.param('id')
    const removed = await db
      .prepare('DELETE FROM supplements WHERE id = ? AND owner_sub = ? RETURNING id')
      .bind(id, owner)
      .first()
    if (!removed) return c.json({ error: 'ไม่พบอาหารเสริมนี้' }, 404)
    await db
      .prepare(
        "DELETE FROM plan_entries WHERE kind = 'supplement' AND ref_id = ? AND owner_sub = ?",
      )
      .bind(id, owner)
      .run()
    return c.json({ ok: true })
  })

  /* ---------------- calendar plan ---------------- */

  app.post('/api/plan', async (c) => {
    const body: unknown = await c.req.json().catch(() => null)
    if (
      !isRecord(body) ||
      !hasOnly(body, ['day', 'kind', 'refId', 'servings'])
    )
      return c.json({ error: 'ข้อมูลตารางอาหารไม่ถูกต้อง' }, 400)
    if (!validDay(body.day))
      return c.json({ error: 'วันที่ไม่ถูกต้อง' }, 400)
    if (body.kind !== 'meal' && body.kind !== 'supplement')
      return c.json({ error: 'ประเภทไม่ถูกต้อง' }, 400)
    if (typeof body.refId !== 'string' || !body.refId)
      return c.json({ error: 'เลือกรายการที่ต้องการเพิ่ม' }, 400)
    const servings =
      'servings' in body ? parseServings(body.servings) : 1
    if (!servings) return c.json({ error: 'จำนวนเสิร์ฟไม่ถูกต้อง' }, 400)

    const kind: PlanKind = body.kind
    const table = kind === 'meal' ? 'recipes' : 'supplements'
    const db = c.get('db')
    const owner = c.get('user').sub
    const source = await db
      .prepare(`SELECT id FROM ${table} WHERE id = ? AND owner_sub = ?`)
      .bind(body.refId, owner)
      .first()
    if (!source) return c.json({ error: 'ไม่พบรายการที่เลือก' }, 404)

    const id = crypto.randomUUID()
    await db
      .prepare(
        'INSERT INTO plan_entries (id, owner_sub, day, kind, ref_id, servings, eaten, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)',
      )
      .bind(id, owner, body.day, kind, body.refId, servings, Date.now())
      .run()
    return c.json({ id }, 201)
  })

  app.patch('/api/plan/:id', async (c) => {
    const body: unknown = await c.req.json().catch(() => null)
    if (
      !isRecord(body) ||
      !hasOnly(body, ['eaten', 'servings']) ||
      !Object.keys(body).length
    )
      return c.json({ error: 'ข้อมูลไม่ถูกต้อง' }, 400)

    const columns: string[] = []
    const values: number[] = []
    if ('eaten' in body) {
      if (typeof body.eaten !== 'boolean')
        return c.json({ error: 'สถานะการกินไม่ถูกต้อง' }, 400)
      columns.push('eaten = ?')
      values.push(body.eaten ? 1 : 0)
    }
    if ('servings' in body) {
      const servings = parseServings(body.servings)
      if (!servings) return c.json({ error: 'จำนวนเสิร์ฟไม่ถูกต้อง' }, 400)
      columns.push('servings = ?')
      values.push(servings)
    }

    const row = await c
      .get('db')
      .prepare(
        `UPDATE plan_entries SET ${columns.join(', ')} WHERE id = ? AND owner_sub = ? RETURNING id`,
      )
      .bind(...values, c.req.param('id'), c.get('user').sub)
      .first()
    return row ? c.json({ ok: true }) : c.json({ error: 'ไม่พบรายการนี้' }, 404)
  })

  app.delete('/api/plan/:id', async (c) => {
    const removed = await c
      .get('db')
      .prepare(
        'DELETE FROM plan_entries WHERE id = ? AND owner_sub = ? RETURNING id',
      )
      .bind(c.req.param('id'), c.get('user').sub)
      .first()
    return removed
      ? c.json({ ok: true })
      : c.json({ error: 'ไม่พบรายการนี้' }, 404)
  })

  /* ---------------- water ---------------- */

  app.post('/api/water', async (c) => {
    const body: unknown = await c.req.json().catch(() => null)
    if (!isRecord(body) || !hasOnly(body, ['day', 'amountMl', 'loggedAt']))
      return c.json({ error: 'ข้อมูลการดื่มน้ำไม่ถูกต้อง' }, 400)
    if (!validDay(body.day)) return c.json({ error: 'วันที่ไม่ถูกต้อง' }, 400)
    const amountMl = body.amountMl
    if (
      typeof amountMl !== 'number' ||
      !Number.isInteger(amountMl) ||
      amountMl <= 0 ||
      amountMl > MAX_WATER
    )
      return c.json({ error: 'ปริมาณน้ำต้องอยู่ระหว่าง 1-5,000 มล.' }, 400)
    const now = Date.now()
    const loggedAt =
      'loggedAt' in body &&
      typeof body.loggedAt === 'number' &&
      Number.isInteger(body.loggedAt) &&
      body.loggedAt >= Date.UTC(2000, 0, 1) &&
      body.loggedAt <= now + 86_400_000
        ? body.loggedAt
        : now

    const id = crypto.randomUUID()
    await c
      .get('db')
      .prepare(
        'INSERT INTO water_logs (id, owner_sub, day, amount_ml, logged_at) VALUES (?, ?, ?, ?, ?)',
      )
      .bind(id, c.get('user').sub, body.day, amountMl, loggedAt)
      .run()
    return c.json({ id }, 201)
  })

  app.delete('/api/water/:id', async (c) => {
    const removed = await c
      .get('db')
      .prepare(
        'DELETE FROM water_logs WHERE id = ? AND owner_sub = ? RETURNING id',
      )
      .bind(c.req.param('id'), c.get('user').sub)
      .first()
    return removed
      ? c.json({ ok: true })
      : c.json({ error: 'ไม่พบรายการนี้' }, 404)
  })

  return app
}
