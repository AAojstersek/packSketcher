import { parseKgInput } from './bagDetailsValidation'

const MAX_ITEM_NAME_LENGTH = 60

/**
 * Normalizes item name: trims and enforces max length (60 chars).
 */
export function normalizeItemName(name: string): string {
  const trimmed = name.trim()
  return trimmed.length > MAX_ITEM_NAME_LENGTH
    ? trimmed.slice(0, MAX_ITEM_NAME_LENGTH)
    : trimmed
}

/**
 * Normalizes item weight (kg): accepts comma/dot decimals, clamps to >= 0.
 */
export function normalizeItemWeight(value: number | string): number {
  return parseKgInput(value)
}
