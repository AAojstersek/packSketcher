# PackSketcher (MVP) — TODO Checklist

Last updated: 2026-02-06

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
- Prompt 22: custom background upload flow (dashboard).
- Prompt 23: workspace rename flow (dashboard card modal + API PATCH).
- Prompt 24: details panel visual redesign (clean/minimal).

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
- [x] Ensure workspace cards list and delete confirmation are correct.
- [x] Hide workspace type in UI (type stored only in DB).
- [x] Ensure delete cascades via DB FKs (verify in UI + DB).

### Templates (Prompt 9)
- [x] Update template create flow to use suffix logic from API.
- [x] Show friendly error messages on create failure.

### Global Item Search (Prompt 10)
- [x] Add global search input component.
- [x] Add debounce (200–300ms).
- [x] Show hint “Type 3+ characters” for <3 chars.
- [x] Add dropdown under input.
- [x] Close dropdown on outside click or Escape.
- [x] Show row format: `Item name — Workspace / Box`.
- [x] Clicking result navigates to planner and selects/highlights box.
- [x] No auto-pan/zoom; no auto-open details panel.
- [x] Tests for debounce + open/close + click navigation.

### Activity Feed (Prompt 11)
- [x] Replace “Your Stats” placeholder with feed component.
- [x] Show last 20 activity records.
- [x] Relative timestamps (e.g., “2h ago”).
- [x] Collapsible/minimizable state (not persisted).
- [x] Tests for relative time formatting and collapse behavior.

## Phase 5 — Planner Core (Prompts 12–16)
### State & Layout (Prompt 12)
- [x] Create a client `PlannerShell` to share state between header and canvas.
- [x] Lift `isEditMode`, `selectedBagId`, `highlightBagId` to shell.
- [x] Remove edit toggle button from canvas overlay; move to header.
- [x] Ensure default mode is View on each load.

### Add Box (Prompt 13)
- [x] Add “+ Add box” button in header (Edit mode only).
- [x] New box centered in viewport.
- [x] Default size 250×120 in original image coordinates.
- [x] Default name `Box N` smallest free number in workspace.
- [x] Immediately open details panel for new box.
- [x] Remove “click empty space creates box”.
- [x] Unit test for `Box N` naming helper.

### Selection + Rendering (Prompt 14)
- [x] Ensure selection works in View + Edit modes.
- [x] Draw labels in top-left, scale with zoom.
- [x] Truncate/hide labels if they don’t fit.
- [x] Render order by `z_index` (higher drawn last).
- [x] Highlight box when navigated from search.

### Move / Resize (Prompt 13, follow-on)
- [x] Desktop: first click selects; drag moves if selected.
- [x] Desktop: resize handles in Edit mode.
- [x] Persist move/resize to DB.
- [x] Roll back on DB error with message.

### Mobile Gestures (Prompt 13, follow-on)
- [x] One-finger drag moves selected box.
- [x] Pinch to zoom, two-finger pan.
- [x] One finger reserved for box interactions.

### Context Menu (Reorder + Delete) (Prompt 15)
- [x] Desktop right-click; mobile long-press.
- [x] Menu: bring forward, send backward, delete.
- [x] Reorder uses `swap_bag_z_index` RPC (1-step swap).
- [x] Delete shows confirm.
- [x] Optimistic UI + rollback on error.

## Phase 6 — Details Panel (Prompts 16–18)
### Open/Close Rules (Prompt 16)
- [x] Desktop: double-click only.
- [x] Mobile: double-tap selected box only (300 ms / 24 px); no gear trigger.
- [x] Desktop: overlay click closes.
- [x] Mobile: close via Close button only.
- [x] Esc closes (desktop).
- [x] If panel open and user selects another box, panel stays on current box.

### Save Model (Prompt 17)
- [x] Manual Save/Cancel (no auto-save).
- [x] Use `save_bag_details` RPC for atomic save.
- [x] Show “Saved” feedback.
- [x] Inline error display for save failures.

### Totals (Prompt 17)
- [x] Total weight (bag + items; missing item weight treated as 0).
- [x] Item count.

### Unsaved Changes Guard (Prompt 18)
- [x] Guard when:
  - [x] closing panel
  - [x] toggling Edit off
  - [x] deleting a box
  - [x] reordering boxes
  - [x] moving items
  - [x] navigating away
- [x] Modal: Cancel / Save / Discard.

## Phase 7 — Items + Bulk Move (Prompts 19–20)
### Items CRUD (Prompt 19)
- [x] Name required, max 60, unique per box (case-insensitive).
- [x] Description optional.
- [x] Weight optional (null allowed), 0..9000.
- [x] Prevent duplicates in UI + DB.

### Multi-select Mode (Prompt 19)
- [x] Toggle available on desktop + mobile.
- [x] When ON: tap/click selects items; no per-item edit.
- [x] Exit multi-select to edit items.

### Bulk Move (Prompt 19)
- [x] “Move selected” action.
- [x] Target search across Workspace / Box.
- [x] Exclude current box by default.
- [x] If unsaved changes exist: require Save/Discard first.

### Conflict Handling (Prompt 20)
- [x] Detect duplicate name conflicts (case-insensitive).
- [x] Prompt rename for conflicts, one by one in alphabetical order.
- [x] Allow cancel.

### RPC Move + Undo (Prompt 20)
- [x] Use `move_items_bulk` RPC (single call).
- [x] Preserve `created_at`, update `updated_at` and `last_moved_at`.
- [x] Create single activity record per move.
- [x] Undo toast (10s) using `undo_move_items_bulk`.
- [x] Undo restores names and locations.

## Phase 8 — Activity Feed Events (Prompt 21, plus DB triggers)
- [x] Workspace renamed / deleted events logged.
- [x] Box created / deleted events logged.
- [x] Item created / deleted events logged.
- [x] Item moved event from RPC.
- [x] Ensure feed updates after actions.

## Phase 9 — Error Handling (Prompts 2, 15, 20)
- [x] Map DB unique/check failures to user-friendly messages.
- [x] Roll back optimistic UI on failure (move/resize/reorder/delete).
- [x] RPC conflict failures show rename UI, no partial moves.

## Phase 10 — Security (Manual verification)
- [x] RLS remains enforced.
- [x] RPC functions validate `auth.uid()` ownership.

## Phase 11 — Testing & Regression (Prompt 21)
### DB Constraints (manual or automated)
- [x] Duplicate name (case variants) fails for workspace/box/item.
- [x] Trim constraints fail on leading/trailing whitespace.
- [x] Empty names fail.
- [x] Weight constraints fail outside 0..9000.

### Functional Checks
- [x] Create workspace from template with auto-suffix.
- [x] Add box via header; name auto-increment.
- [x] Move/resize on desktop + mobile; persists.
- [x] Reorder via context menu; persists and swaps 1 step.
- [x] Delete workspace cascades boxes/items.
- [x] Dashboard search: 3+ chars, matches name+description, limit 20, sorted by last_moved_at.
- [x] Search click selects + highlights box (no auto-pan/zoom).
- [x] Bulk move items across workspaces with conflict rename flow.
- [x] Undo toast for move works within 10s.

### Automated Tests (recommended)
- [x] Unit tests for validation helpers.
- [x] Unit tests for suffix naming helpers.
- [x] Unit tests for error mapping.
- [x] Component tests for dashboard search + dropdown.
- [x] Component tests for details panel open/close + save.
- [x] Integration tests for bulk move + undo (mock RPC).

## Phase 12 — Workspace Management Extensions (Prompts 22–23)
### Custom Background Upload (Prompt 22)
- [x] Enable upload CTA on dashboard.
- [x] Add upload modal/sheet (file + workspace name + Save/Cancel).
- [x] Validate file type/size/dimensions before submit.
- [x] Upload image to storage and create `custom` workspace row.
- [x] Show friendly error + loading states.
- [x] Refresh dashboard list + activity refresh event after success.
- [x] Tests for upload validation and submit flow.

### Workspace Rename (Prompt 23)
- [x] Add rename action on workspace card.
- [x] Add PATCH API for workspace rename (`/api/backgrounds/[id]`).
- [x] Validate trim/non-empty/max-60/case-insensitive unique rules.
- [x] Map DB failures to friendly rename errors.
- [x] Refresh dashboard list + activity refresh event after success.
- [x] Tests for API rename and UI modal flow.

## Phase 13 — Details Panel UX Polish (Prompt 24)
- [x] Redesign full `DetailsPanel` visual layout (clean/minimal, Apple-style direction).
- [x] Reorganize section hierarchy: Box settings / Items / Bulk move / Totals / Save actions.
- [x] Improve action clarity (Save/Cancel, Move selected, conflicts, undo area).
- [x] Add sticky action/footer behavior where appropriate (desktop + mobile).
- [x] Preserve all existing behaviors (save/cancel, unsaved guard, conflict flow, undo, keyboard accessibility).
- [x] Add/adjust component tests for redesigned structure and interactions.
