# Red-Dot Notifications — Handoff Note for Codex

## What we're building

A **red-dot ping system** that visually marks modules and list rows when there's something new for the current user. The point is so work doesn't get buried — when a booking gets reassigned to you, an EV gets approved, etc., the relevant sidebar item lights up until you've seen it.

It is **not** a Notifications inbox, not a "What's new" feed, not a bell-icon panel. There is no dedicated Notifications page or button. The dots live on the existing module entries.

Think Slack channel unread dots — not Gmail.

## Important course correction

In the first pass I added a **Bell button** + a `NotificationsPanel` SidePanel in `NeuronSidebar.tsx`. That was wrong. Marcus wants pings on existing modules only, not a parallel inbox UI. **Please remove**:

- The `Bell` import in `src/components/NeuronSidebar.tsx`
- The `<NotificationsPanel ... />` mount near the bottom of the same file
- The "Notifications" button block under `{/* Personal Section */}`
- The `notifPanelOpen` state
- The `import { NotificationsPanel } from "./notifications/NotificationsPanel"` line
- Delete `src/components/notifications/NotificationsPanel.tsx` entirely

The `useNotifications().total` is still useful elsewhere (sidebar bell badge etc.) — but for now nothing consumes it. Leaving the export in place is fine.

## What stays (the actual feature)

1. **Migration `093_notifications.sql`** — applied to dev. Three tables (`notification_events`, `notification_recipients`, `notification_counters`) + RPCs + Realtime publication. Don't change the schema lightly.
2. **`src/utils/notifications.ts`** — typed `recordNotificationEvent(...)` for write sites, plus `markEntityRead` / `markModuleRead` / `operationsSubSectionFor`. Always call from app code; never insert directly into the tables.
3. **`src/hooks/useNotifications.ts`** — Realtime-backed counters. Exposes `moduleCount(m)`, `subSectionCount(m, sub)`, plus `useUnreadEntityIds(type, ids[])` and `useMarkEntityReadOnMount(type, id)`.
4. **Sidebar pings** — `NeuronSidebar.tsx` renders a shared `<SidebarBadge>` on every module + sub-item via `PAGE_TO_NOTIF`. Module-level dot when collapsed, trailing pill when expanded. Inbox keeps its own existing `get_unread_count` system; don't merge.
5. **DataTable `unreadIds` prop** — leading red dot on unread rows. Already wired in `UnifiedEVouchersTable`.
6. **Detail page mark-as-read** — `useMarkEntityReadOnMount` clears the dot when the user opens an entity. Wired in `EVoucherDetailPage` and `ForwardingBookingDetails`.

## Write paths already wired

- Booking creation + assignment edits → assignees (`utils/assignments/applyAssignmentToBookingPayload.ts`, `BookingAssignmentSection.tsx`)
- Booking status changes — all 5 service detail pages → assignees via `utils/notifyBookingStatusChange.ts`
- E-Voucher submit / approve / reject / posted → next approver, creator (`useEVoucherSubmit.ts`, `evoucherApproval.ts`, `EVoucherWorkflowPanel.tsx`)

## What still needs wiring (your job)

For each, find the central write site and call `recordNotificationEvent(...)` with appropriate `module`, `subSection`, `entityType`, `entityId`, `kind`, and `recipientIds`. Actor is auto-skipped by the DB.

1. **BD inquiry assigned / handed off to Pricing** — module: `bd` / `pricing`, sub: `inquiries`
2. **Quotation submitted / approved / rejected** — module: `pricing`, sub: `quotations`. Notify reviewer on submit; creator on decision.
3. **Billing posted** (`InvoiceBuilder.tsx`) — module: `accounting`, sub: `billings`. Notify project owner + AR team.
4. **Invoice issued / collection recorded** — module: `accounting`, sub: `invoices` / `collections`.
5. **HR leave-request lifecycle** — module: `hr`. Notify manager on submit; requester on decision.
6. **Comments / @mentions** — when comments land, notify mentioned users with `entityType: 'comment'` or the parent entity type.
7. **List-row dots on bookings list pages** — Operations list pages don't use `DataTable` yet; either (a) migrate them or (b) wire `useUnreadEntityIds` + render a leading dot manually in the row.
8. **Mark-as-read on remaining detail pages** — Brokerage / Trucking / MarineInsurance / Others booking details, billing/invoice/collection detail sheets. Pattern is one line: `useMarkEntityReadOnMount("booking", id)`.

## Rules of the road

- **Self-suppression is automatic.** The fan-out function excludes `actor_user_id`. Never code around it.
- **Notifications must never break a write.** Always `void recordNotificationEvent(...)` so failures stay non-fatal. The helper itself swallows errors.
- **Don't fan out empty audiences.** If `recipientIds` ends up empty after filtering, the function no-ops. That's fine.
- **Don't re-derive audience inside the DB.** Audience is resolved at the write site (where assignee/team/watchers are already in scope) and passed in as `recipientIds: string[]`. Keep it that way.
- **Sub-sections must match `PAGE_TO_NOTIF` in `NeuronSidebar.tsx`.** If you invent a new `sub_section` value, add it to `NotifSubSection` in `utils/notifications.ts` AND to `PAGE_TO_NOTIF` so the sidebar can light up the right sub-item.
- **`record_notification_event` is `SECURITY DEFINER`.** Don't grant table-level INSERT to authenticated; everything goes through the RPC.
- **Inbox is a separate system.** Inbox uses `get_unread_count` + `is_unread` on threads. We layer on top, not replace.

## Things I deliberately did not do

- No global app-icon dot (per-module only, per Marcus's call).
- No retention / archival job. Tables grow append-only; revisit if they get uncomfortable.
- No event log UI. The dots are the UI.
- No polling fallback. Realtime is on day one.

## Quick test

Open dev as user A. Reassign a booking to user B. Without refreshing, user B's Operations sidebar entry (and the matching service sub-item, e.g. Forwarding) should sprout a red badge within a second. Opening the booking detail clears it.

If counters drift, the safe reset is:
```sql
UPDATE notification_counters SET unread_count = 0;
-- then let triggers rebuild from notification_recipients on the next read transition
```
(or recompute by counting `recipients WHERE read_at IS NULL` grouped by module/sub_section).
