# Record Visibility V2 — Manual Browser Smoke Test (dev)

Run on the **dev** preview. ~10 minutes. RLS is already verified at the data layer
(docs/PLAN_RECORD_VISIBILITY_V2_2026-06.md §7); this confirms the **UI** wiring.

## Setup (read first)
- Use **two real logins**: one **Executive** (your `hq@neuron.com.ph`) and one
  **non-exec** (a Business Development or Pricing user — synced prod accounts use
  password `devpassword123`).
- **Do NOT use the dev role-override switcher** to fake "exec" — it only changes UI
  labels, not your real RLS identity, so confidential writes would be blocked by the
  DB and you'd get misleading results. Use genuinely different accounts (two
  browsers, or one normal + one incognito).
- **Hard-refresh (Ctrl+Shift+R)** after each login switch and after flipping a flag,
  so scope/lists reload.
- Open the console (F12) and watch for red errors as you go.

---

## A. Cross-departmental visibility (the original bug)
1. **As the BD user** → Contacts, then Customers. ✅ *Expect:* you see records
   created by Pricing / others, not just your own.
2. **As the Pricing user** → same two lists. ✅ *Expect:* you see BD-created records.

## B. Exec sees + can flip the toggle
3. **As the Exec** → open any **Contact**. ✅ *Expect:* a lock chip
   **"Mark confidential"** in the header.
4. Click it. ✅ *Expect:* toast *"Marked confidential — visible only to people
   directly on it + executives"*, chip turns amber **"Confidential"**. No console error.
5. Repeat-confirm the chip appears (as Exec) on a **Customer**, a **Quotation**, a
   **Contract**, a **Project**, and a **Booking** detail. (You can flip one of each
   or just confirm the chip renders.)

## C. Restricted hiding (the whole point)
6. **As the non-exec** (BD/Pricing) who is **not** the owner/assignee of the contact
   from step 4 → Contacts list (hard-refresh). ✅ *Expect:* that contact is **gone**
   from the list and not openable. Also ✅ confirm **no lock chip** appears anywhere
   for this non-exec.
7. If a **non-exec owns/created** a confidential record → log in as them. ✅ *Expect:*
   they **still** see it (owner/assignee keeps access).
8. **Back as Exec** → you still see it. Click the chip again. ✅ *Expect:* toast
   *"Confidentiality removed"*; after the non-exec hard-refreshes, it reappears for them.

## D. Negative / safety
9. **As the non-exec** → confirm there is **no** way to mark anything confidential
   (the chip never renders). (The DB also rejects it even via direct API.)
10. **As the non-exec** → make a **normal** edit (name/phone) on a contact/customer
    you can edit. ✅ *Expect:* saves fine (the exec-only rule only blocks the
    confidential flag, not normal edits).

## E. Bookings
11. **As Exec** → mark a **booking** confidential. As an **Ops user NOT assigned**
    to it → it disappears from their bookings. As the **assigned handler** → still
    visible.

---

## Cleanup (important)
After testing, **un-flag every record you marked confidential** so dev returns to a
clean baseline — including `contact-1781487289813` you flipped earlier today. (Or
tell me and I'll clear them via SQL.)

## If something looks wrong
- A list not updating → hard-refresh first (client cache).
- Chip missing for an exec on a type → that exec account may lack that module's
  *view* grant (module-gated; not a visibility bug — check Admin → Access).
- Capture the console error + which account/record, and tell me.
