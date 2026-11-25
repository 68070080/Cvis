import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type {
  AppData,
  CategoryInput,
  Session,
  SettingsInput,
  TransactionInput,
} from '../shared/types'
import { api, jsonRequest } from './api'
import {
  authSession,
  signOut as endSession,
  type AuthState,
  type AuthUser,
} from './auth'
import { importBackup } from './backup'
import { BudgetsView } from './BudgetsView'
import { currentMonth } from './format'
import { FitnessModule } from './FitnessModule'
import { HealthModule } from './HealthModule'
import { LoginView } from './LoginView'
import { ReportView } from './ReportView'
import { TimeModule } from './TimeModule'
import { SettingsView } from './SettingsView'
import { SummaryView } from './SummaryView'
import { TransactionsView } from './TransactionsView'
import { DEFAULT_THEME, applyTheme } from './theme'

type Tab = 'summary' | 'budgets' | 'transactions'
type Module = 'finance' | 'health' | 'fitness' | 'time' | 'report'

const MODULES: { id: Module; label: string }[] = [
  { id: 'finance', label: 'การเงิน' },
  { id: 'health', label: 'อาหารและสุขภาพ' },
  { id: 'fitness', label: 'ออกกำลังกาย' },
  { id: 'time', label: 'จัดการเวลา' },
  { id: 'report', label: 'รายงาน' },
]

const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  {
    id: 'summary',
    label: 'สรุป',
    icon: (
      <>
        <path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" />
      </>
    ),
  },
  {
    id: 'budgets',
    label: 'หมวด / งบ',
    icon: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 4v8h8" />
      </>
    ),
  },
  {
    id: 'transactions',
    label: 'รายการ',
    icon: (
      <>
        <path d="M4 7h13M4 12h13M4 17h13" />
      </>
    ),
  },
]

const message = (error: unknown) =>
  error instanceof Error ? error.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่'

export function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [data, setData] = useState<AppData | null>(null)
  const [month, setMonth] = useState(currentMonth)
  const [tab, setTab] = useState<Tab>('summary')
  const [mod, setMod] = useState<Module>('finance')
  const [showSettings, setShowSettings] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [auth, setAuth] = useState<AuthState | null>(null)
  const modulesRef = useRef<HTMLDivElement>(null)

  // Five module buttons scroll on narrow phones: keep the active one visible.
  useEffect(() => {
    const active = modulesRef.current?.querySelector('button.active')
    active?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [mod, showSettings])

  // Google sign-in plus a one-time code from e-mail are both required.
  useEffect(() => {
    let live = true
    void (async () => {
      try {
        const current = await authSession()
        if (live) setAuth(current)
      } catch (problem) {
        if (live) {
          setError(message(problem))
          setAuth({ authenticated: false, pending: null })
        }
      }
    })()
    return () => {
      live = false
    }
  }, [])

  const ready = Boolean(session?.user && session.database)

  const load = useCallback(async (value: string) => {
    const next = await api<AppData>(`/api/data?month=${value}`)
    setData(next)
    applyTheme(next.settings.theme)
  }, [])

  useEffect(() => {
    applyTheme(DEFAULT_THEME)
    let live = true
    void (async () => {
      try {
        const current = await api<Session>('/api/session')
        if (live) setSession(current)
      } catch (problem) {
        if (live) setError(message(problem))
      }
    })()
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    if (!ready) return
    void load(month).catch((problem) => setError(message(problem)))
  }, [ready, month, load])

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

  const saveTransaction = (input: TransactionInput, id?: string) =>
    mutate(() =>
      api(
        id ? `/api/transactions/${id}` : '/api/transactions',
        jsonRequest(id ? 'PATCH' : 'POST', input),
      ),
    )
  const deleteTransaction = (id: string) =>
    mutate(() => api(`/api/transactions/${id}`, { method: 'DELETE' }))

  const saveCategory = (input: CategoryInput, id?: string) =>
    mutate(() =>
      api(
        id ? `/api/categories/${id}` : '/api/categories',
        jsonRequest(id ? 'PATCH' : 'POST', input),
      ),
    )
  const deleteCategory = (id: string) =>
    mutate(() => api(`/api/categories/${id}`, { method: 'DELETE' }))

  const saveSettings = (input: SettingsInput) =>
    mutate(() => api('/api/settings', jsonRequest('PATCH', input)))

  const restore = async (text: string) => {
    await importBackup(text)
    await load(month)
  }

  const handleSignOut = () => {
    void (async () => {
      try {
        await endSession()
      } catch {
        // Even if the call fails, drop the local view of the session.
      } finally {
        setShowSettings(false)
        setAuth({ authenticated: false, pending: null })
      }
    })()
  }

  return (
    <div className="app">
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

      {!auth ? (
        <p className="empty">กำลังโหลด…</p>
      ) : !auth.authenticated ? (
        <LoginView
          state={auth}
          onVerified={(user: AuthUser) =>
            setAuth({ authenticated: true, user })
          }
        />
      ) : !session ? (
        <p className="empty">กำลังโหลด…</p>
      ) : !ready ? (
        <section className="card setup">
          <h1>Cvis</h1>
          <p className="muted">
            {session.mode === 'setup' || !session.database
              ? 'แอพนี้ยังตั้งค่าไม่เสร็จ กรุณาลองใหม่ภายหลัง'
              : 'เข้าสู่ระบบเพื่อเริ่มจดรายรับรายจ่ายของคุณ'}
          </p>
          {session.mode === 'freebuff' && (
            <a className="primary" href="/auth/freebuff/signin?returnTo=%2F">
              เข้าสู่ระบบด้วย Freebuff
            </a>
          )}
        </section>
      ) : !data ? (
        <p className="empty">กำลังโหลดข้อมูล…</p>
      ) : (
        <>
          <main>
            {session.mode === 'local' && (
              <p className="localnote">
                ข้อมูลเก็บไว้ในเบราว์เซอร์นี้เท่านั้น — สำรองข้อมูลได้ในหน้าตั้งค่า
              </p>
            )}
            <div className="topbar">
              <div
                className="moduleseg"
                role="tablist"
                aria-label="โมดูล"
                ref={modulesRef}
              >
                {MODULES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={!showSettings && mod === item.id}
                    className={!showSettings && mod === item.id ? 'active' : ''}
                    onClick={() => {
                      setMod(item.id)
                      setShowSettings(false)
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className={showSettings ? 'topbtn active' : 'topbtn'}
                aria-label="ตั้งค่า"
                aria-pressed={showSettings}
                onClick={() => setShowSettings((open) => !open)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
                </svg>
              </button>
            </div>
            {showSettings ? (
              <SettingsView
                data={data}
                session={session}
                busy={busy}
                accountEmail={auth.user?.email ?? ''}
                onSignOut={handleSignOut}
                onSave={saveSettings}
                onRestore={restore}
              />
            ) : mod === 'finance' ? (
              <>
            {tab === 'summary' && (
              <SummaryView
                data={data}
                session={session}
                month={month}
                onMonth={setMonth}
                onOpenAll={() => setTab('transactions')}
              />
            )}
            {tab === 'budgets' && (
              <BudgetsView
                data={data}
                busy={busy}
                onSaveCategory={saveCategory}
                onDeleteCategory={deleteCategory}
              />
            )}
            {tab === 'transactions' && (
              <TransactionsView
                data={data}
                month={month}
                busy={busy}
                onMonth={setMonth}
                onSave={saveTransaction}
                onDelete={deleteTransaction}
              />
            )}
              </>
            ) : mod === 'health' ? (
              <HealthModule
                month={month}
                onMonth={setMonth}
                onSaveWaterGoal={(goal) => saveSettings({ waterGoalMl: goal })}
              />
            ) : mod === 'fitness' ? (
              <FitnessModule
                month={month}
                onMonth={setMonth}
                restTimerSec={data.settings.restTimerSec}
                onSaveRestTimer={(seconds) =>
                  saveSettings({ restTimerSec: seconds })
                }
              />
            ) : mod === 'time' ? (
              <TimeModule />
            ) : (
              <ReportView />
            )}
          </main>

          {!showSettings && mod === 'finance' && (
          <nav className="tabbar three" aria-label="เมนูหลัก">
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
          )}
        </>
      )}
    </div>
  )
}
