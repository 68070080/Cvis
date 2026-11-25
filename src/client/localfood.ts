import type {
  FoodData,
  Ingredient,
  PlanEntry,
  Recipe,
  RecipeItem,
  Supplement,
  WaterLog,
} from '../shared/types'
import {
  MONTH,
  fail,
  hasOnly,
  isRecord,
  nextMonth,
  parseMoney,
  parseName,
  parseQuantity,
  parseServings,
  parseUnit,
  unitFactor,
  validDay,
} from './dataguard'
import * as store from './localstore'

const MAX_WATER = 5000
const MAX_ITEMS = 50

async function loadIngredients(): Promise<{
  list: Ingredient[]
  map: Map<string, Ingredient>
  rows: store.IngredientRecord[]
}> {
  const rows = (await store.getAll<store.IngredientRecord>('ingredients')).sort(
    (a, b) => b.createdAt - a.createdAt || a.name.localeCompare(b.name, 'th'),
  )
  const list = rows.map<Ingredient>((row) => {
    const unit = row.purchaseUnit
    const baseQuantity = row.purchaseQuantity * unitFactor(unit)
    return {
      id: row.id,
      name: row.name,
      purchaseQuantity: row.purchaseQuantity,
      purchaseUnit: unit,
      purchasePrice: row.purchasePrice,
      unitPrice: baseQuantity > 0 ? row.purchasePrice / baseQuantity : 0,
    }
  })
  return { list, map: new Map(list.map((item) => [item.id, item])), rows }
}

/** Computes each recipe's cost from the current ingredient prices. */
async function loadRecipes(ingredients: Map<string, Ingredient>): Promise<{
  list: Recipe[]
  rows: store.RecipeRecord[]
}> {
  const rows = (await store.getAll<store.RecipeRecord>('recipes')).sort(
    (a, b) => b.createdAt - a.createdAt,
  )
  const list = rows.map<Recipe>((row) => {
    const items = row.items.map<RecipeItem>((item, index) => {
      const ingredient = ingredients.get(item.ingredientId)
      return {
        id: `${row.id}:${index}`,
        ingredientId: item.ingredientId,
        name: ingredient?.name ?? 'วัตถุดิบที่ถูกลบ',
        quantity: item.quantity,
        unit: item.unit,
        cost: ingredient
          ? Math.round(item.quantity * unitFactor(item.unit) * ingredient.unitPrice)
          : 0,
      }
    })
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
  return { list, rows }
}

export async function getFoodDataLocal(month: string): Promise<FoodData> {
  const start = `${month}-01`
  const end = nextMonth(month)
  const { map, list: ingredients } = await loadIngredients()
  const [{ list: recipes }, supplementRows, planRows, waterRows, settings] =
    await Promise.all([
      loadRecipes(map),
      store.getAll<store.SupplementRecord>('supplements'),
      store.getAll<store.PlanRecord>('plan'),
      store.getAll<store.WaterRecord>('water'),
      store.readSettings(),
    ])

  const supplements = supplementRows
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .map<Supplement>((row) => ({
      id: row.id,
      name: row.name,
      price: row.price,
      servings: row.servings,
      costPerServing: row.servings > 0 ? Math.round(row.price / row.servings) : 0,
    }))

  const recipeMap = new Map(recipes.map((recipe) => [recipe.id, recipe]))
  const supplementMap = new Map(supplements.map((item) => [item.id, item]))
  const plan: PlanEntry[] = planRows
    .filter((row) => row.day >= start && row.day < end)
    .sort((a, b) => a.day.localeCompare(b.day) || a.createdAt - b.createdAt)
    .flatMap<PlanEntry>((row) => {
      if (row.kind === 'meal') {
        const recipe = recipeMap.get(row.refId)
        if (!recipe) return []
        return [
          {
            id: row.id,
            day: row.day,
            kind: 'meal',
            refId: row.refId,
            name: recipe.name,
            servings: row.servings,
            cost: Math.round(recipe.costPerServing * row.servings),
            eaten: row.eaten,
          },
        ]
      }
      const supplement = supplementMap.get(row.refId)
      if (!supplement) return []
      return [
        {
          id: row.id,
          day: row.day,
          kind: 'supplement',
          refId: row.refId,
          name: supplement.name,
          servings: row.servings,
          cost: Math.round(supplement.costPerServing * row.servings),
          eaten: row.eaten,
        },
      ]
    })

  return {
    month,
    ingredients,
    recipes,
    supplements,
    plan,
    water: waterRows
      .filter((row) => row.day >= start && row.day < end)
      .sort((a, b) => a.day.localeCompare(b.day) || a.loggedAt - b.loggedAt)
      .map<WaterLog>((row) => ({
        id: row.id,
        day: row.day,
        amountMl: row.amountMl,
        loggedAt: row.loggedAt,
      })),
    waterGoalMl: settings.waterGoalMl,
  }
}

function parseItems(
  value: unknown,
  ingredients: Map<string, Ingredient>,
): store.RecipeItemRecord[] | null {
  if (!Array.isArray(value) || value.length > MAX_ITEMS) return null
  const items: store.RecipeItemRecord[] = []
  for (const raw of value) {
    if (!isRecord(raw) || !hasOnly(raw, ['ingredientId', 'quantity', 'unit']))
      return null
    if (typeof raw.ingredientId !== 'string') return null
    const ingredient = ingredients.get(raw.ingredientId)
    if (!ingredient) return null
    const quantity = parseQuantity(raw.quantity)
    const unit = parseUnit(raw.unit)
    if (!quantity || !unit) return null
    items.push({ ingredientId: ingredient.id, quantity, unit })
  }
  return items
}

function parseRecipe(
  body: Record<string, unknown>,
  ingredients: Map<string, Ingredient>,
):
  | { error: string }
  | {
      value: {
        name: string
        servings: number
        note: string
        items: store.RecipeItemRecord[]
      }
    } {
  const name = parseName(body.name)
  if (!name) return { error: 'ชื่อเมนูต้องมี 1-60 ตัวอักษร' }
  const servings = parseServings(body.servings)
  if (!servings) return { error: 'จำนวนเสิร์ฟต้องมากกว่า 0' }
  const note = 'note' in body ? body.note : ''
  if (typeof note !== 'string' || note.length > 200)
    return { error: 'บันทึกต้องไม่เกิน 200 ตัวอักษร' }
  const items = parseItems('items' in body ? body.items : [], ingredients)
  if (!items)
    return { error: 'วัตถุดิบไม่ถูกต้อง — เลือกวัตถุดิบจากคลังและใส่ปริมาณ' }
  return { value: { name, servings, note: note.trim(), items } }
}

export async function foodRoute(
  method: string,
  segments: string[],
  url: URL,
  body: unknown,
): Promise<unknown | undefined> {
  const [head, id] = segments

  if (head === 'food' && method === 'GET') {
    const month = url.searchParams.get('month')
    if (!month || !MONTH.test(month)) fail('เลือกเดือนให้ถูกต้อง')
    return getFoodDataLocal(month)
  }

  /* ---------------- ingredients ---------------- */

  if (head === 'ingredients') {
    if (method === 'POST' || (method === 'PATCH' && id)) {
      if (
        !isRecord(body) ||
        !hasOnly(body, ['name', 'purchaseQuantity', 'purchaseUnit', 'purchasePrice'])
      )
        fail('ข้อมูลวัตถุดิบไม่ถูกต้อง')
      const name = parseName(body.name)
      if (!name) fail('ชื่อวัตถุดิบต้องมี 1-60 ตัวอักษร')
      const purchaseQuantity = parseQuantity(body.purchaseQuantity)
      if (!purchaseQuantity) fail('ปริมาณที่ซื้อต้องมากกว่า 0')
      const purchaseUnit = parseUnit(body.purchaseUnit)
      if (!purchaseUnit) fail('หน่วยไม่ถูกต้อง')
      const purchasePrice = parseMoney(body.purchasePrice)
      if (purchasePrice === null) fail('ราคาที่ซื้อไม่ถูกต้อง')

      if (method === 'POST') {
        const record: store.IngredientRecord = {
          id: crypto.randomUUID(),
          name,
          purchaseQuantity,
          purchaseUnit,
          purchasePrice,
          createdAt: Date.now(),
        }
        await store.writeAll([{ type: 'put', store: 'ingredients', value: record }])
        return { id: record.id }
      }
      const rows = await store.getAll<store.IngredientRecord>('ingredients')
      const existing = rows.find((row) => row.id === id)
      if (!existing) fail('ไม่พบวัตถุดิบนี้', 404)
      await store.writeAll([
        {
          type: 'put',
          store: 'ingredients',
          value: { ...existing, name, purchaseQuantity, purchaseUnit, purchasePrice },
        },
      ])
      return { ok: true }
    }

    if (method === 'DELETE' && id) {
      const recipes = await store.getAll<store.RecipeRecord>('recipes')
      if (recipes.some((recipe) => recipe.items.some((item) => item.ingredientId === id)))
        fail('วัตถุดิบนี้ถูกใช้ในเมนูอยู่ — แก้หรือลบเมนูก่อน', 409)
      const rows = await store.getAll<store.IngredientRecord>('ingredients')
      if (!rows.some((row) => row.id === id)) fail('ไม่พบวัตถุดิบนี้', 404)
      await store.writeAll([{ type: 'delete', store: 'ingredients', key: id }])
      return { ok: true }
    }
  }

  /* ---------------- meal prep ---------------- */

  if (head === 'recipes') {
    if (method === 'POST' || (method === 'PATCH' && id)) {
      if (!isRecord(body) || !hasOnly(body, ['name', 'servings', 'note', 'items']))
        fail('ข้อมูลเมนูไม่ถูกต้อง')
      const { map } = await loadIngredients()
      const parsed = parseRecipe(body, map)
      if ('error' in parsed) fail(parsed.error)

      if (method === 'POST') {
        const record: store.RecipeRecord = {
          id: crypto.randomUUID(),
          ...parsed.value,
          createdAt: Date.now(),
        }
        await store.writeAll([{ type: 'put', store: 'recipes', value: record }])
        return { id: record.id }
      }
      const rows = await store.getAll<store.RecipeRecord>('recipes')
      const existing = rows.find((row) => row.id === id)
      if (!existing) fail('ไม่พบเมนูนี้', 404)
      await store.writeAll([
        { type: 'put', store: 'recipes', value: { ...existing, ...parsed.value } },
      ])
      return { ok: true }
    }

    if (method === 'DELETE' && id) {
      const rows = await store.getAll<store.RecipeRecord>('recipes')
      if (!rows.some((row) => row.id === id)) fail('ไม่พบเมนูนี้', 404)
      const plan = await store.getAll<store.PlanRecord>('plan')
      await store.writeAll([
        { type: 'delete', store: 'recipes', key: id },
        ...plan
          .filter((entry) => entry.kind === 'meal' && entry.refId === id)
          .map((entry) => ({ type: 'delete' as const, store: 'plan' as const, key: entry.id })),
      ])
      return { ok: true }
    }
  }

  /* ---------------- supplements ---------------- */

  if (head === 'supplements') {
    if (method === 'POST' || (method === 'PATCH' && id)) {
      if (!isRecord(body) || !hasOnly(body, ['name', 'price', 'servings']))
        fail('ข้อมูลอาหารเสริมไม่ถูกต้อง')
      const name = parseName(body.name)
      if (!name) fail('ชื่ออาหารเสริมต้องมี 1-60 ตัวอักษร')
      const price = parseMoney(body.price)
      if (price === null) fail('ราคาไม่ถูกต้อง')
      const servings = parseServings(body.servings)
      if (!servings) fail('จำนวนเสิร์ฟต่อภาชนะต้องมากกว่า 0')

      if (method === 'POST') {
        const record: store.SupplementRecord = {
          id: crypto.randomUUID(),
          name,
          price,
          servings,
          createdAt: Date.now(),
        }
        await store.writeAll([{ type: 'put', store: 'supplements', value: record }])
        return { id: record.id }
      }
      const rows = await store.getAll<store.SupplementRecord>('supplements')
      const existing = rows.find((row) => row.id === id)
      if (!existing) fail('ไม่พบอาหารเสริมนี้', 404)
      await store.writeAll([
        { type: 'put', store: 'supplements', value: { ...existing, name, price, servings } },
      ])
      return { ok: true }
    }

    if (method === 'DELETE' && id) {
      const rows = await store.getAll<store.SupplementRecord>('supplements')
      if (!rows.some((row) => row.id === id)) fail('ไม่พบอาหารเสริมนี้', 404)
      const plan = await store.getAll<store.PlanRecord>('plan')
      await store.writeAll([
        { type: 'delete', store: 'supplements', key: id },
        ...plan
          .filter((entry) => entry.kind === 'supplement' && entry.refId === id)
          .map((entry) => ({ type: 'delete' as const, store: 'plan' as const, key: entry.id })),
      ])
      return { ok: true }
    }
  }

  /* ---------------- calendar plan ---------------- */

  if (head === 'plan') {
    if (method === 'POST') {
      if (!isRecord(body) || !hasOnly(body, ['day', 'kind', 'refId', 'servings']))
        fail('ข้อมูลตารางอาหารไม่ถูกต้อง')
      if (!validDay(body.day)) fail('วันที่ไม่ถูกต้อง')
      if (body.kind !== 'meal' && body.kind !== 'supplement')
        fail('ประเภทไม่ถูกต้อง')
      if (typeof body.refId !== 'string' || !body.refId)
        fail('เลือกรายการที่ต้องการเพิ่ม')
      const servings = 'servings' in body ? parseServings(body.servings) : 1
      if (!servings) fail('จำนวนเสิร์ฟไม่ถูกต้อง')

      const kind = body.kind
      const source =
        kind === 'meal'
          ? await store.getAll<store.RecipeRecord>('recipes')
          : await store.getAll<store.SupplementRecord>('supplements')
      if (!source.some((row) => row.id === body.refId)) fail('ไม่พบรายการที่เลือก', 404)

      const record: store.PlanRecord = {
        id: crypto.randomUUID(),
        day: body.day,
        kind,
        refId: body.refId,
        servings,
        eaten: false,
        createdAt: Date.now(),
      }
      await store.writeAll([{ type: 'put', store: 'plan', value: record }])
      return { id: record.id }
    }

    if (method === 'PATCH' && id) {
      if (
        !isRecord(body) ||
        !hasOnly(body, ['eaten', 'servings']) ||
        !Object.keys(body).length
      )
        fail('ข้อมูลไม่ถูกต้อง')
      const rows = await store.getAll<store.PlanRecord>('plan')
      const existing = rows.find((row) => row.id === id)
      if (!existing) fail('ไม่พบรายการนี้', 404)
      const next = { ...existing }
      if ('eaten' in body) {
        if (typeof body.eaten !== 'boolean') fail('สถานะการกินไม่ถูกต้อง')
        next.eaten = body.eaten
      }
      if ('servings' in body) {
        const servings = parseServings(body.servings)
        if (!servings) fail('จำนวนเสิร์ฟไม่ถูกต้อง')
        next.servings = servings
      }
      await store.writeAll([{ type: 'put', store: 'plan', value: next }])
      return { ok: true }
    }

    if (method === 'DELETE' && id) {
      const rows = await store.getAll<store.PlanRecord>('plan')
      if (!rows.some((row) => row.id === id)) fail('ไม่พบรายการนี้', 404)
      await store.writeAll([{ type: 'delete', store: 'plan', key: id }])
      return { ok: true }
    }
  }

  /* ---------------- water ---------------- */

  if (head === 'water') {
    if (method === 'POST') {
      if (!isRecord(body) || !hasOnly(body, ['day', 'amountMl', 'loggedAt']))
        fail('ข้อมูลการดื่มน้ำไม่ถูกต้อง')
      if (!validDay(body.day)) fail('วันที่ไม่ถูกต้อง')
      const amountMl = body.amountMl
      if (
        typeof amountMl !== 'number' ||
        !Number.isInteger(amountMl) ||
        amountMl <= 0 ||
        amountMl > MAX_WATER
      )
        fail('ปริมาณน้ำต้องอยู่ระหว่าง 1-5,000 มล.')
      const now = Date.now()
      const loggedAt =
        'loggedAt' in body &&
        typeof body.loggedAt === 'number' &&
        Number.isInteger(body.loggedAt) &&
        body.loggedAt >= Date.UTC(2000, 0, 1) &&
        body.loggedAt <= now + 86_400_000
          ? body.loggedAt
          : now
      const record: store.WaterRecord = {
        id: crypto.randomUUID(),
        day: body.day,
        amountMl,
        loggedAt,
      }
      await store.writeAll([{ type: 'put', store: 'water', value: record }])
      return { id: record.id }
    }

    if (method === 'DELETE' && id) {
      const rows = await store.getAll<store.WaterRecord>('water')
      if (!rows.some((row) => row.id === id)) fail('ไม่พบรายการนี้', 404)
      await store.writeAll([{ type: 'delete', store: 'water', key: id }])
      return { ok: true }
    }
  }

  return undefined
}
