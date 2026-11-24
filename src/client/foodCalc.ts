import type { BaseUnit, PlanEntry, Recipe } from '../shared/types'
import { baseUnit, toBase } from './units'

export type Usage = {
  name: string
  base: BaseUnit
  quantity: number
  cost: number
}

/** Ingredient quantities and cost needed for a set of calendar entries. */
export function ingredientUsage(
  entries: PlanEntry[],
  recipes: Recipe[],
): Usage[] {
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]))
  const totals = new Map<string, Usage>()
  for (const entry of entries) {
    if (entry.kind !== 'meal') continue
    const recipe = byId.get(entry.refId)
    if (!recipe || recipe.servings <= 0) continue
    const scale = entry.servings / recipe.servings
    for (const item of recipe.items) {
      const base = baseUnit(item.unit)
      const key = `${item.name}|${base}`
      const current = totals.get(key) ?? {
        name: item.name,
        base,
        quantity: 0,
        cost: 0,
      }
      current.quantity += toBase(item.quantity, item.unit) * scale
      current.cost += item.cost * scale
      totals.set(key, current)
    }
  }
  return [...totals.values()].sort((a, b) => a.name.localeCompare(b.name, 'th'))
}
