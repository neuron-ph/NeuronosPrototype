import { supabase } from '../utils/supabase/client';
import { useState, useEffect } from "react";
import { ContactsListWithFilters } from "./crm/ContactsListWithFilters";
import { CustomersListWithFilters } from "./crm/CustomersListWithFilters";
import { CustomerDetail } from "./bd/CustomerDetail";
import { ContactDetail } from "./bd/ContactDetail";
import { TasksList } from "./bd/TasksList";
import { TaskDetailInline } from "./bd/TaskDetailInline";
import { ActivitiesList } from "./bd/ActivitiesList";
import { ActivityDetailInline } from "./bd/ActivityDetailInline";
import { BudgetRequestList } from "./bd/BudgetRequestList";
import { BDReports } from "./bd/BDReports";
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
      return data || [];
    },
    staleTime: 30_000,
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
    staleTime: 30_000,
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

      // Fetch contact info if contact_id exists
      if (selectedActivity.contact_id) {
        try {
          const { data: backendContact } = await supabase
            .from('contacts')
            .select('*')
            .eq('id', selectedActivity.contact_id)
            .maybeSingle();
          
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
        } catch (error) {
          console.error('Error fetching activity contact:', error);
        }
      }

      // Fetch customer info if customer_id exists
      if (selectedActivity.customer_id) {
        try {
          const { data: customerData } = await supabase
            .from('customers')
            .select('*')
            .eq('id', selectedActivity.customer_id)
            .maybeSingle();
          
          if (customerData) {
            setActivityCustomerInfo(customerData);
          }
        } catch (error) {
          console.error('Error fetching activity customer:', error);
        }
      }

      // Set user name from activity user_id
      if (selectedActivity.user_id) {
        setActivityUserName(selectedActivity.user_id);
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

      // Fetch contact if contact_id exists
      if (selectedTask.contact_id) {
        try {
          const { data: contactData } = await supabase
            .from('contacts')
            .select('*')
            .eq('id', selectedTask.contact_id)
            .maybeSingle();
          
          if (contactData) {
            setTaskContacts([contactData]);
          }
        } catch (error) {
          console.error('Error fetching task contact:', error);
        }
      }

      // Fetch customer if customer_id exists
      if (selectedTask.customer_id) {
        try {
          const { data: customerData } = await supabase
            .from('customers')
            .select('*')
            .eq('id', selectedTask.customer_id)
            .maybeSingle();
          
          if (customerData) {
            setTaskCustomers([customerData]);
          }
        } catch (error) {
          console.error('Error fetching task customer:', error);
        }
      }
    };

    fetchTaskRelatedData();
  }, [selectedTask]);

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

  const handleSaveInquiry = async (data: QuotationNew) => {
    console.log("Saving inquiry:", data);
    
    try {
      const isUpdate = !!data.id && data.id.startsWith('QUO-');
      
      if (isUpdate) {
        const { error } = await supabase
          .from('quotations')
          .update({ ...data, updated_at: new Date().toISOString() })
          .eq('id', data.id);
        
        if (error) throw error;
        console.log('Inquiry updated successfully');
        await fetchQuotations();
        setSubView("list");
      } else {
        const newId = `QUO-${Date.now()}`;
        const newData = {
          ...data,
          id: newId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        
        const { error } = await supabase.from('quotations').insert(newData);
        
        if (error) throw error;
        console.log('Inquiry created successfully:', newId);
        await fetchQuotations();
        setSubView("list");
      }
    } catch (error) {
      console.error('Error saving inquiry:', error);
      alert('Error saving inquiry: ' + error);
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

        {view === "reports" && (
          <BDReports />
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