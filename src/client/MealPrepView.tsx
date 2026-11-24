import { useState } from 'react'
import type {
  FoodData,
  Ingredient,
  Recipe,
  RecipeInput,
  RecipeItem,
  Unit,
} from '../shared/types'
import { money, parseQuantityInput } from './format'
import { UNITS, baseUnit, toBase, unitAbbr } from './units'
import { Sheet } from './ui'

type Row = {
  key: string
  ingredientId: string
  quantity: string
  unit: Unit
}

const emptyRow = (): Row => ({
  key: crypto.randomUUID(),
  ingredientId: '',
  quantity: '',
  unit: 'g',
})

function perPurchaseUnit(ingredient: Ingredient): number {
  return Math.round(
    ingredient.unitPrice *
      (ingredient.purchaseUnit === 'kg' || ingredient.purchaseUnit === 'l'
        ? 1000
        : 1),
  )
}

export function MealPrepView({
  data,
  busy,
  onSave,
  onDelete,
}: {
  data: FoodData
  busy: boolean
  onSave: (input: RecipeInput, id?: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [editing, setEditing] = useState<Recipe | 'new' | null>(null)

  return (
    <>
      <section className="card">
        <div className="card-head">
          <div>
            <h2>Meal prep</h2>
            <p className="muted small">
              เลือกวัตถุดิบจากคลัง ใส่ปริมาณที่ใช้ ราคาจะถูกคำนวณอัตโนมัติ
            </p>
          </div>
          <button
            type="button"
            className="chip"
            onClick={() => setEditing('new')}
          >
            + สร้างเมนู
          </button>
        </div>
        {data.ingredients.length === 0 && (
          <p className="empty">
            ยังไม่มีวัตถุดิบ — เพิ่มที่แท็บ “วัตถุดิบ” ก่อนสร้างเมนู
          </p>
        )}
        {data.recipes.length === 0 && (
          <p className="empty">
            ยังไม่มีเมนู — เริ่มจากสูตรที่คุณกินบ่อย ๆ แล้วเพิ่มลงปฏิทินได้เลย
          </p>
        )}
      </section>

      {data.recipes.map((recipe) => (
        <button
          key={recipe.id}
          type="button"
          className="catrow"
          onClick={() => setEditing(recipe)}
        >
          <span className="catmain">
            <span>{recipe.name}</span>
            <span className="muted small">
              {recipe.items.length} วัตถุดิบ · {recipe.servings} เสิร์ฟ ·{' '}
              {money(recipe.costPerServing, true)}/เสิร์ฟ
            </span>
            {recipe.items.length > 0 && (
              <span className="muted small">
                {recipe.items
                  .map(
                    (item) =>
                      `${item.name} ${item.quantity} ${unitAbbr(item.unit)}`,
                  )
                  .join(' · ')}
              </span>
            )}
          </span>
          <span aria-hidden="true" className="muted">
            ›
          </span>
        </button>
      ))}

      {editing && (
        <RecipeSheet
          key={editing === 'new' ? 'new' : editing.id}
          initial={editing === 'new' ? null : editing}
          ingredients={data.ingredients}
          busy={busy}
          onClose={() => setEditing(null)}
          onSave={async (input, id) => {
            await onSave(input, id)
            setEditing(null)
          }}
          onDelete={async (id) => {
            await onDelete(id)
            setEditing(null)
          }}
        />
      )}
    </>
  )
}

function RecipeSheet({
  initial,
  ingredients,
  busy,
  onClose,
  onSave,
  onDelete,
}: {
  initial: Recipe | null
  ingredients: Ingredient[]
  busy: boolean
  onClose: () => void
  onSave: (input: RecipeInput, id?: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [servings, setServings] = useState(
    initial ? String(initial.servings) : '1',
  )
  const [note, setNote] = useState(initial?.note ?? '')
  const [rows, setRows] = useState<Row[]>(() => {
    if (!initial || !initial.items.length) return [emptyRow()]
    return initial.items.map((item: RecipeItem) => ({
      key: item.id,
      ingredientId: item.ingredientId,
      quantity: String(item.quantity),
      unit: item.unit,
    }))
  })
  const [error, setError] = useState('')

  function rowCost(row: Row): number {
    const ingredient = ingredients.find((item) => item.id === row.ingredientId)
    const quantity = parseQuantityInput(row.quantity)
    if (!ingredient || !quantity) return 0
    return Math.round(toBase(quantity, row.unit) * ingredient.unitPrice)
  }

  const total = rows.reduce((sum, row) => sum + rowCost(row), 0)
  const portion = parseQuantityInput(servings) ?? 0

  function update(key: string, patch: Partial<Row>) {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    )
  }

  function pickIngredient(key: string, ingredientId: string) {
    const ingredient = ingredients.find((item) => item.id === ingredientId)
    update(key, {
      ingredientId,
      unit: ingredient ? baseUnit(ingredient.purchaseUnit) : 'g',
    })
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!name.trim()) return setError('ใส่ชื่อเมนู')
    const servingsValue = parseQuantityInput(servings)
    if (!servingsValue) return setError('จำนวนเสิร์ฟต้องมากกว่า 0')

    const items: RecipeInput['items'] = []
    for (const row of rows) {
      if (!row.ingredientId && !row.quantity.trim()) continue
      if (!row.ingredientId) return setError('เลือกวัตถุดิบให้ครบทุกแถว')
      const quantity = parseQuantityInput(row.quantity)
      if (!quantity) return setError('ใส่ปริมาณที่ใช้ให้ครบทุกแถว')
      items.push({
        ingredientId: row.ingredientId,
        quantity,
        unit: row.unit,
      })
    }
    if (!items.length) return setError('เพิ่มวัตถุดิบอย่างน้อย 1 รายการ')

    setError('')
    await onSave(
      { name: name.trim(), servings: servingsValue, note: note.trim(), items },
      initial?.id,
    )
  }

  return (
    <Sheet
      title={initial ? 'แก้ไขเมนู' : 'สร้างเมนู meal prep'}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="recipe-name">ชื่อเมนู</label>
          <input
            id="recipe-name"
            autoFocus
            maxLength={60}
            value={name}
            placeholder="เช่น ข้าวกล้องอกไก่"
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="recipe-servings">
            จำนวนเสิร์ฟที่ทำได้ (เช่น 4 มื้อ)
          </label>
          <input
            id="recipe-servings"
            inputMode="decimal"
            value={servings}
            onChange={(event) => setServings(event.target.value)}
          />
        </div>

        <div className="field">
          <label>วัตถุดิบ — เลือกจากคลังและใส่ปริมาณที่ใช้</label>
          {ingredients.length === 0 && (
            <p className="muted small">
              ยังไม่มีวัตถุดิบในคลัง — เพิ่มที่แท็บ “วัตถุดิบ” ก่อน
            </p>
          )}
          <div className="ingrows">
            {rows.map((row) => {
              const ingredient = ingredients.find(
                (item) => item.id === row.ingredientId,
              )
              return (
                <div className="ingrow" key={row.key}>
                  <select
                    aria-label="วัตถุดิบ"
                    value={row.ingredientId}
                    onChange={(event) =>
                      pickIngredient(row.key, event.target.value)
                    }
                  >
                    <option value="">— เลือกวัตถุดิบ —</option>
                    {ingredients.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} · {money(perPurchaseUnit(item), true)}/
                        {unitAbbr(item.purchaseUnit)}
                      </option>
                    ))}
                  </select>
                  <input
                    aria-label="ปริมาณที่ใช้"
                    inputMode="decimal"
                    placeholder="ปริมาณ"
                    value={row.quantity}
                    onChange={(event) =>
                      update(row.key, { quantity: event.target.value })
                    }
                  />
                  <select
                    aria-label="หน่วยที่ใช้"
                    value={row.unit}
                    onChange={(event) =>
                      update(row.key, { unit: event.target.value as Unit })
                    }
                  >
                    {UNITS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  <span className="ingcost">
                    {ingredient ? money(rowCost(row), true) : '—'}
                  </span>
                  <button
                    type="button"
                    className="iconbtn"
                    aria-label="ลบวัตถุดิบ"
                    onClick={() =>
                      setRows((current) =>
                        current.length > 1
                          ? current.filter((item) => item.key !== row.key)
                          : current,
                      )
                    }
                  >
                    ✕
                  </button>
                </div>
              )
            })}
          </div>
          <button
            type="button"
            className="ghost wide"
            onClick={() => setRows((current) => [...current, emptyRow()])}
          >
            + เพิ่มวัตถุดิบ
          </button>
        </div>

        <div className="costsummary">
          <div>
            <span className="muted small">ต้นทุนวัตถุดิบรวม</span>
            <strong>{money(total, true)}</strong>
          </div>
          <div className="right">
            <span className="muted small">ต่อเสิร์ฟ</span>
            <strong>
              {portion > 0 ? money(Math.round(total / portion), true) : '—'}
            </strong>
          </div>
        </div>

        <div className="field">
          <label htmlFor="recipe-note">บันทึก (ไม่บังคับ)</label>
          <input
            id="recipe-note"
            maxLength={200}
            value={note}
            placeholder="เช่น ทำทีเดียว 4 มื้อ"
            onChange={(event) => setNote(event.target.value)}
          />
        </div>

        {error && (
          <p role="alert" className="formerror">
            {error}
          </p>
        )}
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'กำลังบันทึก…' : 'บันทึกเมนู'}
        </button>
        {initial && (
          <button
            type="button"
            className="danger wide"
            disabled={busy}
            onClick={() => void onDelete(initial.id)}
          >
            ลบเมนูนี้ (รายการในปฏิทินจะถูกลบด้วย)
          </button>
        )}
      </form>
    </Sheet>
  )
}
