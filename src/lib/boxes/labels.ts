interface FormatBoxLabelOptions {
  ellipsis?: string
}

export type BoxLabelOrientation = 'horizontal' | 'vertical'

interface BoxLabelLayoutDecisionOptions {
  ellipsis?: string
  aggressiveTruncateThreshold?: number
}

interface DecideBoxLabelLayoutArgs {
  rawName: string
  horizontalMaxWidth: number
  verticalMaxRun: number
  measureText: (value: string) => number
  canRotateVertical: boolean
  options?: BoxLabelLayoutDecisionOptions
}

export interface BoxLabelLayout {
  text: string
  orientation: BoxLabelOrientation
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

/**
 * Decide whether to draw the label horizontally or vertically.
 * Vertical is considered only when rotation is enabled and horizontal would be hidden
 * or aggressively truncated.
 */
export function decideBoxLabelLayout({
  rawName,
  horizontalMaxWidth,
  verticalMaxRun,
  measureText,
  canRotateVertical,
  options = {},
}: DecideBoxLabelLayoutArgs): BoxLabelLayout | null {
  const name = rawName.trim()
  if (!name) return null

  const ellipsis = options.ellipsis ?? '...'
  const horizontal = formatBoxLabel(name, horizontalMaxWidth, measureText, { ellipsis })
  if (!horizontal) {
    if (!canRotateVertical) return null
    const verticalWhenHorizontalHidden = formatBoxLabel(name, verticalMaxRun, measureText, { ellipsis })
    return verticalWhenHorizontalHidden
      ? { text: verticalWhenHorizontalHidden, orientation: 'vertical' }
      : null
  }

  if (!canRotateVertical) {
    return { text: horizontal, orientation: 'horizontal' }
  }

  const threshold =
    Number.isFinite(options.aggressiveTruncateThreshold) &&
    options.aggressiveTruncateThreshold != null
      ? Math.max(0, Math.floor(options.aggressiveTruncateThreshold))
      : 8
  const isTruncated = horizontal !== name
  const visibleChars = horizontal.endsWith(ellipsis)
    ? Math.max(0, horizontal.length - ellipsis.length)
    : horizontal.length
  const shouldPreferVertical = isTruncated && visibleChars <= threshold

  if (!shouldPreferVertical) {
    return { text: horizontal, orientation: 'horizontal' }
  }

  const vertical = formatBoxLabel(name, verticalMaxRun, measureText, { ellipsis })
  if (!vertical) {
    return { text: horizontal, orientation: 'horizontal' }
  }

  return { text: vertical, orientation: 'vertical' }
}
