import { supabase } from '../utils/supabase/client';
import { useState, useEffect } from "react";
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
import { PricingReports } from "./pricing/PricingReports";
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
  const [quotations, setQuotations] = useState<QuotationNew[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingQuotationType, setPendingQuotationType] = useState<QuotationType>("project");

  // Hook for Network Partners (Lifting State Up)
  const { partners, isLoading: isPartnersLoading, savePartner } = useNetworkPartners();

  // Map department name to userDepartment format
  const userDepartment: "Business Development" | "Pricing" = currentUser?.department === "Pricing" ? "Pricing" : "Business Development";

  // Fetch quotations from backend
  const fetchQuotations = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('quotations')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      // Merge details JSONB so financial fields (charge_categories, buying_price, etc.) are accessible
      // Also normalize contract date column names (DB: contract_start_date → type: contract_validity_start)
      const merged = (data || []).map((row: any) => {
        const m = { ...(row?.details ?? {}), ...row };
        if (!m.contract_validity_start && m.contract_start_date) m.contract_validity_start = m.contract_start_date;
        if (!m.contract_validity_end && m.contract_end_date) m.contract_validity_end = m.contract_end_date;
        return m;
      });
      setQuotations(merged);
      console.log(`Fetched ${merged.length} quotations for Pricing module`);
    } catch (error) {
      console.log('Error fetching quotations:', error);
      setQuotations([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch quotations when view changes to quotations
  useEffect(() => {
    if (view === "quotations" || view === "reports") {
      fetchQuotations();
    }
  }, [view]);

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
  };

  const handleBackFromContact = () => {
    setSelectedContact(null);
    setSubView("list");
  };

  const handleViewCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setSubView("detail");
  };

  const handleBackFromCustomer = () => {
    setSelectedCustomer(null);
    setSubView("list");
  };

  const handleViewQuotation = (quotation: QuotationNew) => {
    setSelectedQuotation(quotation);
    setSubView("detail");
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
    console.log("Saving quotation:", data);

    // Remap contract date fields to match DB column names
    const contractDateFields = {
      contract_start_date: (data as any).contract_validity_start || (data as any).contract_start_date,
      contract_end_date: (data as any).contract_validity_end || (data as any).contract_end_date,
    };

    try {
      // IDs from builder: existing records use original DB id (QUO.../CQ...),
      // new records use builder-generated temp id (quot-...). Treat anything
      // that isn't a temp id and is non-empty as an update.
      const isUpdate = !!data.id && !data.id.startsWith('quot-');

      if (isUpdate) {
        const { error } = await supabase
          .from('quotations')
          .update({ ...data, ...contractDateFields, updated_at: new Date().toISOString() })
          .eq('id', data.id);

        if (error) throw error;
        console.log('Quotation updated successfully');
        await fetchQuotations();
        setSubView("list");
      } else {
        const newId = `QUO-${Date.now()}`;
        const newData = {
          ...data,
          ...contractDateFields,
          id: newId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const { error } = await supabase.from('quotations').insert(newData);
        if (error) throw error;
        console.log('Quotation created successfully:', newId);
        await fetchQuotations();
        setSubView("list");
      }
    } catch (error) {
      console.error('Error saving quotation:', error);
      alert('Error saving quotation: ' + error);
    }
  };

  const handleUpdateQuotation = async (updatedQuotation: QuotationNew) => {
    setSelectedQuotation(updatedQuotation);
    
    try {
      const { error } = await supabase
        .from('quotations')
        .update({ ...updatedQuotation, updated_at: new Date().toISOString() })
        .eq('id', updatedQuotation.id);
      
      if (!error) {
        console.log("Quotation updated successfully");
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

                    if (isUpdate) {
                      const { error } = await supabase
                        .from('quotations')
                        .update({ ...data, ...contractDateFields, updated_at: new Date().toISOString() })
                        .eq('id', data.id);
                      if (error) throw error;
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
                    alert('Error saving inquiry: ' + error);
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
              />
            )}
            {subView === "detail" && selectedQuotation && (
                <QuotationDetail 
                  quotation={selectedQuotation} 
                  onBack={handleBackFromQuotation}
                  userDepartment={userDepartment}
                  onUpdate={handleUpdateQuotation}
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

        {view === "reports" && (
          <PricingReports quotations={quotations} isLoading={isLoading} />
        )}
      </div>
    </div>
  );
}
