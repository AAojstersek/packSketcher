import { describe, expect, it } from 'vitest'
import { reorderBagsOneStep } from '@/lib/boxes/reorder'
import type { Bag } from '@/types'

function bag(id: string, zIndex: number): Bag {
  return {
    id,
    pack_id: 'pack-1',
    user_id: 'user-1',
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    created_at: '2026-01-01T00:00:00Z',
    name: id,
    color: '#000000',
    bag_weight: 0,
    locked: false,
    updated_at: '2026-01-01T00:00:00Z',
    z_index: zIndex,
  }
}

describe('reorderBagsOneStep', () => {
  it('swaps with next z-index when moving forward', () => {
    const items = [bag('a', 1), bag('b', 2), bag('c', 3)]
    const result = reorderBagsOneStep(items, 'b', 'forward')

    expect(result.swapped).toBe(true)
    expect(result.nextItems.find((item) => item.id === 'b')?.z_index).toBe(3)
    expect(result.nextItems.find((item) => item.id === 'c')?.z_index).toBe(2)
  })

  it('swaps with previous z-index when moving backward', () => {
    const items = [bag('a', 1), bag('b', 2), bag('c', 3)]
    const result = reorderBagsOneStep(items, 'b', 'backward')

    expect(result.swapped).toBe(true)
    expect(result.nextItems.find((item) => item.id === 'b')?.z_index).toBe(1)
    expect(result.nextItems.find((item) => item.id === 'a')?.z_index).toBe(2)
  })

  it('returns no-op at boundaries', () => {
    const items = [bag('a', 1), bag('b', 2), bag('c', 3)]
    const top = reorderBagsOneStep(items, 'c', 'forward')
    const bottom = reorderBagsOneStep(items, 'a', 'backward')

    expect(top.swapped).toBe(false)
    expect(bottom.swapped).toBe(false)
    expect(top.nextItems).toBe(items)
    expect(bottom.nextItems).toBe(items)
  })
})
