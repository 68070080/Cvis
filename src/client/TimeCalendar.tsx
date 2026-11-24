import { useEffect, useRef, useState } from 'react'
import type { Activity } from '../shared/types'
import { WEEKDAYS, dayLabel } from './format'
import {
  CATEGORY_LABELS,
  PRIORITY_LABELS,
  daysBetween,
  minutesToTime,
  type TimeScale,
} from './timeaxis'

const HOUR_MARKS = [0, 3, 6, 9, 12, 15, 18, 21, 24]
const SNAP = 15
const MIN_LENGTH = 15
const DAY_MINUTES = 1440

type Props = {
  scale: TimeScale
  from: string
  to: string
  activities: Activity[]
  onOpen: (activity: Activity) => void
  onResize: (id: string, endMin: number) => void
}

function rowLabel(scale: TimeScale, day: string): string {
  const [, , date] = day.split('-').map(Number)
  if (scale === 'day') return dayLabel(day)
  if (scale === 'month') return String(date)
  const [year, month, dayNumber] = day.split('-').map(Number)
  const weekday = WEEKDAYS[new Date(Date.UTC(year!, month! - 1, dayNumber!)).getUTCDay()]
  return `${weekday} ${date}`
}

/**
 * Day-by-day calendar: the vertical axis lists days and the horizontal axis
 * runs from midnight to midnight. Dragging a block's right edge resizes it.
 */
export function TimeCalendar({
  scale,
  from,
  to,
  activities,
  onOpen,
  onResize,
}: Props) {
  const [drag, setDrag] = useState<{ id: string; end: number } | null>(null)
  const dragRef = useRef<{
    id: string
    startX: number
    baseEnd: number
    startMin: number
    railWidth: number
  } | null>(null)
  const endRef = useRef(0)

  const days = daysBetween(from, to)
  const byDay = new Map<string, Activity[]>()
  for (const activity of activities) {
    if (!activity.shown) continue
    const list = byDay.get(activity.day) ?? []
    list.push(activity)
    byDay.set(activity.day, list)
  }

  useEffect(() => {
    if (!drag) return
    const move = (event: PointerEvent) => {
      const state = dragRef.current
      if (!state) return
      const delta = ((event.clientX - state.startX) / state.railWidth) * DAY_MINUTES
      const snapped = Math.round((state.baseEnd + delta) / SNAP) * SNAP
      const end = Math.min(
        DAY_MINUTES,
        Math.max(state.startMin + MIN_LENGTH, snapped),
      )
      endRef.current = end
      setDrag({ id: state.id, end })
    }
    const finish = () => {
      const state = dragRef.current
      dragRef.current = null
      setDrag(null)
      if (state && endRef.current !== state.baseEnd)
        onResize(state.id, endRef.current)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
    }
  }, [drag, onResize])

  function startDrag(event: React.PointerEvent<HTMLSpanElement>, activity: Activity) {
    event.preventDefault()
    event.stopPropagation()
    const rail = event.currentTarget.closest('.timerail')
    if (!(rail instanceof HTMLElement)) return
    dragRef.current = {
      id: activity.id,
      startX: event.clientX,
      baseEnd: activity.endMin,
      startMin: activity.startMin,
      railWidth: Math.max(1, rail.getBoundingClientRect().width),
    }
    endRef.current = activity.endMin
    setDrag({ id: activity.id, end: activity.endMin })
  }

  return (
    <>
      <div className="timescroll">
        <div className={`timegrid ${scale}`}>
      <div className="timehead" aria-hidden="true">
        <span />
        <div className="timeaxis">
          {HOUR_MARKS.map((hour) => (
            <span key={hour} style={{ left: `${(hour / 24) * 100}%` }}>
              {hour}
            </span>
          ))}
        </div>
      </div>
      {days.map((day) => (
        <div className="timerow" key={day}>
          <span className={scale === 'day' ? 'timedaylabel big' : 'timedaylabel'}>
            {rowLabel(scale, day)}
          </span>
          <div className="timerail">
            {(byDay.get(day) ?? []).map((activity) => {
              const end = drag?.id === activity.id ? drag.end : activity.endMin
              const length = Math.max(MIN_LENGTH, end - activity.startMin)
              return (
                <button
                  type="button"
                  key={activity.id}
                  className={`timeblock cat-${activity.category}`}
                  data-prio={activity.priority}
                  style={{
                    left: `${(activity.startMin / DAY_MINUTES) * 100}%`,
                    width: `${(length / DAY_MINUTES) * 100}%`,
                  }}
                  title={`${activity.title} · ${minutesToTime(activity.startMin)}–${minutesToTime(end)} · ${CATEGORY_LABELS[activity.category]} · สำคัญ ${PRIORITY_LABELS[activity.priority]}`}
                  aria-label={`${activity.title} ${minutesToTime(activity.startMin)} ถึง ${minutesToTime(end)}`}
                  onClick={() => onOpen(activity)}
                >
                  {scale !== 'month' && (
                    <span className="timeblocktext">{activity.title}</span>
                  )}
                  <span
                    className="timehandle"
                    role="separator"
                    aria-label={`ปรับเวลาสิ้นสุดของ ${activity.title}`}
                    onPointerDown={(event) => startDrag(event, activity)}
                  />
                </button>
              )
            })}
          </div>
        </div>
      ))}
        </div>
      </div>
      <p className="muted small timehint">
        แตะแท่งกิจกรรมเพื่อแก้ไข · ลากขอบขวาของแท่งเพื่อย่อหรือขยายเวลา (ทีละ 15 นาที)
      </p>
    </>
  )
}
