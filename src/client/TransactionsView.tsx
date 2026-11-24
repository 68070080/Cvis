import { useState } from 'react'
import type {
  AppData,
  Category,
  Kind,
  Transaction,
  TransactionInput,
} from '../shared/types'
import {
  amountInput,
  dateInput,
  defaultDate,
  formatDate,
  money,
  parseAmount,
  parseDateInput,
} from './format'
import { KindToggle, MonthNav, Sheet, TransactionRow } from './ui'

type Filter = 'all' | Kind

export function TransactionsView({
  data,
  month,
  onMonth,
  onSave,
  onDelete,
  busy,
}: {
  data: AppData
  month: string
  onMonth: (value: string) => void
  onSave: (input: TransactionInput, id?: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  busy: boolean
}) {
  const [filter, setFilter] = useState<Filter>('all')
  const [editing, setEditing] = useState<Transaction | 'new' | null>(null)
  const items = data.transactions.filter(
    (transaction) => filter === 'all' || transaction.kind === filter,
  )
  const groups: { day: string; items: Transaction[] }[] = []
  for (const transaction of items) {
    const key = dateInput(transaction.occurredAt)
    const last = groups[groups.length - 1]
    if (last && last.day === key) last.items.push(transaction)
    else groups.push({ day: key, items: [transaction] })
  }

  return (
    <>
      <section className="card">
        <div className="card-head">
          <h2>รายการ</h2>
          <MonthNav month={month} onChange={onMonth} />
        </div>
        <div className="chips">
          {(
            [
              ['all', 'ทั้งหมด'],
              ['expense', 'รายจ่าย'],
              ['income', 'รายรับ'],
            ] as [Filter, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={filter === value ? 'chip active' : 'chip'}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {groups.length ? (
        groups.map((group) => (
          <section key={group.day} className="daygroup">
            <h3 className="daylabel">{formatDate(group.items[0]!.occurredAt)}</h3>
            <ul className="txlist">
              {group.items.map((transaction) => (
                <TransactionRow
                  key={transaction.id}
                  transaction={transaction}
                  onClick={() => setEditing(transaction)}
                />
              ))}
            </ul>
          </section>
        ))
      ) : (
        <p className="empty">ไม่มีข้อมูลรายการ</p>
      )}

      <button
        type="button"
        className="fab"
        aria-label="เพิ่มรายการ"
        onClick={() => setEditing('new')}
      >
        +
      </button>

      {editing && (
        <TransactionSheet
          key={editing === 'new' ? 'new' : editing.id}
          initial={editing === 'new' ? null : editing}
          categories={data.categories}
          month={month}
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

function TransactionSheet({
  initial,
  categories,
  month,
  busy,
  onClose,
  onSave,
  onDelete,
}: {
  initial: Transaction | null
  categories: Category[]
  month: string
  busy: boolean
  onClose: () => void
  onSave: (input: TransactionInput, id?: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [kind, setKind] = useState<Kind>(initial?.kind ?? 'expense')
  const [amount, setAmount] = useState(initial ? amountInput(initial.amount) : '')
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? '')
  const [note, setNote] = useState(initial?.note ?? '')
  const [date, setDate] = useState(
    dateInput(initial?.occurredAt ?? defaultDate(month)),
  )
  const [error, setError] = useState('')
  const options = categories.filter((category) => category.kind === kind)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const satang = parseAmount(amount)
    if (!satang) return setError('ใส่จำนวนเงินให้ถูกต้อง')
    const occurredAt = parseDateInput(date)
    if (!occurredAt) return setError('เลือกวันที่ให้ถูกต้อง')
    const validCategory = options.some((option) => option.id === categoryId)
    setError('')
    await onSave(
      {
        kind,
        amount: satang,
        categoryId: validCategory ? categoryId : null,
        note: note.trim(),
        occurredAt,
      },
      initial?.id,
    )
  }

  return (
    <Sheet title={initial ? 'แก้ไขรายการ' : 'เพิ่มรายการ'} onClose={onClose}>
      <form onSubmit={submit}>
        <KindToggle
          value={kind}
          onChange={(next) => {
            setKind(next)
            setCategoryId('')
          }}
        />
        <div className="field">
          <label htmlFor="tx-amount">จำนวนเงิน (บาท)</label>
          <input
            id="tx-amount"
            inputMode="decimal"
            placeholder="0.00"
            autoFocus
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="tx-category">หมวด</label>
          <select
            id="tx-category"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            <option value="">ไม่ระบุหมวด</option>
            {options.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="tx-date">วันที่</label>
          <input
            id="tx-date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="tx-note">บันทึก (ไม่บังคับ)</label>
          <input
            id="tx-note"
            maxLength={200}
            value={note}
            placeholder="เช่น ข้าวเที่ยงกับเพื่อน"
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
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
            ลบรายการนี้
          </button>
        )}
      </form>
    </Sheet>
  )
}
