import { describe, expect, it } from "vitest";
import type { QuotationLineItemNew, SellingPriceLineItem } from "../../types/pricing";
import {
  calculateSellingItemFromAmountAdded,
  calculateSellingItemFromBuyingPrice,
  calculateSellingItemFromCostChange,
  calculateSellingItemFromPercentage,
  findNegativeBillingAmountItems,
} from "./quotationSignedPricing";

const makeSellingItem = (overrides: Partial<SellingPriceLineItem> = {}): SellingPriceLineItem => ({
  id: "item-1",
  description: "Ocean Freight",
  price: 100,
  currency: "USD",
  quantity: 2,
  forex_rate: 56,
  is_taxed: false,
  remarks: "",
  amount: 11200,
  base_cost: 100,
  amount_added: 0,
  percentage_added: 0,
  final_price: 100,
  ...overrides,
});

const makeBuyingItem = (overrides: Partial<QuotationLineItemNew> = {}): QuotationLineItemNew => ({
  id: "item-1",
  description: "Ocean Freight",
  price: -200,
  currency: "USD",
  quantity: 2,
  forex_rate: 56,
  is_taxed: false,
  remarks: "",
  amount: -22400,
  ...overrides,
});

describe("quotation signed pricing", () => {
  it("copies a negative buying price into the selling cost field without extending it", () => {
    const result = calculateSellingItemFromBuyingPrice(
      makeSellingItem({ amount_added: 300, percentage_added: 15 }),
      makeBuyingItem({ price: -200, quantity: 3, forex_rate: 50 })
    );

    expect(result.base_cost).toBe(-200);
    expect(result.final_price).toBe(100);
    expect(result.price).toBe(100);
    expect(result.quantity).toBe(3);
    expect(result.forex_rate).toBe(50);
    expect(result.amount).toBe(15000);
    expect(result.percentage_added).toBe(0);
  });

  it("preserves amount-added markup when a selling cost becomes negative", () => {
    const result = calculateSellingItemFromCostChange(
      makeSellingItem({ amount_added: 300, percentage_added: 20 }),
      -200
    );

    expect(result.base_cost).toBe(-200);
    expect(result.amount_added).toBe(300);
    expect(result.percentage_added).toBe(0);
    expect(result.final_price).toBe(100);
  });

  it("allows signed amount-added values and derives percentage only for positive costs", () => {
    const positiveCost = calculateSellingItemFromAmountAdded(makeSellingItem({ base_cost: 200 }), -250);
    const negativeCost = calculateSellingItemFromAmountAdded(makeSellingItem({ base_cost: -200 }), 300);

    expect(positiveCost.final_price).toBe(-50);
    expect(positiveCost.percentage_added).toBe(-125);
    expect(negativeCost.final_price).toBe(100);
    expect(negativeCost.percentage_added).toBe(0);
  });

  it("disables percentage-driven markup for negative costs", () => {
    const result = calculateSellingItemFromPercentage(
      makeSellingItem({ base_cost: -200, amount_added: 300, final_price: 100 }),
      25
    );

    expect(result.base_cost).toBe(-200);
    expect(result.amount_added).toBe(300);
    expect(result.percentage_added).toBe(0);
    expect(result.final_price).toBe(100);
  });

  it("identifies negative billable amounts before billing import", () => {
    const result = findNegativeBillingAmountItems([
      { id: "ok", description: "Allowed", amount: 100 },
      { id: "bad", description: "Blocked", amount: -1 },
    ]);

    expect(result).toEqual([{ id: "bad", description: "Blocked", amount: -1 }]);
  });
});
