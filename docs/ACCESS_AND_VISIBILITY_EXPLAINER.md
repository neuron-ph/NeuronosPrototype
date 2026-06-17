# How Access Works in Neuron — Plain-English Guide

*Last updated 2026-06-17. Non-technical. For founders, managers, and onboarding.*

---

## The one big idea: every record passes through **two gates**

Whenever someone tries to open or change a record, Neuron asks **two separate
questions** — and you need a "yes" to **both**:

1. **"Are you allowed to do this *kind* of thing?"** → **Permissions** (RBAC)
2. **"Are you allowed to see *this particular* record?"** → **Visibility**

Think of it like an office building:
- **Permissions** = which rooms your keycard opens, and what you may do inside
  (read a file, edit it, shred it).
- **Visibility** = of the files inside a room you're allowed into, which ones are
  actually on your desk versus locked in a cabinet.

Being allowed into the "Customers" room doesn't automatically mean you can see
*every* customer file in it. That's the second gate.

---

## Gate 1 — Permissions: *what you can do*

**The matrix is king.** Every person has **one** permission matrix — a grid of
modules/tabs × actions (view, create, edit, delete, …). What a box shows in that
grid is **exactly** what's enforced. Checked = allowed. Unchecked = denied. There
is nothing hidden behind it.

- We read a granted cell as a plain sentence:
  > "While in **Contacts**, you can **view** and **edit** contacts."
- **Access Profiles are templates, not law.** A profile (e.g. "Pricing Staff") is a
  convenient starting point you can *stamp* onto a person's matrix to fill it fast.
  Once stamped, the person's own matrix is the only thing that counts — editing it
  takes effect immediately, and you never "re-apply" a profile to make a change
  stick. Editing a template does **not** silently change people who already have it.
- **No inheritance, no cascade, no fallback.** A tab is visible only if its **own**
  box is checked. Granting a parent module does not secretly switch its tabs on —
  if you want a tab, you check it (the parent-row click and "+View" buttons are just
  fill helpers that tick the boxes *visibly* for you).

This gate decides whether the buttons, tabs, and pages even appear for you — and
it decides it the same way the screen shows it. If you see it denied, it's denied.

---

## Gate 2 — Visibility: *which records you can see*

Even with permission to a module, you don't automatically see every record in it.
Visibility is set **per record type**, and there are **four levels of reach**:

| Level | What you see |
|---|---|
| **Own** | Only records you made or are personally assigned to (plus the things attached to your work). |
| **Team** | Your own, **plus** your teammates'. |
| **Org-wide** | **Every** record of that type, across **all** departments — *except* ones marked Confidential. |
| **All records** | Genuinely everything, **including** Confidential ones. (This is the executive level.) |

### The big change we just shipped
Shared workflow records — **Contacts, Customers, Quotations, Contracts, Projects**
— are now **Org-wide** for everyone by default.

That's the fix for the old headache where **Pricing couldn't see what Business
Development created** (and vice-versa). Departments no longer wall each other off
for this shared, cross-departmental data. Everyone working a deal can see the deal.

> Executives sit at **All records**; everyone else sits at **Org-wide** for these
> shared types. (Bookings and money records keep tighter, team-based reach because
> they're more sensitive by nature.)

---

## How "Team" visibility actually works (and the trap we fixed)

"Team" sounds simple — *"my own plus my teammates'."* But there's a trap hiding
in it, and it's worth understanding because it shaped how the whole thing works.

### The trap: people belong to more than one team

A booking is one job, done by one team. But a **person** isn't tied to one team —
senior staff especially. Mariella, a Sr. Ops Manager, sits in **four** teams at
once (Red, Jobert, JR, Jerome) because she helps across all of them.

The old way of computing "Team" asked: *"who are my teammates, and what are they
working on?"* So when Marc (Team Red) looked at bookings, the system found Mariella
(his Red teammate), then showed Marc **everything Mariella touches** — including her
**Jobert** work. One person in two teams quietly became a door between them. Because
managers are attached to most bookings, "Team" visibility silently ballooned to
near-everything.

The bug was never really about Mariella. It was a wrong assumption:

> *"If someone is my teammate, then everything they touch is my team's business."*

True for someone on one team. False the moment they're on two.

### The fix: split records into two kinds

The breakthrough was realising **not every record can belong to a team** — and the
ones that can't shouldn't be team-judged through people.

- **A booking is work.** One shipment, one team does it. It can genuinely *belong*
  to a team — and in Neuron it does: every booking carries its own team stamp.
- **A customer is a relationship.** Sales, ops, accounting, and several teams all
  touch the same customer. It can't belong to one team — it's **shared by nature.**
  The same is true of contacts, quotations, contracts, and projects: they all span
  multiple teams and departments. (In the system, **bookings are literally the only
  record that carries a team** — everything else has none, and that's correct, not a
  gap.)

So "Team" visibility now means two different things depending on the record:

| Record kind | How "Team" is judged | Why it's safe |
|---|---|---|
| **Bookings** (team-owned work) | The booking's **own team stamp** must match one of your teams. People aren't consulted at all. | A booking is private to its team, so we never let a stray multi-team person act as a door. Marc sees Red bookings, full stop — Mariella isn't in the calculation. |
| **Everything else** (shared: customers, contacts, quotes, contracts, projects) | Records **owned or made by your team members**. | These are shared anyway — there's no "other team's private customer" to leak. Seeing a teammate's customer exposes nothing that was ever walled off. |

### Why this is airtight

The thing that actually needed protecting — **one team's bookings staying private
from another team** — is guarded entirely by the booking's own team stamp. So even
though Marc can see a **shared customer** that a teammate works:

- he sees the customer record (shared — fine), but
- he still **cannot** see that customer's **other-team bookings** — those are blocked
  by the team stamp.

Marc sees the shared relationship, never the other team's private work underneath it.
And the simplest test that we got it right: **you can state the rule without naming a
single person.** Bookings → match the team stamp. Everything else → your team's
records. Nobody's name, no hidden door.

---

## The new piece — the **Confidential** lock (the "restriction engine")

Org-wide is great for normal work, but sometimes **one specific record** needs to
be private even though its type is normally shared. So **any record can be marked
Confidential.**

**When a record is Confidential, it vanishes for everyone *except*:**
- the person who **created** it,
- anyone **directly responsible** for it — the account owner, the handler, the
  people on the linked work,
- and **executives**.

Everyone else simply doesn't see it: not in their list, not openable, not in
search. It's as if the record isn't there.

**Four things that make it trustworthy:**

1. **Only executives can mark or unmark Confidential.** No one else even sees the
   button — and the system *enforces* this underneath, so it can't be bypassed by
   a clever workaround, only by an actual executive.
2. **It's logged.** Every flip (who, when, on what, which direction) is recorded —
   a clean audit trail.
3. **It never locks out the people already working on it.** The creator and the
   assigned people keep their access; Confidential just hides it from the *wider*
   org.
4. **Being connected to it can't leak it.** If a Confidential customer happens to
   be linked to a booking you're on, that link does **not** let you peek at the
   customer. The lock always wins.

---

## Putting both gates together

To see or touch a record, you need **both**:

```
   Permission for the module + action      AND      the record is in your visible set
   (Gate 1)                                          (Gate 2 — reach level + not Confidential-to-you)
```

A subtle but important rule: **being able to *see* a record is not the same as
being able to *change* it.** Seeing is Gate 2; changing still needs the edit/delete
permission from Gate 1. Wide visibility never silently hands out editing power.

---

## Who sees what — quick scenarios

- **Pricing staffer:** sees all normal contacts/customers/quotes across every
  department; does **not** see ones an executive marked Confidential — *unless*
  they're personally responsible for that account, in which case they still do.
- **Business Development rep:** same — full view of the shared pipeline, blind to
  Confidential records they're not on.
- **Operations handler:** sees the bookings and records they're assigned to; a
  Confidential record they're a handler on stays visible to them.
- **Executive:** sees **everything**, including Confidential, and is the only one
  who can switch Confidential on or off.

---

## The whole thing in six sentences

1. Every record passes two gates: **can you act** (permissions) and **can you see
   it** (visibility).
2. Permissions are a job-based keycard — view/create/edit/delete, per module,
   customizable per person.
3. Visibility has four reach levels: **Own → Team → Org-wide → All records.**
4. Shared records (contacts, customers, quotes, contracts, projects) are
   **Org-wide by default**, so departments finally see each other's work.
5. **Confidential** is the exception — an executive-only, audited lock that hides
   one record from everyone except its people and executives.
6. Seeing a record never means you can edit it, and being linked to a record never
   unlocks a Confidential one.
