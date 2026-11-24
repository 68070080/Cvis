import { useState } from 'react'
import type {
  FoodData,
  Ingredient,
  IngredientInput,
  Unit,
} from '../shared/types'
import {
  amountInput,
  money,
  parseAmount,
  parseQuantityInput,
} from './format'
import { UNITS, unitAbbr, unitFactor } from './units'
import { Sheet } from './ui'

export function IngredientsView({
  data,
  busy,
  onSave,
  onDelete,
}: {
  data: FoodData
  busy: boolean
  onSave: (input: IngredientInput, id?: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [editing, setEditing] = useState<Ingredient | 'new' | null>(null)

  return (
    <>
      <section className="card">
        <div className="card-head">
          <div>
            <h2>วัตถุดิบ</h2>
            <p className="muted small">
              เก็บราคาซื้อและปริมาณที่ซื้อ แอพจะคำนวณราคาต่อหน่วยให้เอง
            </p>
          </div>
          <button
            type="button"
            className="chip"
            onClick={() => setEditing('new')}
          >
            + เพิ่ม
          </button>
        </div>
        {data.ingredients.length === 0 && (
          <p className="empty">
            ยังไม่มีวัตถุดิบ — เพิ่มราคาซื้อและปริมาณก่อนสร้างเมนู
          </p>
        )}
      </section>

      {data.ingredients.map((ingredient) => {
        const perUnit =
          ingredient.unitPrice * unitFactor(ingredient.purchaseUnit)
        return (
          <button
            key={ingredient.id}
            type="button"
            className="catrow"
            onClick={() => setEditing(ingredient)}
          >
            <span className="catmain">
              <span>{ingredient.name}</span>
              <span className="muted small">
                ซื้อ {ingredient.purchaseQuantity}{' '}
                {unitAbbr(ingredient.purchaseUnit)} ·{' '}
                {money(ingredient.purchasePrice, true)}
              </span>
            </span>
            <span className="suppprice">
              {money(Math.round(perUnit), true)}
              <span className="muted small">
                /{unitAbbr(ingredient.purchaseUnit)}
              </span>
            </span>
          </button>
        )
      })}

      {editing && (
        <IngredientSheet
          key={editing === 'new' ? 'new' : editing.id}
          initial={editing === 'new' ? null : editing}
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

function IngredientSheet({
  initial,
  busy,
  onClose,
  onSave,
  onDelete,
}: {
  initial: Ingredient | null
  busy: boolean
  onClose: () => void
  onSave: (input: IngredientInput, id?: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [quantity, setQuantity] = useState(
    initial ? String(initial.purchaseQuantity) : '',
  )
  const [unit, setUnit] = useState<Unit>(initial?.purchaseUnit ?? 'g')
  const [price, setPrice] = useState(
    initial && initial.purchasePrice > 0
      ? amountInput(initial.purchasePrice)
      : '',
  )
  const [error, setError] = useState('')

  const purchaseQuantity = parseQuantityInput(quantity)
  const purchasePrice = parseAmount(price)
  const perUnit =
    purchaseQuantity && purchasePrice
      ? Math.round(purchasePrice / purchaseQuantity)
      : null

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!name.trim()) return setError('ใส่ชื่อวัตถุดิบ')
    if (!purchaseQuantity || !purchasePrice)
      return setError('ใส่ปริมาณที่ซื้อและราคาที่ซื้อให้ถูกต้อง')
    setError('')
    await onSave(
      {
        name: name.trim(),
        purchaseQuantity,
        purchaseUnit: unit,
        purchasePrice,
      },
      initial?.id,
    )
  }

  return (
    <Sheet
      title={initial ? 'แก้ไขวัตถุดิบ' : 'เพิ่มวัตถุดิบ'}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="ing-name">ชื่อวัตถุดิบ</label>
          <input
            id="ing-name"
            autoFocus
            maxLength={60}
            value={name}
            placeholder="เช่น อกไก่"
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="ing-qty">ปริมาณที่ซื้อ</label>
          <input
            id="ing-qty"
            inputMode="decimal"
            placeholder="เช่น 1"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="ing-unit">หน่วย</label>
          <select
            id="ing-unit"
            value={unit}
            onChange={(event) => setUnit(event.target.value as Unit)}
          >
            {UNITS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="ing-price">ราคาที่ซื้อมาทั้งหมด (บาท)</label>
          <input
            id="ing-price"
            inputMode="decimal"
            placeholder="เช่น 120"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
          />
        </div>

        {perUnit !== null && (
          <div className="costsummary">
            <div>
              <span className="muted small">ราคาต่อหน่วยที่คำนวณได้</span>
              <strong>
                {money(perUnit)} / {unitAbbr(unit)}
              </strong>
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="formerror">
            {error}
          </p>
        )}
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'กำลังบันทึก…' : 'บันทึกวัตถุดิบ'}
        </button>
        {initial && (
          <button
            type="button"
            className="danger wide"
            disabled={busy}
            onClick={() => void onDelete(initial.id)}
          >
            ลบวัตถุดิบนี้
          </button>
        )}
      </form>
    </Sheet>
  )
}
