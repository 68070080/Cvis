import { useState } from 'react'
import type { AppData, Session } from '../shared/types'
import { formatDate, money, periodLabel } from './format'
import { MonthNav, TransactionRow } from './ui'

export function SummaryView({
  data,
  session,
  month,
  onMonth,
  onOpenAll,
}: {
  data: AppData
  session: Session
  month: string
  onMonth: (value: string) => void
  onOpenAll: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const { summary, settings } = data
  const name = settings.displayName || session.user?.name || 'คุณ'
  const remaining = summary.budgetTotal - summary.budgetUsed
  const ratio =
    summary.budgetTotal > 0
      ? Math.min(summary.budgetUsed / summary.budgetTotal, 1)
      : 0
  const latest = data.transactions.slice(0, 5)

  return (
    <>
      <section className="card profile">
        <div className="avatar" aria-hidden="true">
          {name.trim().charAt(0) || 'C'}
        </div>
        <div>
          <h1>{name}</h1>
          <p className="muted small">สมาชิกฟรี</p>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>สรุป</h2>
          <MonthNav month={month} onChange={onMonth} />
        </div>
        <p className="period muted small">{periodLabel(month)}</p>

        <div className="savings">
          <span className="muted small">เหลือเก็บ</span>
          <strong className={summary.savings >= 0 ? 'income-text big' : 'expense-text big'}>
            {money(summary.savings)}
          </strong>
        </div>

        <div className="pair">
          <div className="tile expense-tile">
            <span className="small">รายจ่าย</span>
            <strong>{money(summary.expense)}</strong>
          </div>
          <div className="tile income-tile">
            <span className="small">รายรับ</span>
            <strong>{money(summary.income)}</strong>
          </div>
        </div>

        <button
          type="button"
          className="ghost wide"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'ย่อ' : 'ดูเพิ่ม'}
          <span aria-hidden="true">{expanded ? '⌃' : '⌄'}</span>
        </button>

        {expanded && (
          <div className="extra">
            <div className="row-between">
              <span className="muted small">งบที่ตั้งไว้เดือนนี้</span>
              <span>{money(summary.budgetTotal, true)}</span>
            </div>
            <div className="row-between">
              <span className="muted small">ใช้ไปกับหมวดที่มีงบ</span>
              <span>{money(summary.budgetUsed, true)}</span>
            </div>
            <div className="progress" aria-hidden="true">
              <span style={{ width: `${ratio * 100}%` }} />
            </div>
            <div className="row-between">
              <span className="muted small">คงเหลืองบ</span>
              <strong>{money(Math.max(remaining, 0), true)}</strong>
            </div>
            <div className="row-between">
              <span className="muted small">จำนวนรายการ</span>
              <span>{data.transactions.length}</span>
            </div>
          </div>
        )}
      </section>

      <section>
        <div className="card-head">
          <h2>รายการล่าสุด</h2>
          <button type="button" className="chip" onClick={onOpenAll}>
            ดูทั้งหมด
          </button>
        </div>
        {latest.length ? (
          <ul className="txlist">
            {latest.map((transaction) => (
              <TransactionRow
                key={transaction.id}
                transaction={transaction}
                onClick={onOpenAll}
              />
            ))}
          </ul>
        ) : (
          <p className="empty">ยังไม่มีรายการในเดือนนี้ — กด + ที่หน้าแรก</p>
        )}
        {latest.length > 0 && (
          <p className="muted small center">
            ล่าสุด {formatDate(latest[0]!.occurredAt)}
          </p>
        )}
      </section>
    </>
  )
}
