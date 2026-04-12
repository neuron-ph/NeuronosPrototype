import { supabase } from '../utils/supabase/client';
import { logActivity, logCreation } from '../utils/activityLog';
import { createWorkflowTicket, getOpenWorkflowTicket } from '../utils/workflowTickets';
import { trackRecent } from '../lib/recents';
import { useState, useEffect, useRef } from "react";
import { ContactsListWithFilters } from "./crm/ContactsListWithFilters";
import { CustomersListWithFilters } from "./crm/CustomersListWithFilters";
import { CustomerDetail } from "./bd/CustomerDetail";
import { ContactDetail } from "./bd/ContactDetail";
import { TasksList } from "./bd/TasksList";
import { TaskDetailInline } from "./bd/TaskDetailInline";
import { ActivitiesList } from "./bd/ActivitiesList";
import { ActivityDetailInline } from "./bd/ActivityDetailInline";
import { BudgetRequestList } from "./bd/BudgetRequestList";
import { QuotationsListWithFilters } from "./pricing/QuotationsListWithFilters";
import { QuotationBuilder } from "./bd/QuotationBuilder";
import { QuotationDetail } from "./pricing/QuotationDetail";
import { ProjectsModule } from "./projects/ProjectsModule";
import type { Contact } from "../types/bd";
import type { Customer } from "../types/bd";
import type { Task } from "../types/bd";
import type { Activity } from "../types/bd";
import type { QuotationNew, Project, QuotationType } from "../types/pricing";
import { toast } from "./ui/toast-utils";
import { useUser } from "../hooks/useUser";
import { useUsers } from "../hooks/useUsers";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../lib/queryKeys";

type BDView = "contacts" | "customers" | "inquiries" | "projects" | "tasks" | "activities" | "budget-requests" | "reports";
type SubView = "list" | "detail" | "builder";

interface BusinessDevelopmentProps {
  view?: BDView;
  onCreateInquiry?: (customer: Customer) => void;
  onViewInquiry?: (inquiryId: string) => void;
  customerData?: Customer | null;
  inquiryId?: string | null;
  contactId?: string;
  currentUser?: { name: string; email: string; department: string } | null;
  onCreateTicket?: (quotation: QuotationNew) => void;
}

// API_URL removed — using supabase.from() (Phase 3)

export function BusinessDevelopment({ view: initialView = "contacts", onCreateInquiry, onViewInquiry, customerData, inquiryId, contactId, currentUser, onCreateTicket }: BusinessDevelopmentProps) {
  const [view, setView] = useState<BDView>(initialView);
  const [subView, setSubView] = useState<SubView>("list");
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [selectedQuotation, setSelectedQuotation] = useState<QuotationNew | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [customerDetailKey, setCustomerDetailKey] = useState(0);
  const [pendingQuotationType, setPendingQuotationType] = useState<QuotationType>("project");
  
  // State for fetched related data
  const [activityContactInfo, setActivityContactInfo] = useState<Contact | null>(null);
  const [activityCustomerInfo, setActivityCustomerInfo] = useState<Customer | null>(null);
  const [activityUserName, setActivityUserName] = useState<string>("—");
  const [taskContacts, setTaskContacts] = useState<any[]>([]);
  const [taskCustomers, setTaskCustomers] = useState<any[]>([]);

  const { user } = useUser();
  const { users } = useUsers();
  const isSavingRef = useRef(false);

  // Map department name to userDepartment format
  const userDepartment: "Business Development" | "Pricing" = "Business Development"; // Always BD since this is the Business Development module

  // ── Data fetching ─────────────────────────────────────────
  const queryClient = useQueryClient();

  const { data: quotations = [], isLoading: quotationsLoading } = useQuery<QuotationNew[]>({
    queryKey: queryKeys.quotations.list(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quotations')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      // Spread details + pricing JSONB so fields like credit_terms, validity_period, services_metadata
      // are accessible as top-level props (same pattern as Pricing.tsx fetch).
      return (data || []).map((row: any) => ({
        ...(row?.details ?? {}),
        ...(row?.pricing ?? {}),
        ...row,
        // DB column is `quotation_number`; QuotationNew type uses `quote_number`
        quote_number: row.quotation_number,
        contact_person_name: row.contact_person_name || row.contact_name || null,
      }));
    },
    // Inherits 5-minute staleTime from global QueryClient config
  });

  const { data: projects = [], isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: queryKeys.projects.list(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return data || [];
    },
    // Inherits 5-minute staleTime from global QueryClient config
  });

  const isLoading = quotationsLoading || projectsLoading;

  const fetchQuotations = () => queryClient.invalidateQueries({ queryKey: queryKeys.quotations.list() });
  const fetchProjects = () => queryClient.invalidateQueries({ queryKey: queryKeys.projects.list() });

  // Reset to list view when switching between main views
  useEffect(() => {
    setSubView("list");
    setSelectedContact(null);
    setSelectedCustomer(null);
    setSelectedTask(null);
    setSelectedActivity(null);
    setSelectedQuotation(null);
    setSelectedProject(null);
  }, [view]);

  // Handle inquiryId prop - when set, show the detail view for that inquiry
  useEffect(() => {
    if (inquiryId && (view === "inquiries")) {
      const inquiry = quotations.find(q => q.id === inquiryId);
      if (inquiry) {
        setSelectedQuotation(inquiry);
        setSubView("detail");
      }
    }
  }, [inquiryId, view, quotations]);

  // Handle customerData prop - when set, open builder to create inquiry
  useEffect(() => {
    if (customerData && view === "inquiries") {
      setSubView("builder");
    }
  }, [customerData, view]);

  // Handle contactId prop - when set, fetch and show the contact detail view
  useEffect(() => {
    const fetchContactById = async () => {
      if (contactId && view === "contacts") {
        try {
          const { data: backendContact, error } = await supabase
            .from('contacts')
            .select('*')
            .eq('id', contactId)
            .maybeSingle();
          
          if (!error && backendContact) {
            const bdContact: Contact = {
              id: backendContact.id,
              name: `${backendContact.first_name || ''} ${backendContact.last_name || ''}`.trim(),
              first_name: backendContact.first_name || '',
              last_name: backendContact.last_name || '',
              email: backendContact.email,
              phone: backendContact.phone || '',
              mobile_number: backendContact.phone || '',
              company_id: backendContact.customer_id || backendContact.id,
              lifecycle_stage: backendContact.status === "Customer" ? "Customer" : 
                               backendContact.status === "MQL" ? "MQL" : 
                               backendContact.status === "Prospect" ? "SQL" : "Lead",
              lead_status: "Connected",
              job_title: backendContact.title || '',
              title: backendContact.title || null,
              customer_id: backendContact.customer_id || null,
              owner_id: '',
              notes: backendContact.notes || null,
              created_by: null,
              created_at: backendContact.created_date || backendContact.created_at,
              updated_at: backendContact.updated_at
            };
            setSelectedContact(bdContact);
            setSubView("detail");
          } else {
            toast.error("Contact not found");
          }
        } catch (error) {
          console.error('Error fetching contact:', error);
          toast.error("Error loading contact");
        }
      }
    };
    
    fetchContactById();
  }, [contactId, view]);

  // Fetch related data when an activity is selected
  useEffect(() => {
    const fetchActivityRelatedData = async () => {
      if (!selectedActivity) {
        setActivityContactInfo(null);
        setActivityCustomerInfo(null);
        setActivityUserName("—");
        return;
      }

      if (selectedActivity.user_id) {
        const resolved = users.find(u => u.id === selectedActivity.user_id)?.name;
        setActivityUserName(resolved || selectedActivity.user_id);
      }

      const contactQuery = selectedActivity.contact_id
        ? supabase.from('contacts').select('*').eq('id', selectedActivity.contact_id).maybeSingle()
        : Promise.resolve({ data: null });

      const customerQuery = selectedActivity.customer_id
        ? supabase.from('customers').select('*').eq('id', selectedActivity.customer_id).maybeSingle()
        : Promise.resolve({ data: null });

      try {
        const [{ data: backendContact }, { data: customerData }] = await Promise.all([
          contactQuery,
          customerQuery,
        ]);

        if (backendContact) {
          const bdContact: Contact = {
            id: backendContact.id,
            name: `${backendContact.first_name || ''} ${backendContact.last_name || ''}`.trim(),
            first_name: backendContact.first_name || '',
            last_name: backendContact.last_name || '',
            email: backendContact.email,
            phone: backendContact.phone || '',
            mobile_number: backendContact.phone || '',
            company_id: backendContact.customer_id || backendContact.id,
            lifecycle_stage: backendContact.status === "Customer" ? "Customer" :
                             backendContact.status === "MQL" ? "MQL" :
                             backendContact.status === "Prospect" ? "SQL" : "Lead",
            lead_status: "Connected",
            job_title: backendContact.title || '',
            title: backendContact.title || null,
            customer_id: backendContact.customer_id || null,
            owner_id: '',
            notes: backendContact.notes || null,
            created_by: null,
            created_at: backendContact.created_date || backendContact.created_at,
            updated_at: backendContact.updated_at
          };
          setActivityContactInfo(bdContact);
        }

        if (customerData) {
          setActivityCustomerInfo(customerData);
        }
      } catch (error) {
        console.error('Error fetching activity related data:', error);
      }
    };

    fetchActivityRelatedData();
  }, [selectedActivity]);

  // Fetch related data when a task is selected
  useEffect(() => {
    const fetchTaskRelatedData = async () => {
      if (!selectedTask) {
        setTaskContacts([]);
        setTaskCustomers([]);
        return;
      }

      const contactQuery = selectedTask.contact_id
        ? supabase.from('contacts').select('*').eq('id', selectedTask.contact_id).maybeSingle()
        : Promise.resolve({ data: null });

      const customerQuery = selectedTask.customer_id
        ? supabase.from('customers').select('*').eq('id', selectedTask.customer_id).maybeSingle()
        : Promise.resolve({ data: null });

      try {
        const [{ data: contactData }, { data: customerData }] = await Promise.all([
          contactQuery,
          customerQuery,
        ]);
        if (contactData) setTaskContacts([contactData]);
        if (customerData) setTaskCustomers([customerData]);
      } catch (error) {
        console.error('Error fetching task related data:', error);
      }
    };

    fetchTaskRelatedData();
  }, [selectedTask]);

  const handleViewContact = (contact: Contact) => {
    setSelectedContact(contact);
    setSubView("detail");
    if (user?.id) trackRecent({
      label: contact.name || [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Contact",
      sub: `BD · Contact`,
      path: `/bd/contacts/${contact.id}`,
      type: "contact",
      time: new Date().toISOString(),
    }, user.id);
  };

  const handleBackFromContact = () => {
    setSelectedContact(null);
    setSubView("list");
  };

  const handleViewCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setSubView("detail");
    if (user?.id) trackRecent({
      label: customer.name || customer.company_name || "Customer",
      sub: `BD · Customer`,
      path: `/bd/customers`,
      type: "customer",
      time: new Date().toISOString(),
    }, user.id);
  };

  const handleBackFromCustomer = () => {
    setSelectedCustomer(null);
    setSubView("list");
  };

  const handleViewTask = (task: Task) => {
    setSelectedTask(task);
    setSubView("detail");
  };

  const handleBackFromTask = () => {
    setSelectedTask(null);
    setSubView("list");
  };

  const handleViewActivity = (activity: Activity) => {
    setSelectedActivity(activity);
    setSubView("detail");
  };

  const handleBackFromActivity = () => {
    setSelectedActivity(null);
    setSubView("list");
  };

  const handleViewInquiry = (quotation: QuotationNew) => {
    setSelectedQuotation(quotation);
    setSubView("detail");
    if (user?.id) trackRecent({
      label: quotation.quote_number || "Inquiry",
      sub: `BD · ${quotation.customer_name || ""}`,
      path: `/bd/inquiries/${quotation.id}`,
      type: "inquiry",
      time: new Date().toISOString(),
    }, user.id);
  };

  const handleViewProject = (project: Project) => {
    setSelectedProject(project);
    setView("projects");
  };

  const handleBackFromInquiry = () => {
    setSelectedQuotation(null);
    setSubView("list");
  };

  const handleEditInquiry = () => {
    // Keep the selected quotation and switch to builder mode for editing
    setSubView("builder");
  };

  const handleCreateInquiry = (quotationType?: QuotationType) => {
    setSelectedQuotation(null);
    setPendingQuotationType(quotationType || "project");
    setSubView("builder");
  };

  const toValidityDate = (validUntil: any, createdDate?: string): string | null => {
    if (!validUntil) return null;
    const days = Number(validUntil);
    if (!isNaN(days) && days > 0) {
      const base = createdDate ? new Date(createdDate) : new Date();
      base.setDate(base.getDate() + days);
      return base.toISOString();
    }
    const parsed = new Date(validUntil);
    return isNaN(parsed.getTime()) ? null : parsed.toISOString();
  };

  const handleSaveInquiry = async (data: QuotationNew) => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;

    try {
      // Map QuotationNew fields → quotations table columns.
      // Fields not in the schema are packed into the pricing JSONB column.
      const dbPayload = {
        quotation_number: data.quote_number,
        quotation_type: data.quotation_type || 'spot',
        customer_id: data.customer_id || null,
        customer_name: data.customer_name || null,
        quotation_name: data.quotation_name || null,
        contact_id: data.contact_person_id || data.contact_id || null,
        contact_person_id: data.contact_person_id || data.contact_id || null,
        contact_name: data.contact_person_name || null,
        services: data.services || [],
        services_metadata: data.services_metadata || [],
        pricing: {
          movement: data.movement,
          category: data.category,
          shipment_freight: data.shipment_freight,
          incoterm: data.incoterm,
          carrier: data.carrier,
          transit_days: data.transit_days,
          commodity: data.commodity,
          pol_aol: data.pol_aol,
          pod_aod: data.pod_aod,
          charge_categories: data.charge_categories || [],
          financial_summary: data.financial_summary || {},
          buying_price: data.buying_price || [],
          selling_price: data.selling_price || [],
          credit_terms: data.credit_terms,
          validity_period: data.validity_period,
          source_contract_id: data.source_contract_id || null,
          source_contract_number: data.source_contract_number || null,
          // Contract rate tables
          rate_matrices: data.rate_matrices || [],
          scope_of_services: data.scope_of_services || [],
          terms_and_conditions: data.terms_and_conditions || [],
          contract_general_details: data.contract_general_details || null,
        },
        status: data.status || 'Draft',
        validity_date: toValidityDate(data.valid_until, data.created_date),
        created_by: user?.id || null,
        created_by_name: user?.name || null,
        currency: data.currency || 'PHP',
        // Contract-specific top-level columns
        ...(data.quotation_type === 'contract' && {
          contract_start_date: data.contract_validity_start || null,
          contract_end_date: data.contract_validity_end || null,
          contract_status: data.contract_status || 'Draft',
        }),
      };

      // An existing record has an id that wasn't just generated by the builder.
      // Builder temp ids start with "quot-"; anything else is a saved record.
      const isUpdate = !!data.id && !data.id.startsWith('quot-');

      const _actorBD = { id: user?.id ?? "", name: user?.name ?? "", department: user?.department ?? "" };
      if (isUpdate) {
        const { error } = await supabase
          .from('quotations')
          .update({ ...dbPayload, updated_at: new Date().toISOString() })
          .eq('id', data.id);
        if (error) throw error;
        logActivity("quotation", data.id, (data as any).quotation_number ?? data.id, "updated", _actorBD);
        toast.success('Inquiry saved.');
        queryClient.invalidateQueries({ queryKey: queryKeys.quotations.list() });
        setSubView("list");
      } else {
        const newId = `QUO-${Date.now()}`;
        const { error } = await supabase.from('quotations').insert({
          ...dbPayload,
          id: newId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        if (error) throw error;
        logCreation("quotation", newId, dbPayload.quotation_number ?? newId, _actorBD);

        // Ticket 1: notify Pricing dept when inquiry is ready for pricing
        if (dbPayload.status === 'Pending Pricing') {
          const hasTicket = await getOpenWorkflowTicket("quotation", newId);
          if (!hasTicket) {
            createWorkflowTicket({
              subject: `New Inquiry: ${dbPayload.customer_name || 'Unknown'} – ${(dbPayload.services as string[] || []).join(', ') || 'N/A'}`,
              body: `${user?.name} has submitted a new inquiry for pricing.\n\nCustomer: ${dbPayload.customer_name || 'Unknown'}\nServices: ${(dbPayload.services as string[] || []).join(', ') || 'N/A'}`,
              type: "request",
              priority: "normal",
              recipientDept: "Pricing",
              linkedRecordType: "quotation",
              linkedRecordId: newId,
              createdBy: user?.id ?? "",
              createdByName: user?.name ?? "",
              createdByDept: user?.department ?? "",
              autoCreated: true,
            }).catch(console.error);
          }
        }

        toast.success('Inquiry created.');
        queryClient.invalidateQueries({ queryKey: queryKeys.quotations.list() });
        setSubView("list");
      }
    } catch (error: any) {
      console.error('Error saving inquiry:', error);
      toast.error('Error saving inquiry: ' + (error?.message ?? JSON.stringify(error)));
    } finally {
      isSavingRef.current = false;
    }
  };

  const handleUpdateQuotation = async (updatedQuotation: QuotationNew) => {
    setSelectedQuotation(updatedQuotation);

    try {
      const dbPayload = {
        quotation_number: updatedQuotation.quote_number,
        quotation_type: updatedQuotation.quotation_type || 'spot',
        customer_id: updatedQuotation.customer_id || null,
        customer_name: updatedQuotation.customer_name || null,
        quotation_name: updatedQuotation.quotation_name || null,
        contact_id: updatedQuotation.contact_person_id || updatedQuotation.contact_id || null,
        contact_person_id: updatedQuotation.contact_person_id || updatedQuotation.contact_id || null,
        contact_name: updatedQuotation.contact_person_name || null,
        services: updatedQuotation.services || [],
        services_metadata: updatedQuotation.services_metadata || [],
        pricing: {
          movement: updatedQuotation.movement,
          category: updatedQuotation.category,
          shipment_freight: updatedQuotation.shipment_freight,
          incoterm: updatedQuotation.incoterm,
          carrier: updatedQuotation.carrier,
          transit_days: updatedQuotation.transit_days,
          commodity: updatedQuotation.commodity,
          pol_aol: updatedQuotation.pol_aol,
          pod_aod: updatedQuotation.pod_aod,
          charge_categories: updatedQuotation.charge_categories || [],
          financial_summary: updatedQuotation.financial_summary || {},
          buying_price: updatedQuotation.buying_price || [],
          selling_price: updatedQuotation.selling_price || [],
          credit_terms: updatedQuotation.credit_terms,
          validity_period: updatedQuotation.validity_period,
          source_contract_id: updatedQuotation.source_contract_id || null,
          source_contract_number: updatedQuotation.source_contract_number || null,
          rate_matrices: updatedQuotation.rate_matrices || [],
          scope_of_services: updatedQuotation.scope_of_services || [],
          terms_and_conditions: updatedQuotation.terms_and_conditions || [],
          contract_general_details: updatedQuotation.contract_general_details || null,
        },
        status: updatedQuotation.status || 'Draft',
        validity_date: toValidityDate(updatedQuotation.valid_until, updatedQuotation.created_date),
        currency: updatedQuotation.currency || 'PHP',
        updated_at: new Date().toISOString(),
        ...(updatedQuotation.quotation_type === 'contract' && {
          contract_start_date: updatedQuotation.contract_validity_start || null,
          contract_end_date: updatedQuotation.contract_validity_end || null,
          contract_status: updatedQuotation.contract_status || 'Draft',
        }),
      };

      const { error } = await supabase
        .from('quotations')
        .update(dbPayload)
        .eq('id', updatedQuotation.id);

      if (!error) {
        const _actorUpd = { id: user?.id ?? "", name: user?.name ?? "", department: user?.department ?? "" };
        logActivity("quotation", updatedQuotation.id, updatedQuotation.quotation_number ?? updatedQuotation.id, "updated", _actorUpd);
        await fetchQuotations();
      } else {
        console.error('Error updating quotation:', error.message);
        toast.error('Error updating quotation: ' + error.message);
      }
    } catch (error: any) {
      console.error('Error updating quotation:', error);
      toast.error('Error updating quotation: ' + (error?.message ?? JSON.stringify(error)));
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
        toast.success("Quotation deleted successfully");
        await fetchQuotations();
        setSubView("list");
        setSelectedQuotation(null);
      } else {
        console.error('Error deleting quotation:', error.message);
        toast.error("Error deleting quotation");
      }
    } catch (error) {
      console.error('Error deleting quotation:', error);
      toast.error("Unable to delete quotation");
    }
  };

  const handleDuplicateInquiry = (quotation: QuotationNew) => {
    // 📋 CLONE & EDIT STRATEGY FOR BD
    // Similar to Pricing but preserves inquiry-specific context
    
    const duplicatedData: Partial<QuotationNew> = {
      ...quotation,
      id: undefined, // Force new ID generation
      quote_number: undefined, // Force new Number generation
      quotation_name: `${quotation.quotation_name} (Copy)`,
      status: "Draft", // Reset status to Draft
      created_date: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      project_id: undefined, // Unlink from any project
      project_number: undefined,
      // Preserve: customer_id, services, etc.
    };

    console.log("🔄 Duplicating inquiry for new record:", duplicatedData);
    
    // Set selected quotation (will be used as initialData in builder)
    setSelectedQuotation(duplicatedData as QuotationNew);
    
    // Switch to builder view
    setSubView("builder");
  };

  return (
    <div className="h-full flex flex-col" style={{ background: "var(--neuron-bg-page)" }}>
      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        {view === "contacts" && (
          <>
            {subView === "list" && (
              <ContactsListWithFilters 
                userDepartment={userDepartment}
                onViewContact={handleViewContact} 
              />
            )}
            {subView === "detail" && selectedContact && (
              <ContactDetail 
                contact={selectedContact} 
                onBack={handleBackFromContact}
                onCreateInquiry={async (customer, contact) => {
                  let customerToUse = customer;
                  
                  if (!customerToUse && contact?.customer_id) {
                    try {
                      const { data: custData } = await supabase
                        .from('customers')
                        .select('*')
                        .eq('id', contact.customer_id!)
                        .maybeSingle();
                      
                      if (custData) {
                        customerToUse = custData;
                      }
                    } catch (error) {
                      console.error('Error fetching customer:', error);
                    }
                  }
                  
                  setSelectedCustomer(customerToUse || null);
                  setSelectedContact(contact ?? null);
                  setView("inquiries");
                  setSubView("builder");
                }}
              />
            )}
          </>
        )}

        {view === "customers" && (
          <>
            {subView === "list" && (
              <CustomersListWithFilters 
                userDepartment="Business Development"
                onViewCustomer={handleViewCustomer} 
              />
            )}
            {subView === "detail" && selectedCustomer && (
              <CustomerDetail 
                key={customerDetailKey}
                customer={selectedCustomer} 
                onBack={handleBackFromCustomer}
                onCreateInquiry={() => {
                  // Handle inquiry creation within customer detail view
                  setSubView("builder");
                }}
                onViewInquiry={onViewInquiry}
                onViewProject={handleViewProject}
              />
            )}
            {subView === "builder" && selectedCustomer && (
              <QuotationBuilder 
                customerData={selectedCustomer}
                onSave={async (data: QuotationNew) => {
                  try {
                    const newId = `QUO-${Date.now()}`;
                    const newData = {
                      ...data,
                      id: newId,
                      created_at: new Date().toISOString(),
                      updated_at: new Date().toISOString(),
                    };
                    
                    const { error } = await supabase.from('quotations').insert(newData);

                    if (!error) {
                      const _actorInq = { id: user?.id ?? "", name: user?.name ?? "", department: user?.department ?? "" };
                      logCreation("quotation", newId, data.quotation_number ?? newId, _actorInq);

                      // Ticket 1: notify Pricing dept when inquiry is ready for pricing
                      if (data.status === 'Pending Pricing') {
                        const hasTicket = await getOpenWorkflowTicket("quotation", newId);
                        if (!hasTicket) {
                          createWorkflowTicket({
                            subject: `New Inquiry: ${data.customer_name || 'Unknown'} – ${(data.services || []).join(', ') || 'N/A'}`,
                            body: `${user?.name} has submitted a new inquiry for pricing.\n\nCustomer: ${data.customer_name || 'Unknown'}\nServices: ${(data.services || []).join(', ') || 'N/A'}`,
                            type: "request",
                            priority: "normal",
                            recipientDept: "Pricing",
                            linkedRecordType: "quotation",
                            linkedRecordId: newId,
                            createdBy: user?.id ?? "",
                            createdByName: user?.name ?? "",
                            createdByDept: user?.department ?? "",
                            autoCreated: true,
                          }).catch(console.error);
                        }
                      }

                      toast.success("Inquiry created successfully!");
                      setCustomerDetailKey(prev => prev + 1);
                      setSubView("detail");
                    } else {
                      console.error('Error creating inquiry:', error.message);
                      toast.error("Failed to create inquiry");
                    }
                  } catch (error) {
                    console.error('Error saving inquiry:', error);
                    toast.error("Failed to create inquiry");
                  }
                }}
                onClose={() => {
                  // Go back to customer detail view
                  setSubView("detail");
                }}
                builderMode="inquiry"
                initialData={{
                  customer_id: selectedCustomer.id,
                  customer_name: selectedCustomer.company_name,
                  status: "Draft"
                } as Partial<QuotationNew>}
              />
            )}
          </>
        )}

        {view === "tasks" && (
          <>
            {subView === "list" && (
              <TasksList onViewTask={handleViewTask} />
            )}
            {subView === "detail" && selectedTask && (
              <div className="h-full" style={{ padding: "32px 48px", background: "var(--theme-bg-surface)" }}>
                <TaskDetailInline 
                  task={selectedTask} 
                  onBack={handleBackFromTask}
                  customers={taskCustomers}
                  contacts={taskContacts}
                />
              </div>
            )}
          </>
        )}

        {view === "activities" && (
          <>
            {!selectedActivity ? (
              <ActivitiesList onViewActivity={handleViewActivity} />
            ) : (
              <div className="h-full" style={{ padding: "32px 48px", background: "var(--theme-bg-surface)" }}>
                <ActivityDetailInline
                  activity={selectedActivity}
                  onBack={handleBackFromActivity}
                  onUpdate={() => {
                    // Refresh activities list if needed
                    handleBackFromActivity();
                  }}
                  onDelete={() => {
                    handleBackFromActivity();
                  }}
                  contactInfo={activityContactInfo}
                  customerInfo={activityCustomerInfo}
                  userName={activityUserName}
                />
              </div>
            )}
          </>
        )}

        {view === "budget-requests" && (
          <BudgetRequestList />
        )}

        {view === "inquiries" && (
          <>
            {subView === "list" && (
              <QuotationsListWithFilters 
                onViewItem={handleViewInquiry} 
                onCreateQuotation={handleCreateInquiry}
                quotations={quotations}
                isLoading={isLoading}
                userDepartment="Business Development"
                onRefresh={fetchQuotations}
              />
            )}
            {subView === "detail" && selectedQuotation && (
              <QuotationDetail 
                quotation={selectedQuotation} 
                onBack={handleBackFromInquiry}
                userDepartment="Business Development"
                onUpdate={handleUpdateQuotation}
                onSaveQuotation={handleSaveInquiry}
                onEdit={handleEditInquiry}
                onDuplicate={handleDuplicateInquiry}
                onCreateTicket={onCreateTicket}
                onConvertToProject={async (projectId) => {
                  try {
                    const { data: projectData, error: fetchErr } = await supabase
                      .from('projects')
                      .select('*')
                      .eq('id', projectId)
                      .maybeSingle();

                    if (!fetchErr && projectData) {
                      console.log(`Project ${projectData.project_number} has ${projectData.services_metadata?.length || 0} service specifications`);
                      
                      setSelectedProject(projectData);
                      setView("projects");
                      setSubView("detail");
                      
                      fetchProjects();
                    } else {
                      await fetchProjects();
                      setView("projects");
                      setSubView("list");
                    }
                  } catch (error) {
                    console.error('Error fetching created project:', error);
                    await fetchProjects();
                    setView("projects");
                    setSubView("list");
                  }
                }}
                onConvertToContract={() => {
                  // Contract activated — stay on detail view (locked state shows automatically)
                  // User can navigate to Contracts module via sidebar
                  handleBackFromInquiry();
                }}
                currentUser={currentUser as any}
                onDelete={handleDeleteQuotation}
              />
            )}
            {subView === "builder" && (
              <QuotationBuilder
                customerData={customerData || selectedCustomer}
                contactData={selectedContact}
                onSave={handleSaveInquiry}
                onClose={handleBackFromInquiry}
                builderMode="inquiry"
                mode={selectedQuotation ? "edit" : "create"}
                initialQuotationType={selectedQuotation?.quotation_type || pendingQuotationType}
                initialData={selectedQuotation || (customerData ? {
                  customer_id: customerData.id,
                  customer_name: customerData.company_name,
                  customer_company: customerData.company_name,
                  status: "Draft"
                } as Partial<QuotationNew> : undefined)}
              />
            )}
          </>
        )}

        {view === "projects" && (
          <ProjectsModule
            currentUser={currentUser ? {
              id: "user-bd-rep-001", // TODO: Get from actual user context
              name: currentUser.name,
              email: currentUser.email,
              department: currentUser.department
            } : undefined}
            onCreateTicket={onCreateTicket as any}
            initialProject={selectedProject}
          />
        )}
      </div>
    </div>
  );
}