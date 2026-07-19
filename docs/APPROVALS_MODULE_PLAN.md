# Approvals Module — Build Plan

One page — **Approvals** — that lists everything awaiting the current user's sign-off, across document types, each row opening the item's detail in an **in-module slide-over** where Approve/Reject already live. Fixes the UX finding that the invoice approver had no way to reach the invoice.

## Core idea
Approval was scattered by document type (e-vouchers surfaced it one way, invoices nowhere). The Approvals module asks one question — *"what needs my sign-off?"* — and answers it. It **self-authorizes**: you see an item because it's routed to you, so the assignment itself grants visibility (no tab-permission / visibility-dial fights).

## v1 scope
E-Vouchers (all types incl. Transfer of Funds) + Invoices. Built so a third producer later (contracts, budget requests…) is just another feeder.

## Status

| Piece | State |
|---|---|
| **RLS: invoices approver SELECT carve-out** | ✅ Done (mig 249), verified |
| **approve_invoice SECURITY DEFINER RPC** | ✅ Done (mig 249), verified; InvoiceBuilder wired |
| E-voucher approver read carve-out | ✅ Already existed (evouchers_select) |
| Approvals page + merged "waiting on me" query | ⬜ To build |
| Route `/approvals` + nav item (gated to approvers) | ⬜ To build |
| In-module slide-over (EVoucherDetailView / invoice review) | ⬜ To build |
| Retire "Needs Your Approval" panel in MyEVouchersPage | ⬜ To build |
| E2E verify (Mariella approves invoice in-module) | ⬜ To do |

## Data
Both queries rely on RLS to filter to "mine":
- **E-vouchers**: query pending statuses; `evouchers_select` approver carve-out returns only those routed to me.
- **Invoices**: query `approval_status='pending_approval'`; `invoices_select_approver` (mig 249) returns only those I'm the approver of.
Merge into one row shape: `{type, id, number, requestor, amount, age, open()}`.

## UI
`/approvals` page. Rows: `[type badge] number · requestor · amount · age · Review →`. Review opens a slide-over **without leaving the page**:
- E-Voucher → reuse `EVoucherDetailView` (already a slide-over with the approve gate).
- Invoice → **wrinkle:** `InvoiceBuilder` is coupled to a `project`/`FinancialContainer`, so mounting it standalone is awkward. Plan: a lightweight invoice-review drawer (header + line items + Approve/Reject calling `approve_invoice`), rather than mounting the full builder.

## Nav
"Approvals" in the PERSONAL section (by Inbox / E-Vouchers), shown to anyone holding an approve grant (`my_evouchers:approve` OR `acct_evouchers:approve` OR Executive). Inherently self-scoping — only shows items routed to you.

## Decisions (locked with Marcus)
- **Open-to-review, in-module** (slide-over on the page, not a navigation away).
- **Replaces** the "Needs Your Approval" panel in MyEVouchersPage (Approvals becomes the one home).
