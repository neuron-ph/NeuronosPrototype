import { supabase } from '../utils/supabase/client';
import { toast } from "sonner@2.0.3";
import { createWorkflowTicket } from '../utils/workflowTickets';
import { logActivity, logCreation } from '../utils/activityLog';
import { trackRecent } from '../lib/recents';
import { useState, useEffect } from "react";
import { useUser } from "../hooks/useUser";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../lib/queryKeys";
import { QuotationDetail } from "./pricing/QuotationDetail";
import { QuotationsListWithFilters } from "./pricing/QuotationsListWithFilters";
import { QuotationBuilderV3 } from "./pricing/quotations/QuotationBuilderV3";
import type { QuotationNew, QuotationType } from "../types/pricing";
import { ContactsListWithFilters } from "./crm/ContactsListWithFilters";
import { PricingContactDetail } from "./pricing/PricingContactDetail";
import { CustomersListWithFilters } from "./crm/CustomersListWithFilters";
import { CustomerDetail } from "./bd/CustomerDetail";
import { PricingCustomerDetail } from "./pricing/PricingCustomerDetail";
import { NetworkPartnersModule } from "./pricing/NetworkPartnersModule";
import { VendorDetail } from "./pricing/VendorDetail";
import type { Contact, Customer } from "../types/bd";
import type { NetworkPartner } from "../data/networkPartners";
// Removed static import: import { NETWORK_PARTNERS } from "../data/networkPartners";
import { ContactsModuleWithBackend } from "./crm/ContactsModuleWithBackend";
// projectId/publicAnonKey removed — using supabase.from() (Phase 3)
import { useNetworkPartners } from "../hooks/useNetworkPartners";

export type PricingView = "contacts" | "customers" | "quotations" | "vendors" | "reports";
type SubView = "list" | "detail" | "create";

interface PricingProps {
  view?: PricingView;
  onViewInquiry?: (inquiryId: string) => void;
  inquiryId?: string | null;
  currentUser?: { id?: string; name: string; email: string; department: string } | null;
  onCreateTicket?: (quotation: QuotationNew) => void;
}

// API_URL removed — using supabase.from() wrapper (Phase 3)

export function Pricing({ view = "contacts", onViewInquiry, inquiryId, currentUser, onCreateTicket }: PricingProps) {
  const [subView, setSubView] = useState<SubView>("list");
  const [selectedQuotation, setSelectedQuotation] = useState<QuotationNew | null>(null);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedVendor, setSelectedVendor] = useState<NetworkPartner | null>(null);
  const [pendingQuotationType, setPendingQuotationType] = useState<QuotationType>("project");

  const queryClient = useQueryClient();
  const { effectiveRole } = useUser();

  // Hook for Network Partners (Lifting State Up)
  const { partners, isLoading: isPartnersLoading, savePartner } = useNetworkPartners();

  // Map department name to userDepartment format
  const userDepartment: "Business Development" | "Pricing" = currentUser?.department === "Pricing" ? "Pricing" : "Business Development";

  // Fetch quotations from backend — Pricing sees the full pipeline (no scope
  // filter). RLS policy already restricts to permitted departments; owner-based
  // narrowing would hide BD-originated or manager-created quotations from staff.
  const { data: quotations = [], isLoading } = useQuery({
    queryKey: queryKeys.quotations.list(),
    queryFn: async () => {
      let query = supabase.from('quotations').select('*');
      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;
      // Merge details JSONB so financial fields (charge_categories, buying_price, etc.) are accessible
      // Also normalize contract date column names (DB: contract_start_date → type: contract_validity_start)
      const merged = (data || []).map((row: any) => {
        // Spread details first, then pricing JSONB (so credit_terms, validity_period etc. are top-level),
        // then the raw row last so real columns always win.
        const m = { ...(row?.details ?? {}), ...(row?.pricing ?? {}), ...row };
        if (!m.contract_validity_start && m.contract_start_date) m.contract_validity_start = m.contract_start_date;
        if (!m.contract_validity_end && m.contract_end_date) m.contract_validity_end = m.contract_end_date;
        return m;
      });
      console.log(`Fetched ${merged.length} quotations for Pricing module`);
      return merged as QuotationNew[];
    },
    enabled: view === "quotations",
    // Inherits 5-minute staleTime from global QueryClient config
  });

  const fetchQuotations = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.quotations.list() });
  };

  // Reset to list view when switching between main views
  useEffect(() => {
    setSubView("list");
    setSelectedQuotation(null);
    setSelectedContact(null);
    setSelectedCustomer(null);
  }, [view]);

  // Handle inquiryId prop - when set, show the detail view for that inquiry
  useEffect(() => {
    if (inquiryId && view === "quotations") {
      const inquiry = quotations.find(q => q.id === inquiryId);
      if (inquiry) {
        setSelectedQuotation(inquiry);
        setSubView("detail");
      }
    }
  }, [inquiryId, view, quotations]);

  const handleViewContact = (contact: Contact) => {
    setSelectedContact(contact);
    setSubView("detail");
    if (currentUser?.id) trackRecent({
      label: contact.name || [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Contact",
      sub: `Pricing · Contact`,
      path: `/pricing/contacts`,
      type: "quotation",
      time: new Date().toISOString(),
    }, currentUser.id);
  };

  const handleBackFromContact = () => {
    setSelectedContact(null);
    setSubView("list");
  };

  const handleViewCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setSubView("detail");
    if (currentUser?.id) trackRecent({
      label: customer.name || customer.company_name || "Customer",
      sub: `Pricing · Customer`,
      path: `/pricing/customers`,
      type: "quotation",
      time: new Date().toISOString(),
    }, currentUser.id);
  };

  const handleBackFromCustomer = () => {
    setSelectedCustomer(null);
    setSubView("list");
  };

  const handleViewQuotation = (quotation: QuotationNew) => {
    setSelectedQuotation(quotation);
    setSubView("detail");
    if (currentUser?.id) trackRecent({
      label: quotation.quote_number || "Quotation",
      sub: `Pricing · ${quotation.customer_name || ""}`,
      path: `/pricing/quotations/${quotation.id}`,
      type: "quotation",
      time: new Date().toISOString(),
    }, currentUser.id);
  };

  const handleBackFromQuotation = () => {
    setSelectedQuotation(null);
    setSubView("list");
  };

  const handleEditQuotation = () => {
    // Keep the selected quotation and switch to create mode for editing
    setSubView("create");
  };

  const handleCreateQuotation = (quotationType?: QuotationType) => {
    setSelectedQuotation(null);
    setPendingQuotationType(quotationType || "project");
    setSubView("create");
  };

  const handleBackFromCreate = () => {
    setSelectedQuotation(null);
    setSubView("list");
  };

  const handleSaveQuotation = async (data: QuotationNew) => {
    const d = data as any;

    // Fields that live inside the `pricing` JSONB column (not top-level DB columns)
    const pricingFields: Record<string, unknown> = {};
    const PRICING_KEYS = [
      'selling_price', 'buying_price', 'financial_summary',
      'movement', 'category', 'shipment_freight',
      'incoterm', 'carrier', 'transit_days', 'commodity',
      'pol_aol', 'pod_aod', 'charge_categories', 'currency',
      'credit_terms', 'validity_period',
    ];
    for (const key of PRICING_KEYS) {
      if (d[key] !== undefined) pricingFields[key] = d[key];
    }

    // Merge with any existing pricing data already on the record
    const existingPricing = d.pricing && typeof d.pricing === 'object' ? d.pricing : {};
    const mergedPricing = { ...existingPricing, ...pricingFields };

    // Build a clean payload with only valid DB columns
    const cleanPayload: Record<string, unknown> = {
      quotation_name: d.quotation_name,
      quotation_number: d.quotation_number,
      quote_number: d.quote_number,
      customer_id: d.customer_id,
      customer_name: d.customer_name,
      contact_id: d.contact_id,
      contact_name: d.contact_name ?? d.contact_person_name,
      contact_person_id: d.contact_person_id,
      services: d.services,
      services_metadata: d.services_metadata,
      status: d.status,
      quotation_type: d.quotation_type,
      // Date field remaps
      quotation_date: d.quotation_date ?? d.created_date,
      // valid_until can be either an ISO date string or a plain number (days).
      // Only write expiry_date when it's actually a date; validity_period (days) lives in the pricing JSONB.
      expiry_date: (() => {
        const raw = d.expiry_date ?? d.valid_until;
        if (!raw) return undefined;
        const days = Number(raw);
        if (!isNaN(days) && String(raw).trim() === String(days)) {
          // It's a plain number — compute expiry from quotation_date + days
          const base = d.quotation_date ?? d.created_date;
          if (!base) return undefined;
          const dt = new Date(base);
          dt.setDate(dt.getDate() + days);
          return dt.toISOString();
        }
        return raw; // Already a date string
      })(),
      validity_date: d.validity_date,
      // Contract date fields
      contract_start_date: d.contract_validity_start ?? d.contract_start_date,
      contract_end_date: d.contract_validity_end ?? d.contract_end_date,
      // Misc columns that do exist on the table
      created_by: d.created_by,
      created_by_name: d.created_by_name,
      project_id: d.project_id,
      // Pack all pricing sub-fields into the JSONB column
      pricing: Object.keys(mergedPricing).length > 0 ? mergedPricing : undefined,
      // Contract rate matrices live in details (spread on load via { ...details, ...row })
      details: d.rate_matrices !== undefined
        ? { ...(d.details ?? {}), rate_matrices: d.rate_matrices }
        : d.details ?? undefined,
    };

    // Date fields — null out anything Postgres can't parse as a timestamp
    const DATE_COLS = ['quotation_date', 'expiry_date', 'validity_date', 'contract_start_date', 'contract_end_date'];
    for (const col of DATE_COLS) {
      const v = cleanPayload[col];
      if (v === '' || (typeof v === 'string' && v !== null && isNaN(Date.parse(v)))) {
        cleanPayload[col] = null;
      }
    }

    // Strip undefined values so we don't send nulls for untouched fields
    const payload = Object.fromEntries(
      Object.entries(cleanPayload).filter(([, v]) => v !== undefined)
    );


    try {
      const isUpdate = !!d.id && !d.id.startsWith('quot-');

      if (isUpdate) {
        // Don't include these on updates:
        // - quote_number: builder regenerates it on every Edit open → unique constraint 409
        // - created_by / created_by_name: immutable after creation → FK violation if builder passes wrong value
        delete payload.quote_number;
        delete payload.created_by;
        delete payload.created_by_name;
        const { error } = await supabase
          .from('quotations')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', d.id);

        if (error) throw error;
        toast.success("Quotation saved successfully");
        const _actor = { id: currentUser?.id ?? "", name: currentUser?.name ?? "", department: currentUser?.department ?? "" };
        logActivity("quotation", d.id, d.quote_number ?? d.id, "updated", _actor);

        // Pricing → BD handoff: fire ticket when builder saves with status "Priced"
        if (d.status === "Priced" && currentUser?.id) {
          await createWorkflowTicket({
            subject: `Ready to Send: ${d.quote_number || d.quotation_name}`,
            body: `Pricing for "${d.quotation_name}" (${d.quote_number}) is complete. Please review and send the quotation to ${d.customer_name}.`,
            type: "fyi",
            priority: "normal",
            recipientDept: "Business Development",
            linkedRecordType: "quotation",
            linkedRecordId: d.id,
            createdBy: currentUser.id,
            createdByName: currentUser.name,
            createdByDept: currentUser.department,
            autoCreated: true,
          });
        }

        fetchQuotations();
        // Re-fetch the saved record so the detail view shows fresh data immediately
        const { data: refreshed } = await supabase
          .from('quotations')
          .select('*')
          .eq('id', d.id)
          .maybeSingle();
        if (refreshed) {
          const merged = { ...(refreshed.details ?? {}), ...(refreshed.pricing ?? {}), ...refreshed } as QuotationNew;
          setSelectedQuotation(merged);
        }
        setSubView("detail");
      } else {
        const newId = `QUO-${Date.now()}`;
        const { error } = await supabase.from('quotations').insert({
          ...payload,
          id: newId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        if (error) throw error;
        console.log('Quotation created successfully:', newId);
        const _actorC = { id: currentUser?.id ?? "", name: currentUser?.name ?? "", department: currentUser?.department ?? "" };
        logCreation("quotation", newId, payload.quote_number ?? newId, _actorC);
        toast.success('Quotation saved.');
        await fetchQuotations();
        setSubView("list");
      }
    } catch (error) {
      console.error('Error saving quotation:', error);
      const msg = (error as any)?.message ?? JSON.stringify(error);
      toast.error('Error saving quotation: ' + msg);
    }
  };

  const handleUpdateQuotation = async (updatedQuotation: QuotationNew) => {
    setSelectedQuotation(updatedQuotation);

    // _localUpdate: the caller already wrote directly to the DB (e.g. confirmAssign).
    // Just sync the list cache — no second write.
    if ((updatedQuotation as any)._localUpdate) {
      fetchQuotations();
      return;
    }

    // Status/field-only updates from QuotationFileView — safe columns only
    const u = updatedQuotation as any;
    const safeUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const SAFE_COLS = [
      'status', 'quotation_name', 'quotation_number', 'quote_number',
      'customer_id', 'customer_name', 'contact_id', 'contact_name',
      'contact_person_id', 'services', 'services_metadata',
      'quotation_type', 'quotation_date', 'expiry_date', 'validity_date',
      'contract_start_date', 'contract_end_date',
      'created_by', 'created_by_name', 'inquiry_id', 'project_id', 'pricing',
      'assigned_to', 'details',
    ];
    for (const col of SAFE_COLS) {
      if (u[col] !== undefined) safeUpdate[col] = u[col];
    }

    try {
      const { error } = await supabase
        .from('quotations')
        .update(safeUpdate)
        .eq('id', updatedQuotation.id);

      if (!error) {
        console.log("Quotation updated successfully");
        const _actorU = { id: currentUser?.id ?? "", name: currentUser?.name ?? "", department: currentUser?.department ?? "" };
        logActivity("quotation", updatedQuotation.id, updatedQuotation.quotation_number ?? updatedQuotation.id, "updated", _actorU);
        await fetchQuotations();
      } else {
        console.error('Error updating quotation:', error.message);
      }
    } catch (error) {
      console.error('Error updating quotation:', error);
    }
  };

  const handleDeleteQuotation = async () => {
    if (!selectedQuotation) return;
    
    try {
      const { error } = await supabase
        .from('quotations')
        .delete()
        .eq('id', selectedQuotation.id);
      
      if (!error) {
        console.log("Quotation deleted successfully");
        await fetchQuotations();
        setSubView("list");
        setSelectedQuotation(null);
      } else {
        console.error('Error deleting quotation:', error.message);
      }
    } catch (error) {
      console.error('Error deleting quotation:', error);
    }
  };

  const handleDuplicateQuotation = (quotation: QuotationNew) => {
    // 📋 CLONE & EDIT STRATEGY
    // 1. Create a shallow copy of the quotation
    // 2. Sanitize ID and Number to force "New Record" behavior
    // 3. Reset dates and status
    // 4. Open Builder in "Create" mode with this data pre-filled
    
    const duplicatedData: Partial<QuotationNew> = {
      ...quotation,
      id: undefined, // Force new ID generation
      quote_number: undefined, // Force new Number generation
      quotation_name: `${quotation.quotation_name} (Copy)`,
      status: "Draft", // Reset status
      created_date: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      project_id: undefined, // Unlink from any project
      project_number: undefined,
      // Preserve: customer_id, services, pricing, etc.
    };

    console.log("🔄 Duplicating quotation for new record:", duplicatedData);
    
    setSelectedQuotation(duplicatedData as QuotationNew);
    setSubView("create");
  };

  const handleCreateInquiry = (customer: Customer) => {
    // Pre-fill customer info and open quotation builder
    const inquiryTemplate: Partial<QuotationNew> = {
      customer_id: customer.id,
      customer_name: customer.name,
      customer_company: customer.name,
      status: "Pending Pricing",
    };
    setSelectedQuotation(inquiryTemplate as QuotationNew);
    setSubView("create");
  };

  const handleViewVendor = (vendorId: string) => {
    // Search in dynamic partners list
    const vendor = partners.find(v => v.id === vendorId);
    if (vendor) {
      setSelectedVendor(vendor);
      setSubView("detail");
    }
  };

  const handleBackFromVendor = () => {
    setSelectedVendor(null);
    setSubView("list");
  };

  return (
    <div className="h-full flex flex-col" style={{ background: "var(--neuron-bg-page)" }}>
      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        {view === "contacts" && (
          <>
            {subView === "list" && (
              <ContactsListWithFilters 
                userDepartment="Pricing"
                onViewContact={handleViewContact} 
              />
            )}
            {subView === "detail" && selectedContact && (
              <PricingContactDetail contact={selectedContact} onBack={handleBackFromContact} />
            )}
          </>
        )}

        {view === "customers" && (
          <>
            {subView === "list" && (
              <CustomersListWithFilters 
                userDepartment="Pricing"
                onViewCustomer={handleViewCustomer} 
              />
            )}
            {subView === "detail" && selectedCustomer && (
              <PricingCustomerDetail 
                customer={selectedCustomer} 
                onBack={handleBackFromCustomer}
                onCreateInquiry={handleCreateInquiry}
                onViewInquiry={onViewInquiry}
              />
            )}
            {subView === "create" && selectedCustomer && (
              <QuotationBuilderV3 
                onClose={() => {
                  setSubView("detail");
                  setSelectedQuotation(null);
                }}
                onSave={async (data) => {
                  try {
                    const contractDateFields = {
                      contract_start_date: (data as any).contract_validity_start || (data as any).contract_start_date,
                      contract_end_date: (data as any).contract_validity_end || (data as any).contract_end_date,
                    };
                    const isUpdate = !!data.id && !data.id.startsWith('quot-');

                    const _actorInline = { id: currentUser?.id ?? "", name: currentUser?.name ?? "", department: currentUser?.department ?? "" };
                    if (isUpdate) {
                      const { error } = await supabase
                        .from('quotations')
                        .update({ ...data, ...contractDateFields, updated_at: new Date().toISOString() })
                        .eq('id', data.id);
                      if (error) throw error;
                      logActivity("contract", data.id, (data as any).quote_number ?? data.id, "updated", _actorInline);
                    } else {
                      const newId = `QUO-${Date.now()}`;
                      const { error } = await supabase
                        .from('quotations')
                        .insert({ ...data, ...contractDateFields, id: newId, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
                      if (error) throw error;
                    }

                    console.log('Inquiry saved successfully');
                    setSubView("detail");
                    setSelectedQuotation(null);
                  } catch (error) {
                    console.error('Error saving inquiry:', error);
                    toast.error('Error saving inquiry: ' + (error as any)?.message ?? String(error));
                  }
                }}
                initialData={selectedQuotation || undefined}
                builderMode="quotation"
                customerData={selectedCustomer}
              />
            )}
          </>
        )}

        {view === "quotations" && (
          <>
            {subView === "list" && (
              <QuotationsListWithFilters
                onViewItem={handleViewQuotation}
                onCreateQuotation={handleCreateQuotation}
                quotations={quotations}
                isLoading={isLoading}
                userDepartment="Pricing"
                onRefresh={fetchQuotations}
                currentUserId={currentUser?.id}
                userRole={effectiveRole}
              />
            )}
            {subView === "detail" && selectedQuotation && (
                <QuotationDetail 
                  quotation={selectedQuotation} 
                  onBack={handleBackFromQuotation}
                  userDepartment={userDepartment}
                  onUpdate={handleUpdateQuotation}
                  onSaveQuotation={handleSaveQuotation}
                  onEdit={handleEditQuotation}
                  onDuplicate={handleDuplicateQuotation}
                  onCreateTicket={onCreateTicket}
                  onConvertToProject={(projectId) => {
                    // PD users cannot convert to project directly
                    console.log("Project conversion not available for PD users");
                  }}
                  onConvertToContract={() => {
                    // Contract activated — return to list
                    handleBackFromQuotation();
                  }}
                  currentUser={currentUser ? { id: currentUser.id || "current-user", ...currentUser } : null}
                  onDelete={handleDeleteQuotation}
                />
            )}
            {subView === "create" && (
              <QuotationBuilderV3
                onClose={handleBackFromCreate}
                onSave={handleSaveQuotation}
                initialData={selectedQuotation || undefined}
                mode={selectedQuotation ? "edit" : "create"}
                builderMode="quotation"
                initialQuotationType={selectedQuotation?.quotation_type || pendingQuotationType}
              />
            )}
          </>
        )}

        {view === "vendors" && (
          <>
            {subView === "list" && (
              <NetworkPartnersModule 
                onViewVendor={handleViewVendor} 
                partners={partners}
                isLoading={isPartnersLoading}
                onSavePartner={savePartner}
              />
            )}
            {subView === "detail" && selectedVendor && (
              <VendorDetail 
                vendor={selectedVendor} 
                onBack={handleBackFromVendor} 
                onSave={savePartner}
              />
            )}
          </>
        )}

      </div>
    </div>
  );
}
