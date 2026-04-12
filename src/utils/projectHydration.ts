import { supabase } from "./supabase/client";
import type { Project, QuotationNew } from "../types/pricing";

type RecordLike = Record<string, any>;

interface ProjectUserRef {
  id?: string | null;
  name?: string | null;
}

interface BuildProjectFromQuotationOptions {
  projectNumber: string;
  id?: string;
  status?: string;
  timestamp?: string;
  overrides?: Record<string, unknown>;
  extraDetails?: Record<string, unknown>;
}

function asObject(value: unknown): RecordLike {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordLike)
    : {};
}

function asArray<T>(value: unknown, fallback: T[] = []): T[] {
  return Array.isArray(value) ? (value as T[]) : fallback;
}

export function normalizeQuotationRow(row: RecordLike | null | undefined): QuotationNew | undefined {
  if (!row) return undefined;

  const merged: RecordLike = {
    ...asObject(row.details),
    ...asObject(row.pricing),
    ...row,
  };

  if (!merged.quote_number && row.quotation_number) {
    merged.quote_number = row.quotation_number;
  }
  if (!merged.contact_person_id && (row.contact_person_id || row.contact_id)) {
    merged.contact_person_id = row.contact_person_id || row.contact_id;
  }
  if (!merged.contact_person_name && (row.contact_person_name || row.contact_name)) {
    merged.contact_person_name = row.contact_person_name || row.contact_name;
  }
  if (!merged.created_date) {
    merged.created_date = row.quotation_date || row.created_at;
  }
  if (!merged.valid_until) {
    merged.valid_until = row.expiry_date || row.validity_date || row.contract_end_date;
  }
  if (!merged.contract_validity_start && merged.contract_start_date) {
    merged.contract_validity_start = merged.contract_start_date;
  }
  if (!merged.contract_validity_end && merged.contract_end_date) {
    merged.contract_validity_end = merged.contract_end_date;
  }

  merged.services = asArray(merged.services);
  merged.services_metadata = asArray(merged.services_metadata);
  merged.charge_categories = asArray(merged.charge_categories);
  merged.buying_price = asArray(merged.buying_price);
  merged.selling_price = asArray(merged.selling_price);

  return merged as QuotationNew;
}

export function normalizeProjectRow(row: RecordLike | null | undefined): Project {
  const source = row || {};
  const quotationSource = Array.isArray(source.quotations)
    ? source.quotations[0]
    : source.quotations;
  const quotation = normalizeQuotationRow(quotationSource);

  const merged: RecordLike = {
    ...asObject(source.details),
    ...asObject(source.pricing),
    ...source,
  };

  delete merged.quotations;

  merged.linkedBookings = merged.linkedBookings || merged.linked_bookings || [];
  merged.quotation_number =
    merged.quotation_number ||
    merged.quote_number ||
    quotation?.quote_number ||
    quotationSource?.quotation_number;
  merged.quote_number = merged.quote_number || merged.quotation_number;
  merged.quotation_name =
    merged.quotation_name || quotation?.quotation_name || quotationSource?.quotation_name || null;
  merged.customer_id = merged.customer_id || quotation?.customer_id || quotationSource?.customer_id || null;
  merged.customer_name =
    merged.customer_name || quotation?.customer_name || quotationSource?.customer_name || null;
  merged.contact_person_id =
    merged.contact_person_id ||
    quotation?.contact_person_id ||
    quotationSource?.contact_person_id ||
    quotationSource?.contact_id ||
    null;
  merged.contact_person_name =
    merged.contact_person_name ||
    quotation?.contact_person_name ||
    quotationSource?.contact_person_name ||
    quotationSource?.contact_name ||
    null;
  merged.movement = merged.movement || quotation?.movement || null;
  merged.services = asArray(merged.services, quotation?.services || []);
  merged.service_mode = merged.service_mode || quotation?.service_mode || null;
  merged.services_metadata = asArray(merged.services_metadata, quotation?.services_metadata || []);
  merged.charge_categories = asArray(merged.charge_categories, quotation?.charge_categories || []);
  merged.currency = merged.currency || quotation?.currency || "PHP";
  merged.credit_terms = merged.credit_terms || quotation?.credit_terms || null;
  merged.validity_period = merged.validity_period || quotation?.validity_period || null;
  merged.buying_price = merged.buying_price || quotation?.buying_price || [];
  merged.selling_price = merged.selling_price || quotation?.selling_price || [];
  merged.financial_summary = merged.financial_summary || quotation?.financial_summary || {};
  merged.total = merged.total ?? quotation?.financial_summary?.grand_total;

  if (quotation) {
    merged.quotation = quotation;
  }

  return merged as Project;
}

export async function fetchProjectsWithQuotation(): Promise<Project[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("*, quotations(*)")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data || []).map(normalizeProjectRow);
}

export async function fetchProjectWithQuotation(projectId: string): Promise<Project | null> {
  const { data, error } = await supabase
    .from("projects")
    .select("*, quotations(*)")
    .eq("id", projectId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? normalizeProjectRow(data) : null;
}

export async function fetchProjectByNumberWithQuotation(projectNumber: string): Promise<Project | null> {
  const { data, error } = await supabase
    .from("projects")
    .select("*, quotations(*)")
    .eq("project_number", projectNumber)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? normalizeProjectRow(data) : null;
}

export function buildProjectInsertFromQuotation(
  quotation: Partial<QuotationNew>,
  currentUser: ProjectUserRef | null | undefined,
  options: BuildProjectFromQuotationOptions,
): Record<string, unknown> {
  const timestamp = options.timestamp || new Date().toISOString();
  const quotationDetails = asObject((quotation as RecordLike).details);

  const details: Record<string, unknown> = {
    ...quotationDetails,
    bd_owner_user_id: currentUser?.id ?? null,
    bd_owner_user_name: currentUser?.name ?? null,
    quotation_number: quotation.quote_number ?? null,
    quotation_name: quotation.quotation_name ?? null,
    quotation_type: quotation.quotation_type ?? null,
    customer_id: quotation.customer_id ?? null,
    customer_name: quotation.customer_name ?? quotation.customer_company ?? null,
    contact_person_id: quotation.contact_person_id ?? quotation.contact_id ?? null,
    contact_person_name: quotation.contact_person_name ?? null,
    movement: quotation.movement ?? null,
    services: quotation.services ?? [],
    service_mode: quotation.service_mode ?? null,
    services_metadata: quotation.services_metadata ?? [],
    charge_categories: quotation.charge_categories ?? [],
    currency: quotation.currency ?? "PHP",
    financial_summary: quotation.financial_summary ?? {},
    buying_price: quotation.buying_price ?? [],
    selling_price: quotation.selling_price ?? [],
    credit_terms: quotation.credit_terms ?? null,
    validity_period: quotation.validity_period ?? null,
    created_date: quotation.created_date ?? null,
    valid_until: quotation.valid_until ?? null,
    quotation_date: quotation.created_date ?? null,
    validity_date: quotation.valid_until ?? null,
    category: quotation.category ?? null,
    shipment_freight: quotation.shipment_freight ?? null,
    incoterm: quotation.incoterm ?? null,
    carrier: quotation.carrier ?? null,
    transit_days: quotation.transit_days ?? null,
    transit_time: quotation.transit_time ?? null,
    routing_info: quotation.routing_info ?? null,
    commodity: quotation.commodity ?? null,
    pol_aol: quotation.pol_aol ?? null,
    pod_aod: quotation.pod_aod ?? null,
    packaging_type: quotation.packaging_type ?? null,
    volume: quotation.volume ?? null,
    gross_weight: quotation.gross_weight ?? null,
    chargeable_weight: quotation.chargeable_weight ?? null,
    dimensions: quotation.dimensions ?? null,
    collection_address: quotation.collection_address ?? null,
    pickup_address: quotation.pickup_address ?? null,
    source_contract_id: quotation.source_contract_id ?? null,
    source_contract_number: quotation.source_contract_number ?? null,
    ...options.extraDetails,
  };

  return {
    id: options.id || `proj-${Date.now()}`,
    project_number: options.projectNumber,
    quotation_id: quotation.id ?? null,
    quotation_name: quotation.quotation_name ?? null,
    customer_id: quotation.customer_id ?? null,
    customer_name: quotation.customer_name ?? quotation.customer_company ?? null,
    status: options.status || "Active",
    services: quotation.services ?? [],
    service_type:
      options.overrides?.service_type ??
      (Array.isArray(quotation.services) && quotation.services.length === 1
        ? quotation.services[0]
        : null),
    created_by: currentUser?.id ?? null,
    created_by_name: currentUser?.name ?? null,
    created_at: timestamp,
    updated_at: timestamp,
    details,
    ...(options.overrides || {}),
  };
}
