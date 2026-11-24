import { useEffect, useMemo, useState } from 'react'
import type {
  FoodData,
  PlanEntry,
  PlanInput,
  PlanKind,
  Recipe,
  Supplement,
} from '../shared/types'
import {
  dayLabel,
  daysOfMonth,
  money,
  parseQuantityInput,
  timeLabel,
  todayKey,
  WEEKDAYS,
} from './format'
import { ingredientUsage } from './foodCalc'
import { formatBase } from './units'
import { MonthNav, Sheet } from './ui'

function dayForMonth(month: string): string {
  const today = todayKey()
  return today.startsWith(`${month}-`) ? today : `${month}-01`
}

export function CalendarView({
  data,
  month,
  onMonth,
  busy,
  onAddPlan,
  onTogglePlan,
  onDeletePlan,
  onAddWater,
  onDeleteWater,
  onSaveGoal,
}: {
  data: FoodData
  month: string
  onMonth: (value: string) => void
  busy: boolean
  onAddPlan: (input: PlanInput) => Promise<void>
  onTogglePlan: (entry: PlanEntry) => Promise<void>
  onDeletePlan: (id: string) => Promise<void>
  onAddWater: (day: string, amountMl: number) => Promise<void>
  onDeleteWater: (id: string) => Promise<void>
  onSaveGoal: (goal: number) => Promise<void>
}) {
  const days = useMemo(() => daysOfMonth(month), [month])
  const [day, setDay] = useState(() => dayForMonth(month))
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    setDay(dayForMonth(month))
  }, [month])

  const marks = useMemo(() => {
    const map = new Map<
      string,
      { meal: boolean; supplement: boolean; water: number }
    >()
    const get = (key: string) => {
      const found = map.get(key)
      if (found) return found
      const next = { meal: false, supplement: false, water: 0 }
      map.set(key, next)
      return next
    }
    for (const entry of data.plan) {
      const mark = get(entry.day)
      if (entry.kind === 'meal') mark.meal = true
      else mark.supplement = true
    }
    for (const log of data.water) get(log.day).water += log.amountMl
    return map
  }, [data.plan, data.water])

  const offset = new Date(`${days[0]}T00:00:00Z`).getUTCDay()
  const cells: (string | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...days,
  ]

  const entries = data.plan.filter((entry) => entry.day === day)
  const dayCost = entries.reduce((sum, entry) => sum + entry.cost, 0)
  const usage = ingredientUsage(entries, data.recipes)

  const waterLogs = data.water.filter((log) => log.day === day)
  const waterTotal = waterLogs.reduce((sum, log) => sum + log.amountMl, 0)
  const goal = data.waterGoalMl
  const ratio = goal > 0 ? Math.min(waterTotal / goal, 1) : 0
  const [amount, setAmount] = useState('250')
  const [goalInput, setGoalInput] = useState(String(goal))

  useEffect(() => {
    setGoalInput(String(goal))
  }, [goal])

  const addWater = (ml: number) => {
    if (Number.isInteger(ml) && ml > 0) void onAddWater(day, ml)
  }

  return (
    <>
      <section className="card">
        <div className="card-head">
          <h2>ปฏิทินอาหาร</h2>
          <MonthNav month={month} onChange={onMonth} />
        </div>
        <div className="calhead" aria-hidden="true">
          {WEEKDAYS.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
        <div className="calgrid">
          {cells.map((cell, index) =>
            cell ? (
              <button
                key={cell}
                type="button"
                className={`calcell${cell === day ? ' selected' : ''}${
                  cell === todayKey() ? ' today' : ''
                }`}
                aria-pressed={cell === day}
                onClick={() => setDay(cell)}
              >
                <span>{Number(cell.slice(-2))}</span>
                <span className="caldots">
                  {marks.get(cell)?.meal && <i className="dot meal" />}
                  {marks.get(cell)?.supplement && (
                    <i className="dot supplement" />
                  )}
                  {(marks.get(cell)?.water ?? 0) > 0 && (
                    <i className="dot water" />
                  )}
                </span>
              </button>
            ) : (
              <span key={`blank-${index}`} className="calcell blank" />
            ),
          )}
        </div>
        <p className="muted small cephint">
          แตะวันที่เพื่อดูมื้อ วัตถุดิบ และน้ำดื่มของวันนั้น
        </p>
      </section>

      <section className="card">
        <div className="card-head">
          <div>
            <h2>{dayLabel(day)}</h2>
            <p className="muted small">ต้นทุนรวม {money(dayCost, true)}</p>
          </div>
          <button
            type="button"
            className="chip"
            onClick={() => setAdding(true)}
          >
            + เพิ่มมื้อ
          </button>
        </div>

        {entries.length ? (
          <ul className="txlist">
            {entries.map((entry) => (
              <li key={entry.id} className="planrow">
                <button
                  type="button"
                  className={entry.eaten ? 'check on' : 'check'}
                  aria-pressed={entry.eaten}
                  aria-label={
                    entry.eaten ? `ยกเลิก ${entry.name}` : `กิน ${entry.name} แล้ว`
                  }
                  onClick={() => void onTogglePlan(entry)}
                >
                  ✓
                </button>
                <span className="planmain">
                  <span
                    className={entry.eaten ? 'plantitle done' : 'plantitle'}
                  >
                    {entry.name}
                  </span>
                  <span className="plansub">
                    {entry.kind === 'meal' ? 'มื้ออาหาร' : 'อาหารเสริม'} ·{' '}
                    {entry.servings} เสิร์ฟ
                  </span>
                </span>
                <span className="planright">
                  <span className="planprice">{money(entry.cost, true)}</span>
                  <button
                    type="button"
                    className="delbtn"
                    aria-label={`ลบ ${entry.name}`}
                    onClick={() => void onDeletePlan(entry.id)}
                  >
                    ✕
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">ยังไม่มีมื้ออาหารในวันนี้ — กด “+ เพิ่มมื้อ”</p>
        )}

        {usage.length > 0 && (
          <>
            <h3 className="usagehead">วัตถุดิบที่ต้องใช้</h3>
            <div className="ingchips">
              {usage.map((item) => (
                <span className="ingchip" key={`${item.name}-${item.base}`}>
                  {item.name} {formatBase(item.quantity, item.base)}
                </span>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>น้ำดื่ม</h2>
          <span className="chip muted">{waterLogs.length} ครั้ง</span>
        </div>
        <div className="watertop">
          <div
            className="waterbar vertical"
            role="progressbar"
            aria-label="ความคืบหน้าน้ำดื่มวันนี้"
            aria-valuemin={0}
            aria-valuemax={goal}
            aria-valuenow={waterTotal}
          >
            <span style={{ height: `${ratio * 100}%` }} />
          </div>
          <div className="grow">
            <div className="waternums">
              <strong className="big water-text">
                {waterTotal.toLocaleString('th-TH')}
              </strong>
              <span className="muted small">
                / {goal.toLocaleString('th-TH')} มล.
              </span>
            </div>
            <p className="muted small">
              {goal > 0 ? Math.round((waterTotal / goal) * 100) : 0}%
              ของเป้าหมายวันนี้
            </p>
          </div>
        </div>
        <div className="quick">
          {[200, 250, 300, 500].map((ml) => (
            <button
              key={ml}
              type="button"
              className="chip"
              disabled={busy}
              onClick={() => addWater(ml)}
            >
              +{ml} มล.
            </button>
          ))}
        </div>
        <form
          className="wateradd"
          onSubmit={(event) => {
            event.preventDefault()
            const ml = Number(amount)
            if (Number.isInteger(ml) && ml > 0) addWater(ml)
          }}
        >
          <input
            inputMode="numeric"
            aria-label="ปริมาณน้ำ (มล.)"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
          <button type="submit" disabled={busy}>
            เพิ่ม
          </button>
        </form>

        {waterLogs.length > 0 && (
          <ul className="waterlog">
            {waterLogs.map((log) => (
              <li key={log.id}>
                <span>
                  {timeLabel(log.loggedAt)} · {log.amountMl} มล.
                </span>
                <button
                  type="button"
                  className="delbtn"
                  aria-label="ลบรายการน้ำ"
                  onClick={() => void onDeleteWater(log.id)}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        <form
          className="goalrow"
          onSubmit={(event) => {
            event.preventDefault()
            const next = Number(goalInput)
            if (Number.isInteger(next) && next >= 0 && next <= 20000)
              void onSaveGoal(next)
          }}
        >
          <label className="small muted" htmlFor="water-goal">
            เป้าหมายต่อวัน
          </label>
          <input
            id="water-goal"
            inputMode="numeric"
            value={goalInput}
            onChange={(event) => setGoalInput(event.target.value)}
          />
          <button type="submit" disabled={busy}>
            มล.
          </button>
        </form>
      </section>

      <button
        type="button"
        className="fab"
        aria-label="เพิ่มมื้ออาหาร"
        onClick={() => setAdding(true)}
      >
        +
      </button>

      {adding && (
        <PlanSheet
          day={day}
          recipes={data.recipes}
          supplements={data.supplements}
          busy={busy}
          onClose={() => setAdding(false)}
          onAdd={async (input) => {
            await onAddPlan(input)
            setAdding(false)
          }}
        />
      )}
    </>
  )
}

function PlanSheet({
  day,
  recipes,
  supplements,
  busy,
  onClose,
  onAdd,
}: {
  day: string
  recipes: Recipe[]
  supplements: Supplement[]
  busy: boolean
  onClose: () => void
  onAdd: (input: PlanInput) => Promise<void>
}) {
  const [kind, setKind] = useState<PlanKind>('meal')
  const [refId, setRefId] = useState('')
  const [servings, setServings] = useState('1')
  const [date, setDate] = useState(day)
  const [error, setError] = useState('')

  const options =
    kind === 'meal'
      ? recipes.map((recipe) => ({
          id: recipe.id,
          label: `${recipe.name} · ${money(recipe.costPerServing, true)}/เสิร์ฟ`,
        }))
      : supplements.map((supplement) => ({
          id: supplement.id,
          label: `${supplement.name} · ${money(
            supplement.costPerServing,
            true,
          )}/เสิร์ฟ`,
        }))
  const selected = options.some((option) => option.id === refId)
    ? refId
    : (options[0]?.id ?? '')

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!selected)
      return setError(
        kind === 'meal'
          ? 'ยังไม่มีเมนู — สร้าง meal prep ก่อน'
          : 'ยังไม่มีอาหารเสริม — เพิ่มก่อน',
      )
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
      return setError('เลือกวันที่ให้ถูกต้อง')
    const amount = parseQuantityInput(servings)
    if (!amount) return setError('จำนวนเสิร์ฟต้องมากกว่า 0')
    setError('')
    await onAdd({ day: date, kind, refId: selected, servings: amount })
  }

  return (
    <Sheet title="เพิ่มลงปฏิทิน" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="chips kindchips">
          <button
            type="button"
            className={kind === 'meal' ? 'chip active' : 'chip'}
            onClick={() => {
              setKind('meal')
              setRefId('')
            }}
          >
            มื้ออาหาร
          </button>
          <button
            type="button"
            className={kind === 'supplement' ? 'chip active' : 'chip'}
            onClick={() => {
              setKind('supplement')
              setRefId('')
            }}
          >
            อาหารเสริม
          </button>
        </div>
        <div className="field">
          <label htmlFor="plan-ref">
            {kind === 'meal' ? 'เมนู meal prep' : 'อาหารเสริม'}
          </label>
          <select
            id="plan-ref"
            value={selected}
            onChange={(event) => setRefId(event.target.value)}
          >
            {options.length ? (
              options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))
            ) : (
              <option value="">— ยังไม่มีรายการ —</option>
            )}
          </select>
        </div>
        <div className="field">
          <label htmlFor="plan-servings">จำนวนเสิร์ฟ</label>
          <input
            id="plan-servings"
            inputMode="decimal"
            value={servings}
            onChange={(event) => setServings(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="plan-date">วันที่</label>
          <input
            id="plan-date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </div>
        {error && (
          <p role="alert" className="formerror">
            {error}
          </p>
        )}
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'กำลังบันทึก…' : 'เพิ่มลงปฏิทิน'}
        </button>
      </form>
    </Sheet>
  )
}
