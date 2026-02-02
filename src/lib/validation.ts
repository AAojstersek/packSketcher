export const MAX_NAME_LENGTH = 60
export const WEIGHT_MIN = 0
export const WEIGHT_MAX = 9000

/**
 * Trim leading/trailing whitespace and clamp to max length.
 */
export function normalizeName(value: string): string {
  const trimmed = (value ?? '').trim()
  return trimmed.length > MAX_NAME_LENGTH
    ? trimmed.slice(0, MAX_NAME_LENGTH)
    : trimmed
}

/**
 * Validate a required name: returns an error message or null.
 * Always returns the normalized value for callers that need it.
 */
export function validateRequiredName(
  value: string
): { value: string; error: string | null } {
  const normalized = normalizeName(value)
  if (!normalized) {
    return { value: '', error: 'Name is required' }
  }
  return { value: normalized, error: null }
}

function parseNumberLike(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const cleaned = value.trim().replace(/,/g, '.')
  if (cleaned === '') return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

function clampWeightRange(weight: number): number {
  if (!Number.isFinite(weight)) return WEIGHT_MIN
  return Math.min(Math.max(weight, WEIGHT_MIN), WEIGHT_MAX)
}

/**
 * Normalize a required weight in kg. Blank/invalid => 0. Clamped to 0..9000.
 */
export function normalizeWeightKg(value: string | number): number {
  const parsed = parseNumberLike(value)
  const n = parsed ?? WEIGHT_MIN
  return clampWeightRange(n)
}

/**
 * Normalize an optional weight in kg. Blank/invalid => null. Valid numbers clamped to 0..9000.
 */
export function normalizeOptionalWeightKg(
  value: string | number | null | undefined
): number | null {
  const parsed = parseNumberLike(value)
  if (parsed === null) return null
  return clampWeightRange(parsed)
}

/**
 * Validate a weight (optional). Returns an error message or null.
 */
export function validateWeightKg(weight: number | null): string | null {
  if (weight === null) return null
  if (!Number.isFinite(weight)) return 'Weight must be a number'
  if (weight < WEIGHT_MIN || weight > WEIGHT_MAX) return 'Weight must be between 0 and 9000'
  return null
}
