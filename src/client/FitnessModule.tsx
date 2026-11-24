import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { BodyInput, FitnessData, WorkoutInput } from '../shared/types'
import { api, jsonRequest } from './api'
import { FitnessSummary } from './FitnessSummary'
import { CardioView, StrengthView } from './WorkoutView'

type Tab = 'summary' | 'strength' | 'cardio'

const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  {
    id: 'summary',
    label: 'สรุป',
    icon: <path d="M4 19V9M10 19V5M16 19v-6M22 19H2" />,
  },
  {
    id: 'strength',
    label: 'เวท',
    icon: <path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10" />,
  },
  {
    id: 'cardio',
    label: 'คาร์ดิโอ',
    icon: (
      <path d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.6-7 9-7 9z" />
    ),
  },
]

const message = (error: unknown) =>
  error instanceof Error ? error.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่'

export function FitnessModule({
  month,
  onMonth,
  restTimerSec,
  onSaveRestTimer,
}: {
  month: string
  onMonth: (value: string) => void
  restTimerSec: number
  onSaveRestTimer: (seconds: number) => Promise<void>
}) {
  const [tab, setTab] = useState<Tab>('summary')
  const [data, setData] = useState<FitnessData | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (value: string) => {
    setData(await api<FitnessData>(`/api/fitness?month=${value}`))
  }, [])

  useEffect(() => {
    let live = true
    setData(null)
    api<FitnessData>(`/api/fitness?month=${month}`)
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

  const saveBody = (input: BodyInput) =>
    mutate(() => api('/api/body', jsonRequest('PUT', input)))
  const saveWorkout = (input: WorkoutInput, id?: string) =>
    mutate(() =>
      api(
        id ? `/api/workouts/${id}` : '/api/workouts',
        jsonRequest(id ? 'PATCH' : 'POST', input),
      ),
    )
  const deleteWorkout = (id: string) =>
    mutate(() => api(`/api/workouts/${id}`, { method: 'DELETE' }))

  const handlers = data
    ? {
        data,
        busy,
        restTimerSec,
        onRestTimer: (seconds: number) => void onSaveRestTimer(seconds),
        onSave: saveWorkout,
        onDelete: deleteWorkout,
      }
    : null

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

      {!data || !handlers ? (
        <p className="empty">กำลังโหลดข้อมูลการออกกำลังกาย…</p>
      ) : (
        <>
          {tab === 'summary' && (
            <FitnessSummary
              data={data}
              month={month}
              busy={busy}
              onMonth={onMonth}
              onSaveBody={saveBody}
            />
          )}
          {tab === 'strength' && <StrengthView {...handlers} />}
          {tab === 'cardio' && <CardioView {...handlers} />}
        </>
      )}

      <nav className="tabbar three" aria-label="เมนูออกกำลังกาย">
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
