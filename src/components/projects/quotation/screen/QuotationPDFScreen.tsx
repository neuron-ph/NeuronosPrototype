import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Printer, Save, ZoomIn, ZoomOut, Maximize, User, Layout, FileText, Settings, UserCheck } from "lucide-react";
import type { Project, QuotationNew } from "../../../../types/pricing";
import { QuotationDocument } from "../QuotationDocument";
import { useQuotationDocumentState } from "./useQuotationDocumentState";
import { SignatoryControl } from "./controls/SignatoryControl";
import { DisplayOptionsControl } from "./controls/DisplayOptionsControl";
import { NotesControl } from "./controls/NotesControl";
import { CollapsibleSection } from "./controls/CollapsibleSection";

interface QuotationPDFScreenProps {
  project: Project;
  /** Pass the original QuotationNew directly (Pricing/BD context). Takes priority over
   *  project.quotation. When omitted falls back to project.quotation → project (ProjectOverviewTab). */
  quotation?: QuotationNew;
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
  currentUser?: { name: string; email: string; } | null;
  isEmbedded?: boolean;
}

// A4 Dimensions in pixels at 96 DPI
const A4_WIDTH_PX = 794; // 210mm
const A4_HEIGHT_PX = 1123; // 297mm

export function QuotationPDFScreen({ project, quotation: quotationProp, onClose, onSave, currentUser, isEmbedded = false }: QuotationPDFScreenProps) {
  // Resolve the authoritative quotation:
  // 1. Direct prop from QuotationFileView (most fields populated)
  // 2. Nested inside an adapted Project (legacy path)
  // 3. The Project itself cast as QuotationNew (ProjectOverviewTab path)
  const resolvedQuotation: QuotationNew = quotationProp ?? ((project as any).quotation as QuotationNew) ?? (project as any as QuotationNew);

  const {
    options,
    isDirty,
    markClean,
    updateSignatory,
    updateAddressedTo,
    setValidityOverride,
    setPaymentTerms,
    toggleDisplay,
    setCustomNotes,
  } = useQuotationDocumentState(resolvedQuotation as any, currentUser);

  const [isSaving, setIsSaving] = useState(false);
  const [scale, setScale] = useState(0.75);
  const [autoScale, setAutoScale] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [pageCount, setPageCount] = useState(1);

  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);

  // Measure actual document height to determine page count
  useEffect(() => {
    if (!measureRef.current) return;
    const h = measureRef.current.scrollHeight;
    setPageCount(Math.max(1, Math.ceil(h / A4_HEIGHT_PX)));
  }, [options, resolvedQuotation]);

  // Auto-scale logic — fits to width only so multi-page docs scroll naturally
  useEffect(() => {
    if (!autoScale || !containerRef.current) return;

    const calculateScale = () => {
      if (!containerRef.current) return;
      const xMargin = 64;
      const availableWidth = containerRef.current.clientWidth - xMargin;
      const fitScale = availableWidth / A4_WIDTH_PX;
      setScale(Math.max(0.4, Math.min(fitScale, 1.1)));
    };

    const observer = new ResizeObserver(calculateScale);
    observer.observe(containerRef.current);
    calculateScale();
    return () => observer.disconnect();
  }, [autoScale]);

  // Lazy print: mount portal content first, then open print dialog after DOM settles
  useEffect(() => {
    if (!isPrinting) return;
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.print();
        setIsPrinting(false);
      });
    });
    return () => cancelAnimationFrame(id);
  }, [isPrinting]);

  const handlePrint = () => setIsPrinting(true);

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
      markClean();
    } finally {
      setIsSaving(false);
    }
  };

  const zoomIn = () => { setAutoScale(false); setScale(prev => Math.min(prev + 0.1, 1.5)); };
  const zoomOut = () => { setAutoScale(false); setScale(prev => Math.max(prev - 0.1, 0.4)); };
  const toggleFit = () => setAutoScale(true);

  const inputCls = "w-full px-3 py-2 text-sm border border-[var(--theme-border-default)] rounded-lg focus:border-[var(--theme-action-primary-bg)] focus:ring-1 focus:ring-[var(--theme-action-primary-bg)] outline-none transition-all placeholder:text-[var(--theme-text-muted)]";

  return (
    <div className={`flex flex-col h-full w-full bg-[var(--theme-bg-surface-subtle)] overflow-hidden ${isEmbedded ? 'rounded-lg border border-[var(--theme-border-default)]' : ''}`}>
      {/* Header — only shown when not embedded */}
      {!isEmbedded && (
        <div className="h-16 bg-[var(--theme-bg-surface)] border-b border-[var(--theme-border-default)] px-6 flex items-center justify-between shrink-0 z-20">
          <div className="flex items-center gap-4">
            <button
              onClick={onClose}
              aria-label="Close PDF studio"
              className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-[var(--theme-bg-surface-subtle)] text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] transition-all"
            >
              <ArrowLeft size={20} />
            </button>
            <h2 className="text-xl font-bold text-[var(--theme-text-primary)] tracking-tight">Quotation PDF Studio</h2>
          </div>
        </div>
      )}

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden">

        {/* LEFT: Live Preview Stage */}
        <div ref={containerRef} className="flex-1 bg-[var(--theme-bg-surface-subtle)] overflow-hidden flex items-center justify-center relative p-8">
          {/* Hidden measurement div — renders at natural size to detect page count */}
          <div
            ref={measureRef}
            style={{
              position: 'absolute',
              visibility: 'hidden',
              pointerEvents: 'none',
              top: -99999,
              left: 0,
              width: '210mm',
              zIndex: -1,
            }}
          >
            <QuotationDocument project={project} quotation={resolvedQuotation} mode="preview" currentUser={currentUser} options={options} />
          </div>

          <div className="absolute inset-0 overflow-auto flex justify-center p-8 pb-32">
            <div className="print-portal-root flex flex-col items-center gap-4">
              {Array.from({ length: pageCount }, (_, pageIndex) => (
                <div
                  key={pageIndex}
                  style={{
                    width: A4_WIDTH_PX * scale,
                    height: A4_HEIGHT_PX * scale,
                    position: 'relative',
                    overflow: 'hidden',
                    flexShrink: 0,
                    boxShadow: '0 10px 30px -5px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05), 0 0 0 1px rgba(0,0,0,0.02)',
                  }}
                >
                  <div
                    className="bg-[var(--theme-bg-surface)] origin-top-left"
                    style={{
                      width: '210mm',
                      minHeight: '297mm',
                      transform: `scale(${scale})`,
                      position: 'absolute',
                      top: -(pageIndex * A4_HEIGHT_PX * scale),
                      left: 0,
                    }}
                  >
                    <QuotationDocument project={project} quotation={resolvedQuotation} mode="preview" currentUser={currentUser} options={options} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Floating Zoom Controls */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-[var(--theme-bg-surface)] border border-[var(--theme-border-default)] shadow-lg rounded-full px-4 py-2 flex items-center gap-3 z-30 hover:shadow-xl transition-shadow">
            <button
              onClick={zoomOut}
              aria-label="Zoom out"
              className="min-w-[40px] min-h-[40px] flex items-center justify-center hover:bg-[var(--theme-bg-surface-subtle)] rounded-full text-[var(--theme-text-secondary)] transition-all"
            >
              <ZoomOut size={18} />
            </button>
            <span className="text-sm font-medium text-[var(--theme-text-secondary)] w-12 text-center select-none tabular-nums">
              {Math.round(scale * 100)}%
            </span>
            <button
              onClick={zoomIn}
              aria-label="Zoom in"
              className="min-w-[40px] min-h-[40px] flex items-center justify-center hover:bg-[var(--theme-bg-surface-subtle)] rounded-full text-[var(--theme-text-secondary)] transition-all"
            >
              <ZoomIn size={18} />
            </button>
            <div className="w-px h-4 bg-[var(--theme-border-default)]" />
            <button
              onClick={toggleFit}
              aria-label="Fit to screen"
              aria-pressed={autoScale}
              className={`flex items-center gap-2 px-2 py-1 rounded-md text-sm font-medium transition-all ${autoScale ? 'text-[var(--theme-action-primary-bg)] bg-[var(--theme-action-primary-bg)]/10' : 'text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-surface-subtle)]'}`}
            >
              <Maximize size={16} /><span>Fit</span>
            </button>
          </div>
        </div>

        {/* RIGHT: Document Controls Sidebar */}
        <div className="w-[320px] bg-[var(--theme-bg-surface)] border-l border-[var(--theme-border-default)] flex flex-col overflow-hidden shrink-0 z-20">

          {/* Sidebar Header */}
          <div className="px-5 py-3.5 border-b border-[var(--theme-border-default)] flex items-center justify-between shrink-0">
            <span className="text-xs font-semibold text-[var(--theme-text-secondary)] uppercase tracking-wider">Document Settings</span>
            {isDirty && (
              <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5 font-medium">Unsaved</span>
            )}
          </div>

          {/* Scrollable Controls */}
          <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--theme-border-default)] scrollbar-track-transparent">

            <CollapsibleSection title="Signatories" icon={<User size={16} />} defaultOpen={true}>
              <SignatoryControl
                preparedBy={options.signatories.prepared_by}
                approvedBy={options.signatories.approved_by}
                onUpdate={updateSignatory}
              />
            </CollapsibleSection>

            <CollapsibleSection title="Quote Settings" icon={<Settings size={16} />} defaultOpen={true}>
              <div className="space-y-3">
                <div>
                  <label htmlFor="valid-until-date" className="text-xs font-semibold text-[var(--theme-text-secondary)] uppercase tracking-wider mb-1.5 block">Valid Until</label>
                  <input
                    id="valid-until-date"
                    type="date"
                    value={options.validity_override || ""}
                    onChange={e => setValidityOverride(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label htmlFor="payment-terms-input" className="text-xs font-semibold text-[var(--theme-text-secondary)] uppercase tracking-wider mb-1.5 block">Payment Terms</label>
                  <input
                    id="payment-terms-input"
                    type="text"
                    value={options.payment_terms}
                    onChange={e => setPaymentTerms(e.target.value)}
                    className={inputCls}
                    placeholder="e.g. Net 30, COD"
                  />
                </div>
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="Display Options" icon={<Layout size={16} />} defaultOpen={false}>
              <DisplayOptionsControl options={options.display} onToggle={toggleDisplay} />
            </CollapsibleSection>

            <CollapsibleSection title="Addressed To" icon={<UserCheck size={16} />} defaultOpen={false}>
              <div className="space-y-3">
                <div>
                  <label htmlFor="addressed-to-name" className="text-xs font-semibold text-[var(--theme-text-secondary)] uppercase tracking-wider mb-1.5 block">Name</label>
                  <input
                    id="addressed-to-name"
                    type="text"
                    value={options.addressed_to.name}
                    onChange={e => updateAddressedTo("name", e.target.value)}
                    className={inputCls}
                    placeholder="Contact person name"
                  />
                </div>
                <div>
                  <label htmlFor="addressed-to-position" className="text-xs font-semibold text-[var(--theme-text-secondary)] uppercase tracking-wider mb-1.5 block">Position</label>
                  <input
                    id="addressed-to-position"
                    type="text"
                    value={options.addressed_to.title}
                    onChange={e => updateAddressedTo("title", e.target.value)}
                    className={inputCls}
                    placeholder="Position / title"
                  />
                </div>
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="Client Note" icon={<FileText size={16} />} defaultOpen={false}>
              <NotesControl value={options.custom_notes || ""} onChange={setCustomNotes} />
            </CollapsibleSection>

          </div>

          {/* Sidebar Footer */}
          <div className="p-5 border-t border-[var(--theme-border-default)] bg-[var(--theme-bg-surface)] shrink-0 flex flex-col gap-2.5">
            <button
              onClick={handleSave}
              disabled={isSaving || !isDirty}
              className="flex items-center justify-center gap-2 w-full px-4 py-2.5 text-sm font-semibold text-[var(--theme-text-primary)] bg-[var(--theme-bg-surface)] border border-[var(--theme-border-default)] rounded-lg hover:bg-[var(--theme-bg-surface-subtle)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSaving ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Save size={15} />}
              {isSaving ? "Saving…" : "Save Changes"}
            </button>
            <button
              onClick={handlePrint}
              disabled={isPrinting}
              className="flex items-center justify-center gap-2 w-full px-4 py-2.5 text-sm font-semibold text-white bg-[var(--theme-action-primary-bg)] rounded-lg hover:opacity-90 transition-all disabled:opacity-70"
            >
              <Printer size={15} />
              {isPrinting ? "Preparing…" : "Print PDF"}
            </button>
          </div>
        </div>
      </div>

      {/* Print Styles */}
      <style>{`
        @media print {
          @page { size: A4; margin: 0; }
          body { margin: 0 !important; padding: 0 !important; background: white !important; }
          #root, .app-root, body > div:not(.print-portal-container) { display: none !important; }
          .print-portal-container { display: block !important; position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 9999; background: white; }
        }
      `}</style>

      {/* Print Portal — only mounted when printing to avoid a persistent hidden render tree */}
      {isPrinting && createPortal(
        <div className="print-portal-container hidden">
          <QuotationDocument project={project} quotation={resolvedQuotation} mode="print" currentUser={currentUser} options={options} />
        </div>,
        document.body
      )}
    </div>
  );
}
