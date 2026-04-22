import type { QuotationLineItemNew, SellingPriceLineItem } from "../../types/pricing";

export interface BillingAmountCandidate {
  id?: string;
  description?: string;
  amount?: number | string | null;
}

const asFiniteNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const recalculateSellingAmount = (item: SellingPriceLineItem): SellingPriceLineItem => {
  const finalPrice = asFiniteNumber(item.base_cost) + asFiniteNumber(item.amount_added);
  const quantity = asFiniteNumber(item.quantity, 1);
  const forexRate = asFiniteNumber(item.forex_rate, 1);

  return {
    ...item,
    final_price: finalPrice,
    price: finalPrice,
    amount: finalPrice * quantity * forexRate,
  };
};

const percentageFromAmount = (baseCost: number, amountAdded: number): number =>
  baseCost > 0 ? (amountAdded / baseCost) * 100 : 0;

export const calculateSellingItemFromCostChange = (
  item: SellingPriceLineItem,
  baseCost: number
): SellingPriceLineItem => {
  const nextBaseCost = asFiniteNumber(baseCost);
  const amountAdded = asFiniteNumber(item.amount_added);

  return recalculateSellingAmount({
    ...item,
    base_cost: nextBaseCost,
    percentage_added: percentageFromAmount(nextBaseCost, amountAdded),
  });
};

export const calculateSellingItemFromAmountAdded = (
  item: SellingPriceLineItem,
  amountAdded: number
): SellingPriceLineItem => {
  const nextAmountAdded = asFiniteNumber(amountAdded);
  const baseCost = asFiniteNumber(item.base_cost);

  return recalculateSellingAmount({
    ...item,
    amount_added: nextAmountAdded,
    percentage_added: percentageFromAmount(baseCost, nextAmountAdded),
  });
};

export const calculateSellingItemFromPercentage = (
  item: SellingPriceLineItem,
  percentage: number
): SellingPriceLineItem => {
  const baseCost = asFiniteNumber(item.base_cost);

  if (baseCost < 0) {
    return {
      ...item,
      percentage_added: 0,
    };
  }

  const nextPercentage = Math.max(0, asFiniteNumber(percentage));
  const amountAdded = (baseCost * nextPercentage) / 100;

  return recalculateSellingAmount({
    ...item,
    amount_added: amountAdded,
    percentage_added: nextPercentage,
  });
};

export const calculateSellingItemFromBuyingPrice = (
  sellingItem: SellingPriceLineItem,
  buyingItem: QuotationLineItemNew
): SellingPriceLineItem => {
  const baseCost = asFiniteNumber(buyingItem.price);

  return recalculateSellingAmount({
    ...sellingItem,
    base_cost: baseCost,
    quantity: asFiniteNumber(buyingItem.quantity, 1),
    currency: buyingItem.currency,
    forex_rate: asFiniteNumber(buyingItem.forex_rate, 1),
    percentage_added: percentageFromAmount(baseCost, asFiniteNumber(sellingItem.amount_added)),
  });
};

export const findNegativeBillingAmountItems = <T extends BillingAmountCandidate>(items: T[]): T[] =>
  items.filter((item) => asFiniteNumber(item.amount) < 0);

export const hasNonNegativeBillingAmount = (item: BillingAmountCandidate): boolean =>
  asFiniteNumber(item.amount) >= 0;
