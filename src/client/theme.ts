import type { Theme } from '../shared/types'

/** Sea-from-space palette: teal water, gold sand, deep navy. */
export const DEFAULT_THEME: Theme = {
  accent: '#17808d',
  income: '#1f7d68',
  expense: '#a26a0d',
  background: '#e9f1f5',
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement.style
  root.setProperty('--accent', theme.accent)
  root.setProperty('--income', theme.income)
  root.setProperty('--expense', theme.expense)
  root.setProperty('--bg', theme.background)
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme.background)
}

export const isHexColor = (value: string) => /^#[0-9a-fA-F]{6}$/.test(value)
