/**
 * Validation helpers for bag details panel.
 *
 * Manual test checklist:
 * - Name: trim whitespace; enforce 60-char max (slice).
 * - Bag weight: 0, negative (clamp to 0), decimal (round); persistence after refresh.
 * - Lock toggle: persistence; locked bag cannot drag/resize/delete in Edit mode.
 * - Color: preset or picker; persistence.
 */

const MAX_NAME_LENGTH = 60

/**
 * Parses a string or number into a non-negative kg value.
 * Accepts comma or dot decimals; empty/invalid => 0.
 * Examples: "0,9" => 0.9, ",3" => 0.3, "1." => 1, "" => 0.
 */
export function parseKgInput(value: string | number): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.max(0, value) : 0
  }
  let s = value.trim().replace(/,/g, '.')
  if (s.startsWith('.')) s = '0' + s
  const n = parseFloat(s)
  return Number.isFinite(n) ? Math.max(0, n) : 0
}

/**
 * Normalizes bag name: trims and enforces max length (60 chars).
 */
export function normalizeBagName(name: string): string {
  const trimmed = name.trim()
  return trimmed.length > MAX_NAME_LENGTH ? trimmed.slice(0, MAX_NAME_LENGTH) : trimmed
}

/**
 * Normalizes bag weight: coerces to number, rounds, clamps to >= 0. Returns integer.
 */
export function normalizeBagWeight(value: number | string): number {
  const num = typeof value === 'string' ? Number(value) : value
  const rounded = Math.round(Number.isFinite(num) ? num : 0)
  const result = Math.max(0, rounded)
  if (process.env.NODE_ENV === 'development') {
    console.assert(Number.isInteger(result), 'bag_weight must be integer')
  }
  return result
}

/**
 * Normalizes bag weight in kg: accepts comma/dot decimals, clamps to >= 0.
 */
export function normalizeBagWeightKg(value: number | string): number {
  return parseKgInput(value)
}
