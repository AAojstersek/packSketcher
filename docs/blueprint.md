# PackSketcher (MVP) — Step-by-Step Blueprint (Repo-Tailored)

Last updated: 2026-02-06

## Repo Context (Observed)
- Next.js App Router under `src/app`.
- Supabase clients in `src/lib/supabase/{server.ts,browser.ts}`.
- Existing API routes: `src/app/api/backgrounds/route.ts` and `src/app/api/backgrounds/[id]/route.ts`.
- Dashboard UI in `src/app/(dashboard)/dashboard/*`.
- Planner UI in `src/app/planner/[backgroundId]/*`.
- Details panel + validation helpers in `src/components/planner/*`.
- No test runner configured in `package.json` (no `test` script).

---

## Phase 0 — Baseline & Setup
1. Review repo structure and App Router boundaries (server vs client components).
2. Confirm Supabase server/browser client usage patterns.
3. Inventory existing planner behavior vs spec gaps.
4. Confirm required env vars for auth/reset flows (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`).
5. Decide on test runner and add harness (Vitest + RTL + jsdom).
6. Add `test` and `test:watch` scripts to `package.json`.
7. Add `vitest.config.ts` and `src/test/setup.ts` with `@testing-library/jest-dom`.
8. Add a smoke test to validate the harness.

## Phase 1 — Data Access & API Layer
1. Align `src/types/index.ts` with DB rules (optional item weight, `z_index`, `last_moved_at`, etc.).
2. Centralize validation helpers to match DB constraints (trim, non-empty, max 60, 0..9000).
3. Add error mapping utility for Supabase errors.
4. Extend API routes for search + activities.
5. Add RPC usage helpers for bulk move + z-index swap.

## Phase 2 — Auth & Reset Password
1. Add `/forgot-password` page.
2. Add `/reset-password` page.
3. Update `middleware.ts` matcher to allow these routes.
4. Link from login screen.

## Phase 3 — Dashboard
1. Workspace list + delete confirmation (existing cards).
2. Template-based create flow with smallest suffix logic.
3. Global item search (live dropdown).
4. Activity feed (last 20, relative time, collapsible).

## Phase 4 — Planner Core
1. Lift edit/view state to a shared client wrapper for Header + Canvas.
2. Add “+ Add box” button (Edit only) and remove “click empty to add”.
3. Add label rendering + truncation in canvas draw loop.
4. Add selection + highlight behavior from dashboard search.
5. Add context menu reorder/delete (desktop + mobile).

## Phase 5 — Details Panel
1. Enforce open/close rules (desktop gear/double-click, mobile double-tap, overlay, Esc).
2. Manual Save/Cancel with `save_bag_details` RPC.
3. Totals (weight + count) and inline validation errors.
4. Unsaved changes guard.

## Phase 6 — Items & Bulk Move
1. Multi-select mode and bulk move UI.
2. Conflict rename flow for duplicates.
3. RPC move + undo toast (10s).

## Phase 7 — Integration & Regression
1. Wire planner selection from dashboard search.
2. Verify activity feed updates (RPC + triggers).
3. Regression test key flows.

## Phase 8 — Activity Feed Events (Prompt 21 + DB triggers)
1. Ensure workspace rename/delete events are logged.
2. Ensure box create/delete events are logged.
3. Ensure item create/delete events are logged.
4. Ensure move RPC adds item-moved event.
5. Verify feed updates after actions.

## Phase 9 — Error Handling + Rollback
1. Map DB unique/check failures to user-friendly messages.
2. Roll back optimistic UI on failure (move/resize/reorder/delete).
3. RPC conflict failures show rename UI; prevent partial moves.

## Phase 10 — Security (Manual Verification)
1. RLS remains enforced for all data paths.
2. RPC functions validate `auth.uid()` ownership.

## Phase 11 — Testing & Regression (Prompt 21)
1. DB constraints: duplicate name variants, trim/empty, weight range.
2. Functional checks: template suffix create, add box naming, move/resize, reorder swap, cascade delete, dashboard search rules, search click highlight, bulk move + conflict rename flow, undo toast window.
3. Automated tests (recommended): validation helpers, naming helpers, error mapping, dashboard search dropdown, details panel open/close + save, bulk move + undo (mock RPC).

## Phase 12 — Workspace Management Extensions (Prompts 22–23)
1. Add full custom background upload flow (file upload + validation + create workspace).
2. Add workspace rename flow from dashboard card modal.
3. Ensure both flows refresh dashboard and activity feed correctly.

## Phase 13 — Details Panel UX Polish (Prompt 24)
1. Redesign full details panel visual hierarchy (clean/minimal, Apple-style direction).
2. Preserve all existing behavior and accessibility/keyboard interactions.
3. Add focused regression tests for redesigned structure and critical interactions.

---

# Iterative Chunking (Round 3 — Right-Sized Steps)
1. Add a test harness (Vitest + RTL) and base test utilities.
2. Align types in `src/types/index.ts` and centralize validation helpers.
3. Add Supabase error mapping utility.
4. Update backgrounds API for suffix logic + friendly errors.
5. Add items search API route.
6. Add activities API route.
7. Build `/forgot-password` page and update login link.
8. Build `/reset-password` page and update middleware matcher.
9. Dashboard: integrate workspace list + delete confirm cleanup (as needed).
10. Dashboard: add template create flow using suffix logic.
11. Dashboard: add global item search input + debounce + dropdown.
12. Dashboard: add activity feed component.
13. Planner: create client wrapper (header + canvas) with shared state.
14. Planner: add Add Box button, default box creation, remove click-to-add.
15. Planner: label rendering + truncation + z-index ordering.
16. Planner: context menu reorder/delete + RPC wiring.
17. Planner: details panel open rules (desktop gear/double-click, mobile double-tap only).
18. Details panel: enforce edit/view behavior + save/cancel + totals.
19. Details panel: unsaved changes guard.
20. Items: multi-select + bulk move + conflict handling.
21. RPC move + undo toast.
22. Integration wiring + regression tests.
23. Dashboard: custom background upload flow (storage + create workspace).
24. Dashboard: workspace rename flow (card modal + API PATCH).
25. Details panel: full visual redesign + interaction regression checks.

---

# LLM Code-Generation Prompts (Repo-Tailored)

## Prompt 0 — Test Harness
```
Set up a minimal test harness for this repo.

Repo notes:
- Next.js App Router, no existing test script.
- TypeScript + Tailwind, no Jest/Vitest configured.

Requirements:
- Add Vitest + React Testing Library + jsdom.
- Add `test` and `test:watch` scripts to `package.json`.
- Create `vitest.config.ts` with jsdom environment.
- Add a `src/test/setup.ts` to register `@testing-library/jest-dom`.

Deliverables:
- Updated `package.json` scripts and devDependencies.
- New config + setup files.
- A single smoke test (e.g., `src/test/smoke.test.ts`) proving the harness works.
```

## Prompt 1 — Types + Validation (Align With DB)
```
Align types and validation helpers with DB constraints.

Where:
- Types live in `src/types/index.ts`.
- Current validation helpers in `src/components/planner/bagDetailsValidation.ts` and `src/components/planner/itemsValidation.ts`.

Requirements:
- Update types: Bag should include `z_index`; Item should allow `weight: number | null` and include `last_moved_at` if present; add `Activity` type.
- Add shared validation helpers in `src/lib/validation.ts` (trim, non-empty, max 60, weight 0..9000, optional item weight).
- Refactor existing planner validation to use the shared helpers (do not break current UI).

Tests:
- Add unit tests for new validation helpers.
```

## Prompt 2 — Supabase Error Mapping Utility
```
Add a Supabase error mapping helper.

Where:
- Create `src/lib/supabase/errorMapping.ts`.

Requirements:
- Map unique constraint failures for workspace/box/item name conflicts.
- Map check constraint failures for trim, empty, max length, weight range.
- Provide a single function that returns `{ code, message }`.

Tests:
- Unit tests for known error signatures.
```

## Prompt 3 — Backgrounds API: Suffix Logic + Friendly Errors
```
Update the existing backgrounds API to enforce template naming rules and friendly errors.

Where:
- `src/app/api/backgrounds/route.ts`
- `src/app/api/backgrounds/[id]/route.ts`

Requirements:
- Enforce smallest free suffix for template-created workspaces.
- Trim + validate names; map errors with the error mapping helper.
- Keep routes authenticated via `createSupabaseServerClient`.

Tests:
- Unit test the suffix-name helper (create a helper in `src/lib/workspaces/naming.ts`).
```

## Prompt 4 — Items Search API
```
Add a global item search API route.

Where:
- Create `src/app/api/items/search/route.ts`.

Requirements:
- Query items.name + items.description (case-insensitive contains).
- Only current user’s data.
- Require 3+ chars; return empty array otherwise.
- Limit 20 results; sort by `last_moved_at desc`.
- Return fields needed for UI: item name, workspace name, box name, backgroundId, bagId.

Tests:
- Unit tests for a helper that validates/query params and shapes response.
```

## Prompt 5 — Activities API
```
Add an activities fetch API route.

Where:
- Create `src/app/api/activities/route.ts`.

Requirements:
- Return last 20 activities for current user.
- Ordered by created_at desc.

Tests:
- Unit test helper to validate response shape.
```

## Prompt 6 — Forgot Password Page
```
Add `/forgot-password` page.

Where:
- `src/app/(auth)/forgot-password/page.tsx`
- Update `src/app/(auth)/login/page.tsx` to link to it.

Requirements:
- Email input + submit.
- Use Supabase `resetPasswordForEmail` with redirect to `/reset-password`.
- Build redirect from `NEXT_PUBLIC_SITE_URL`.
- Show success/error states.

Tests:
- Render + interaction test (mock supabase client).
```

## Prompt 7 — Reset Password Page + Middleware
```
Add `/reset-password` page and update middleware.

Where:
- `src/app/(auth)/reset-password/page.tsx`
- `src/middleware.ts`

Requirements:
- Password + confirm fields.
- Call Supabase update password.
- On success: auto-auth and redirect to `/dashboard`.
- Allow `/forgot-password` and `/reset-password` routes in middleware matcher.

Tests:
- Form validation + success redirect (mock).
```

## Prompt 8 — Dashboard: Workspace List + Delete
```
Ensure dashboard workspace list + delete flow meets MVP requirements.

Where:
- `src/app/(dashboard)/dashboard/page.tsx`
- `src/app/(dashboard)/dashboard/BackgroundCard.tsx`

Requirements:
- Keep delete confirm.
- Hide workspace type in UI (type stored in DB only).
- Ensure delete triggers refresh and handles errors.

Tests:
- Component test for delete button behavior.
```

## Prompt 9 — Dashboard: Template Create Flow (Suffix)
```
Update template create flow to use suffix logic.

Where:
- `src/app/(dashboard)/dashboard/CreateFromTemplateButton.tsx`

Requirements:
- On create, API returns the finalized name (with suffix) and ID.
- Refresh list after create.
- Display friendly errors from error mapping.

Tests:
- Unit test suffix helper already created.
```

## Prompt 10 — Dashboard: Global Item Search
```
Add global item search UI with live dropdown.

Where:
- Create `src/app/(dashboard)/dashboard/GlobalItemSearch.tsx`.
- Wire into `src/app/(dashboard)/dashboard/page.tsx`.

Requirements:
- 200–300ms debounce.
- <3 chars shows “Type 3+ characters”.
- Dropdown closes on outside click or Escape.
- Each row: “Item name — Workspace / Box”.
- Click navigates to `/planner/[backgroundId]` and passes bagId for highlight.

Tests:
- Debounce + dropdown open/close.
```

## Prompt 11 — Dashboard: Activity Feed
```
Add activity feed component.

Where:
- Create `src/app/(dashboard)/dashboard/ActivityFeed.tsx`.
- Wire into `src/app/(dashboard)/dashboard/page.tsx` (replace “Your Stats”).

Requirements:
- Show last 20 activities with relative time.
- Collapsible/minimizable (state not persisted).

Tests:
- Relative time formatting helper.
```

## Prompt 12 — Planner: Client Wrapper for Shared State
```
Create a client wrapper to share state between header and canvas.

Where:
- Add `src/app/planner/[backgroundId]/PlannerShell.tsx` (client component).
- Update `src/app/planner/[backgroundId]/page.tsx` to render PlannerShell.
- Update `PlannerHeader.tsx` and `PlannerCanvas.tsx` props accordingly.

Requirements:
- Shared state: `isEditMode`, `selectedBagId`, `highlightBagId` (from dashboard search).
- Pass callbacks for toggle edit mode, add box, open details.
- Remove edit toggle button from canvas overlay (will move to header).

Tests:
- Basic state wiring test (unit).
```

## Prompt 13 — Planner: Add Box Button + Remove Click-to-Add
```
Implement “+ Add box” button and remove click-to-add.

Where:
- `src/app/planner/[backgroundId]/PlannerHeader.tsx`
- `src/app/planner/[backgroundId]/PlannerCanvas.tsx`

Requirements:
- Add “+ Add box” button in header, visible only in Edit mode.
- New box centered in viewport, size 250x120 in original image coords.
- Default name: “Box N” smallest free number in workspace.
- Immediately open details panel for new box.
- Remove creation by clicking empty space.

Tests:
- Unit test for smallest-free-number helper (new helper in `src/lib/boxes/naming.ts`).
```

## Prompt 14 — Planner: Label Rendering + Z-Index Order
```
Add box label rendering and z-index ordering.

Where:
- `src/app/planner/[backgroundId]/PlannerCanvas.tsx`

Requirements:
- Draw box name label in top-left, scaled with zoom.
- Truncate or hide label if it doesn’t fit.
- Sort render order by `z_index` (higher z_index drawn last).

Tests:
- Unit test label truncation helper.
```

## Prompt 15 — Planner: Context Menu Reorder + Delete
```
Add context menu for reorder and delete.

Where:
- `src/app/planner/[backgroundId]/PlannerCanvas.tsx`
- Use RPC `swap_bag_z_index` (see `docs/06_rpc_swap_bag_z_index.sql`).

Requirements:
- Desktop: right-click; mobile: long-press.
- Menu items: bring forward (1 step), send backward (1 step), delete (confirm).
- Optimistic UI + rollback on failure.

Tests:
- Unit tests for reorder boundary logic.
```

## Prompt 16 — Planner: Open Rules
```
Enforce details panel open rules.

Where:
- `src/app/planner/[backgroundId]/PlannerCanvas.tsx`
- `src/components/planner/DetailsPanel.tsx`

Requirements:
- Gear icon appears on selected box on desktop.
- Desktop: double-click OR gear opens details.
- Mobile: double-tap selected box opens details (300 ms / 24 px threshold).
- Mobile: no gear trigger.
- Overlay click closes panel; Esc closes on desktop.
- If panel open and user selects another box, panel stays on current box.

Tests:
- Interaction tests for open/close behavior.
```

## Prompt 17 — Details Panel: Save/Cancel + Totals
```
Align details panel save model and totals.

Where:
- `src/components/planner/DetailsPanel.tsx`

Requirements:
- Manual Save/Cancel only.
- Use existing `save_bag_details` RPC for atomic save (already wired).
- Show “Saved” feedback on success.
- Totals: item count + total weight (bag + items).
- Validation errors inline.

Tests:
- Totals calculation unit test.
```

## Prompt 18 — Unsaved Changes Guard
```
Add unsaved changes guard.

Where:
- `src/components/planner/DetailsPanel.tsx`
- `src/app/planner/[backgroundId]/PlannerCanvas.tsx`
- `src/app/planner/[backgroundId]/PlannerShell.tsx`

Requirements:
- Guard on close panel, toggle Edit off, delete box, reorder, move items, and navigation.
- Modal options: Cancel / Save / Discard.

Tests:
- Guard triggers for each action (unit where possible).
```

## Prompt 19 — Items: Multi-select + Bulk Move UI
```
Add multi-select mode and bulk move UI.

Where:
- `src/components/planner/DetailsPanel.tsx`

Requirements:
- Toggle multi-select (desktop + mobile).
- When ON: tap/click selects items; no per-item edit.
- “Move selected” action with target search across Workspace / Box.
- Exclude current box by default.
- If unsaved changes exist: require Save/Discard first.

Tests:
- Multi-select selection model.
```

## Prompt 20 — Bulk Move RPC + Conflict Handling + Undo
```
Wire bulk move RPC, conflict handling, and undo.

Where:
- Use RPC `move_items_bulk` and `undo_move_items_bulk` (see `docs/05_rpc_move_items_bulk.sql`).
- Likely update `src/components/planner/DetailsPanel.tsx` or add a helper in `src/lib/items/move.ts`.

Requirements:
- If conflicts (duplicate names), prompt rename one-by-one in alphabetical order.
- Rename is manual; cancel allowed.
- Move returns undo payload and triggers 10s toast.
- Undo moves items back and restores pre-move names.

Tests:
- Conflict flow unit test.
- Undo restores names and locations.
```

## Prompt 21 — Integration + Regression
```
Integration wiring and regression tests.

Requirements:
- Dashboard search click highlights the correct box in planner (no auto-pan/zoom).
- Activity feed reflects trigger + move RPC events.
- Verify core functional checks from spec.

Tests:
- Add e2e/integration tests if feasible; otherwise document manual test checklist.
```

## Prompt 22 — Dashboard: Custom Background Upload
```
Implement full custom background upload from dashboard.

Where:
- `src/app/(dashboard)/dashboard/page.tsx`
- Add upload UI components in `src/app/(dashboard)/dashboard/*` (modal/sheet as needed).
- Extend `src/app/api/backgrounds/route.ts` for custom upload create path or add a dedicated upload route.

Requirements:
- Enable existing “Upload Custom Background” CTA.
- Open modal/sheet with:
  - workspace name input
  - file picker
  - Save/Cancel actions
- Validate client-side before submit:
  - allowed mime: `image/png`, `image/jpeg`, `image/webp`
  - max size: 10MB
  - image dimensions read from file metadata.
- Upload image to Supabase Storage path scoped by user.
- Create workspace with:
  - `type: 'custom'`
  - `image_url`, `width`, `height`
  - trimmed validated name.
- Refresh dashboard list + trigger activities refresh event.
- Show mapped friendly errors for API/DB failures.

Tests:
- Component test for modal validation states + submit loading/error/success.
- API/helper unit tests for payload validation and friendly error mapping.
```

## Prompt 23 — Dashboard: Workspace Rename (Card Modal)
```
Implement workspace rename flow from dashboard cards.

Where:
- `src/app/api/backgrounds/[id]/route.ts` (add `PATCH`)
- `src/app/(dashboard)/dashboard/BackgroundCard.tsx`

Requirements:
- Add Rename action per workspace card.
- Open modal with current name prefilled + Save/Cancel.
- Validation rules:
  - trim required
  - non-empty
  - max 60 chars
  - case-insensitive unique per user.
- Return and display friendly mapped DB errors.
- On success:
  - refresh dashboard list
  - trigger activities refresh event.

Tests:
- API route test for successful rename and unique-constraint failure.
- Component test for modal open/save/cancel and error rendering.
```

## Prompt 24 — Details Panel: Visual Redesign
```
Redesign the full details panel UI while preserving existing behavior.

Where:
- `src/components/planner/DetailsPanel.tsx`

Requirements:
- Apply clean/minimal visual direction (Apple-style).
- Clear section hierarchy:
  - Box settings
  - Items
  - Bulk move
  - Totals
  - Save actions.
- Reduce visual noise:
  - tighter spacing system
  - clearer typography hierarchy
  - stronger primary/secondary action clarity.
- Add sticky actions/footer where appropriate (especially mobile).
- Preserve all current behavior:
  - save/cancel model
  - unsaved guard
  - multi-select and move conflict flow
  - undo move behavior
  - keyboard/accessibility interactions.

Tests:
- Existing interaction regression tests remain green.
- Add focused component tests for redesigned structure and accessibility landmarks.
```
