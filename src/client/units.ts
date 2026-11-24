import type { BaseUnit, Unit } from '../shared/types'

export const UNITS: {
  value: Unit
  label: string
  base: BaseUnit
  factor: number
}[] = [
  { value: 'g', label: 'กรัม (g)', base: 'g', factor: 1 },
  { value: 'kg', label: 'กิโลกรัม (kg)', base: 'g', factor: 1000 },
  { value: 'ml', label: 'มิลลิลิตร (ml)', base: 'ml', factor: 1 },
  { value: 'l', label: 'ลิตร (l)', base: 'ml', factor: 1000 },
  { value: 'piece', label: 'ชิ้น / ฟอง', base: 'piece', factor: 1 },
]

export function unitFactor(unit: Unit): number {
  return UNITS.find((item) => item.value === unit)?.factor ?? 1
}

export function baseUnit(unit: Unit): BaseUnit {
  return UNITS.find((item) => item.value === unit)?.base ?? 'g'
}

export function unitAbbr(unit: Unit): string {
  const map: Record<Unit, string> = {
    g: 'ก.',
    kg: 'กก.',
    ml: 'มล.',
    l: 'ล.',
    piece: 'ชิ้น',
  }
  return map[unit]
}

export function toBase(quantity: number, unit: Unit): number {
  return quantity * unitFactor(unit)
}

const trim = (value: number) =>
  value.toLocaleString('th-TH', { maximumFractionDigits: 2 })

export function formatBase(quantity: number, base: BaseUnit): string {
  if (base === 'piece') return `${trim(quantity)} ชิ้น`
  if (base === 'g')
    return quantity >= 1000
      ? `${trim(quantity / 1000)} กก.`
      : `${trim(quantity)} ก.`
  return quantity >= 1000 ? `${trim(quantity / 1000)} ล.` : `${trim(quantity)} มล.`
}
