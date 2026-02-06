interface FormatBoxLabelOptions {
  ellipsis?: string
}

/**
 * Return a full or truncated label that fits maxWidth.
 * Returns null when even a meaningful truncated label cannot fit.
 */
export function formatBoxLabel(
  rawName: string,
  maxWidth: number,
  measureText: (value: string) => number,
  options: FormatBoxLabelOptions = {}
): string | null {
  const name = rawName.trim()
  if (!name) return null
  if (!Number.isFinite(maxWidth) || maxWidth <= 0) return null

  if (measureText(name) <= maxWidth) {
    return name
  }

  const ellipsis = options.ellipsis ?? '...'
  const ellipsisWidth = measureText(ellipsis)
  if (ellipsisWidth > maxWidth) {
    return null
  }

  let low = 1
  let high = name.length
  let bestPrefixLength = 0

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const candidate = `${name.slice(0, mid)}${ellipsis}`
    if (measureText(candidate) <= maxWidth) {
      bestPrefixLength = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  if (bestPrefixLength < 1) {
    return null
  }

  return `${name.slice(0, bestPrefixLength)}${ellipsis}`
}
