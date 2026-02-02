import { normalizeName, normalizeOptionalWeightKg } from '@/lib/validation'

const MAX_ITEM_NAME_LENGTH = 60

/**
 * Normalizes item name: trims and enforces max length (60 chars).
 */
export function normalizeItemName(name: string): string {
  const normalized = normalizeName(name)
  return normalized.length > MAX_ITEM_NAME_LENGTH
    ? normalized.slice(0, MAX_ITEM_NAME_LENGTH)
    : normalized
}

/**
 * Normalizes item weight (kg): accepts comma/dot decimals, clamps to >= 0.
 */
export function normalizeItemWeight(value: number | string | null | undefined): number | null {
  return normalizeOptionalWeightKg(value)
}
