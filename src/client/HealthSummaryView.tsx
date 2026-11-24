import { useMemo } from 'react'
import type { FoodData } from '../shared/types'
import { daysOfMonth, money, WEEKDAYS } from './format'
import { ingredientUsage } from './foodCalc'
import { formatBase } from './units'
import { MonthNav } from './ui'

type Totals = { ingredient: number; supplement: number; water: number }

const emptyTotals = (): Totals => ({ ingredient: 0, supplement: 0, water: 0 })

export function HealthSummaryView({
  data,
  month,
  onMonth,
}: {
  data: FoodData
  month: string
  onMonth: (value: string) => void
}) {
  const days = useMemo(() => daysOfMonth(month), [month])

  const perDay = useMemo(() => {
    const map = new Map<string, Totals>()
    const get = (day: string) => {
      const found = map.get(day)
      if (found) return found
      const next = emptyTotals()
      map.set(day, next)
      return next
    }
    for (const entry of data.plan) {
      if (entry.kind === 'meal') get(entry.day).ingredient += entry.cost
      else get(entry.day).supplement += entry.cost
    }
    for (const log of data.water) get(log.day).water += log.amountMl
    return map
  }, [data.plan, data.water])

  const total = useMemo(() => {
    const sum = emptyTotals()
    for (const entry of data.plan) {
      if (entry.kind === 'meal') sum.ingredient += entry.cost
      else sum.supplement += entry.cost
    }
    for (const log of data.water) sum.water += log.amountMl
    return sum
  }, [data.plan, data.water])

  const usage = useMemo(
    () => ingredientUsage(data.plan, data.recipes),
    [data.plan, data.recipes],
  )

  const weeks = useMemo(() => {
    const groups: { label: string; days: string[] }[] = []
    for (let index = 0; index < days.length; index += 7) {
      const chunk = days.slice(index, index + 7)
      groups.push({
        label: `${index + 1}–${index + chunk.length}`,
        days: chunk,
      })
    }
    return groups
  }, [days])

  const goalMet = days.filter((day) => {
    const value = perDay.get(day)?.water ?? 0
    return data.waterGoalMl > 0 && value >= data.waterGoalMl
  }).length

  const offset = new Date(`${days[0]}T00:00:00Z`).getUTCDay()
  const cells: (string | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...days,
  ]

  return (
    <>
      <section className="card">
        <div className="card-head">
          <h2>วิเคราะห์</h2>
          <MonthNav month={month} onChange={onMonth} />
        </div>
        <div className="sumtiles">
          <div className="sumtile">
            <span>ค่าวัตถุดิบ</span>
            <strong className="expense-text">
              {money(total.ingredient, true)}
            </strong>
          </div>
          <div className="sumtile">
            <span>ค่าอาหารเสริม</span>
            <strong className="income-text">
              {money(total.supplement, true)}
            </strong>
          </div>
          <div className="sumtile">
            <span>น้ำดื่มรวม</span>
            <strong className="water-text">
              {total.water.toLocaleString('th-TH')} มล.
            </strong>
          </div>
          <div className="sumtile">
            <span>ครบเป้าหมายน้ำ</span>
            <strong>
              {goalMet}/{days.length} วัน
            </strong>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>ปฏิทินค่าวัตถุดิบ / อาหารเสริม / น้ำ</h2>
        <div className="calhead" aria-hidden="true">
          {WEEKDAYS.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
        <div className="calgrid sumgrid">
          {cells.map((cell, index) => {
            if (!cell)
              return <span key={`blank-${index}`} className="calcell blank" />
            const value = perDay.get(cell) ?? emptyTotals()
            const cost = value.ingredient + value.supplement
            return (
              <div key={cell} className="calcell sumcell">
                <span>{Number(cell.slice(-2))}</span>
                {cost > 0 && <span className="cost">{money(cost, true)}</span>}
                {value.water > 0 && (
                  <span className="watermini">{value.water} มล.</span>
                )}
              </div>
            )
          })}
        </div>
        <div className="legend">
          <span>
            <i className="legenddot ingredient" /> ค่าวัตถุดิบ
          </span>
          <span>
            <i className="legenddot supplement" /> อาหารเสริม
          </span>
          <span>
            <i className="legenddot water" /> น้ำดื่ม (มล.)
          </span>
        </div>
      </section>

      <section className="card">
        <h2>สรุปรายสัปดาห์</h2>
        <table className="weeks">
          <thead>
            <tr>
              <th>วันที่</th>
              <th>วัตถุดิบ</th>
              <th>เสริม</th>
              <th>น้ำ</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((week) => {
              const sum = emptyTotals()
              for (const day of week.days) {
                const value = perDay.get(day)
                if (!value) continue
                sum.ingredient += value.ingredient
                sum.supplement += value.supplement
                sum.water += value.water
              }
              return (
                <tr key={week.label}>
                  <td>{week.label}</td>
                  <td>{money(sum.ingredient, true)}</td>
                  <td>{money(sum.supplement, true)}</td>
                  <td>{(sum.water / 1000).toLocaleString('th-TH')} ล.</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>ปริมาณวัตถุดิบที่ใช้</h2>
        <p className="muted small">
          รวมทั้งเดือน พร้อมเฉลี่ยต่อวันและต่อสัปดาห์
        </p>
        {usage.length ? (
          <ul className="usage">
            {usage.map((item) => (
              <li key={`${item.name}-${item.base}`}>
                <span className="grow">
                  <span>{item.name}</span>
                  <span className="qty">
                    รวม {formatBase(item.quantity, item.base)} · เฉลี่ย{' '}
                    {formatBase(item.quantity / days.length, item.base)}/วัน ·{' '}
                    {formatBase((item.quantity / days.length) * 7, item.base)}
                    /สัปดาห์
                  </span>
                </span>
                <span className="planprice">{money(item.cost, true)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">
            ยังไม่มีเมนูในปฏิทินเดือนนี้ — เพิ่มมื้ออาหารเพื่อดูปริมาณวัตถุดิบ
          </p>
        )}
      </section>
    </>
  )
}
