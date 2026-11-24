import { useState } from 'react'
import type {
  FoodData,
  Supplement,
  SupplementInput,
} from '../shared/types'
import {
  amountInput,
  money,
  parseAmount,
  parseQuantityInput,
} from './format'
import { Sheet } from './ui'

export function SupplementsView({
  data,
  busy,
  onSave,
  onDelete,
}: {
  data: FoodData
  busy: boolean
  onSave: (input: SupplementInput, id?: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [editing, setEditing] = useState<Supplement | 'new' | null>(null)

  return (
    <>
      <section className="card">
        <div className="card-head">
          <div>
            <h2>อาหารเสริม</h2>
            <p className="muted small">
              ใส่ราคาต่อภาชนะและจำนวนเสิร์ฟ ระบบคำนวณราคาต่อเสิร์ฟให้
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
        {data.supplements.length === 0 && (
          <p className="empty">ยังไม่มีอาหารเสริม</p>
        )}
      </section>

      {data.supplements.map((supplement) => (
        <button
          key={supplement.id}
          type="button"
          className="catrow"
          onClick={() => setEditing(supplement)}
        >
          <span className="catmain">
            <span>{supplement.name}</span>
            <span className="muted small">
              {money(supplement.price, true)} · {supplement.servings} เสิร์ฟ
            </span>
          </span>
          <span className="suppprice">
            {money(supplement.costPerServing, true)}
            <span className="muted small">/เสิร์ฟ</span>
          </span>
        </button>
      ))}

      {editing && (
        <SupplementSheet
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

function SupplementSheet({
  initial,
  busy,
  onClose,
  onSave,
  onDelete,
}: {
  initial: Supplement | null
  busy: boolean
  onClose: () => void
  onSave: (input: SupplementInput, id?: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [price, setPrice] = useState(
    initial && initial.price > 0 ? amountInput(initial.price) : '',
  )
  const [servings, setServings] = useState(
    initial ? String(initial.servings) : '',
  )
  const [error, setError] = useState('')

  const priceSatang = parseAmount(price)
  const servingCount = parseQuantityInput(servings)
  const perServing =
    priceSatang && servingCount
      ? Math.round(priceSatang / servingCount)
      : null

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!name.trim()) return setError('ใส่ชื่ออาหารเสริม')
    if (!priceSatang) return setError('ใส่ราคาให้ถูกต้อง')
    if (!servingCount) return setError('จำนวนเสิร์ฟต้องมากกว่า 0')
    setError('')
    await onSave(
      { name: name.trim(), price: priceSatang, servings: servingCount },
      initial?.id,
    )
  }

  return (
    <Sheet
      title={initial ? 'แก้ไขอาหารเสริม' : 'เพิ่มอาหารเสริม'}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="sup-name">ชื่อ</label>
          <input
            id="sup-name"
            autoFocus
            maxLength={60}
            value={name}
            placeholder="เช่น เวย์โปรตีน"
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="sup-price">ราคาต่อภาชนะ (บาท)</label>
          <input
            id="sup-price"
            inputMode="decimal"
            placeholder="0.00"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="sup-servings">จำนวนเสิร์ฟที่ได้ (ช้อน/เม็ด)</label>
          <input
            id="sup-servings"
            inputMode="decimal"
            placeholder="เช่น 30"
            value={servings}
            onChange={(event) => setServings(event.target.value)}
          />
        </div>

        {perServing !== null && (
          <div className="costsummary">
            <div>
              <span className="muted small">ราคาต่อเสิร์ฟ</span>
              <strong>{money(perServing)}</strong>
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="formerror">
            {error}
          </p>
        )}
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'กำลังบันทึก…' : 'บันทึก'}
        </button>
        {initial && (
          <button
            type="button"
            className="danger wide"
            disabled={busy}
            onClick={() => void onDelete(initial.id)}
          >
            ลบอาหารเสริมนี้
          </button>
        )}
      </form>
    </Sheet>
  )
}
