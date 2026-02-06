import { describe, expect, it } from 'vitest'
import { nextBoxName } from '@/lib/boxes/naming'

describe('nextBoxName', () => {
  it('starts at Box 1 when no existing names match', () => {
    expect(nextBoxName([])).toBe('Box 1')
    expect(nextBoxName(['Tent', 'Main Bag'])).toBe('Box 1')
  })

  it('returns the smallest free Box number', () => {
    expect(nextBoxName(['Box 1', 'Box 3'])).toBe('Box 2')
    expect(nextBoxName(['box 2', 'Box 1', 'Box 4'])).toBe('Box 3')
  })

  it('ignores invalid Box formats and non-positive numbers', () => {
    expect(nextBoxName(['Box', 'Box 0', 'Box -1', 'Box 2a'])).toBe('Box 1')
  })
})
