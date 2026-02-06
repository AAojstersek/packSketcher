export interface TotalItemLike {
  weight: number | null | undefined
  isDeleted?: boolean
}

export interface DetailsTotalsResult {
  itemCount: number
  totalWeightKg: number
}

/**
 * Computes visible item count and total bag weight in kg.
 * Missing item weights are treated as zero.
 */
export function calculateDetailsTotals(
  bagWeightKg: number,
  items: TotalItemLike[]
): DetailsTotalsResult {
  const visibleItems = items.filter((item) => !item.isDeleted)
  const itemWeightKg = visibleItems.reduce((sum, item) => sum + (item.weight ?? 0), 0)

  return {
    itemCount: visibleItems.length,
    totalWeightKg: bagWeightKg + itemWeightKg,
  }
}
