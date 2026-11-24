import { useEffect, type ReactNode } from 'react'
import type { Kind, Transaction } from '../shared/types'
import { formatDate, money, monthLabel, shiftMonth } from './format'

export function MonthNav({
  month,
  onChange,
}: {
  month: string
  onChange: (value: string) => void
}) {
  return (
    <div className="monthnav">
      <button
        type="button"
        className="iconbtn"
        aria-label="เดือนก่อนหน้า"
        onClick={() => onChange(shiftMonth(month, -1))}
      >
        ‹
      </button>
      <span>{monthLabel(month)}</span>
      <button
        type="button"
        className="iconbtn"
        aria-label="เดือนถัดไป"
        onClick={() => onChange(shiftMonth(month, 1))}
      >
        ›
      </button>
    </div>
  )
}

export function KindToggle({
  value,
  onChange,
}: {
  value: Kind
  onChange: (kind: Kind) => void
}) {
  return (
    <div className="segmented">
      <button
        type="button"
        className={value === 'expense' ? 'active expense' : ''}
        onClick={() => onChange('expense')}
      >
        รายจ่าย
      </button>
      <button
        type="button"
        className={value === 'income' ? 'active income' : ''}
        onClick={() => onChange('income')}
      >
        รายรับ
      </button>
    </div>
  )
}

export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div className="scrim" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-head">
          <h2>{title}</h2>
          <button
            type="button"
            className="iconbtn"
            aria-label="ปิด"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function TransactionRow({
  transaction,
  onClick,
}: {
  transaction: Transaction
  onClick?: () => void
}) {
  const income = transaction.kind === 'income'
  return (
    <li className="txrow-wrap">
      <button type="button" className="txrow" onClick={onClick}>
        <span className="txmain">
          <span className="txtitle">
            {transaction.categoryName || 'ไม่ระบุหมวด'}
          </span>
          {transaction.note && (
            <span className="txnote">{transaction.note}</span>
          )}
          <span className="txdate">
            {formatDate(transaction.occurredAt)}
          </span>
        </span>
        <span className={income ? 'amount income-text' : 'amount expense-text'}>
          {income ? '+' : '−'}
          {money(transaction.amount, true)}
        </span>
      </button>
    </li>
  )
}
