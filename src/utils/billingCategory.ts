type BillingCategoryInput = {
  quotation_category?: unknown;
  category?: unknown;
};

const asNonEmptyString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export function getBillingDisplayCategory(item: BillingCategoryInput): string {
  return asNonEmptyString(item.quotation_category) ?? asNonEmptyString(item.category) ?? "General";
}
