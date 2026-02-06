import type { Bag } from '@/types'
import type { SwapDirection } from '@/lib/rpc/bags'

export interface ReorderResult {
  nextItems: Bag[]
  swapped: boolean
}

function sortByLayer(items: Bag[]): Bag[] {
  return [...items].sort((a, b) => {
    if (a.z_index !== b.z_index) return a.z_index - b.z_index
    if (a.created_at !== b.created_at) return a.created_at.localeCompare(b.created_at)
    return a.id.localeCompare(b.id)
  })
}

export function reorderBagsOneStep(
  items: Bag[],
  bagId: string,
  direction: SwapDirection
): ReorderResult {
  const ordered = sortByLayer(items)
  const index = ordered.findIndex((item) => item.id === bagId)
  if (index < 0) return { nextItems: items, swapped: false }

  const neighborIndex = direction === 'forward' ? index + 1 : index - 1
  if (neighborIndex < 0 || neighborIndex >= ordered.length) {
    return { nextItems: items, swapped: false }
  }

  const current = ordered[index]
  const neighbor = ordered[neighborIndex]

  const nextItems = items.map((item) => {
    if (item.id === current.id) {
      return { ...item, z_index: neighbor.z_index }
    }
    if (item.id === neighbor.id) {
      return { ...item, z_index: current.z_index }
    }
    return item
  })

  return { nextItems, swapped: true }
}
