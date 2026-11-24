import type {
  AppData,
  Category,
  Kind,
  MonthSummary,
  Settings,
  Theme,
  Transaction,
} from '../shared/types'

/** Sea-from-space palette: teal water, gold sand, deep navy. */
export const DEFAULT_THEME: Theme = {
  accent: '#17808d',
  income: '#1f7d68',
  expense: '#a26a0d',
  background: '#e9f1f5',
}

const DEFAULT_CATEGORIES: { name: string; kind: Kind }[] = [
  { name: 'อาหาร', kind: 'expense' },
  { name: 'เดินทาง', kind: 'expense' },
  { name: 'ค่าโทรศัพท์', kind: 'expense' },
  { name: 'ค่าเน็ต', kind: 'expense' },
  { name: 'ค่าน้ำค่าไฟ', kind: 'expense' },
  { name: 'ชอปปิ้ง', kind: 'expense' },
  { name: 'ที่พัก', kind: 'expense' },
  { name: 'อาหารเสริม', kind: 'expense' },
  { name: 'ของใช้', kind: 'expense' },
  { name: 'รองเท้า', kind: 'expense' },
  { name: 'อื่นๆ', kind: 'expense' },
  { name: 'เงินเดือน', kind: 'income' },
  { name: 'รายได้เสริม', kind: 'income' },
  { name: 'โบนัส', kind: 'income' },
]

const schema = [
  `CREATE TABLE IF NOT EXISTS settings (
    owner_sub TEXT PRIMARY KEY,
    display_name TEXT NOT NULL DEFAULT '',
    accent TEXT NOT NULL DEFAULT '#17808d',
    income_color TEXT NOT NULL DEFAULT '#1f7d68',
    expense_color TEXT NOT NULL DEFAULT '#a26a0d',
    background_color TEXT NOT NULL DEFAULT '#e9f1f5',
    cycle_day INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    owner_sub TEXT NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    budget INTEGER NOT NULL DEFAULT 0,
    position INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS categories_owner ON categories(owner_sub, kind, position)`,
  `CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    owner_sub TEXT NOT NULL,
    kind TEXT NOT NULL,
    amount INTEGER NOT NULL,
    category_id TEXT,
    note TEXT NOT NULL DEFAULT '',
    occurred_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS transactions_owner ON transactions(owner_sub, occurred_at DESC)`,
  `CREATE TABLE IF NOT EXISTS ingredients (
    id TEXT PRIMARY KEY,
    owner_sub TEXT NOT NULL,
    name TEXT NOT NULL,
    purchase_quantity REAL NOT NULL,
    purchase_unit TEXT NOT NULL,
    purchase_price INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS ingredients_owner ON ingredients(owner_sub, name)`,
  `CREATE TABLE IF NOT EXISTS recipes (
    id TEXT PRIMARY KEY,
    owner_sub TEXT NOT NULL,
    name TEXT NOT NULL,
    servings REAL NOT NULL DEFAULT 1,
    note TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS recipes_owner ON recipes(owner_sub, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS recipe_items (
    id TEXT PRIMARY KEY,
    recipe_id TEXT NOT NULL,
    owner_sub TEXT NOT NULL,
    name TEXT NOT NULL,
    quantity REAL NOT NULL,
    unit TEXT NOT NULL,
    price INTEGER NOT NULL,
    position INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS recipe_items_recipe ON recipe_items(recipe_id, position)`,
  `CREATE TABLE IF NOT EXISTS supplements (
    id TEXT PRIMARY KEY,
    owner_sub TEXT NOT NULL,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    servings REAL NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS supplements_owner ON supplements(owner_sub, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS plan_entries (
    id TEXT PRIMARY KEY,
    owner_sub TEXT NOT NULL,
    day TEXT NOT NULL,
    kind TEXT NOT NULL,
    ref_id TEXT NOT NULL,
    servings REAL NOT NULL DEFAULT 1,
    eaten INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS plan_entries_owner ON plan_entries(owner_sub, day, created_at)`,
  `CREATE TABLE IF NOT EXISTS water_logs (
    id TEXT PRIMARY KEY,
    owner_sub TEXT NOT NULL,
    day TEXT NOT NULL,
    amount_ml INTEGER NOT NULL,
    logged_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS water_logs_owner ON water_logs(owner_sub, day, logged_at)`,
  `CREATE TABLE IF NOT EXISTS body_logs (
    id TEXT PRIMARY KEY,
    owner_sub TEXT NOT NULL,
    day TEXT NOT NULL,
    weight_g INTEGER,
    steps INTEGER,
    sleep_bed_min INTEGER,
    sleep_wake_min INTEGER,
    energy INTEGER,
    hunger INTEGER,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS body_logs_owner_day ON body_logs(owner_sub, day)`,
  `CREATE TABLE IF NOT EXISTS workouts (
    id TEXT PRIMARY KEY,
    owner_sub TEXT NOT NULL,
    day TEXT NOT NULL,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    cardio_type TEXT,
    duration_min REAL NOT NULL DEFAULT 0,
    distance_m INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS workouts_owner ON workouts(owner_sub, day DESC, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS workout_sets (
    id TEXT PRIMARY KEY,
    workout_id TEXT NOT NULL,
    owner_sub TEXT NOT NULL,
    exercise TEXT NOT NULL,
    weight_g INTEGER NOT NULL DEFAULT 0,
    reps INTEGER NOT NULL DEFAULT 0,
    rir INTEGER NOT NULL DEFAULT 0,
    position INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS workout_sets_workout ON workout_sets(workout_id, position)`,
  `CREATE TABLE IF NOT EXISTS activities (
    id TEXT PRIMARY KEY,
    owner_sub TEXT NOT NULL,
    day TEXT NOT NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'other',
    start_min INTEGER NOT NULL,
    end_min INTEGER NOT NULL,
    priority INTEGER NOT NULL DEFAULT 3,
    reminder TEXT NOT NULL DEFAULT 'none',
    reminder_minutes INTEGER NOT NULL DEFAULT 0,
    shown INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS activities_owner ON activities(owner_sub, day, start_min)`,
  `CREATE TABLE IF NOT EXISTS time_checkins (
    owner_sub TEXT NOT NULL,
    day TEXT NOT NULL,
    checked_at INTEGER NOT NULL,
    PRIMARY KEY (owner_sub, day)
  )`,
]

/** Column additions for databases created before the health module existed. */
const migrations = [
  'ALTER TABLE settings ADD COLUMN water_goal_ml INTEGER NOT NULL DEFAULT 2000',
  'ALTER TABLE recipe_items ADD COLUMN ingredient_id TEXT',
  'ALTER TABLE settings ADD COLUMN rest_timer_sec INTEGER NOT NULL DEFAULT 90',
  'ALTER TABLE body_logs ADD COLUMN sleep_bed_min INTEGER',
  'ALTER TABLE body_logs ADD COLUMN sleep_wake_min INTEGER',
  'ALTER TABLE body_logs ADD COLUMN energy INTEGER',
  'ALTER TABLE body_logs ADD COLUMN hunger INTEGER',
  // Repaint accounts that still carry the old pink default palette.
  `UPDATE settings SET accent = '#17808d', income_color = '#1f7d68',
     expense_color = '#a26a0d', background_color = '#e9f1f5'
   WHERE accent = '#c2185b' AND background_color = '#f7f1ec'`,
]

const ready = new WeakMap<D1Database, Promise<void>>()
export function ensureSchema(db: D1Database): Promise<void> {
  let pending = ready.get(db)
  if (!pending) {
    pending = db
      .batch(schema.map((sql) => db.prepare(sql)))
      .then(async () => {
        for (const sql of migrations) {
          try {
            await db.prepare(sql).run()
          } catch (error) {
            const text = error instanceof Error ? error.message : String(error)
            if (!/duplicate column|already exists/i.test(text)) throw error
          }
        }
      })
      .catch((error) => {
        ready.delete(db)
        throw error
      })
    ready.set(db, pending)
  }
  return pending
}

export type SettingsRow = {
  owner_sub: string
  display_name: string
  accent: string
  income_color: string
  expense_color: string
  background_color: string
  cycle_day: number
  water_goal_ml?: number
  rest_timer_sec?: number
}

export type CategoryRow = {
  id: string
  name: string
  kind: string
  budget: number
  position: number
}

export type TransactionRow = {
  id: string
  kind: string
  amount: number
  category_id: string | null
  note: string
  occurred_at: number
  category_name?: string | null
}

const asKind = (value: string): Kind => (value === 'income' ? 'income' : 'expense')

export function mapSettings(row: SettingsRow): Settings {
  return {
    displayName: row.display_name,
    theme: {
      accent: row.accent,
      income: row.income_color,
      expense: row.expense_color,
      background: row.background_color,
    },
    cycleDay: row.cycle_day,
    waterGoalMl: row.water_goal_ml ?? 2000,
    restTimerSec: row.rest_timer_sec ?? 90,
  }
}

export function mapCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    kind: asKind(row.kind),
    budget: row.budget,
    position: row.position,
  }
}

export function mapTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    kind: asKind(row.kind),
    amount: row.amount,
    categoryId: row.category_id,
    categoryName: row.category_name ?? '',
    note: row.note,
    occurredAt: row.occurred_at,
  }
}

/** Creates the settings row and starter categories exactly once per account. */
export async function ensureUser(
  db: D1Database,
  owner: string,
  name: string | undefined,
): Promise<void> {
  const created = await db
    .prepare(
      `INSERT INTO settings (owner_sub, display_name, accent, income_color, expense_color, background_color, cycle_day)
       VALUES (?, ?, ?, ?, ?, ?, 1)
       ON CONFLICT(owner_sub) DO NOTHING
       RETURNING owner_sub`,
    )
    .bind(
      owner,
      (name ?? '').slice(0, 40),
      DEFAULT_THEME.accent,
      DEFAULT_THEME.income,
      DEFAULT_THEME.expense,
      DEFAULT_THEME.background,
    )
    .first()
  if (!created) return
  const now = Date.now()
  await db.batch(
    DEFAULT_CATEGORIES.map((category, index) =>
      db
        .prepare(
          'INSERT INTO categories (id, owner_sub, name, kind, budget, position, created_at) VALUES (?, ?, ?, ?, 0, ?, ?)',
        )
        .bind(
          crypto.randomUUID(),
          owner,
          category.name,
          category.kind,
          index,
          now,
        ),
    ),
  )
}

export function monthRange(month: string): [number, number] {
  const [year, mon] = month.split('-').map(Number)
  return [Date.UTC(year!, mon! - 1, 1), Date.UTC(year!, mon!, 1)]
}

export async function getData(
  db: D1Database,
  owner: string,
  month: string,
): Promise<AppData> {
  const [start, end] = monthRange(month)
  const settingsRow = await db
    .prepare('SELECT * FROM settings WHERE owner_sub = ?')
    .bind(owner)
    .first<SettingsRow>()
  const categories = await db
    .prepare(
      'SELECT id, name, kind, budget, position FROM categories WHERE owner_sub = ? ORDER BY position, created_at',
    )
    .bind(owner)
    .all<CategoryRow>()
  const transactions = await db
    .prepare(
      `SELECT t.id, t.kind, t.amount, t.category_id, t.note, t.occurred_at,
              COALESCE(c.name, '') AS category_name
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id AND c.owner_sub = t.owner_sub
       WHERE t.owner_sub = ? AND t.occurred_at >= ? AND t.occurred_at < ?
       ORDER BY t.occurred_at DESC, t.created_at DESC
       LIMIT 500`,
    )
    .bind(owner, start, end)
    .all<TransactionRow>()
  const totals = await db
    .prepare(
      `SELECT kind, SUM(amount) AS total FROM transactions
       WHERE owner_sub = ? AND occurred_at >= ? AND occurred_at < ?
       GROUP BY kind`,
    )
    .bind(owner, start, end)
    .all<{ kind: string; total: number }>()
  const budgetUsed = await db
    .prepare(
      `SELECT SUM(t.amount) AS total
       FROM transactions t
       JOIN categories c ON c.id = t.category_id AND c.owner_sub = t.owner_sub
       WHERE t.owner_sub = ? AND t.occurred_at >= ? AND t.occurred_at < ? AND c.budget > 0`,
    )
    .bind(owner, start, end)
    .first<{ total: number | null }>()

  const income = totals.results.find((row) => row.kind === 'income')?.total ?? 0
  const expense = totals.results.find((row) => row.kind === 'expense')?.total ?? 0
  const budgetTotal = categories.results
    .filter((row) => asKind(row.kind) === 'expense')
    .reduce((sum, row) => sum + row.budget, 0)

  const summary: MonthSummary = {
    month,
    income,
    expense,
    savings: income - expense,
    budgetTotal,
    budgetUsed: budgetUsed?.total ?? 0,
  }

  return {
    settings: settingsRow ? mapSettings(settingsRow) : {
      displayName: '',
      theme: DEFAULT_THEME,
      cycleDay: 1,
      waterGoalMl: 2000,
      restTimerSec: 90,
    },
    categories: categories.results.map(mapCategory),
    transactions: transactions.results.map(mapTransaction),
    summary,
  }
}
