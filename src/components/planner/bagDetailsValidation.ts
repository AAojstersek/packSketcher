/**
 * Validation helpers for bag details panel.
 *
 * Manual test checklist:
 * - Name: trim whitespace; enforce 60-char max (slice).
 * - Bag weight: 0, negative (clamp to 0), decimal (round); persistence after refresh.
 * - Lock toggle: persistence; locked bag cannot drag/resize/delete in Edit mode.
 * - Color: preset or picker; persistence.
 */

import { normalizeName, normalizeWeightKg } from '@/lib/validation'

/**
 * Normalizes bag name: trims and enforces max length (60 chars).
 */
export function normalizeBagName(name: string): string {
  return normalizeName(name)
}

/**
 * Normalizes bag weight: coerces to number, rounds, clamps to >= 0. Returns integer.
 */
export function normalizeBagWeight(value: number | string): number {
  const normalized = normalizeWeightKg(value)
  const rounded = Math.round(normalized)
  return Math.max(0, rounded)
}

/**
 * Normalizes bag weight in kg: accepts comma/dot decimals, clamps to >= 0.
 */
export function normalizeBagWeightKg(value: number | string): number {
  return normalizeWeightKg(value)
}
