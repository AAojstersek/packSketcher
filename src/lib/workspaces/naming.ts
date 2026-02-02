import { MAX_NAME_LENGTH, normalizeName } from '@/lib/validation'

/**
 * Return the smallest free name using the pattern:
 *   - If base is free (case-insensitive): base
 *   - Else: base (2), base (3), ... using the first available number.
 * Names are normalized (trim + clamp to max length) before comparison.
 */
export function smallestFreeWorkspaceName(baseName: string, existingNames: string[]): string {
  const normalizedBase = normalizeName(baseName)
  const occupied = new Set(
    existingNames.map((n) => normalizeName(n).toLowerCase())
  )

  const baseKey = normalizedBase.toLowerCase()
  if (!occupied.has(baseKey)) {
    return normalizedBase
  }

  let counter = 2
  while (true) {
    const suffix = ` (${counter})`
    // Ensure we don't exceed max length when adding suffix.
    const trimmedBase =
      normalizedBase.length + suffix.length > MAX_NAME_LENGTH
        ? normalizedBase.slice(0, MAX_NAME_LENGTH - suffix.length)
        : normalizedBase
    const candidate = `${trimmedBase}${suffix}`
    const candidateKey = normalizeName(candidate).toLowerCase()
    if (!occupied.has(candidateKey)) {
      return normalizeName(candidate)
    }
    counter += 1
  }
}
