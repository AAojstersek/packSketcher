import { describe, expect, it } from 'vitest'
import { decideBoxLabelLayout, formatBoxLabel } from '@/lib/boxes/labels'

const monospaceMeasure = (value: string) => value.length * 8

describe('formatBoxLabel', () => {
  it('returns the full label when it fits', () => {
    expect(formatBoxLabel('Camera Gear', 120, monospaceMeasure)).toBe('Camera Gear')
  })

  it('truncates with ellipsis when needed', () => {
    expect(formatBoxLabel('Emergency Supplies', 88, monospaceMeasure)).toBe('Emergenc...')
  })

  it('returns null when label area is too small', () => {
    expect(formatBoxLabel('Tent', 16, monospaceMeasure)).toBeNull()
  })
})

describe('decideBoxLabelLayout', () => {
  it('keeps horizontal label on desktop', () => {
    expect(
      decideBoxLabelLayout({
        rawName: 'Emergency Supplies',
        horizontalMaxWidth: 88,
        verticalMaxRun: 200,
        measureText: monospaceMeasure,
        isMobile: false,
      })
    ).toEqual({ text: 'Emergenc...', orientation: 'horizontal' })
  })

  it('prefers vertical label on mobile when horizontal is aggressively truncated', () => {
    expect(
      decideBoxLabelLayout({
        rawName: 'Emergency Supplies',
        horizontalMaxWidth: 88,
        verticalMaxRun: 200,
        measureText: monospaceMeasure,
        isMobile: true,
      })
    ).toEqual({ text: 'Emergency Supplies', orientation: 'vertical' })
  })

  it('uses vertical fallback when horizontal label cannot fit on mobile', () => {
    expect(
      decideBoxLabelLayout({
        rawName: 'Tent',
        horizontalMaxWidth: 16,
        verticalMaxRun: 64,
        measureText: monospaceMeasure,
        isMobile: true,
      })
    ).toEqual({ text: 'Tent', orientation: 'vertical' })
  })

  it('falls back to horizontal when vertical layout cannot fit', () => {
    expect(
      decideBoxLabelLayout({
        rawName: 'Emergency Supplies',
        horizontalMaxWidth: 88,
        verticalMaxRun: 16,
        measureText: monospaceMeasure,
        isMobile: true,
      })
    ).toEqual({ text: 'Emergenc...', orientation: 'horizontal' })
  })

  it('does not rotate on mobile when the full horizontal label already fits', () => {
    expect(
      decideBoxLabelLayout({
        rawName: 'Tent',
        horizontalMaxWidth: 120,
        verticalMaxRun: 120,
        measureText: monospaceMeasure,
        isMobile: true,
      })
    ).toEqual({ text: 'Tent', orientation: 'horizontal' })
  })

  it('handles trim and empty values', () => {
    expect(
      decideBoxLabelLayout({
        rawName: '   Camera Gear   ',
        horizontalMaxWidth: 120,
        verticalMaxRun: 120,
        measureText: monospaceMeasure,
        isMobile: false,
      })
    ).toEqual({ text: 'Camera Gear', orientation: 'horizontal' })

    expect(
      decideBoxLabelLayout({
        rawName: '   ',
        horizontalMaxWidth: 120,
        verticalMaxRun: 120,
        measureText: monospaceMeasure,
        isMobile: true,
      })
    ).toBeNull()
  })
})
