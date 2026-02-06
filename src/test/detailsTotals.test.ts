import { describe, expect, it } from 'vitest'
import { calculateDetailsTotals } from '@/components/planner/detailsTotals'

describe('calculateDetailsTotals', () => {
  it('counts only non-deleted items and treats missing weights as zero', () => {
    const totals = calculateDetailsTotals(2.5, [
      { weight: 1.2 },
      { weight: null },
      { weight: undefined },
      { weight: 3.3, isDeleted: true },
    ])

    expect(totals.itemCount).toBe(3)
    expect(totals.totalWeightKg).toBeCloseTo(3.7, 6)
  })

  it('returns bag weight when there are no visible items', () => {
    const totals = calculateDetailsTotals(4, [
      { weight: 1, isDeleted: true },
    ])

    expect(totals.itemCount).toBe(0)
    expect(totals.totalWeightKg).toBe(4)
  })
})
