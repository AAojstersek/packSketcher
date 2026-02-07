\# PackSketcher (MVP) — Developer-Ready Specification

Last updated: 2026-02-06

## 1) Goal + Scope
Build a responsive web app (desktop + mobile) that lets authenticated users visually plan where **Boxes** go on a **Workspace** (background image), then manage **Items** inside each Box, including:
- Global item search across all workspaces
- Bulk moving items between boxes across workspaces (with conflict handling + undo)
- Minimal activity feed
- Custom background upload + workspace rename on dashboard

Out of scope for MVP:
- Subscriptions/membership
- Export/print
- Public sharing

UI language: English.

Extension track (planned next phases):
- Phase 12: custom background upload and workspace rename.
- Phase 13: full visual redesign of details panel (clean/minimal, Apple-style).

## 2) Terminology
- **Workspace**: a background “board” the user works on (DB: `backgrounds` + its `packs` row).
- **Box**: a rectangular container placed on the workspace (DB: `bags`).
- **Item**: an entry inside a box (DB: `items`).

## 3) Target Stack / Architecture
- Frontend: Next.js App Router (current repo).
- Auth/DB: Supabase (RLS enabled).
- Deployment: Vercel + Supabase (single production environment for MVP).

Design principle: keep app robust and minimal; enforce critical invariants at the DB level (trimmed, non-empty, unique names).

## 4) Data Model (Existing)
Tables:
- `backgrounds` (workspaces)
- `packs` (1:1 per background; internal)
- `bags` (boxes)
- `items` (items)
- `activities` (activity feed)

Key relationships (CASCADE already present):
- `packs.background_id → backgrounds.id` (CASCADE)
- `bags.pack_id → packs.id` (CASCADE)
- `items.bag_id → bags.id` (CASCADE)

### 4.1 DB-level Rules (Must Match UI)
Names (workspaces, boxes, items):
- Trim enforced: `name = btrim(name)` (DB CHECK)
- Non-empty enforced (DB CHECK)
- Max length 60 enforced (DB CHECK)
- Case-insensitive uniqueness enforced via unique indexes:
  - Workspaces: unique `(user_id, lower(name))` on `backgrounds`
  - Boxes: unique `(pack_id, lower(name))` on `bags`
  - Items: unique `(bag_id, lower(name))` on `items`
- Whitespace normalization inside the string is NOT performed (only trim).

Weights:
- Box weight uses `bag_weight_kg` in kg, 0..9000.
- Item weight is optional (`null` allowed), if present 0..9000.

### 4.2 Ordering / Layers
Boxes have `bags.z_index`:
- Scoped within a workspace/pack.
- Reorder is “1 step” swap with adjacent neighbor.
- Persisted (DB column + unique `(pack_id, z_index)`).

### 4.3 Sorting for Dashboard Search
Dashboard results sort by “most recently moved item”.
- DB column: `items.last_moved_at`
- Updated only when `bag_id` changes (move), not on edits.

## 5) Auth + Reset Password (in-app)
Auth:
- Email + password only.

Reset password:
- Add `/forgot-password` page (request email).
- Add `/reset-password` page (set new password).
- After successful reset: auto-authenticate and redirect to `/dashboard`.

Redirect URL must be configurable via env (e.g. `NEXT_PUBLIC_SITE_URL`) to work on Vercel.

## 6) Dashboard
### 6.1 Workspaces
- Multiple workspaces per user.
- Created from templates and custom uploads.
- Workspace name is visible; type is not shown (type still stored in DB).
- Workspace names must be unique per user (case-insensitive, trimmed).
- Creating from template auto-suffixes: `Motorcycle (2)`, `Motorcycle (3)`, using the smallest free number.

Custom background upload:
- Triggered from dashboard (“Upload Custom Background”).
- Uses file upload (`image/png`, `image/jpeg`, `image/webp`, default max 10MB).
- Client reads image dimensions before submit.
- Created workspace uses `type = custom` and stores `image_url`, `width`, `height`.

Rename workspace:
- Triggered from dashboard card modal.
- Save/Cancel flow with prefilled current name.
- Same trim/non-empty/max-60/case-insensitive-unique rules as all workspace names.
- Friendly mapped DB errors are shown inline.

Delete workspace:
- Only from dashboard card.
- Confirmation required.
- Cascade delete via DB FKs.

### 6.2 Global Item Search (Live Dropdown)
Location: dashboard.

Behavior:
- Live search with debounce (recommended 200–300ms).
- Starts at 3+ characters; below that show hint “Type 3+ characters”.
- Matches case-insensitive “contains” across `items.name` and `items.description`.
- Only searches current user’s data.
- Limit 20 results.
- Sort by `items.last_moved_at desc`.

Result row displays:
- `Item name — Workspace / Box`

UI:
- Dropdown under search input.
- Closes on outside click or Escape; input remains.

Clicking a result:
- Navigates to the relevant workspace planner.
- Selects the destination box and highlights it (glow + selected).
- Does not auto-pan/zoom.
- Does not auto-open details panel.

## 7) Planner (Workspace)
### 7.1 Modes
- Default: View mode on every load (do not persist edit state).
- Edit mode enables modifications.

View mode:
- Tap/click selects a box.
- Desktop: double-click opens details panel (read-only).
- Mobile: double-tap selected box opens details panel (within 300 ms and 24 px).

Edit mode:
- Can add/move/resize/reorder/delete boxes.
- Details panel allows editing and uses Save/Cancel.

### 7.2 Add Box
Creation via button only:
- Remove “click empty space creates box”.
- Add `+ Add box` in planner header, visible only in Edit mode.
- New box appears centered in viewport.
- Default size: 250×120 (in original image coordinate system).
- Default name: `Box N` using the smallest free number in that workspace.
- Immediately opens details panel for that box (edit enabled).

### 7.3 Box Rendering
- Box shows name label only, top-left, scales with zoom.
- Truncate/hide label if it doesn’t fit.

### 7.4 Selection / Move / Resize
Desktop (Edit):
- First click selects.
- Drag to move works when selected.

Mobile (Edit):
- Tap selects.
- One-finger drag moves selected box.
- Resize via corner handles.

Pan/zoom on mobile:
- Pinch to zoom, two-finger drag to pan.
- One finger reserved for box interactions.

### 7.5 Details Panel Opening
- Desktop: double-click OR gear icon overlay on selected box.
- Mobile: double-tap selected box (within 300 ms and 24 px).
- Mobile: no gear icon trigger.
- Overlay click closes panel.
- Esc closes panel (desktop; mobile only with hardware keyboard).
- If panel is open and user selects another box: panel stays on current box.

### 7.6 Context Menu (Reorder + Delete)
Available only in Edit mode:
- Desktop: right-click selected box.
- Mobile: long-press selected box.

Menu items:
- Bring forward (1 step)
- Send backward (1 step)
- Delete (confirmation required)

Delete is immediate (optimistic UI + DB delete).

## 8) Box Details Panel (Box + Items)
### 8.1 Save Model
- Manual Save/Cancel (no auto-save).
- Single atomic Save for box details + items using existing `save_bag_details` RPC.
- Save success shows a small “Saved” feedback and remains in Edit mode.
- Save errors show inline red message.

### 8.2 Totals
Display:
- Total weight (box + items; missing item weights treated as 0)
- Item count (items; empty names are not allowed by DB)

### 8.3 Unsaved Changes Guard
If there are unsaved changes and user attempts to:
- close panel
- toggle Edit off
- delete a box
- reorder boxes
- move items
- navigate away

Show modal with: Cancel / Save / Discard.

### 8.4 Visual Design Direction (Phase 13)
- Whole details panel is redesigned with a clean/minimal visual system (Apple-style direction).
- Clear hierarchy for: Box settings, Items, Bulk move, Totals, Save actions.
- Improve spacing/grouping/typography and action prioritization.
- Keep all current behavior and keyboard/accessibility interaction rules unchanged.
- Maintain mobile-first readability and tap-target quality.

## 9) Items
Validation:
- Name required, max 60, unique per box (case-insensitive, trimmed).
- Description optional.
- Weight optional (null allowed), numeric, 0..9000.

Duplicates:
- Prevent duplicates in UI and DB.

## 10) Multi-select + Bulk Move (Items)
Multi-select mode:
- Available on desktop + mobile.
- When ON: tap/click selects items (no per-item edit). Editing requires exiting multi-select mode.

Bulk move:
- “Move selected” action.
- Target selection via 1-step search across `Workspace / Box`.
- Excludes current box by default.
- Move executes immediately (not staged in Save).
- If unsaved changes exist: require Save/Discard first.

Conflict handling:
- If target box already has an item with same name (case-insensitive): block move and prompt rename per conflicting item.
- Conflicts resolved one-by-one in alphabetical order by item name.
- Rename is manual; cancel allowed.

## 11) Move RPC + Undo
Move uses Supabase RPC (single call for bulk):
- Verifies ownership (`auth.uid()`).
- Preserves `created_at`.
- Updates `updated_at`.
- Updates `last_moved_at` (move-time).
- Returns an `undo` payload to enable client-side undo.

Activity for move:
- One `activities` record per move operation.
- Message lists up to 3 item names; then `+N more`:
  - `Moved items: Tent, Stove, Jacket +7 more from box Left (Motor) to box Top (Bike)`
- Undo does NOT create activity events.

Undo behavior (in-memory toast, 10 seconds):
- Undo for move: moves all items back and restores pre-move names if changed.
- Undo should work even if user navigates within app during the 10s window.
- No persistence across refresh.

## 12) Activity Feed
Location: dashboard (replacing “Your Stats” placeholder).

Behavior:
- Shows last 20 activity records for the user.
- Relative timestamps (“2h ago”).
- Collapsible/minimizable; state not persisted across refresh.

Activity events (MVP):
- workspace renamed / deleted
- box created / deleted
- item created / deleted
- item moved (from RPC)

Retention:
- Keep last 90 days (implementation via scheduler/cron if available; otherwise manual cleanup).

## 13) Error Handling Requirements
- Map DB unique/check failures to user-friendly messages.
- For optimistic UI updates (move/resize/reorder/delete box), roll back on DB failure and show error.
- For RPC conflict failures: show rename UI; do not partially apply moves.

## 14) Security Requirements
- RLS already enabled; must remain enforced.
- RPC functions must validate `auth.uid()` ownership of all relevant rows.

## 15) Testing Plan (MVP)
DB verification:
- Duplicate names (case variants) should fail for workspace/box/item.
- Trim constraints should fail on leading/trailing whitespace.
- Empty names should fail.
- Weight constraints should fail outside 0..9000.

Functional checks:
- Create workspaces from templates with auto-suffix.
- Upload custom background from dashboard and open it in planner.
- Rename workspace from dashboard card and persist after refresh.
- Add box via header; name auto-increment.
- Move/resize on desktop + mobile; persists.
- Reorder via context menu; persists and swaps 1 step.
- Delete workspace (dashboard) cascades boxes/items.
- Dashboard search: 3+ chars, matches name+description, limit 20, sorted by last_moved_at; click selects+highlights box.
- Bulk move items across workspaces with conflict rename flow.
- Undo toast for move works within 10s.
- Details panel redesign keeps save/cancel, unsaved guard, conflict flow, and undo behavior intact.

## 16) Acceptance Criteria (Extension Track)
Phase 12 (upload + rename):
- User can upload a supported image file, create a `custom` workspace, and see it in dashboard list without manual reload.
- Uploaded workspace opens in planner with correct background dimensions.
- User can rename workspace from card modal; uniqueness/validation errors are friendly and actionable.

Phase 13 (details panel redesign):
- New visual layout improves clarity without changing business behavior.
- Existing interaction test scenarios continue to pass (open/close, save/cancel, unsaved guard, move conflicts, undo).
- Desktop and mobile layouts remain usable and readable.
