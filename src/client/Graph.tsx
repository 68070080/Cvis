import { todayKey } from './format'

/** Compact per-day bar chart used by the fitness screens. */
export function MiniGraph({
  title,
  average,
  unit,
  max,
  days,
  values,
  height = 52,
}: {
  title: string
  average: string
  unit: (value: number) => string
  max: number
  days: string[]
  values: Map<string, number>
  height?: number
}) {
  return (
    <div className="minigraph">
      <div className="minigraph-head">
        <strong>{title}</strong>
        <span className="muted small">{average}</span>
      </div>
      <div className="stepsbars">
        {days.map((key) => {
          const value = values.get(key)
          return (
            <div
              key={key}
              className={key === todayKey() ? 'stepsbar today' : 'stepsbar'}
              title={`${key} · ${value === undefined ? 'ไม่มีข้อมูล' : unit(value)}`}
            >
              <i
                style={{
                  height: `${
                    value ? Math.max(4, Math.round((value / max) * height)) : 2
                  }px`,
                }}
              />
              <span>{Number(key.slice(-2))}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
