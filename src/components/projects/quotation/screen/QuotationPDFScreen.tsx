import React, { useState } from "react";
import { Save, Download, User, Layout, FileText, Settings, UserCheck, Calendar } from "lucide-react";
import type { Project, QuotationNew } from "../../../../types/pricing";
import { useQuotationDocumentState } from "./useQuotationDocumentState";
import { useCompanySettings } from "../../../../hooks/useCompanySettings";
import { QuotationPDFDocument, downloadQuotationPDF } from "../../../pricing/QuotationPDFRenderer";
import { SignatoryControl } from "./controls/SignatoryControl";
import { DisplayOptionsControl } from "./controls/DisplayOptionsControl";
import { NotesControl } from "./controls/NotesControl";
import { CollapsibleSection } from "./controls/CollapsibleSection";
import { PDFViewer } from "@react-pdf/renderer";

interface QuotationPDFScreenProps {
  project: Project;
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
  currentUser?: { name: string; email: string; } | null;
  isEmbedded?: boolean;
}

export function QuotationPDFScreen({ project, onClose, onSave, currentUser, isEmbedded = false }: QuotationPDFScreenProps) {
  const {
    options,
    updateSignatory,
    updateAddressedTo,
    setValidityOverride,
    setPaymentTerms,
    toggleDisplay,
    setCustomNotes,
  } = useQuotationDocumentState(project, currentUser);

  const { settings: companySettings } = useCompanySettings();
  const [isSaving, setIsSaving] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // Extract the quotation from the project adapter
  const quotation: QuotationNew = (project.quotation || project) as any;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({
        prepared_by: options.signatories.prepared_by.name,
        prepared_by_title: options.signatories.prepared_by.title,
        approved_by: options.signatories.approved_by.name,
        approved_by_title: options.signatories.approved_by.title,
        addressed_to_name: options.addressed_to.name,
        addressed_to_title: options.addressed_to.title,
        payment_terms: options.payment_terms,
        custom_notes: options.custom_notes,
        valid_until: options.validity_override || undefined,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      await downloadQuotationPDF(quotation, options, companySettings);
    } finally {
      setIsDownloading(false);
    }
  };

  // Input class for consistency
  const inputCls = "w-full px-3.5 py-2 text-sm border border-[var(--theme-border-default)] rounded-lg focus:border-[var(--theme-action-primary-bg)] focus:ring-1 focus:ring-[var(--theme-action-primary-bg)] outline-none transition-all placeholder:text-[var(--theme-text-muted)]";

  return (
    <div className={`flex flex-col h-full w-full bg-[var(--theme-bg-surface-subtle)] overflow-hidden ${isEmbedded ? 'rounded-lg border border-[var(--theme-border-default)]' : ''}`}>
      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden">

        {/* LEFT: PDF Viewer (live preview = actual PDF output) */}
        <div className="flex-1 bg-[var(--theme-bg-surface-subtle)] overflow-hidden relative">
          <PDFViewer
            width="100%"
            height="100%"
            showToolbar={false}
            style={{ border: "none" }}
          >
            <QuotationPDFDocument
              quotation={quotation}
              options={options}
              companySettings={companySettings}
            />
          </PDFViewer>
        </div>

        {/* RIGHT: Document Controls Sidebar */}
        <div className="w-[360px] bg-[var(--theme-bg-surface)] border-l border-[var(--theme-border-default)] flex flex-col overflow-hidden shrink-0 z-20 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.02)]">

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">

            {/* Signatories */}
            <CollapsibleSection title="Signatories" icon={<User size={18} />} defaultOpen={true}>
              <SignatoryControl
                preparedBy={options.signatories.prepared_by}
                approvedBy={options.signatories.approved_by}
                onUpdate={updateSignatory}
              />
            </CollapsibleSection>

            {/* Addressed To */}
            <CollapsibleSection title="Addressed To" icon={<UserCheck size={18} />} defaultOpen={true}>
              <div className="space-y-2">
                <input
                  type="text"
                  value={options.addressed_to.name}
                  onChange={(e) => updateAddressedTo("name", e.target.value)}
                  className={inputCls}
                  placeholder="Contact person name"
                />
                <input
                  type="text"
                  value={options.addressed_to.title}
                  onChange={(e) => updateAddressedTo("title", e.target.value)}
                  className={`${inputCls} bg-[var(--theme-bg-surface-subtle)]`}
                  placeholder="Position / title"
                />
              </div>
            </CollapsibleSection>

            {/* Quote Settings */}
            <CollapsibleSection title="Quote Settings" icon={<Settings size={18} />} defaultOpen={true}>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-[var(--theme-text-secondary)] uppercase tracking-wider mb-1.5 block">Valid Until</label>
                  <input
                    type="date"
                    value={options.validity_override || ""}
                    onChange={(e) => setValidityOverride(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[var(--theme-text-secondary)] uppercase tracking-wider mb-1.5 block">Payment Terms</label>
                  <input
                    type="text"
                    value={options.payment_terms}
                    onChange={(e) => setPaymentTerms(e.target.value)}
                    className={inputCls}
                    placeholder="e.g. Net 30, COD"
                  />
                </div>
              </div>
            </CollapsibleSection>

            {/* Display Options */}
            <CollapsibleSection title="Display Options" icon={<Layout size={18} />} defaultOpen={true}>
              <DisplayOptionsControl
                options={options.display}
                onToggle={toggleDisplay}
              />
            </CollapsibleSection>

            {/* Client Note */}
            <CollapsibleSection title="Client Note" icon={<FileText size={18} />} defaultOpen={false}>
              <NotesControl
                value={options.custom_notes || ""}
                onChange={setCustomNotes}
              />
            </CollapsibleSection>
          </div>

          {/* Sidebar Footer - Actions */}
          <div className="p-6 border-t border-[var(--theme-border-default)] bg-[var(--theme-bg-surface)] shrink-0 flex flex-col gap-3 shadow-[0_-4px_15px_-3px_rgba(0,0,0,0.02)] z-30">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center justify-center gap-2 w-full px-4 py-3 text-sm font-bold text-[var(--theme-text-primary)] bg-[var(--theme-bg-surface)] border border-[var(--theme-border-default)] rounded-lg hover:bg-[var(--theme-bg-surface-subtle)] transition-all disabled:opacity-50 shadow-sm"
            >
              {isSaving ? (
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <Save size={18} />
              )}
              {isSaving ? "Saving..." : "Save Changes"}
            </button>

            <button
              onClick={handleDownload}
              disabled={isDownloading}
              className="flex items-center justify-center gap-2 w-full px-4 py-3 text-sm font-bold text-white bg-[var(--theme-action-primary-bg)] rounded-lg hover:bg-[#0D625D] hover:shadow-md transition-all shadow-sm disabled:opacity-50"
            >
              {isDownloading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Download size={18} />
              )}
              {isDownloading ? "Generating PDF..." : "Download PDF"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
