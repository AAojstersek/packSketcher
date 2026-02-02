# PackSketcher (MVP) — TODO Checklist

Last updated: 2026-02-01

## Prompt Map (When to Use Which Prompt)
- Prompt 0: test harness setup (Vitest + RTL + jsdom).
- Prompt 1: types + shared validation alignment.
- Prompt 2: Supabase error mapping utility.
- Prompt 3: backgrounds API suffix logic + friendly errors.
- Prompt 4: global items search API.
- Prompt 5: activities API.
- Prompt 6: forgot-password page + login link.
- Prompt 7: reset-password page + middleware matcher update.
- Prompt 8: dashboard workspace list + delete behavior.
- Prompt 9: dashboard template create flow.
- Prompt 10: dashboard global item search UI.
- Prompt 11: activity feed UI.
- Prompt 12: planner client shell (shared state).
- Prompt 13: add box button + remove click-to-add.
- Prompt 14: box label rendering + z-index order.
- Prompt 15: context menu reorder/delete + swap RPC.
- Prompt 16: gear icon + details panel open rules.
- Prompt 17: details panel save/cancel + totals.
- Prompt 18: unsaved changes guard modal.
- Prompt 19: multi-select + bulk move UI.
- Prompt 20: bulk move RPC + conflict flow + undo.
- Prompt 21: integration wiring + regression checks.

## Phase 0 — Baseline & Setup (Prompt 0)
- [x] Review repo structure and App Router boundaries (server vs client components).
- [x] Verify Supabase client usage (`src/lib/supabase/server.ts`, `src/lib/supabase/browser.ts`).
- [x] Inventory current planner behavior vs spec gaps.
- [x] Confirm required env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`).
- [x] Migrate middleware to Next.js 16 `proxy` convention.
- [x] Decide on test runner and add harness (Vitest + RTL + jsdom recommended).
- [x] Add `test` and `test:watch` scripts to `package.json`.
- [x] Add `vitest.config.ts` and `src/test/setup.ts` with `@testing-library/jest-dom`.
- [x] Add a smoke test to validate test harness.

## Phase 1 — Types, Validation, Error Mapping (Prompts 1–2)
- [x] Align `src/types/index.ts` with DB constraints:
  - [x] Add `Bag.z_index`.
  - [x] Make `Item.weight` nullable.
  - [x] Add `Item.last_moved_at`.
  - [x] Add `Activity` type.
- [x] Add shared validation helpers (trim, non-empty, max 60, weight 0..9000, optional item weight) in `src/lib/validation.ts`.
- [x] Refactor existing validation helpers to use shared helpers:
  - [x] `src/components/planner/bagDetailsValidation.ts`.
  - [x] `src/components/planner/itemsValidation.ts`.
- [x] Add Supabase error mapping helper in `src/lib/supabase/errorMapping.ts`.
- [x] Unit tests for validation helpers.
- [x] Unit tests for error mapping helper.

## Phase 2 — API Layer (Prompts 3–5)
### Backgrounds API (Prompt 3)
- [x] Update `src/app/api/backgrounds/route.ts`:
  - [x] Enforce smallest-free-number suffix logic for template creation.
  - [x] Trim + validate names.
  - [x] Map DB errors to friendly messages.
- [x] Ensure `src/app/api/backgrounds/[id]/route.ts` uses error mapping for delete.
- [x] Add helper `src/lib/workspaces/naming.ts` and unit tests.

### Items Search API (Prompt 4)
- [x] Add `src/app/api/items/search/route.ts`.
- [x] Enforce 3+ chars; return empty result otherwise.
- [x] Search `items.name` + `items.description` (case-insensitive contains).
- [x] Limit 20, sort by `last_moved_at desc`.
- [x] Return fields for UI: item name, workspace name, box name, backgroundId, bagId.
- [x] Unit tests for param validation/response shaping.

### Activities API (Prompt 5)
- [x] Add `src/app/api/activities/route.ts`.
- [x] Return last 20 activities ordered by `created_at desc`.
- [x] Unit test response shape.

### RPC Wiring (Prompts 15, 20)
- [x] Add helper for `swap_bag_z_index` RPC usage (planner reorder).
- [x] Add helper for `move_items_bulk` + `undo_move_items_bulk` RPC usage.
- [x] Map RPC conflicts into UI-friendly errors.

## Phase 3 — Auth + Reset Password (Prompts 6–7)
- [x] Add `/forgot-password` page:
  - [x] Email input + submit.
  - [x] Call `resetPasswordForEmail` with redirect to `/reset-password`.
  - [x] Use `NEXT_PUBLIC_SITE_URL`.
  - [x] Show success/error states.
- [x] Add `/reset-password` page:
  - [x] Password + confirm fields.
  - [x] Call Supabase update password.
  - [x] Auto-auth and redirect to `/dashboard` on success.
- [x] Update `middleware.ts` matcher to allow `/forgot-password` + `/reset-password`.
- [x] Add link to `/forgot-password` on login page.
- [x] Tests for forgot/reset flows (mock Supabase client).

## Phase 4 — Dashboard (Prompts 8–11)
### Workspaces (Prompt 8)
- [ ] Ensure workspace cards list and delete confirmation are correct.
- [ ] Hide workspace type in UI (type stored only in DB).
- [ ] Ensure delete cascades via DB FKs (verify in UI + DB).

### Templates (Prompt 9)
- [ ] Update template create flow to use suffix logic from API.
- [ ] Show friendly error messages on create failure.

### Global Item Search (Prompt 10)
- [ ] Add global search input component.
- [ ] Add debounce (200–300ms).
- [ ] Show hint “Type 3+ characters” for <3 chars.
- [ ] Add dropdown under input.
- [ ] Close dropdown on outside click or Escape.
- [ ] Show row format: `Item name — Workspace / Box`.
- [ ] Clicking result navigates to planner and selects/highlights box.
- [ ] No auto-pan/zoom; no auto-open details panel.
- [ ] Tests for debounce + open/close + click navigation.

### Activity Feed (Prompt 11)
- [ ] Replace “Your Stats” placeholder with feed component.
- [ ] Show last 20 activity records.
- [ ] Relative timestamps (e.g., “2h ago”).
- [ ] Collapsible/minimizable state (not persisted).
- [ ] Tests for relative time formatting and collapse behavior.

## Phase 5 — Planner Core (Prompts 12–16)
### State & Layout (Prompt 12)
- [ ] Create a client `PlannerShell` to share state between header and canvas.
- [ ] Lift `isEditMode`, `selectedBagId`, `highlightBagId` to shell.
- [ ] Remove edit toggle button from canvas overlay; move to header.
- [ ] Ensure default mode is View on each load.

### Add Box (Prompt 13)
- [ ] Add “+ Add box” button in header (Edit mode only).
- [ ] New box centered in viewport.
- [ ] Default size 250×120 in original image coordinates.
- [ ] Default name `Box N` smallest free number in workspace.
- [ ] Immediately open details panel for new box.
- [ ] Remove “click empty space creates box”.
- [ ] Unit test for `Box N` naming helper.

### Selection + Rendering (Prompt 14)
- [ ] Ensure selection works in View + Edit modes.
- [ ] Draw labels in top-left, scale with zoom.
- [ ] Truncate/hide labels if they don’t fit.
- [ ] Render order by `z_index` (higher drawn last).
- [ ] Highlight box when navigated from search.

### Move / Resize (Prompt 13, follow-on)
- [ ] Desktop: first click selects; drag moves if selected.
- [ ] Desktop: resize handles in Edit mode.
- [ ] Persist move/resize to DB.
- [ ] Roll back on DB error with message.

### Mobile Gestures (Prompt 13, follow-on)
- [ ] One-finger drag moves selected box.
- [ ] Pinch to zoom, two-finger pan.
- [ ] One finger reserved for box interactions.

### Context Menu (Reorder + Delete) (Prompt 15)
- [ ] Desktop right-click; mobile long-press.
- [ ] Menu: bring forward, send backward, delete.
- [ ] Reorder uses `swap_bag_z_index` RPC (1-step swap).
- [ ] Delete shows confirm.
- [ ] Optimistic UI + rollback on error.

## Phase 6 — Details Panel (Prompts 16–18)
### Open/Close Rules (Prompt 16)
- [ ] Desktop: double-click OR gear icon overlay to open.
- [ ] Mobile: gear icon overlay only.
- [ ] Overlay click closes.
- [ ] Esc closes (desktop).
- [ ] If panel open and user selects another box, panel stays on current box.

### Save Model (Prompt 17)
- [ ] Manual Save/Cancel (no auto-save).
- [ ] Use `save_bag_details` RPC for atomic save.
- [ ] Show “Saved” feedback.
- [ ] Inline error display for save failures.

### Totals (Prompt 17)
- [ ] Total weight (bag + items; missing item weight treated as 0).
- [ ] Item count.

### Unsaved Changes Guard (Prompt 18)
- [ ] Guard when:
  - [ ] closing panel
  - [ ] toggling Edit off
  - [ ] deleting a box
  - [ ] reordering boxes
  - [ ] moving items
  - [ ] navigating away
- [ ] Modal: Cancel / Save / Discard.

## Phase 7 — Items + Bulk Move (Prompts 19–20)
### Items CRUD (Prompt 19)
- [ ] Name required, max 60, unique per box (case-insensitive).
- [ ] Description optional.
- [ ] Weight optional (null allowed), 0..9000.
- [ ] Prevent duplicates in UI + DB.

### Multi-select Mode (Prompt 19)
- [ ] Toggle available on desktop + mobile.
- [ ] When ON: tap/click selects items; no per-item edit.
- [ ] Exit multi-select to edit items.

### Bulk Move (Prompt 19)
- [ ] “Move selected” action.
- [ ] Target search across Workspace / Box.
- [ ] Exclude current box by default.
- [ ] If unsaved changes exist: require Save/Discard first.

### Conflict Handling (Prompt 20)
- [ ] Detect duplicate name conflicts (case-insensitive).
- [ ] Prompt rename for conflicts, one by one in alphabetical order.
- [ ] Allow cancel.

### RPC Move + Undo (Prompt 20)
- [ ] Use `move_items_bulk` RPC (single call).
- [ ] Preserve `created_at`, update `updated_at` and `last_moved_at`.
- [ ] Create single activity record per move.
- [ ] Undo toast (10s) using `undo_move_items_bulk`.
- [ ] Undo restores names and locations.

## Phase 8 — Activity Feed Events (Prompt 21, plus DB triggers)
- [ ] Workspace renamed / deleted events logged.
- [ ] Box created / deleted events logged.
- [ ] Item created / deleted events logged.
- [ ] Item moved event from RPC.
- [ ] Ensure feed updates after actions.

## Phase 9 — Error Handling (Prompts 2, 15, 20)
- [ ] Map DB unique/check failures to user-friendly messages.
- [ ] Roll back optimistic UI on failure (move/resize/reorder/delete).
- [ ] RPC conflict failures show rename UI, no partial moves.

## Phase 10 — Security (Manual verification)
- [ ] RLS remains enforced.
- [ ] RPC functions validate `auth.uid()` ownership.

## Phase 11 — Testing & Regression (Prompt 21)
### DB Constraints (manual or automated)
- [ ] Duplicate name (case variants) fails for workspace/box/item.
- [ ] Trim constraints fail on leading/trailing whitespace.
- [ ] Empty names fail.
- [ ] Weight constraints fail outside 0..9000.

### Functional Checks
- [ ] Create workspace from template with auto-suffix.
- [ ] Add box via header; name auto-increment.
- [ ] Move/resize on desktop + mobile; persists.
- [ ] Reorder via context menu; persists and swaps 1 step.
- [ ] Delete workspace cascades boxes/items.
- [ ] Dashboard search: 3+ chars, matches name+description, limit 20, sorted by last_moved_at.
- [ ] Search click selects + highlights box (no auto-pan/zoom).
- [ ] Bulk move items across workspaces with conflict rename flow.
- [ ] Undo toast for move works within 10s.

### Automated Tests (recommended)
- [ ] Unit tests for validation helpers.
- [ ] Unit tests for suffix naming helpers.
- [ ] Unit tests for error mapping.
- [ ] Component tests for dashboard search + dropdown.
- [ ] Component tests for details panel open/close + save.
- [ ] Integration tests for bulk move + undo (mock RPC).
