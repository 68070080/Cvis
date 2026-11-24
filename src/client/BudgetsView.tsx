import { useMemo, useState } from 'react'
import type { AppData, Category, CategoryInput, Kind } from '../shared/types'
import { amountInput, money, parseAmount } from './format'
import { KindToggle, Sheet } from './ui'

export function BudgetsView({
  data,
  onSaveCategory,
  onDeleteCategory,
  busy,
}: {
  data: AppData
  onSaveCategory: (input: CategoryInput, id?: string) => Promise<void>
  onDeleteCategory: (id: string) => Promise<void>
  busy: boolean
}) {
  const [kind, setKind] = useState<Kind>('expense')
  const [editing, setEditing] = useState<Category | 'new' | null>(null)
  const categories = data.categories.filter((category) => category.kind === kind)

  const spentByCategory = useMemo(() => {
    const totals = new Map<string, number>()
    for (const transaction of data.transactions) {
      if (!transaction.categoryId) continue
      totals.set(
        transaction.categoryId,
        (totals.get(transaction.categoryId) ?? 0) + transaction.amount,
      )
    }
    return totals
  }, [data.transactions])

  const totalBudget = categories.reduce((sum, item) => sum + item.budget, 0)
  const totalUsed = categories.reduce(
    (sum, item) => sum + (item.budget > 0 ? (spentByCategory.get(item.id) ?? 0) : 0),
    0,
  )
  const ratio = totalBudget > 0 ? Math.min(totalUsed / totalBudget, 1) : 0

  return (
    <>
      <KindToggle value={kind} onChange={setKind} />

      <section className="card">
        <div className="card-head">
          <h2>งบที่ตั้งไว้</h2>
          <span className="chip muted">แยกหมวด</span>
        </div>
        {kind === 'expense' ? (
          <>
            <strong className="big">
              {totalBudget > 0 ? money(totalBudget, true) : 'ยังไม่ได้ตั้งงบ'}
            </strong>
            <div className="progress" aria-hidden="true">
              <span style={{ width: `${ratio * 100}%` }} />
            </div>
            <div className="row-between small muted">
              <span>ใช้ไป {money(totalUsed, true)}</span>
              <span>
                คงเหลือ {money(Math.max(totalBudget - totalUsed, 0), true)}
              </span>
            </div>
          </>
        ) : (
          <strong className="big income-text">
            {money(
              categories.reduce(
                (sum, item) => sum + (spentByCategory.get(item.id) ?? 0),
                0,
              ),
              true,
            )}
          </strong>
        )}
        <div className="cycle">
          <div>
            <span className="muted small">รอบงบ</span>
            <strong>รายเดือน (วันที่ {data.settings.cycleDay})</strong>
          </div>
        </div>
      </section>

      <div className="listhead">
        <span className="muted small">
          {categories.length} หมวด{kind === 'expense' ? 'รายจ่าย' : 'รายรับ'}
        </span>
      </div>

      {categories.map((category) => {
        const used = spentByCategory.get(category.id) ?? 0
        const share =
          category.budget > 0 ? Math.min(used / category.budget, 1) : 0
        return (
          <button
            key={category.id}
            type="button"
            className="catrow"
            onClick={() => setEditing(category)}
          >
            <span className="catmain">
              <span>{category.name}</span>
              <span className="muted small">
                {category.budget > 0
                  ? `งบ ${money(category.budget, true)} · ใช้ ${money(used, true)}`
                  : 'ไม่มีตั้งงบ'}
              </span>
              {category.budget > 0 && (
                <span className="progress thin" aria-hidden="true">
                  <span style={{ width: `${share * 100}%` }} />
                </span>
              )}
            </span>
            <span aria-hidden="true" className="muted">
              ›
            </span>
          </button>
        )
      })}

      <button
        type="button"
        className="primary addcat"
        onClick={() => setEditing('new')}
      >
        + เพิ่มหมวด
      </button>

      {editing && (
        <CategorySheet
          key={editing === 'new' ? `new-${kind}` : editing.id}
          initial={editing === 'new' ? null : editing}
          kind={kind}
          busy={busy}
          onClose={() => setEditing(null)}
          onSave={async (input, id) => {
            await onSaveCategory(input, id)
            setEditing(null)
          }}
          onDelete={async (id) => {
            await onDeleteCategory(id)
            setEditing(null)
          }}
        />
      )}
    </>
  )
}

function CategorySheet({
  initial,
  kind,
  busy,
  onClose,
  onSave,
  onDelete,
}: {
  initial: Category | null
  kind: Kind
  busy: boolean
  onClose: () => void
  onSave: (input: CategoryInput, id?: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [budget, setBudget] = useState(
    initial && initial.budget > 0 ? amountInput(initial.budget) : '',
  )
  const [error, setError] = useState('')

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!name.trim()) return setError('ใส่ชื่อหมวด')
    const satang = budget.trim() ? parseAmount(budget) : 0
    if (satang === null) return setError('งบต้องเป็นตัวเลข เช่น 3000')
    setError('')
    await onSave({ name: name.trim(), kind, budget: satang }, initial?.id)
  }

  return (
    <Sheet title={initial ? 'แก้ไขหมวด' : 'เพิ่มหมวด'} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="cat-name">ชื่อหมวด</label>
          <input
            id="cat-name"
            autoFocus
            maxLength={40}
            value={name}
            placeholder="เช่น อาหาร"
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        {kind === 'expense' && (
          <div className="field">
            <label htmlFor="cat-budget">งบต่อเดือน (บาท) — เว้นว่างได้</label>
            <input
              id="cat-budget"
              inputMode="decimal"
              placeholder="0.00"
              value={budget}
              onChange={(event) => setBudget(event.target.value)}
            />
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
            ลบหมวดนี้ (รายการเดิมจะไม่หาย)
          </button>
        )}
      </form>
    </Sheet>
  )
}
