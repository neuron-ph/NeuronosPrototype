import { describe, it, expect } from "vitest";
import {
  calculateFinancialTotals,
  mergeBillableExpenses,
  convertQuotationToVirtualItems,
  mergeVirtualItemsWithRealItems,
} from "./financialCalculations";

type RawRow = Record<string, unknown>;

// ── helpers ─────────────────────────────────────────────────────────────────

const makeInvoice = (overrides: Partial<RawRow> = {}): RawRow => ({
  id: "inv-1",
  status: "posted",
  payment_status: "unpaid",
  amount: 10000,
  total_amount: 10000,
  remaining_balance: 10000,
  due_date: new Date(Date.now() - 90 * 86_400_000).toISOString(), // 90 days ago
  ...overrides,
});

const makeBillingItem = (overrides: Partial<RawRow> = {}): RawRow => ({
  id: "bli-1",
  status: "unbilled",
  amount: 5000,
  ...overrides,
});

const makeExpense = (overrides: Partial<RawRow> = {}): RawRow => ({
  id: "exp-1",
  status: "approved",
  payment_status: "unpaid",
  amount: 3000,
  ...overrides,
});

const makeCollection = (overrides: Partial<RawRow> = {}): RawRow => ({
  id: "col-1",
  status: "applied",
  amount: 4000,
  ...overrides,
});

// ── calculateFinancialTotals ────────────────────────────────────────────────

describe("calculateFinancialTotals", () => {
  it("returns zeroes for empty inputs", () => {
    const result = calculateFinancialTotals([], [], [], []);
    expect(result.bookedCharges).toBe(0);
    expect(result.invoicedAmount).toBe(0);
    expect(result.unbilledCharges).toBe(0);
    expect(result.directCost).toBe(0);
    expect(result.collectedAmount).toBe(0);
    expect(result.grossProfit).toBe(0);
    expect(result.grossMargin).toBe(0);
    expect(result.netCashFlow).toBe(0);
    expect(result.outstandingAmount).toBe(0);
    expect(result.overdueAmount).toBe(0);
  });

  it("sums invoiced amount from active invoices only", () => {
    const invoices = [
      makeInvoice({ amount: 10000 }),
      makeInvoice({ id: "inv-2", status: "reversed", amount: 5000 }),
      makeInvoice({ id: "inv-3", status: "posted", amount: 8000 }),
    ];
    const result = calculateFinancialTotals(invoices, [], [], []);
    // reversed invoice excluded → 10000 + 8000
    expect(result.invoicedAmount).toBe(18000);
  });

  it("excludes reversal documents from invoiced amount", () => {
    const invoices = [
      makeInvoice({ amount: 10000 }),
      makeInvoice({
        id: "inv-rev",
        amount: -10000,
        metadata: { reversal_of_invoice_id: "inv-1" },
      }),
    ];
    const result = calculateFinancialTotals(invoices, [], [], []);
    expect(result.invoicedAmount).toBe(10000);
  });

  it("calculates unbilled charges from billing items with unbilled status", () => {
    const billingItems = [
      makeBillingItem({ status: "unbilled", amount: 5000 }),
      makeBillingItem({ id: "bli-2", status: "invoiced", amount: 3000 }),
      makeBillingItem({ id: "bli-3", status: "unbilled", amount: 2000 }),
    ];
    const result = calculateFinancialTotals([], billingItems, [], []);
    expect(result.unbilledCharges).toBe(7000);
  });

  it("calculates bookedCharges = invoicedAmount + unbilledCharges", () => {
    const invoices = [makeInvoice({ amount: 10000 })];
    const billingItems = [makeBillingItem({ status: "unbilled", amount: 5000 })];
    const result = calculateFinancialTotals(invoices, billingItems, [], []);
    expect(result.bookedCharges).toBe(15000);
    expect(result.invoicedAmount).toBe(10000);
    expect(result.unbilledCharges).toBe(5000);
  });

  it("sums direct cost from all expenses", () => {
    const expenses = [
      makeExpense({ amount: 3000 }),
      makeExpense({ id: "exp-2", amount: 2000 }),
    ];
    const result = calculateFinancialTotals([], [], expenses, []);
    expect(result.directCost).toBe(5000);
  });

  it("sums collected amount from applied collections only", () => {
    const collections = [
      makeCollection({ amount: 4000, status: "applied" }),
      makeCollection({ id: "col-2", amount: 2000, status: "draft" }), // excluded
      makeCollection({ id: "col-3", amount: 1000, status: "voided" }), // excluded
      makeCollection({ id: "col-4", amount: 3000, status: "posted" }),
    ];
    const result = calculateFinancialTotals([], [], [], collections);
    expect(result.collectedAmount).toBe(7000);
  });

  it("calculates paidDirectCost from paid/cleared expenses", () => {
    const expenses = [
      makeExpense({ amount: 3000, status: "paid" }),
      makeExpense({ id: "exp-2", amount: 2000, status: "approved" }), // not paid
      makeExpense({ id: "exp-3", amount: 1500, payment_status: "cleared" }),
    ];
    const result = calculateFinancialTotals([], [], expenses, []);
    expect(result.paidDirectCost).toBe(4500);
    expect(result.directCost).toBe(6500);
  });

  it("calculates netCashFlow = collected - paidDirectCost", () => {
    const invoices = [makeInvoice({ amount: 20000 })];
    const expenses = [makeExpense({ amount: 5000, status: "paid" })];
    const collections = [makeCollection({ amount: 12000 })];
    const result = calculateFinancialTotals(invoices, [], expenses, collections);
    expect(result.netCashFlow).toBe(7000); // 12000 - 5000
  });

  it("calculates grossProfit and grossMargin correctly", () => {
    const invoices = [makeInvoice({ amount: 20000 })];
    const expenses = [makeExpense({ amount: 5000 })];
    const result = calculateFinancialTotals(invoices, [], expenses, []);
    expect(result.grossProfit).toBe(15000); // 20000 - 5000
    expect(result.grossMargin).toBe(75); // (15000/20000)*100
  });

  it("returns 0 grossMargin when bookedCharges is 0", () => {
    const result = calculateFinancialTotals([], [], [makeExpense({ amount: 1000 })], []);
    expect(result.grossMargin).toBe(0);
  });

  it("calculates outstanding from unpaid active invoices", () => {
    const invoices = [
      makeInvoice({ amount: 10000, remaining_balance: 7000, payment_status: "partial" }),
      makeInvoice({ id: "inv-2", amount: 5000, payment_status: "paid" }), // excluded
      makeInvoice({ id: "inv-3", amount: 8000, remaining_balance: 8000, payment_status: "unpaid" }),
    ];
    const result = calculateFinancialTotals(invoices, [], [], []);
    expect(result.outstandingAmount).toBe(15000); // 7000 + 8000
  });

  it("calculates overdue from past-due invoices", () => {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000).toISOString();
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString();

    const invoices = [
      makeInvoice({ amount: 10000, remaining_balance: 10000, due_date: ninetyDaysAgo }),
      makeInvoice({ id: "inv-2", amount: 5000, remaining_balance: 5000, due_date: tomorrow }), // not overdue
    ];
    const result = calculateFinancialTotals(invoices, [], [], []);
    expect(result.overdueAmount).toBe(10000);
  });

  it("handles NaN / undefined amounts gracefully", () => {
    const invoices = [makeInvoice({ amount: undefined, total_amount: "not-a-number" })];
    const result = calculateFinancialTotals(invoices, [], [], []);
    expect(result.invoicedAmount).toBe(0);
  });
});

// ── mergeBillableExpenses ───────────────────────────────────────────────────

describe("mergeBillableExpenses", () => {
  it("appends billable expenses as unbilled billing items", () => {
    const existing: RawRow[] = [];
    const expenses: RawRow[] = [
      { id: "e1", is_billable: true, status: "approved", amount: 1000, currency: "PHP" },
    ];
    const result = mergeBillableExpenses(existing, expenses);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("unbilled");
    expect(result[0].source_type).toBe("billable_expense");
    expect(result[0].amount).toBe(1000);
  });

  it("skips non-billable expenses", () => {
    const expenses: RawRow[] = [
      { id: "e1", is_billable: false, status: "approved", amount: 1000 },
    ];
    const result = mergeBillableExpenses([], expenses);
    expect(result).toHaveLength(0);
  });

  it("skips expenses already linked via source_id", () => {
    const existing: RawRow[] = [{ id: "b1", source_id: "e1" }];
    const expenses: RawRow[] = [
      { id: "e1", is_billable: true, status: "approved", amount: 1000 },
    ];
    const result = mergeBillableExpenses(existing, expenses);
    expect(result).toHaveLength(1); // only the original
    expect(result[0].id).toBe("b1");
  });

  it("skips cancelled/rejected expenses", () => {
    const expenses: RawRow[] = [
      { id: "e1", is_billable: true, status: "cancelled", amount: 1000 },
      { id: "e2", is_billable: true, status: "rejected", amount: 2000 },
    ];
    const result = mergeBillableExpenses([], expenses);
    expect(result).toHaveLength(0);
  });
});

// ── convertQuotationToVirtualItems ──────────────────────────────────────────

describe("convertQuotationToVirtualItems", () => {
  it("creates virtual billing items from quotation selling_price", () => {
    const quotation: RawRow = {
      created_at: "2025-01-01T00:00:00Z",
      selling_price: [
        {
          category_name: "Ocean Freight",
          line_items: [
            { id: "li1", description: "20ft container", amount: 50000, currency: "PHP", service: "Forwarding" },
          ],
        },
      ],
    };
    const result = convertQuotationToVirtualItems(quotation, "PRJ-001");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("virtual-li1");
    expect(result[0].is_virtual).toBe(true);
    expect(result[0].status).toBe("unbilled");
    expect(result[0].amount).toBe(50000);
    expect(result[0].project_number).toBe("PRJ-001");
    expect(result[0].quotation_category).toBe("Ocean Freight");
  });

  it("creates virtual billing items from negative quotation selling amounts so accounting can review them", () => {
    const quotation: RawRow = {
      created_at: "2025-01-01T00:00:00Z",
      selling_price: [
        {
          category_name: "Ocean Freight",
          line_items: [
            { id: "li1", description: "Rebate", amount: -200, currency: "USD", service: "Forwarding" },
            { id: "li2", description: "Freight", amount: 100, currency: "USD", service: "Forwarding" },
          ],
        },
      ],
    };

    const result = convertQuotationToVirtualItems(quotation, "PRJ-001");

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("virtual-li1");
    expect(result[0].amount).toBe(-200);
    expect(result[1].id).toBe("virtual-li2");
    expect(result[1].amount).toBe(100);
  });

  it("returns empty array when selling_price is not an array", () => {
    expect(convertQuotationToVirtualItems({ selling_price: null }, "PRJ-001")).toEqual([]);
    expect(convertQuotationToVirtualItems({ selling_price: "bad" }, "PRJ-001")).toEqual([]);
    expect(convertQuotationToVirtualItems({}, "PRJ-001")).toEqual([]);
  });
});

// ── mergeVirtualItemsWithRealItems ──────────────────────────────────────────

describe("mergeVirtualItemsWithRealItems", () => {
  it("includes virtual items not yet realized", () => {
    const real: RawRow[] = [{ id: "r1", source_quotation_item_id: "li1" }];
    const virtual: RawRow[] = [
      { id: "v-li1", source_quotation_item_id: "li1", source_id: "li1" },
      { id: "v-li2", source_quotation_item_id: "li2", source_id: "li2" },
    ];
    const result = mergeVirtualItemsWithRealItems(real, virtual);
    expect(result).toHaveLength(2); // real r1 + virtual v-li2
    expect(result.map((r) => r.id)).toContain("r1");
    expect(result.map((r) => r.id)).toContain("v-li2");
  });

  it("excludes virtual items matched by source_id with source_type quotation_item", () => {
    const real: RawRow[] = [{ id: "r1", source_id: "li1", source_type: "quotation_item" }];
    const virtual: RawRow[] = [
      { id: "v-li1", source_quotation_item_id: "li1", source_id: "li1" },
    ];
    const result = mergeVirtualItemsWithRealItems(real, virtual);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("r1");
  });

  it("keeps all items when no overlap", () => {
    const real: RawRow[] = [{ id: "r1" }];
    const virtual: RawRow[] = [{ id: "v1", source_quotation_item_id: "li99", source_id: "li99" }];
    const result = mergeVirtualItemsWithRealItems(real, virtual);
    expect(result).toHaveLength(2);
  });
});
