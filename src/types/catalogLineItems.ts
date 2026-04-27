export interface CatalogSnapshot {
  name: string;
  unit_type: string | null;
  tax_code: string | null;
  category_name: string | null;
  default_price: number;
  currency: string;
}

export interface BillingLineItemPayload {
  booking_id: string | null;
  project_number: string;
  description: string;
  service_type: string;
  category: string;
  quotation_category: string;
  amount: number;
  quantity: number;
  currency: string;
  status: string;
  is_taxed: boolean;
  source_quotation_item_id: string | null;
  source_type: string;
  catalog_item_id: string | null;
  catalog_snapshot: CatalogSnapshot | null;
  created_at: string;
}

export interface ExpenseLineItemPayload {
  catalog_item_id: string | null;
  catalog_snapshot: CatalogSnapshot | null;
  particular: string;
  description: string;
  amount: number;
}
