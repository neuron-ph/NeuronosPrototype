import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Printer, Save, ZoomIn, ZoomOut, Maximize, User, Settings, UserCheck, Building2, Phone, Check, Eye } from "lucide-react";
import { toast } from "sonner@2.0.3";
import type { Project, QuotationNew } from "../../../../types/pricing";
import { QuotationDocument } from "../QuotationDocument";
import { useQuotationDocumentState, type QuotationPrintOptions } from "./useQuotationDocumentState";
import { ContactFooterControl } from "./controls/ContactFooterControl";
import { useCompanySettings, useUpdateCompanySettings } from "../../../../hooks/useCompanySettings";

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
const CONSOLE_WIDTH = 520;
const JUMP_RAIL_WIDTH = 44;
const QUOTATION_PRINT_BODY_CLASS = "neuron-printing-quotation-pdf";
const QUOTATION_PRINT_STYLE_ID = "quotation-print-portal-styles";

const QUOTATION_PRINT_CSS = `
  @media print {
    @page { size: A4; margin: 0; }
    html,
    body {
      margin: 0 !important;
      padding: 0 !important;
      width: 210mm !important;
      min-height: 297mm !important;
      height: auto !important;
      overflow: visible !important;
      background: white !important;
    }
    body.${QUOTATION_PRINT_BODY_CLASS} > *:not(.print-portal-container) {
      display: none !important;
    }
    body.${QUOTATION_PRINT_BODY_CLASS} .print-portal-container {
      display: block !important;
      position: static !important;
      width: 210mm !important;
      min-height: 297mm !important;
      background: white !important;
      z-index: 9999 !important;
    }
    body.${QUOTATION_PRINT_BODY_CLASS} .print-portal-container .p-page {
      break-after: page;
      page-break-after: always;
    }
    body.${QUOTATION_PRINT_BODY_CLASS} .print-portal-container .p-page:last-child {
      break-after: auto;
      page-break-after: auto;
    }
  }
`;

type SectionId = "display" | "settings" | "addressed" | "signatories" | "bank" | "footer";

const SECTION_ORDER: SectionId[] = ["display", "settings", "addressed", "signatories", "bank", "footer"];

const SECTION_META: Record<SectionId, { label: string; icon: React.ReactNode }> = {
  display:     { label: "Display",        icon: <Eye size={16} /> },
  settings:    { label: "Quote Settings", icon: <Settings size={16} /> },
  addressed:   { label: "Addressed To",   icon: <UserCheck size={16} /> },
  signatories: { label: "Signatories",    icon: <User size={16} /> },
  bank:        { label: "Bank Details",   icon: <Building2 size={16} /> },
  footer:      { label: "Contact Footer", icon: <Phone size={16} /> },
};

const DISPLAY_TOGGLES: Array<{ key: keyof QuotationPrintOptions["display"]; label: string; hint: string }> = [
  { key: "show_bank_details",   label: "Bank Details",    hint: "Payment account block" },
  { key: "show_notes",          label: "Terms and Conditions",     hint: "Custom terms paragraph" },
  { key: "show_tax_summary",    label: "Tax Breakdown",   hint: "VAT row in totals" },
  { key: "show_signatories",    label: "Signatories",     hint: "Prepared / approved block" },
  { key: "show_contact_footer", label: "Contact Footer",  hint: "Company contact bar" },
];

const inputCls = "w-full px-3 py-2 text-sm border border-[var(--theme-border-default)] rounded-lg focus:border-[var(--theme-action-primary-bg)] focus:ring-1 focus:ring-[var(--theme-action-primary-bg)] outline-none transition-all placeholder:text-[var(--theme-text-muted)]";
const labelCls = "text-[11px] font-semibold text-[var(--theme-text-secondary)] uppercase tracking-wider mb-1.5 block";

export function QuotationPDFScreen({ project, quotation: quotationProp, onClose, onSave, currentUser, isEmbedded = false }: QuotationPDFScreenProps) {
  // Resolve the authoritative quotation:
  // 1. Direct prop from QuotationFileView (most fields populated)
  // 2. Nested inside an adapted Project (legacy path)
  // 3. The Project itself cast as QuotationNew (ProjectOverviewTab path)
  const resolvedQuotation: QuotationNew = quotationProp ?? ((project as any).quotation as QuotationNew) ?? (project as any as QuotationNew);

  const { settings: companySettings } = useCompanySettings();
  const updateCompanySettings = useUpdateCompanySettings();

  const {
    options,
    isDirty,
    markClean,
    updateSignatory,
    updateAddressedTo,
    setValidityOverride,
    setPaymentTerms,
    toggleDisplay,
    updateBankDetails,
    updateContactFooter,
    updateCallNumber,
    addCallNumber,
    removeCallNumber,
  } = useQuotationDocumentState(resolvedQuotation as any, currentUser, companySettings);

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
  const [scale, setScale] = useState(0.75);
  const [autoScale, setAutoScale] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [pageCount, setPageCount] = useState(1);
  const [activeSection, setActiveSection] = useState<SectionId>("display");
  const containerRef = useRef<HTMLDivElement>(null);
  const previewScrollerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const consoleScrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<SectionId, HTMLDivElement | null>>({
    display: null, settings: null, addressed: null, signatories: null, bank: null, footer: null,
  });

  // Measure actual document height to determine page count
  useEffect(() => {
    if (!measureRef.current) return;
    const h = measureRef.current.scrollHeight;
    setPageCount(Math.max(1, Math.ceil(h / A4_HEIGHT_PX)));
  }, [options, resolvedQuotation]);

  useEffect(() => {
    previewScrollerRef.current?.scrollTo({ top: 0, left: 0 });
  }, [resolvedQuotation.id]);

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

  // Highlight the currently visible console section in the jump rail.
  useEffect(() => {
    const scroller = consoleScrollRef.current;
    if (!scroller) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        const top = visible[0]?.target as HTMLElement | undefined;
        const id = top?.dataset.sectionId as SectionId | undefined;
        if (id) setActiveSection(id);
      },
      { root: scroller, rootMargin: "0px 0px -55% 0px", threshold: [0, 0.25, 0.5, 1] }
    );
    SECTION_ORDER.forEach((id) => {
      const el = sectionRefs.current[id];
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [options.bank_details, options.contact_footer]);

  const jumpTo = (id: SectionId) => {
    const el = sectionRefs.current[id];
    const scroller = consoleScrollRef.current;
    if (!el || !scroller) return;
    setActiveSection(id);
    scroller.scrollTo({ top: el.offsetTop - 8, behavior: "smooth" });
  };

  // Lazy print: mount portal content first, then open print dialog after DOM settles.
  // Keep it mounted until `afterprint`; Chromium can return from window.print()
  // while the system preview is still reading DOM/CSS.
  useEffect(() => {
    if (!isPrinting) return;
    document.body.classList.add(QUOTATION_PRINT_BODY_CLASS);

    let styleEl = document.getElementById(QUOTATION_PRINT_STYLE_ID) as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = QUOTATION_PRINT_STYLE_ID;
      styleEl.textContent = QUOTATION_PRINT_CSS;
      document.head.appendChild(styleEl);
    }

    const finishPrint = () => setIsPrinting(false);
    window.addEventListener("afterprint", finishPrint, { once: true });

    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.print();
      });
    });

    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("afterprint", finishPrint);
      document.body.classList.remove(QUOTATION_PRINT_BODY_CLASS);
      document.getElementById(QUOTATION_PRINT_STYLE_ID)?.remove();
    };
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
        display: options.display,
        details: {
          ...(options.bank_details
            ? { bank_details_override: { ...options.bank_details } }
            : {}),
          ...(options.contact_footer
            ? { contact_footer_override: { ...options.contact_footer } }
            : {}),
        },
      });
      markClean();
    } finally {
      setIsSaving(false);
    }
  };

  const zoomIn = () => { setAutoScale(false); setScale(prev => Math.min(prev + 0.1, 1.5)); };
  const zoomOut = () => { setAutoScale(false); setScale(prev => Math.max(prev - 0.1, 0.4)); };
  const toggleFit = () => setAutoScale(true);

  // Format a date string (YYYY-MM-DD) for mini-preview display.
  const validUntilDisplay = useMemo(() => {
    const raw = options.validity_override;
    if (!raw) return "—";
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return raw;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }, [options.validity_override]);

  // Visible jump-rail icons (Bank / Footer hidden if those overrides don't exist).
  const visibleSections = SECTION_ORDER.filter((id) => {
    if (id === "bank") return !!options.bank_details;
    if (id === "footer") return !!options.contact_footer;
    return true;
  });

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

      {/* Main Workspace — Split Console (preview left, fixed console right) */}
      <div className="flex-1 flex overflow-hidden">

        {/* LEFT: Preview stage (flex-1 — takes everything not claimed by the console) */}
        <div ref={containerRef} className="flex-1 bg-[var(--theme-bg-surface-subtle)] overflow-hidden relative">
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

          <div ref={previewScrollerRef} className="absolute inset-0 overflow-auto flex justify-center p-8 pb-24">
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

          {/* Floating zoom pill — preview-only utilities (Save/Print live in the console footer) */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-[var(--theme-bg-surface)] border border-[var(--theme-border-default)] shadow-lg rounded-full pl-1.5 pr-1.5 py-1 flex items-center gap-1 z-30 hover:shadow-xl transition-shadow">
            <button
              onClick={zoomOut}
              aria-label="Zoom out"
              className="w-8 h-8 flex items-center justify-center hover:bg-[var(--theme-bg-surface-subtle)] rounded-full text-[var(--theme-text-secondary)] transition-all"
            >
              <ZoomOut size={15} />
            </button>
            <span className="text-xs font-medium text-[var(--theme-text-secondary)] w-10 text-center select-none tabular-nums">
              {Math.round(scale * 100)}%
            </span>
            <button
              onClick={zoomIn}
              aria-label="Zoom in"
              className="w-8 h-8 flex items-center justify-center hover:bg-[var(--theme-bg-surface-subtle)] rounded-full text-[var(--theme-text-secondary)] transition-all"
            >
              <ZoomIn size={15} />
            </button>
            <button
              onClick={toggleFit}
              aria-label="Fit to screen"
              aria-pressed={autoScale}
              className={`flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium transition-all ${autoScale ? 'text-[var(--theme-action-primary-bg)] bg-[var(--theme-action-primary-bg)]/10' : 'text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-surface-subtle)]'}`}
            >
              <Maximize size={13} /><span>Fit</span>
            </button>
          </div>
        </div>

        {/* RIGHT: Console — fixed 520px (forms don't get better wider; the preview rubber-bands instead) */}
        <aside
          className="shrink-0 bg-[var(--theme-bg-surface)] border-l border-[var(--theme-border-default)] flex overflow-hidden z-20"
          style={{ width: CONSOLE_WIDTH }}
        >
          {/* Sticky jump rail (left edge of the console) */}
          <nav
            aria-label="Console sections"
            className="shrink-0 bg-[var(--theme-bg-surface-subtle)] border-r border-[var(--theme-border-default)] flex flex-col items-center py-2 gap-0.5"
            style={{ width: JUMP_RAIL_WIDTH }}
          >
            {visibleSections.map((id) => {
              const meta = SECTION_META[id];
              const isActive = activeSection === id;
              return (
                <button
                  key={id}
                  onClick={() => jumpTo(id)}
                  aria-label={`Jump to ${meta.label}`}
                  aria-current={isActive ? "true" : undefined}
                  title={meta.label}
                  className={`relative w-9 h-9 flex items-center justify-center rounded-md transition-all ${
                    isActive
                      ? "text-[var(--theme-action-primary-bg)] bg-[var(--theme-action-primary-bg)]/10"
                      : "text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-surface)]"
                  }`}
                >
                  {isActive && (
                    <span
                      aria-hidden
                      className="absolute -left-2 top-1.5 bottom-1.5 w-0.5 rounded-full bg-[var(--theme-action-primary-bg)]"
                    />
                  )}
                  {meta.icon}
                </button>
              );
            })}
          </nav>

          {/* Console body: scroll area + sticky action footer */}
          <div className="flex-1 flex flex-col min-w-0">
            <div
              ref={consoleScrollRef}
              className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--theme-border-default)] scrollbar-track-transparent"
            >
              <div className="px-6 pt-5 pb-8 space-y-8">

                {/* === Display === */}
                <ConsoleSection
                  id="display"
                  meta={SECTION_META.display}
                  description="Toggle which blocks appear on the printed document."
                  sectionRef={(el) => { sectionRefs.current.display = el; }}
                >
                  <div className="grid grid-cols-2 gap-2">
                    {DISPLAY_TOGGLES.map((t) => {
                      const checked = options.display[t.key];
                      return (
                        <button
                          key={t.key}
                          role="switch"
                          aria-checked={checked}
                          onClick={() => toggleDisplay(t.key)}
                          className={`group flex items-start gap-2.5 p-3 text-left rounded-lg border transition-all ${
                            checked
                              ? "border-[var(--theme-action-primary-bg)]/50 bg-[var(--theme-action-primary-bg)]/5"
                              : "border-[var(--theme-border-default)] bg-[var(--theme-bg-surface)] hover:border-[var(--theme-action-primary-bg)]/30"
                          }`}
                        >
                          <div
                            className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center transition-all shrink-0 ${
                              checked
                                ? "bg-[var(--theme-action-primary-bg)] border-[var(--theme-action-primary-bg)]"
                                : "bg-[var(--theme-bg-surface)] border-[var(--theme-border-default)]"
                            }`}
                            style={{ borderWidth: 1.5 }}
                          >
                            {checked && <Check size={11} className="text-white stroke-[3]" />}
                          </div>
                          <div className="min-w-0">
                            <div className={`text-sm font-medium leading-tight ${checked ? "text-[var(--theme-text-primary)]" : "text-[var(--theme-text-secondary)]"}`}>
                              {t.label}
                            </div>
                            <div className="text-[11px] text-[var(--theme-text-muted)] mt-0.5 leading-snug">{t.hint}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </ConsoleSection>

                {/* === Quote Settings (2-col) + mini-preview === */}
                <ConsoleSection
                  id="settings"
                  meta={SECTION_META.settings}
                  description="Validity and payment terms shown in the contract header."
                  sectionRef={(el) => { sectionRefs.current.settings = el; }}
                >
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="valid-until-date" className={labelCls}>Valid Until</label>
                      <input
                        id="valid-until-date"
                        type="date"
                        value={options.validity_override || ""}
                        onChange={(e) => setValidityOverride(e.target.value)}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label htmlFor="payment-terms-input" className={labelCls}>Payment Terms</label>
                      <input
                        id="payment-terms-input"
                        type="text"
                        value={options.payment_terms}
                        onChange={(e) => setPaymentTerms(e.target.value)}
                        className={inputCls}
                        placeholder="e.g. Net 30, COD"
                      />
                    </div>
                  </div>
                  <MiniPreview label="On the document">
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                      <KV k="Valid Until" v={validUntilDisplay} />
                      <KV k="Payment Terms" v={options.payment_terms || "—"} />
                    </div>
                  </MiniPreview>
                </ConsoleSection>

                {/* === Addressed To (2-col) + mini-preview === */}
                <ConsoleSection
                  id="addressed"
                  meta={SECTION_META.addressed}
                  description="Recipient line at the top of the document."
                  sectionRef={(el) => { sectionRefs.current.addressed = el; }}
                >
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="addressed-to-name" className={labelCls}>Name</label>
                      <input
                        id="addressed-to-name"
                        type="text"
                        value={options.addressed_to.name}
                        onChange={(e) => updateAddressedTo("name", e.target.value)}
                        className={inputCls}
                        placeholder="Contact person name"
                      />
                    </div>
                    <div>
                      <label htmlFor="addressed-to-position" className={labelCls}>Position</label>
                      <input
                        id="addressed-to-position"
                        type="text"
                        value={options.addressed_to.title}
                        onChange={(e) => updateAddressedTo("title", e.target.value)}
                        className={inputCls}
                        placeholder="Position / title"
                      />
                    </div>
                  </div>
                  <MiniPreview label="On the document">
                    <div className="text-sm">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--theme-action-primary-bg)] mr-2">Attention:</span>
                      <span className="text-[var(--theme-text-primary)] font-medium">{options.addressed_to.name || "—"}</span>
                      {options.addressed_to.title && (
                        <span className="text-[var(--theme-text-muted)]"> · {options.addressed_to.title}</span>
                      )}
                    </div>
                  </MiniPreview>
                </ConsoleSection>

                {/* === Signatories (2-col Prepared | Approved) === */}
                <ConsoleSection
                  id="signatories"
                  meta={SECTION_META.signatories}
                  description="Names and titles at the bottom of the document."
                  sectionRef={(el) => { sectionRefs.current.signatories = el; }}
                >
                  <div className="grid grid-cols-2 gap-4">
                    <SignatoryColumn
                      heading="Prepared By"
                      value={options.signatories.prepared_by}
                      onChange={(field, v) => updateSignatory("prepared_by", field, v)}
                      nameAriaLabel="Prepared by name"
                      titleAriaLabel="Prepared by job title"
                    />
                    <SignatoryColumn
                      heading="Approved By"
                      value={options.signatories.approved_by}
                      onChange={(field, v) => updateSignatory("approved_by", field, v)}
                      nameAriaLabel="Approved by name"
                      titleAriaLabel="Approved by job title"
                      namePlaceholder="Name (Optional)"
                    />
                  </div>
                </ConsoleSection>

                {/* === Bank Details === */}
                {options.bank_details && (
                  <ConsoleSection
                    id="bank"
                    meta={SECTION_META.bank}
                    description="Wire-transfer details printed in the payments block."
                    sectionRef={(el) => { sectionRefs.current.bank = el; }}
                  >
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="bank-name" className={labelCls}>Bank</label>
                        <input
                          id="bank-name"
                          type="text"
                          value={options.bank_details.bank_name}
                          onChange={(e) => updateBankDetails("bank_name", e.target.value)}
                          className={inputCls}
                          placeholder="e.g. BDO Unibank"
                        />
                      </div>
                      <div>
                        <label htmlFor="bank-acct-no" className={labelCls}>Account Number</label>
                        <input
                          id="bank-acct-no"
                          type="text"
                          value={options.bank_details.account_number}
                          onChange={(e) => updateBankDetails("account_number", e.target.value)}
                          className={inputCls}
                          placeholder="0000-0000-0000"
                        />
                      </div>
                    </div>
                    <div className="mt-3">
                      <label htmlFor="bank-acct-name" className={labelCls}>Account Name</label>
                      <input
                        id="bank-acct-name"
                        type="text"
                        value={options.bank_details.account_name}
                        onChange={(e) => updateBankDetails("account_name", e.target.value)}
                        className={inputCls}
                        placeholder="Account holder name"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleSaveBankAsDefault}
                      disabled={updateCompanySettings.isPending}
                      className="w-full mt-3 px-3 py-1.5 text-xs font-medium text-[var(--theme-text-secondary)] border border-dashed border-[var(--theme-border-default)] rounded-lg hover:bg-[var(--theme-bg-surface-subtle)] hover:text-[var(--theme-text-primary)] transition-all disabled:opacity-50"
                    >
                      {updateCompanySettings.isPending ? "Saving…" : "Save as company default"}
                    </button>
                  </ConsoleSection>
                )}

                {/* === Contact Footer === */}
                {options.contact_footer && (
                  <ConsoleSection
                    id="footer"
                    meta={SECTION_META.footer}
                    description="Phone, email, and office address printed in the footer bar."
                    sectionRef={(el) => { sectionRefs.current.footer = el; }}
                  >
                    <ContactFooterControl
                      contactFooter={options.contact_footer}
                      onUpdateField={updateContactFooter}
                      onUpdateCallNumber={updateCallNumber}
                      onAddCallNumber={addCallNumber}
                      onRemoveCallNumber={removeCallNumber}
                      onSaveAsDefault={handleSaveContactAsDefault}
                      isSavingDefault={updateCompanySettings.isPending}
                    />
                  </ConsoleSection>
                )}

              </div>
            </div>

            {/* Sticky action footer — always pinned next to where the user is editing */}
            <div className="shrink-0 border-t border-[var(--theme-border-default)] bg-[var(--theme-bg-surface)] px-6 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${isDirty ? "bg-amber-500" : "bg-emerald-500"}`}
                  aria-hidden
                />
                <span className={`text-xs font-medium truncate ${isDirty ? "text-amber-700" : "text-[var(--theme-text-muted)]"}`}>
                  {isDirty ? "Unsaved changes" : "All changes saved"}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleSave}
                  disabled={isSaving || !isDirty}
                  className="flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-sm font-semibold text-[var(--theme-text-primary)] bg-[var(--theme-bg-surface)] border border-[var(--theme-border-default)] hover:bg-[var(--theme-bg-surface-subtle)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isSaving ? <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Save size={14} />}
                  {isSaving ? "Saving…" : "Save"}
                </button>
                <button
                  onClick={handlePrint}
                  disabled={isPrinting}
                  className="flex items-center gap-1.5 h-9 px-4 rounded-lg text-sm font-semibold text-white bg-[var(--theme-action-primary-bg)] hover:opacity-90 transition-all disabled:opacity-70"
                >
                  <Printer size={14} />
                  {isPrinting ? "Preparing…" : "Print PDF"}
                </button>
              </div>
            </div>
          </div>
        </aside>
      </div>

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

// ─── Console internals ──────────────────────────────────────────────────────

interface ConsoleSectionProps {
  id: SectionId;
  meta: { label: string; icon: React.ReactNode };
  description?: string;
  sectionRef: (el: HTMLDivElement | null) => void;
  children: React.ReactNode;
}

function ConsoleSection({ id, meta, description, sectionRef, children }: ConsoleSectionProps) {
  return (
    <section
      ref={sectionRef}
      data-section-id={id}
      aria-labelledby={`console-heading-${id}`}
      className="scroll-mt-4"
    >
      <header className="mb-3">
        <h3
          id={`console-heading-${id}`}
          className="flex items-center gap-2 text-[13px] font-semibold text-[var(--theme-text-primary)]"
        >
          <span className="text-[var(--theme-text-muted)]">{meta.icon}</span>
          {meta.label}
        </h3>
        {description && (
          <p className="mt-0.5 ml-6 text-[11px] text-[var(--theme-text-muted)] leading-relaxed">{description}</p>
        )}
      </header>
      {children}
    </section>
  );
}

interface SignatoryColumnProps {
  heading: string;
  value: { name: string; title: string };
  onChange: (field: "name" | "title", v: string) => void;
  nameAriaLabel: string;
  titleAriaLabel: string;
  namePlaceholder?: string;
}

function SignatoryColumn({ heading, value, onChange, nameAriaLabel, titleAriaLabel, namePlaceholder = "Name" }: SignatoryColumnProps) {
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-semibold text-[var(--theme-text-secondary)] uppercase tracking-wider">{heading}</div>
      <input
        type="text"
        value={value.name}
        onChange={(e) => onChange("name", e.target.value)}
        className={inputCls}
        placeholder={namePlaceholder}
        aria-label={nameAriaLabel}
      />
      <input
        type="text"
        value={value.title}
        onChange={(e) => onChange("title", e.target.value)}
        className={`${inputCls} bg-[var(--theme-bg-surface-subtle)]`}
        placeholder="Job Title"
        aria-label={titleAriaLabel}
      />
    </div>
  );
}

interface MiniPreviewProps {
  label: string;
  children: React.ReactNode;
}

function MiniPreview({ label, children }: MiniPreviewProps) {
  return (
    <div className="mt-3 rounded-lg border border-dashed border-[var(--theme-border-default)] bg-[var(--theme-bg-surface-subtle)] p-3">
      <div className="text-[10px] font-semibold text-[var(--theme-text-muted)] uppercase tracking-wider mb-1.5">{label}</div>
      {children}
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--theme-action-primary-bg)]">{k}</div>
      <div className="text-sm text-[var(--theme-text-primary)] font-medium truncate">{v}</div>
    </div>
  );
}
