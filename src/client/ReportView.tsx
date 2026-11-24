import { useEffect, useMemo, useState } from 'react'
import type { ReportData, ReportDay } from '../shared/types'
import { api } from './api'
import { dayLabel, money, todayKey } from './format'

const PRESETS = [
  { label: '7 วัน', days: 7 },
  { label: '30 วัน', days: 30 },
  { label: '90 วัน', days: 90 },
]

const shiftDay = (day: string, delta: number): string => {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(Date.UTC(year!, month! - 1, date! + delta))
    .toISOString()
    .slice(0, 10)
}

const hours = (minutes: number | null): string =>
  minutes === null
    ? '—'
    : `${Math.floor(minutes / 60)} ชม. ${minutes % 60} นาที`

const baht = (satang: number): string => (satang / 100).toFixed(2)

const kilo = (metres: number): string => (metres / 1000).toFixed(2)

const HEADERS = [
  'วันที่',
  'น้ำ (มล.)',
  'ค่าอาหาร (บาท)',
  'มื้อที่กิน',
  'น้ำหนัก (กก.)',
  'ก้าวเดิน',
  'นอน (ชม.)',
  'พลังงาน (1-5)',
  'ความหิว (1-5)',
  'เซทเวท',
  'ปริมาณเวท (กก.)',
  'คาร์ดิโอ (นาที)',
  'ระยะทาง (กม.)',
]

const sheetRow = (row: ReportDay): (string | number)[] => [
  row.day,
  row.waterMl || '',
  row.foodCost ? baht(row.foodCost) : '',
  row.mealsEaten || '',
  row.weightKg ?? '',
  row.steps ?? '',
  row.sleepMin === null ? '' : (row.sleepMin / 60).toFixed(2),
  row.energy ?? '',
  row.hunger ?? '',
  row.strengthSets || '',
  row.strengthVolume || '',
  row.cardioMin || '',
  row.cardioM ? kilo(row.cardioM) : '',
]

const cell = (value: string | number): string => {
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** CSV with a BOM so Thai text opens correctly in Google Sheets and Excel. */
function buildCsv(data: ReportData): string {
  const { totals } = data
  const rows = [
    HEADERS,
    ...data.days.map(sheetRow),
    [
      'รวม',
      totals.waterMl,
      baht(totals.foodCost),
      totals.mealsEaten,
      totals.weightChange ?? '',
      totals.steps,
      totals.sleepAvgMin === null ? '' : (totals.sleepAvgMin / 60).toFixed(2),
      '',
      '',
      totals.strengthSets,
      totals.strengthVolume,
      totals.cardioMin,
      kilo(totals.cardioM),
    ],
  ]
  return `\uFEFF${rows.map((row) => row.map(cell).join(',')).join('\r\n')}`
}

const mark = (value: number, format: (value: number) => string): string =>
  value > 0 ? format(value) : '—'

export function ReportView() {
  const today = todayKey()
  const [from, setFrom] = useState(() => shiftDay(today, -29))
  const [to, setTo] = useState(today)
  const [data, setData] = useState<ReportData | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  const invalid = from > to

  useEffect(() => {
    if (invalid) return
    let live = true
    setBusy(true)
    setError('')
    api<ReportData>(`/api/report?from=${from}&to=${to}`)
      .then((next) => {
        if (live) setData(next)
      })
      .catch((problem) => {
        if (live) setError(problem instanceof Error ? problem.message : 'โหลดรายงานไม่สำเร็จ')
      })
      .finally(() => {
        if (live) setBusy(false)
      })
    return () => {
      live = false
    }
  }, [from, to, invalid])

  const csv = useMemo(() => (data ? buildCsv(data) : ''), [data])
  const totals = data?.totals

  const filename = `cvis-report-${from}_${to}.csv`

  function download() {
    if (!csv) return
    const url = URL.createObjectURL(
      new Blob([csv], { type: 'text/csv;charset=utf-8' }),
    )
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
    setNote('ดาวน์โหลด CSV แล้ว — เปิด Google Sheets › ไฟล์ › นำเข้า เพื่อดูเป็นชีต')
  }

  async function copy() {
    if (!csv) return
    try {
      await navigator.clipboard.writeText(csv)
      setNote('คัดลอกตารางแล้ว — เปิด Google Sheets แล้วกดวาง (Ctrl+V) ที่ช่อง A1')
    } catch {
      setNote('คัดลอกอัตโนมัติไม่ได้ — ใช้ปุ่มดาวน์โหลด CSV แทน')
    }
  }

  return (
    <>
      <section className="card">
        <div className="card-head">
          <div>
            <h2>รายงานรวมทุกด้าน</h2>
            <p className="muted small">
              สรุปอาหารและสุขภาพรวมกับออกกำลังกายในช่วงวันที่เลือก
            </p>
          </div>
        </div>

        <div className="reportrange">
          <div className="field">
            <label htmlFor="report-from">ตั้งแต่วันที่</label>
            <input
              id="report-from"
              type="date"
              value={from}
              max={to}
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="report-to">ถึงวันที่</label>
            <input
              id="report-to"
              type="date"
              value={to}
              min={from}
              max={today}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
        </div>

        <div className="chips">
          {PRESETS.map((preset) => (
            <button
              key={preset.days}
              type="button"
              className="chip"
              onClick={() => {
                setTo(today)
                setFrom(shiftDay(today, -(preset.days - 1)))
              }}
            >
              {preset.label}
            </button>
          ))}
          <button
            type="button"
            className="chip"
            onClick={() => {
              setTo(today)
              setFrom(`${today.slice(0, 7)}-01`)
            }}
          >
            เดือนนี้
          </button>
        </div>

        {invalid && (
          <p role="alert" className="formerror">
            วันเริ่มต้องไม่เกินวันสิ้นสุด
          </p>
        )}
        {error && (
          <p role="alert" className="formerror">
            {error}
          </p>
        )}
        {busy && !data && <p className="empty">กำลังคำนวณรายงาน…</p>}

        {totals && (
          <div className="reportstats">
            <div className="reporttile">
              <span>ช่วงที่เลือก</span>
              <strong>{totals.days} วัน</strong>
            </div>
            <div className="reporttile">
              <span>วันที่มีข้อมูล</span>
              <strong>{totals.loggedDays} วัน</strong>
            </div>
            <div className="reporttile">
              <span>น้ำรวม</span>
              <strong>{totals.waterMl.toLocaleString('th-TH')} มล.</strong>
              <span>เฉลี่ย {totals.waterAvgMl.toLocaleString('th-TH')} มล./วัน</span>
            </div>
            <div className="reporttile">
              <span>ค่าอาหารรวม</span>
              <strong>{money(totals.foodCost)}</strong>
              <span>{totals.mealsEaten} มื้อที่กิน</span>
            </div>
            <div className="reporttile">
              <span>การนอนเฉลี่ย</span>
              <strong>{hours(totals.sleepAvgMin)}</strong>
            </div>
            <div className="reporttile">
              <span>น้ำหนัก</span>
              <strong>
                {totals.weightEnd === null ? '—' : `${totals.weightEnd} กก.`}
              </strong>
              <span>
                {totals.weightChange === null
                  ? 'ข้อมูลไม่พอ'
                  : `${totals.weightChange > 0 ? '+' : ''}${totals.weightChange} กก.`}
              </span>
            </div>
            <div className="reporttile">
              <span>ก้าวเดินรวม</span>
              <strong>{totals.steps.toLocaleString('th-TH')}</strong>
            </div>
            <div className="reporttile">
              <span>เวทเทรนนิ่ง</span>
              <strong>{totals.strengthSets} เซท</strong>
              <span>{totals.strengthVolume.toLocaleString('th-TH')} กก. รวม</span>
            </div>
            <div className="reporttile">
              <span>คาร์ดิโอ</span>
              <strong>{totals.cardioMin} นาที</strong>
              <span>{kilo(totals.cardioM)} กม.</span>
            </div>
          </div>
        )}

        {data && (
          <div className="reporttable">
            <table className="report">
              <thead>
                <tr>
                  {HEADERS.map((header) => (
                    <th key={header} scope="col">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.days.map((row) => (
                  <tr key={row.day}>
                    <th scope="row">{dayLabel(row.day)}</th>
                    <td>{mark(row.waterMl, (value) => value.toLocaleString('th-TH'))}</td>
                    <td>{mark(row.foodCost, (value) => baht(value))}</td>
                    <td>{row.mealsEaten || '—'}</td>
                    <td>{row.weightKg ?? '—'}</td>
                    <td>{row.steps === null ? '—' : row.steps.toLocaleString('th-TH')}</td>
                    <td>
                      {row.sleepMin === null ? '—' : (row.sleepMin / 60).toFixed(1)}
                    </td>
                    <td>{row.energy ?? '—'}</td>
                    <td>{row.hunger ?? '—'}</td>
                    <td>{row.strengthSets || '—'}</td>
                    <td>
                      {row.strengthVolume
                        ? row.strengthVolume.toLocaleString('th-TH')
                        : '—'}
                    </td>
                    <td>{row.cardioMin || '—'}</td>
                    <td>{row.cardioM ? kilo(row.cardioM) : '—'}</td>
                  </tr>
                ))}
              </tbody>
              {totals && (
                <tfoot>
                  <tr>
                    <th scope="row">รวม</th>
                    <td>{totals.waterMl.toLocaleString('th-TH')}</td>
                    <td>{baht(totals.foodCost)}</td>
                    <td>{totals.mealsEaten}</td>
                    <td>
                      {totals.weightChange === null
                        ? '—'
                        : `${totals.weightChange > 0 ? '+' : ''}${totals.weightChange}`}
                    </td>
                    <td>{totals.steps.toLocaleString('th-TH')}</td>
                    <td>
                      {totals.sleepAvgMin === null
                        ? '—'
                        : (totals.sleepAvgMin / 60).toFixed(1)}
                    </td>
                    <td>—</td>
                    <td>—</td>
                    <td>{totals.strengthSets}</td>
                    <td>{totals.strengthVolume.toLocaleString('th-TH')}</td>
                    <td>{totals.cardioMin}</td>
                    <td>{kilo(totals.cardioM)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        <div className="reportactions">
          <button type="button" className="primary" disabled={!csv} onClick={download}>
            ดาวน์โหลด CSV สำหรับ Google Sheets
          </button>
          <button type="button" className="ghost" disabled={!csv} onClick={() => void copy()}>
            คัดลอกตาราง
          </button>
          <a
            className="chip"
            href="https://sheets.new"
            target="_blank"
            rel="noreferrer"
          >
            เปิด Google Sheets
          </a>
        </div>
        <p className="muted small">
          ตารางด้านบนคือข้อมูลชุดเดียวกับไฟล์ที่ส่งออก — ดาวน์โหลด CSV แล้วเลือก
          “ไฟล์ › นำเข้า” ใน Google Sheets หรือกดคัดลอกแล้ววางที่ช่อง A1
        </p>
        {note && (
          <p className="muted small" role="status">
            {note}
          </p>
        )}
      </section>
    </>
  )
}
