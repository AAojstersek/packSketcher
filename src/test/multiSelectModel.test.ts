import { describe, expect, it } from 'vitest'
import { pruneMultiSelectItems, toggleMultiSelectItem } from '@/lib/items/multiSelect'

describe('multi-select selection model', () => {
  it('toggles an item on and off', () => {
    const selected = toggleMultiSelectItem([], 'item-1')
    expect(selected).toEqual(['item-1'])

    const unselected = toggleMultiSelectItem(selected, 'item-1')
    expect(unselected).toEqual([])
  })

  it('preserves selection order when adding multiple items', () => {
    const selected = toggleMultiSelectItem([], 'item-2')
    const next = toggleMultiSelectItem(selected, 'item-1')
    expect(next).toEqual(['item-2', 'item-1'])
  })

  it('prunes selected ids that are no longer selectable', () => {
    const pruned = pruneMultiSelectItems(['a', 'b', 'c'], ['c', 'a'])
    expect(pruned).toEqual(['a', 'c'])
  })
})
