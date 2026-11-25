import type { Settings } from '../shared/types'
import { isRecord } from './dataguard'
import * as store from './localstore'
import { DEFAULT_SETTINGS } from './localstore'

export type BackupData = {
  settings: Settings
  categories: store.CategoryRecord[]
  transactions: store.TransactionRecord[]
  ingredients: store.IngredientRecord[]
  recipes: store.RecipeRecord[]
  supplements: store.SupplementRecord[]
  plan: store.PlanRecord[]
  water: store.WaterRecord[]
  body: store.BodyRecord[]
  workouts: store.WorkoutRecord[]
  activities: store.ActivityRecord[]
  checkins: store.CheckinRecord[]
}

export type BackupFile = {
  app: 'cvis'
  version: 1
  exportedAt: string
  data: BackupData
}

export async function createBackup(): Promise<BackupFile> {
  const [
    settings,
    categories,
    transactions,
    ingredients,
    recipes,
    supplements,
    plan,
    water,
    body,
    workouts,
    activities,
    checkins,
  ] = await Promise.all([
    store.readSettings(),
    store.getAll<store.CategoryRecord>('categories'),
    store.getAll<store.TransactionRecord>('transactions'),
    store.getAll<store.IngredientRecord>('ingredients'),
    store.getAll<store.RecipeRecord>('recipes'),
    store.getAll<store.SupplementRecord>('supplements'),
    store.getAll<store.PlanRecord>('plan'),
    store.getAll<store.WaterRecord>('water'),
    store.getAll<store.BodyRecord>('body'),
    store.getAll<store.WorkoutRecord>('workouts'),
    store.getAll<store.ActivityRecord>('activities'),
    store.getAll<store.CheckinRecord>('checkins'),
  ])

  return {
    app: 'cvis',
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      settings,
      categories,
      transactions,
      ingredients,
      recipes,
      supplements,
      plan,
      water,
      body,
      workouts,
      activities,
      checkins,
    },
  }
}

/** Saves a JSON file the owner can keep or move to another device. */
export async function downloadBackup(): Promise<void> {
  const backup = await createBackup()
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `cvis-backup-${backup.exportedAt.slice(0, 10)}.json`
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const HEX = /^#[0-9a-fA-F]{6}$/

function hex(value: unknown, fallback: string): string {
  return typeof value === 'string' && HEX.test(value) ? value.toLowerCase() : fallback
}

function intInRange(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
    ? value
    : fallback
}

function readSettings(value: unknown): Settings {
  if (!isRecord(value)) return DEFAULT_SETTINGS
  const theme = isRecord(value.theme) ? value.theme : {}
  return {
    displayName:
      typeof value.displayName === 'string'
        ? value.displayName.trim().slice(0, 40)
        : '',
    theme: {
      accent: hex(theme.accent, DEFAULT_SETTINGS.theme.accent),
      income: hex(theme.income, DEFAULT_SETTINGS.theme.income),
      expense: hex(theme.expense, DEFAULT_SETTINGS.theme.expense),
      background: hex(theme.background, DEFAULT_SETTINGS.theme.background),
    },
    cycleDay: intInRange(value.cycleDay, 1, 28, DEFAULT_SETTINGS.cycleDay),
    waterGoalMl: intInRange(value.waterGoalMl, 0, 20000, DEFAULT_SETTINGS.waterGoalMl),
    restTimerSec: intInRange(value.restTimerSec, 5, 900, DEFAULT_SETTINGS.restTimerSec),
  }
}

function validRows(value: unknown, key: 'id' | 'day'): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error('ไฟล์สำรองไม่สมบูรณ์')
  return value.filter(
    (row): row is Record<string, unknown> =>
      isRecord(row) && typeof row[key] === 'string' && Boolean(row[key]),
  )
}

export type ImportResult = {
  transactions: number
  activities: number
  water: number
  workouts: number
}

/** Replaces every local store with the contents of a Cvis backup file. */
export async function importBackup(text: string): Promise<ImportResult> {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('ไฟล์นี้ไม่ใช่ไฟล์สำรองของ Cvis')
  }
  if (!isRecord(parsed) || parsed.app !== 'cvis' || !isRecord(parsed.data))
    throw new Error('ไฟล์นี้ไม่ใช่ไฟล์สำรองของ Cvis')
  const data = parsed.data

  const categories = validRows(data.categories, 'id') as unknown as store.CategoryRecord[]
  const transactions = validRows(
    data.transactions,
    'id',
  ) as unknown as store.TransactionRecord[]
  const ingredients = validRows(
    data.ingredients,
    'id',
  ) as unknown as store.IngredientRecord[]
  const recipes = validRows(data.recipes, 'id') as unknown as store.RecipeRecord[]
  const supplements = validRows(
    data.supplements,
    'id',
  ) as unknown as store.SupplementRecord[]
  const plan = validRows(data.plan, 'id') as unknown as store.PlanRecord[]
  const water = validRows(data.water, 'id') as unknown as store.WaterRecord[]
  const body = validRows(data.body, 'day') as unknown as store.BodyRecord[]
  const workouts = validRows(data.workouts, 'id') as unknown as store.WorkoutRecord[]
  const activities = validRows(
    data.activities,
    'id',
  ) as unknown as store.ActivityRecord[]
  const checkins = validRows(data.checkins, 'day') as unknown as store.CheckinRecord[]
  const settings = readSettings(data.settings)

  await store.replaceAll([
    {
      store: 'meta',
      values: [{ key: 'settings', value: settings } satisfies store.SettingsRecord],
    },
    { store: 'categories', values: categories },
    { store: 'transactions', values: transactions },
    { store: 'ingredients', values: ingredients },
    { store: 'recipes', values: recipes },
    { store: 'supplements', values: supplements },
    { store: 'plan', values: plan },
    { store: 'water', values: water },
    { store: 'body', values: body },
    { store: 'workouts', values: workouts },
    { store: 'activities', values: activities },
    { store: 'checkins', values: checkins },
  ])

  return {
    transactions: transactions.length,
    activities: activities.length,
    water: water.length,
    workouts: workouts.length,
  }
}
