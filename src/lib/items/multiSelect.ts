/**
 * Toggle item id in a multi-select list while preserving insertion order.
 */
export function toggleMultiSelectItem(selectedIds: string[], itemId: string): string[] {
  if (selectedIds.includes(itemId)) {
    return selectedIds.filter((id) => id !== itemId)
  }
  return [...selectedIds, itemId]
}

/**
 * Remove ids that are no longer selectable.
 */
export function pruneMultiSelectItems(
  selectedIds: string[],
  selectableIds: string[]
): string[] {
  if (selectedIds.length === 0) return selectedIds
  const selectableSet = new Set(selectableIds)
  return selectedIds.filter((id) => selectableSet.has(id))
}
