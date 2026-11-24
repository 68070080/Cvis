import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type {
  FoodData,
  IngredientInput,
  PlanEntry,
  PlanInput,
  RecipeInput,
  SupplementInput,
} from '../shared/types'
import { api, jsonRequest } from './api'
import { CalendarView } from './CalendarView'
import { HealthSummaryView } from './HealthSummaryView'
import { IngredientsView } from './IngredientsView'
import { MealPrepView } from './MealPrepView'
import { SupplementsView } from './SupplementsView'

type Tab = 'calendar' | 'prep' | 'ingredients' | 'supplements' | 'summary'

const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  {
    id: 'calendar',
    label: 'ปฏิทิน',
    icon: (
      <>
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <path d="M4 9h16M8 3v4M16 3v4" />
      </>
    ),
  },
  {
    id: 'prep',
    label: 'Meal prep',
    icon: (
      <>
        <path d="M4 12h16a8 8 0 0 1-16 0z" />
        <path d="M9 8c0-2 1-3 3-3s3 1 3 3" />
      </>
    ),
  },
  {
    id: 'ingredients',
    label: 'วัตถุดิบ',
    icon: (
      <>
        <path d="M5 8h14l-1 12H6L5 8z" />
        <path d="M9 8V6a3 3 0 0 1 6 0v2" />
      </>
    ),
  },
  {
    id: 'supplements',
    label: 'เสริม',
    icon: (
      <>
        <rect x="3" y="9" width="18" height="7" rx="3.5" transform="rotate(-35 12 12)" />
        <path d="M9 15 15 9" />
      </>
    ),
  },
  {
    id: 'summary',
    label: 'วิเคราะห์',
    icon: (
      <>
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </>
    ),
  },
]

const message = (error: unknown) =>
  error instanceof Error ? error.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่'

export function HealthModule({
  month,
  onMonth,
  onSaveWaterGoal,
}: {
  month: string
  onMonth: (value: string) => void
  onSaveWaterGoal: (goal: number) => Promise<void>
}) {
  const [tab, setTab] = useState<Tab>('calendar')
  const [data, setData] = useState<FoodData | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (value: string) => {
    setData(await api<FoodData>(`/api/food?month=${value}`))
  }, [])

  useEffect(() => {
    let live = true
    setData(null)
    api<FoodData>(`/api/food?month=${month}`)
      .then((next) => {
        if (live) setData(next)
      })
      .catch((problem) => {
        if (live) setError(message(problem))
      })
    return () => {
      live = false
    }
  }, [month])

  const mutate = async (action: () => Promise<unknown>) => {
    setBusy(true)
    setError('')
    try {
      await action()
      await load(month)
    } catch (problem) {
      setError(message(problem))
    } finally {
      setBusy(false)
    }
  }

  const saveGoal = async (goal: number) => {
    setBusy(true)
    setError('')
    try {
      await onSaveWaterGoal(goal)
      await load(month)
    } catch (problem) {
      setError(message(problem))
    } finally {
      setBusy(false)
    }
  }

  const saveRecipe = (input: RecipeInput, id?: string) =>
    mutate(() =>
      api(
        id ? `/api/recipes/${id}` : '/api/recipes',
        jsonRequest(id ? 'PATCH' : 'POST', input),
      ),
    )
  const deleteRecipe = (id: string) =>
    mutate(() => api(`/api/recipes/${id}`, { method: 'DELETE' }))

  const saveIngredient = (input: IngredientInput, id?: string) =>
    mutate(() =>
      api(
        id ? `/api/ingredients/${id}` : '/api/ingredients',
        jsonRequest(id ? 'PATCH' : 'POST', input),
      ),
    )
  const deleteIngredient = (id: string) =>
    mutate(() => api(`/api/ingredients/${id}`, { method: 'DELETE' }))

  const saveSupplement = (input: SupplementInput, id?: string) =>
    mutate(() =>
      api(
        id ? `/api/supplements/${id}` : '/api/supplements',
        jsonRequest(id ? 'PATCH' : 'POST', input),
      ),
    )
  const deleteSupplement = (id: string) =>
    mutate(() => api(`/api/supplements/${id}`, { method: 'DELETE' }))

  const addPlan = (input: PlanInput) =>
    mutate(() => api('/api/plan', jsonRequest('POST', input)))
  const togglePlan = (entry: PlanEntry) =>
    mutate(() =>
      api(`/api/plan/${entry.id}`, jsonRequest('PATCH', { eaten: !entry.eaten })),
    )
  const deletePlan = (id: string) =>
    mutate(() => api(`/api/plan/${id}`, { method: 'DELETE' }))

  const addWater = (day: string, amountMl: number) =>
    mutate(() => api('/api/water', jsonRequest('POST', { day, amountMl })))
  const deleteWater = (id: string) =>
    mutate(() => api(`/api/water/${id}`, { method: 'DELETE' }))

  return (
    <>
      {error && (
        <p role="alert" className="error">
          <span>{error}</span>
          <button
            type="button"
            className="iconbtn"
            aria-label="ปิดข้อความ"
            onClick={() => setError('')}
          >
            ✕
          </button>
        </p>
      )}

      {!data ? (
        <p className="empty">กำลังโหลดข้อมูลอาหารและสุขภาพ…</p>
      ) : (
        <>
          {tab === 'calendar' && (
            <CalendarView
              data={data}
              month={month}
              onMonth={onMonth}
              busy={busy}
              onAddPlan={addPlan}
              onTogglePlan={togglePlan}
              onDeletePlan={deletePlan}
              onAddWater={addWater}
              onDeleteWater={deleteWater}
              onSaveGoal={saveGoal}
            />
          )}
          {tab === 'prep' && (
            <MealPrepView
              data={data}
              busy={busy}
              onSave={saveRecipe}
              onDelete={deleteRecipe}
            />
          )}
          {tab === 'ingredients' && (
            <IngredientsView
              data={data}
              busy={busy}
              onSave={saveIngredient}
              onDelete={deleteIngredient}
            />
          )}
          {tab === 'supplements' && (
            <SupplementsView
              data={data}
              busy={busy}
              onSave={saveSupplement}
              onDelete={deleteSupplement}
            />
          )}
          {tab === 'summary' && (
            <HealthSummaryView data={data} month={month} onMonth={onMonth} />
          )}
        </>
      )}

      <nav className="tabbar five" aria-label="เมนูอาหารและสุขภาพ">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={tab === item.id ? 'tab active' : 'tab'}
            aria-current={tab === item.id ? 'page' : undefined}
            onClick={() => setTab(item.id)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {item.icon}
            </svg>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </>
  )
}
