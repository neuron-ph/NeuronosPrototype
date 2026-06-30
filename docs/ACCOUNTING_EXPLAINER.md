# How Our Accounting Works

A practical, straight-up guide to how transactions become financial statements, and how each statement's numbers are calculated.

---

## The flow

```
  Transaction        →   Journal entry      →   General ledger    →   Account balances   →   Statements
  (invoice, payment,     (two sides that         (every posted         (each account          (Income Statement,
   expense, etc.)         must balance)           entry, kept)          tallied + labeled)     Balance Sheet, Cash Flow)
```

Every figure on every statement comes from this chain. Nothing is typed in by hand.

---

## Accounts and their labels

An **account** is a category of money — Cash in Bank, Accounts Receivable, Freight Revenue, Salaries Expense, Bank Loan, and so on. A business has a few dozen of them.

Each account carries two labels, set once when it's created:

- **Account Type** — one of: Asset, Liability, Equity, Income, Expense. This decides **which statement** the account shows on.
- **Detail Type** — the finer one (Cash, Accounts Receivable, Fixed Assets, Loans, Depreciation, etc.). This decides **which cash-flow activity** the account belongs to (operating, investing, or financing).

The statements are calculated by **reading these labels** — not by inferring anything from the account number. The number is just a reference; the labels do the work. Add a new account, label it, and it lands in the right place on every statement.

---

## How a transaction is recorded

When money moves, the system writes a **journal entry** with two sides that always sum to the same amount — one side records where the money went, the other where it came from.

```
  Customer pays ₱50,000 against an invoice:
      Cash in Bank          +50,000      (an asset increases)
      Accounts Receivable   −50,000      (they owe us less)
```

Every posted entry is kept permanently in the **general ledger**. To produce a statement, the system tallies each account's entries over the relevant window:

- **For a period** (Income Statement, Cash Flow) — only entries dated within that month/year.
- **Up to a date** (Balance Sheet) — every entry up to that point, since a balance sheet is a running position.

That tally, signed by whether the account normally increases on the money-in or money-out side, is the account's **balance**. Every statement is built from these balances (and, for cash flow, the entries themselves).

---

## Income Statement — calculated

Covers a period. Worked top to bottom:

```
   Revenue                        (sum of all Income accounts)
 − Cost of Services               (direct cost of the jobs)
   ─────────────────────
 = Gross Profit
 − Operating Expenses             (salaries, rent, utilities, depreciation, etc.)
   ─────────────────────
 = Operating Income
 + Other Income  − Other Expenses (interest, FX, gains/losses outside core operations)
   ─────────────────────
 = Income Before Tax
 − Income Tax
   ─────────────────────
 = Net Income (profit or loss)
```

Each account lands in its line by its label — e.g. a revenue account sums into Revenue, a depreciation account into Operating Expenses, an interest charge into Other Expenses.

---

## Balance Sheet — calculated

A snapshot at a moment in time.

```
   ASSETS  (what the business owns)
     Current Assets        Cash, Accounts Receivable, Inventory, Prepaids
     Non-Current Assets    Equipment, Vehicles, Long-term Investments
     ───────────────────
     Total Assets

   LIABILITIES + EQUITY  (what it owes + the owners' share)
     Current Liabilities       Accounts Payable, Accrued Expenses, Taxes Payable
     Non-Current Liabilities   Long-term Loans
     Equity                    Owner capital + this period's Net Income
     ───────────────────
     Total Liabilities + Equity
```

**The check:** Total Assets must equal Total Liabilities + Equity. If they don't, the statement shows an out-of-balance warning — a signal that an entry needs checking. With clean books they always match.

---

## Cash Flow Statement — calculated

Covers a period. It exists because **profit is not the same as cash** — you can earn a profit while cash drops (customers haven't paid), or hold cash while running a loss. This statement explains the difference, then verifies it.

It has three sections:

**1. Operating** — cash from running the business. Built by starting from Net Income and adjusting it back to actual cash:
```
   Net Income
 + Non-cash costs            add back things that lowered profit but didn't spend cash
                             (depreciation, losses on disposal, unrealised FX)
 ± Working-capital changes   timing: receivables going up ties cash up (−);
                             payables going up holds cash longer (+)
   ─────────────────────
 = Net Cash from Operating
```

**2. Investing** — cash from buying or selling long-term things (equipment, vehicles, investments). Taken from the *actual cash amounts* on those transactions, not from balance changes.

**3. Financing** — cash from loans and owners (loan proceeds, repayments, owner contributions, dividends).

```
   Operating + Investing + Financing  =  Net increase / (decrease) in cash
```

**The check (this is the important part):** the system compares that figure against how much the **actual Cash accounts moved** over the period.

```
   Calculated change  vs  Actual movement in Cash accounts
        match     →  ✅ "Reconciled"  (the statement is proven correct)
        mismatch  →  ⚠️ warning       (something doesn't add up — go check)
```

So the cash flow doesn't just produce a number — it confirms the number is real.

---

## Seeing behind any number

Click any line on any statement and a panel opens listing the actual journal entries behind it — date, description, reference, amount, and where it originated (invoice, payment, expense voucher). The panel's total matches the line. Read the summary up top; drill to the underlying entries whenever you want proof.

---

## Why the numbers can be trusted

- Accounts are classified by **what they are** (their labels), not by an account number that could be mistyped.
- The **Balance Sheet checks itself** — it must balance or it warns.
- The **Cash Flow proves itself** against actual cash movement — it reconciles or it flags.
- **Every figure drills down** to the transactions behind it.

The statements are either provably correct, or they tell you exactly where to look.
