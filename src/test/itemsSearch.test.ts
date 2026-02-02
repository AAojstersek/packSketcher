import { describe, expect, it } from 'vitest'
import {
  parseItemsSearchQuery,
  shapeItemsSearchResults,
  type RawItemsSearchRow,
} from '@/lib/items/search'

describe('parseItemsSearchQuery', () => {
  it('requires at least 3 characters', () => {
    expect(parseItemsSearchQuery('ab')).toEqual({ term: 'ab', shouldQuery: false })
    expect(parseItemsSearchQuery('abc')).toEqual({ term: 'abc', shouldQuery: true })
  })

  it('trims whitespace', () => {
    expect(parseItemsSearchQuery('   abc  ')).toEqual({ term: 'abc', shouldQuery: true })
  })
})

describe('shapeItemsSearchResults', () => {
  const baseRow: RawItemsSearchRow = {
    name: 'Pump',
    bag_id: 'bag-1',
    bags: {
      id: 'bag-1',
      name: 'Front Box',
      pack_id: 'pack-1',
      packs: {
        background_id: 'bg-1',
        backgrounds: { id: 'bg-1', name: 'Garage' },
      },
    },
  }

  it('maps nested rows into the UI-friendly shape', () => {
    const shaped = shapeItemsSearchResults([baseRow])
    expect(shaped).toEqual([
      {
        itemName: 'Pump',
        workspaceName: 'Garage',
        boxName: 'Front Box',
        backgroundId: 'bg-1',
        bagId: 'bag-1',
      },
    ])
  })

  it('drops rows missing required context', () => {
    const missingWorkspace: RawItemsSearchRow = {
      ...baseRow,
      bags: { ...baseRow.bags, packs: { background_id: 'bg-1', backgrounds: null } },
    }
    const shaped = shapeItemsSearchResults([missingWorkspace])
    expect(shaped).toEqual([])
  })
})
