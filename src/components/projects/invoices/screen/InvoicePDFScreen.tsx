import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, Printer, Save, ZoomIn, ZoomOut, Maximize, User, Layout, FileText, Download, Building2, Phone } from "lucide-react";
import type { Project } from "../../../../types/pricing";
import { Invoice } from "../../../../types/accounting";
import { InvoiceDocument } from "../InvoiceDocument";
import { useInvoiceDocumentState } from "./useInvoiceDocumentState";
import { SignatoryControl } from "./controls/SignatoryControl";
import { DisplayOptionsControl } from "./controls/DisplayOptionsControl";
import { NotesControl } from "./controls/NotesControl";
import { BankDetailsControl } from "../../quotation/screen/controls/BankDetailsControl";
import { ContactFooterControl } from "../../quotation/screen/controls/ContactFooterControl";
import { CollapsibleSection } from "./controls/CollapsibleSection";
import { toast } from "../../../ui/toast-utils";
import { useCompanySettings, useUpdateCompanySettings } from "../../../../hooks/useCompanySettings";

interface InvoicePDFScreenProps {
  project: Project;
  invoice: Invoice;
  onClose: () => void;
  currentUser?: { name: string; email: string; } | null;
  isEmbedded?: boolean;
}

// A4 Dimensions in pixels at 96 DPI
const A4_WIDTH_PX = 794; // 210mm
const A4_HEIGHT_PX = 1123; // 297mm

export function InvoicePDFScreen({ project, invoice, onClose, currentUser, isEmbedded = false }: InvoicePDFScreenProps) {
  const { settings: companySettings } = useCompanySettings();
  const updateCompanySettings = useUpdateCompanySettings();
  const {
    options,
    updateSignatory,
    toggleDisplay,
    setCustomNotes,
    updateBankDetails,
    updateContactFooter,
    updateCallNumber,
    addCallNumber,
    removeCallNumber,
  } = useInvoiceDocumentState(project, invoice, currentUser, companySettings);

  const handleSaveBankAsDefault = async () => {
    if (!options.bank_details) return;
    try {
      await updateCompanySettings.mutateAsync({
        bank_name: options.bank_details.bank_name || null,
        bank_account_name: options.bank_details.account_name || null,
        bank_account_number: options.bank_details.account_number || null,
      });
      toast.success("Bank details saved as company default.");
    } catch (e: any) {
      toast.error(e?.message || "Failed to save bank details.");
    }
  };

  const handleSaveContactAsDefault = async () => {
    if (!options.contact_footer) return;
    const lines = options.contact_footer.office_address.split("\n").map((l) => l.trim()).filter(Boolean);
    try {
      await updateCompanySettings.mutateAsync({
        phone_numbers: options.contact_footer.call_numbers.map((p) => p.trim()).filter(Boolean),
        email: options.contact_footer.email || null,
        address_line1: lines[0] || null,
        address_line2: lines[1] || null,
        city: lines[2]?.split(",")[0]?.trim() || null,
        country: lines[2]?.split(",").slice(1).join(",").trim() || null,
      });
      toast.success("Contact footer saved as company default.");
    } catch (e: any) {
      toast.error(e?.message || "Failed to save contact footer.");
    }
  };
  const [isSaving, setIsSaving] = useState(false);
  const [scale, setScale] = useState(0.85);
  const [autoScale, setAutoScale] = useState(true);
  
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scale logic
  useEffect(() => {
    if (!autoScale || !containerRef.current) return;

    const calculateScale = () => {
      if (!containerRef.current) return;
      const { clientWidth, clientHeight } = containerRef.current;
      
      // Target margins
      const xMargin = 64; // 32px each side
      const yMargin = 120; // Increased to account for floating controls
      
      const availableWidth = clientWidth - xMargin;
      const availableHeight = clientHeight - yMargin;
      
      // Calculate fit scales
      const scaleX = availableWidth / A4_WIDTH_PX;
      const scaleY = availableHeight / A4_HEIGHT_PX;
      
      // Choose the smaller scale to ensure it fits, but don't go too small
      const fitScale = Math.min(scaleX, scaleY);
      
      // Clamp
      const finalScale = Math.max(0.4, Math.min(fitScale, 1.1));
      
      setScale(finalScale);
    };

    const observer = new ResizeObserver(calculateScale);
    observer.observe(containerRef.current);
    
    // Initial calculation
    calculateScale();

    return () => observer.disconnect();
  }, [autoScale]);

  const handlePrint = () => {
    window.print();
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
        // Mock save for now
        await new Promise(resolve => setTimeout(resolve, 800));
        toast.success("Preferences saved (Session only)");
    } finally {
        setIsSaving(false);
    }
  };

  const zoomIn = () => {
    setAutoScale(false);
    setScale(prev => Math.min(prev + 0.1, 1.5));
  };

  const zoomOut = () => {
    setAutoScale(false);
    setScale(prev => Math.max(prev - 0.1, 0.4));
  };
  
  const toggleFit = () => {
    setAutoScale(true); // Will trigger useEffect to recalculate
  };

  return (
    <div className={`flex flex-col h-full w-full bg-[var(--theme-bg-surface-subtle)] overflow-hidden ${isEmbedded ? 'rounded-lg border border-[var(--theme-border-default)]' : ''}`}>
      {/* Header - Styled like a Module Header - Only show if not embedded */}
      {!isEmbedded && (
        <div className="h-16 bg-[var(--theme-bg-surface)] border-b border-[var(--theme-border-default)] px-6 flex items-center justify-between shrink-0 z-20 print:hidden">
            <div className="flex items-center gap-4">
            <button 
                onClick={onClose}
                className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-[var(--theme-bg-surface-subtle)] text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] transition-all"
                title="Close Studio"
            >
                <ArrowLeft size={20} />
            </button>
            
            <div>
                <h2 className="text-xl font-bold text-[var(--theme-text-primary)] tracking-tight">Invoice PDF Studio</h2>
                <p className="text-[11px] text-[var(--theme-text-muted)] font-mono leading-none mt-1">{invoice.invoice_number}</p>
            </div>
            </div>
        </div>
      )}

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* LEFT: Live Preview Stage */}
        <div 
            ref={containerRef}
            className="flex-1 bg-[var(--theme-bg-surface-subtle)] overflow-hidden flex items-center justify-center relative p-8"
        >
            {/* Scrollable Area */}
            <div className="absolute inset-0 overflow-auto flex items-center justify-center p-8 pb-32 print:p-0 print:overflow-visible print:absolute print:inset-0 print:block">
                {/* Print Portal Scope */}
                <div className="print-portal-root flex flex-col items-center print:block print:w-full print:h-full">
                    {/* The Wrapper */}
                    <div 
                        className="print:w-full print:h-full"
                        style={{ 
                            width: A4_WIDTH_PX * scale,
                            height: A4_HEIGHT_PX * scale,
                            transition: 'width 0.2s, height 0.2s',
                            position: 'relative'
                        }}
                    >
                        {/* The "Paper" Container */}
                        <div 
                            className="bg-[var(--theme-bg-surface)] origin-top-left print:transform-none print:shadow-none print:static print:w-full print:h-full" 
                            style={{ 
                                width: '210mm', 
                                minHeight: '297mm',
                                transform: `scale(${scale})`,
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                // Stronger, layered shadow for "floating on desk" effect
                                boxShadow: '0 10px 30px -5px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05), 0 0 0 1px rgba(0,0,0,0.02)' 
                            }}
                        >
                            <InvoiceDocument 
                                project={project} 
                                invoice={invoice}
                                mode="preview" 
                                options={options}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Floating Zoom Controls - Hidden on Print */}
            <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 bg-[var(--theme-bg-surface)]/90 backdrop-blur-sm border border-[var(--theme-border-default)] shadow-lg rounded-full px-4 py-2 flex items-center gap-4 z-30 transition-all hover:bg-[var(--theme-bg-surface)] hover:shadow-xl print:hidden">
                 <button onClick={zoomOut} className="p-1.5 hover:bg-[var(--theme-bg-surface-subtle)] rounded-full text-[var(--theme-text-secondary)] transition-all" title="Zoom Out">
                    <ZoomOut size={18} />
                 </button>
                 <span className="text-sm font-medium text-[var(--theme-text-secondary)] w-12 text-center select-none tabular-nums">{Math.round(scale * 100)}%</span>
                 <button onClick={zoomIn} className="p-1.5 hover:bg-[var(--theme-bg-surface-subtle)] rounded-full text-[var(--theme-text-secondary)] transition-all" title="Zoom In">
                    <ZoomIn size={18} />
                 </button>
                 <div className="w-px h-4 bg-[var(--theme-bg-surface-tint)]" />
                 <button 
                    onClick={toggleFit} 
                    className={`flex items-center gap-2 px-2 py-1 rounded-md text-sm font-medium transition-all ${autoScale ? 'text-[var(--theme-action-primary-bg)] bg-[#F0FDFA]' : 'text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-surface-subtle)]'}`}
                    title="Fit to Screen"
                 >
                    <Maximize size={16} />
                    <span>Fit</span>
                 </button>
            </div>
        </div>

        {/* RIGHT: Document Controls Sidebar - Hidden on Print */}
        <div className="w-[360px] bg-[var(--theme-bg-surface)] border-l border-[var(--theme-border-default)] flex flex-col overflow-hidden shrink-0 z-20 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.02)] print:hidden">
            
            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
                <CollapsibleSection title="Signatories" icon={<User size={18} />} defaultOpen={true}>
                    <SignatoryControl
                        preparedBy={options.signatories.prepared_by}
                        approvedBy={options.signatories.approved_by}
                        onUpdate={updateSignatory}
                    />
                </CollapsibleSection>

                {options.bank_details && (
                  <CollapsibleSection title="Bank Details" icon={<Building2 size={18} />} defaultOpen={false}>
                    <BankDetailsControl
                      bankDetails={options.bank_details}
                      onUpdate={updateBankDetails as any}
                      onSaveAsDefault={handleSaveBankAsDefault}
                      isSavingDefault={updateCompanySettings.isPending}
                    />
                  </CollapsibleSection>
                )}

                {options.contact_footer && (
                  <CollapsibleSection title="Contact Footer" icon={<Phone size={18} />} defaultOpen={false}>
                    <ContactFooterControl
                      contactFooter={options.contact_footer}
                      onUpdateField={updateContactFooter}
                      onUpdateCallNumber={updateCallNumber}
                      onAddCallNumber={addCallNumber}
                      onRemoveCallNumber={removeCallNumber}
                      onSaveAsDefault={handleSaveContactAsDefault}
                      isSavingDefault={updateCompanySettings.isPending}
                    />
                  </CollapsibleSection>
                )}

                <CollapsibleSection title="Display Options" icon={<Layout size={18} />} defaultOpen={true}>
                    <DisplayOptionsControl
                        options={options.display}
                        onToggle={toggleDisplay as any}
                    />
                </CollapsibleSection>

                <CollapsibleSection title="Custom Notes" icon={<FileText size={18} />} defaultOpen={false}>
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
                    className="flex items-center justify-center gap-2 w-full px-4 py-3 text-sm font-bold text-[var(--theme-text-primary)] bg-[var(--theme-bg-surface)] border border-[var(--theme-border-default)] rounded-lg hover:bg-[var(--theme-bg-surface-subtle)] hover:border-[var(--theme-border-default)] transition-all disabled:opacity-50 shadow-sm"
                  >
                    {isSaving ? (
                        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                        <Save size={18} />
                    )}
                    {isSaving ? "Saving..." : "Save Preferences"}
                  </button>
                  
                  <button 
                    onClick={handlePrint}
                    className="flex items-center justify-center gap-2 w-full px-4 py-3 text-sm font-bold text-white bg-[var(--theme-action-primary-bg)] rounded-lg hover:opacity-90 hover:shadow-md transition-all shadow-sm"
                  >
                    <Printer size={18} />
                    Print / Download PDF
                  </button>
            </div>
        </div>
      </div>

      {/* Hidden Print Style Setup */}
      <style>
        {`
          @media print {
            @page { size: A4; margin: 0; }
            body { margin: 0 !important; padding: 0 !important; background: white !important; }
            body > *:not(.print-container) { display: none !important; }
            .print-container { display: block !important; position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 9999; }
          }
        `}
      </style>

      {/* Actual Print Container (Hidden usually, visible when printing) */}
      <div className="print-container hidden">
         <InvoiceDocument 
            project={project} 
            invoice={invoice}
            mode="print" 
            options={options}
         />
      </div>
    </div>
  );
}
