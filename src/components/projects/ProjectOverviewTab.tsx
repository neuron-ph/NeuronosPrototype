import { useState, useEffect } from "react";
import { Printer } from "lucide-react";
import type { Project, QuotationNew } from "../../types/pricing";
import {
  BrokerageServiceDisplay,
  ForwardingServiceDisplay,
  TruckingServiceDisplay,
  MarineInsuranceServiceDisplay,
  OthersServiceDisplay
} from "../pricing/ServiceDetailsDisplay";
import { PDFStudioOverlay } from "./quotation/screen/PDFStudioOverlay";
import { QuotationFormView } from "./quotation/QuotationFormView";
import { QuotationBuilderV3 } from "../pricing/quotations/QuotationBuilderV3";

interface ProjectOverviewTabProps {
  project: Project;
  currentUser?: {
    id: string;
    name: string;
    email: string;
    department: string;
  } | null;
  onUpdate?: () => void;
  onViewBooking?: (bookingId: string, serviceType: string) => void;
  onSaveQuotation?: (data: any) => Promise<void>;
  /** NEU-019 WG-25: the Amend button enters full edit mode and saves the
   *  quotation — needs the record's edit grant. Defaults to false (fail closed). */
  canAmend?: boolean;
  /** NEU-020 2.11 (WT4/DD-3): Print PDF is export-class — gated on the Quotation
   *  tab's own :export cell. Defaults to false (fail closed). */
  canExport?: boolean;
}

export function ProjectOverviewTab({ project, currentUser, onUpdate, onViewBooking, onSaveQuotation, canAmend = false, canExport = false }: ProjectOverviewTabProps) {
  const [isPDFStudioOpen, setIsPDFStudioOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  // ✨ Optimistic UI: Local state to show updates immediately while background fetch happens
  const [displayProject, setDisplayProject] = useState<Project>(project);

  // Keep local state in sync when parent updates project (e.g. after background fetch completes)
  useEffect(() => {
    setDisplayProject(project);
  }, [project]);

  const servicesMetadata = displayProject.services_metadata || [];

  // Format date
  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return "—";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
    });
  };

  // Calculate financial totals from quotation data
  const subtotalTaxable = displayProject.charge_categories?.reduce((total, category) => {
    return total + (category.subtotal || 0);
  }, 0) || 0;

  const financialSummary = {
    subtotal_non_taxed: displayProject.quotation?.financial_summary?.subtotal_non_taxed || 0,
    subtotal_taxable: displayProject.quotation?.financial_summary?.subtotal_taxed || subtotalTaxable,
    tax_rate: displayProject.quotation?.financial_summary?.tax_rate || 0.12,
    tax_amount: displayProject.quotation?.financial_summary?.tax_amount || (subtotalTaxable * 0.12),
    other_charges: displayProject.quotation?.financial_summary?.other_charges || 0,
    grand_total: displayProject.quotation?.financial_summary?.grand_total || displayProject.total || 0
  };

  // Calculate grand total if not provided
  if (!displayProject.quotation?.financial_summary?.grand_total && !displayProject.total) {
    financialSummary.grand_total = financialSummary.subtotal_non_taxed + financialSummary.subtotal_taxable + financialSummary.tax_amount + financialSummary.other_charges;
  }

  // Handle PDF save
  const handlePDFSave = async (data: any) => {
    if (onSaveQuotation) {
      await onSaveQuotation(data);
    }
  };

  const handleSaveAmend = async (updatedQuotation: QuotationNew) => {
    // ⚡️ OPTIMISTIC UPDATE: Update UI immediately
    const optimisticProject: Project = {
      ...displayProject,
      // Update top-level project fields that mirror quotation data
      customer_name: updatedQuotation.customer_name,
      contact_person_name: updatedQuotation.contact_person_name,
      movement: updatedQuotation.movement,
      services: updatedQuotation.services,
      services_metadata: updatedQuotation.services_metadata || [],
      charge_categories: updatedQuotation.charge_categories,
      currency: updatedQuotation.currency,
      
      // Update the embedded quotation object
      quotation: {
        ...displayProject.quotation, // Keep existing fields
        ...updatedQuotation, // Overwrite with updates
        // Restore linkage fields that might have been stripped by the builder
        project_id: displayProject.id,
        project_number: displayProject.project_number
      } as QuotationNew
    };
    
    setDisplayProject(optimisticProject);
    setIsEditing(false); // Close editor immediately for "instant" feel

    if (onSaveQuotation) {
      // 🛡️ SAFE MERGE: Ensure we send a complete object linked to the project
      // The builder intentionally strips project_id to unlock editing.
      // We must restore it here so the backend knows this quotation belongs to this project.
      await onSaveQuotation({
        ...updatedQuotation,
        // Explicitly restore linkage IDs from the source of truth (the Project object)
        project_id: project.id,
        project_number: project.project_number,
        // Ensure the ID is correct (prefer existing quotation ID)
        id: project.quotation_id || project.quotation?.id || updatedQuotation.id,
        // Restore creation metadata if missing
        created_by: project.quotation?.created_by || currentUser?.id,
        created_at: project.quotation?.created_at || new Date().toISOString()
      });
    }
  };

  if (isEditing) {
    // Construct robust initialData by merging Project data with Quotation data.
    // This ensures that even if project.quotation is partial, we have the necessary fields.
    const initialData: Partial<QuotationNew> = {
      ...displayProject.quotation,
      // Fallback to Project fields if Quotation fields are missing
      id: displayProject.quotation?.id || displayProject.quotation_id, // Keep original quotation ID (fallback to FK)
      quote_number: displayProject.quotation?.quote_number || displayProject.quotation_number,
      customer_id: displayProject.quotation?.customer_id || displayProject.customer_id,
      customer_name: displayProject.quotation?.customer_name || displayProject.customer_name,
      contact_person_id: displayProject.quotation?.contact_person_id || displayProject.contact_person_id,
      contact_person_name: displayProject.quotation?.contact_person_name || displayProject.contact_person_name,
      movement: displayProject.quotation?.movement || displayProject.movement,
      services: displayProject.quotation?.services || displayProject.services,
      services_metadata: displayProject.quotation?.services_metadata || displayProject.services_metadata,
      charge_categories: displayProject.quotation?.charge_categories || displayProject.charge_categories,
      currency: displayProject.quotation?.currency || displayProject.currency,
      
      // CRITICAL: Explicitly remove project_id to preventing "Locked" mode in QuotationBuilderV3
      project_id: undefined,
      project_number: undefined,
      
      // Ensure specific service details are carried over if not in services_metadata (though they should be)
      // This is handled by services_metadata being passed.
    };

    return (
      <QuotationBuilderV3
        mode="edit"
        initialData={initialData}
        onClose={() => setIsEditing(false)}
        onSave={handleSaveAmend}
        builderMode="quotation"
        hideHeader={false}
        isAmendment={true}
      />
    );
  }

  return (
    <div style={{ 
      padding: "32px 48px",
      maxWidth: "1400px",
      margin: "0 auto"
    }}>
      
      {/* Open PDF Studio — publishing surface lives in a full-screen overlay, not a peer view */}
      {/* NEU-020 2.11 (WT4): Print PDF obeys the Quotation tab's Export cell. */}
      {canExport && (
      <div className="flex items-center justify-end mb-6">
        <button
          onClick={() => setIsPDFStudioOpen(true)}
          className="inline-flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-semibold text-white bg-[var(--theme-action-primary-bg)] hover:opacity-90 transition-all shadow-sm"
        >
          <Printer size={15} />
          Print PDF
        </button>
      </div>
      )}

      <QuotationFormView
        project={displayProject}
        onSave={onSaveQuotation}
        onAmend={canAmend ? () => setIsEditing(true) : undefined}
      />

      <PDFStudioOverlay
        isOpen={isPDFStudioOpen}
        onClose={() => setIsPDFStudioOpen(false)}
        project={displayProject}
        onSave={handlePDFSave}
        currentUser={currentUser}
      />
    </div>
  );
}