import { describe, expect, it } from 'vitest'
import { shouldPromptUnsavedGuard, type UnsavedGuardAction } from '@/lib/planner/unsavedGuard'

const actions: UnsavedGuardAction[] = [
  'close_panel',
  'toggle_edit_off',
  'delete_box',
  'reorder_boxes',
  'move_items',
  'navigate_away',
]

describe('shouldPromptUnsavedGuard', () => {
  it('prompts for each guarded action when panel is open and dirty', () => {
    for (const action of actions) {
      expect(
        shouldPromptUnsavedGuard(action, {
          isDetailsPanelOpen: true,
          hasUnsavedChanges: true,
        })
      ).toBe(true)
    }
  })

  it('does not prompt when panel is closed', () => {
    for (const action of actions) {
      expect(
        shouldPromptUnsavedGuard(action, {
          isDetailsPanelOpen: false,
          hasUnsavedChanges: true,
        })
      ).toBe(false)
    }
  })

  it('does not prompt when there are no unsaved changes', () => {
    for (const action of actions) {
      expect(
        shouldPromptUnsavedGuard(action, {
          isDetailsPanelOpen: true,
          hasUnsavedChanges: false,
        })
      ).toBe(false)
    }
  })
})
