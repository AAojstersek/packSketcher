import { describe, expect, it } from 'vitest'
import { formatBoxLabel } from '@/lib/boxes/labels'

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
