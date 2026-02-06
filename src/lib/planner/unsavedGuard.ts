export type UnsavedGuardAction =
  | 'close_panel'
  | 'toggle_edit_off'
  | 'delete_box'
  | 'reorder_boxes'
  | 'move_items'
  | 'navigate_away'

interface UnsavedGuardState {
  isDetailsPanelOpen: boolean
  hasUnsavedChanges: boolean
}

/**
 * Returns whether a user action must show the unsaved-changes guard.
 */
export function shouldPromptUnsavedGuard(
  action: UnsavedGuardAction,
  state: UnsavedGuardState
): boolean {
  const needsGuard = state.isDetailsPanelOpen && state.hasUnsavedChanges

  switch (action) {
    case 'close_panel':
    case 'toggle_edit_off':
    case 'delete_box':
    case 'reorder_boxes':
    case 'move_items':
    case 'navigate_away':
      return needsGuard
    default: {
      const exhaustiveCheck: never = action
      return exhaustiveCheck
    }
  }
}
