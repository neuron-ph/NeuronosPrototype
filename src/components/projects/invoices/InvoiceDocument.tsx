import React from "react";
import type { Project } from "../../../types/pricing";
import type { Invoice } from "../../../types/accounting";
import type { BillingLineItem } from "../../../types/operations";
import logoImage from "figma:asset/28c84ed117b026fbf800de0882eb478561f37f4f.png";
import { formatMoney, formatDualCurrency } from "../../../utils/accountingCurrency";

export interface InvoicePrintOptions {
  signatories: {
    prepared_by: { name: string; title: string };
    approved_by: { name: string; title: string };
  };
  display: {
    show_bank_details: boolean;
    show_notes: boolean;
    show_tax_summary: boolean;
    show_letterhead?: boolean;
  };
  custom_notes?: string;
}

interface InvoiceDocumentProps {
  project: Project;
  invoice: Invoice;
  mode?: "print" | "preview";
  options?: InvoicePrintOptions;
}

export const InvoiceDocument = React.forwardRef<HTMLDivElement, InvoiceDocumentProps>(
  ({ project, invoice, mode = "print", options }, ref) => {
    
    // Determine effective signatories
    const preparedBy = options?.signatories.prepared_by.name || invoice.created_by_name || "System User";
    const preparedByTitle = options?.signatories.prepared_by.title || "Authorized User";
    
    const approvedBy = options?.signatories.approved_by.name || "MANAGEMENT";
    const approvedByTitle = options?.signatories.approved_by.title || "Authorized Signatory";
    
    // Determine display toggles (default to true if options not provided)
    const showBankDetails = options ? options.display.show_bank_details : true;
    const showNotes = options ? options.display.show_notes : true;
    const showTax = options ? options.display.show_tax_summary : true;
    const customNotes = options?.custom_notes ?? invoice.notes;

    // Helper to safe render
    const t = (val: any, fallback = "-") => {
      if (val === 0) return "0";
      return val || fallback;
    };

    // Helper to format money via the canonical formatter (locale-aware per currency).
    const fmtMoney = (val?: number, currency = "PHP") => {
        if (val === undefined || val === null) return formatMoney(0, "PHP" as any);
        return formatMoney(val, (currency || "PHP") as any);
    };

    // For foreign-currency invoices, render the PHP-base equivalent under the total.
    const isForeign = (invoice.currency && invoice.currency !== "PHP");
    const invRate = Number((invoice as any).exchange_rate);
    const hasUsableRate = isForeign && Number.isFinite(invRate) && invRate > 0;

    // Helper to render description with conversion info
    const renderDescription = (item: BillingLineItem) => {
        let desc = item.description;
        // Check if item was converted (Snapshot Strategy)
        if (item.original_currency && item.original_currency !== invoice.currency) {
            const rate = item.exchange_rate || 1;
            const originalAmt = item.original_amount?.toLocaleString('en-US', { minimumFractionDigits: 2 }) || "0.00";
            desc += ` (Converted from ${item.original_currency} ${originalAmt} @ ${rate})`;
        }
        return desc;
    };

    // Format Date Helper
    const fmtDate = (dateStr: string | undefined) => {
        if (!dateStr) return "-";
        return new Date(dateStr).toLocaleDateString('en-US', {
            month: '2-digit',
            day: '2-digit',
            year: 'numeric'
        });
    };

    // --- GROUPING LOGIC ---
    // Separate items into VAT and NON-VAT
    const vatItems = invoice.line_items?.filter(i => i.tax_type === "VAT") || [];
    const nonVatItems = invoice.line_items?.filter(i => i.tax_type !== "VAT") || [];

    const vatSubtotal = vatItems.reduce((sum, i) => sum + (i.amount || 0), 0);
    const nonVatSubtotal = nonVatItems.reduce((sum, i) => sum + (i.amount || 0), 0);

    return (
      <div 
        ref={ref} 
        className={`p-page ${mode === "print" ? "p-mode-print" : "p-mode-preview"}`}
      >
        <style>
          {`
            /* --- STEP 1: PRINT-SPEC FOUNDATION --- */
            
            /* Reset & Base */
            .p-page {
                width: 210mm;
                min-height: 297mm;
                padding: 12mm 12mm;
                background: white;
                box-sizing: border-box;
                font-family: 'Inter', Arial, Helvetica, sans-serif !important;
                color: #111827 !important;
                position: relative;
                font-size: 8.5pt;
                line-height: 1.25;
            }

            /* Typography Utilities */
            .p-font-bold { font-weight: 700 !important; }
            .p-font-black { font-weight: 900 !important; }
            .p-text-right { text-align: right !important; }
            
            /* --- ZONE A: HEADER --- */
            .p-header-zone {
                display: flex !important;
                justify-content: space-between !important;
                align-items: flex-start !important;
                margin-bottom: 24px !important;
            }
            
            /* Logo & Address */
            .p-brand-col {
                width: 40% !important;
            }
            .p-logo-img {
                height: 40px !important;
                object-fit: contain !important;
                object-position: left !important;
                margin-bottom: 8px !important;
            }
            .p-brand-addr {
                font-size: 8pt !important;
                color: #6B7280 !important;
                line-height: 1.3 !important;
            }

            /* Title & Grid */
            .p-title-col {
                width: 60% !important;
                display: flex !important;
                flex-direction: column !important;
                align-items: flex-end !important;
            }
            .p-doc-title {
                font-size: 24pt !important;
                font-weight: 800 !important;
                color: #111827 !important; /* Black Title per design */
                text-transform: uppercase !important;
                margin-bottom: 12px !important;
                letter-spacing: -0.02em !important;
            }
            
            .p-header-grid {
                display: flex !important;
                gap: 24px !important;
                text-align: right !important;
            }
            .p-h-item {
                display: flex !important;
                flex-direction: column !important;
                align-items: flex-end !important;
            }
            .p-h-label {
                font-size: 6pt !important;
                color: #6B7280 !important;
                text-transform: uppercase !important;
                font-weight: 700 !important;
                letter-spacing: 0.05em !important;
                margin-bottom: 2px !important;
            }
            .p-h-val {
                font-size: 9pt !important;
                font-weight: 600 !important;
                color: #111827 !important;
            }

            /* --- SEPARATOR LINE --- */
            .p-separator {
                border-bottom: 2px solid #111827 !important;
                margin-bottom: 24px !important;
            }

            /* --- ZONE B: BILL TO & SHIPMENT INFO --- */
            .p-zone-b {
                display: flex !important;
                justify-content: space-between !important;
                margin-bottom: 32px !important;
                gap: 40px !important;
            }
            
            /* Left: Bill To */
            .p-bill-to-col {
                width: 55% !important;
            }
            .p-bill-header {
                font-size: 8pt !important;
                font-weight: 800 !important;
                color: #111827 !important;
                text-transform: uppercase !important;
                margin-bottom: 8px !important;
            }
            .p-cust-name {
                font-size: 10pt !important;
                font-weight: 800 !important; /* Bold Customer Name */
                color: #111827 !important;
                margin-bottom: 4px !important;
            }
            .p-cust-addr {
                font-size: 9pt !important;
                color: #111827 !important;
                line-height: 1.4 !important;
                margin-bottom: 16px !important;
                white-space: pre-wrap !important;
            }
            .p-cust-tin {
                font-size: 9pt !important;
                font-weight: 800 !important;
                color: #111827 !important;
            }

            /* Right: Shipment Details */
            .p-ship-col {
                width: 45% !important;
                display: flex !important;
                flex-direction: column !important;
                gap: 16px !important;
            }
            .p-ship-item {
                display: flex !important;
                flex-direction: column !important;
            }
            .p-ship-label {
                font-size: 8pt !important;
                font-weight: 800 !important;
                color: #111827 !important;
                text-transform: uppercase !important;
                margin-bottom: 2px !important;
            }
            .p-ship-val {
                font-size: 9pt !important;
                color: #111827 !important;
                line-height: 1.3 !important;
                text-transform: uppercase !important;
            }

            /* --- ZONE D: RATE TABLE (New Format) --- */
            .p-table-container {
                margin-bottom: 16px !important;
            }
            .p-rate-table {
                width: 100% !important;
                border-collapse: collapse !important;
            }
            .p-rate-table thead {
                display: table-header-group !important;
                background-color: #E5E7EB !important; /* Light gray header bg */
            }
            .p-rate-th {
                text-align: left !important;
                font-size: 7pt !important;
                font-weight: 700 !important;
                color: #374151 !important;
                text-transform: uppercase !important;
                letter-spacing: 0.05em !important;
                padding: 6px 4px !important;
            }
            .p-rate-row td {
                padding: 8px 4px !important;
                font-size: 8pt !important;
                color: #111827 !important;
                vertical-align: top !important;
                border-bottom: none !important; /* Clean look */
            }
            
            /* Column Widths */
            .p-col-desc { width: 35% !important; font-weight: 600 !important; }
            .p-col-rem { width: 25% !important; }
            .p-col-qty { width: 8% !important; text-align: center !important; }
            .p-col-rate { width: 12% !important; text-align: right !important; }
            .p-col-tax { width: 8% !important; text-align: center !important; }
            .p-col-amt { width: 12% !important; text-align: right !important; }
            
            /* Group Subtotal Row */
            .p-group-subtotal td {
                padding-top: 8px !important;
                padding-bottom: 16px !important;
                text-align: right !important;
                font-weight: 700 !important;
                font-size: 8.5pt !important;
                color: #111827 !important;
            }
            
            .p-spacer-row td {
                height: 16px !important;
            }

            /* --- FOOTER SECTION --- */
            .p-footer-grid {
                display: flex !important;
                justify-content: space-between !important;
                align-items: flex-start !important;
                margin-top: 32px !important;
                padding-top: 8px !important;
                border-top: 1px dashed #D1D5DB !important; /* Dashed separator */
            }
            .p-terms-col {
                width: 55% !important;
                padding-right: 24px !important;
            }
            .p-terms-header {
                font-size: 7pt !important;
                font-weight: 800 !important;
                text-transform: uppercase !important;
                margin-bottom: 4px !important;
                color: #9CA3AF !important; /* Muted header */
            }
            .p-terms-text {
                font-size: 7pt !important;
                color: #6B7280 !important;
                line-height: 1.3 !important;
                white-space: pre-wrap !important;
            }
            
            .p-totals-col {
                width: 40% !important;
            }
            .p-total-row {
                display: flex !important;
                justify-content: space-between !important;
                margin-bottom: 6px !important;
                font-size: 9pt !important;
            }
            .p-total-label {
                color: #6B7280 !important;
                text-transform: uppercase !important;
                letter-spacing: 0.05em !important;
                font-size: 8pt !important;
            }
            .p-total-val {
                font-weight: 600 !important;
                color: #111827 !important;
                text-align: right !important;
            }
            .p-grand-total {
                border-top: 2px solid #111827 !important;
                margin-top: 12px !important;
                padding-top: 12px !important;
                display: flex !important;
                justify-content: space-between !important;
                align-items: center !important;
            }
            .p-gt-label {
                font-size: 10pt !important;
                font-weight: 900 !important;
                color: #111827 !important;
            }
            .p-gt-val {
                font-size: 12pt !important;
                font-weight: 900 !important;
                color: #111827 !important;
            }

            /* --- SIGNATORIES --- */
            .p-signatories-grid {
                display: grid !important;
                grid-template-columns: 1fr 1fr 1fr !important;
                gap: 48px !important;
                margin-top: 48px !important;
                page-break-inside: avoid !important;
            }
            .p-sig-box {
                display: flex !important;
                flex-direction: column !important;
            }
            .p-sig-action {
                font-size: 7pt !important;
                color: #6B7280 !important;
                margin-bottom: 32px !important;
                font-style: italic !important;
            }
            .p-sig-line {
                border-bottom: 1px solid #111827 !important;
                margin-bottom: 8px !important;
            }
            .p-sig-name {
                font-size: 9pt !important;
                font-weight: 700 !important;
                color: #111827 !important;
                text-transform: uppercase !important;
            }
            .p-sig-title {
                font-size: 7pt !important;
                color: #4B5563 !important;
            }

            /* --- CONTACT FOOTER --- */
            .p-contact-footer {
                margin-top: auto !important;
                padding-top: 16px !important;
                border-top: 3px solid #12332B !important;
                display: flex !important;
                justify-content: space-between !important;
                page-break-inside: avoid !important;
                position: absolute;
                bottom: 12mm;
                left: 12mm;
                right: 12mm;
            }
            .p-contact-col {
                display: flex !important;
                flex-direction: column !important;
            }
            .p-contact-label {
                font-size: 8pt !important;
                font-weight: 800 !important;
                color: #12332B !important;
                margin-bottom: 4px !important;
            }
            .p-contact-text {
                font-size: 7.5pt !important;
                color: #111827 !important;
                line-height: 1.4 !important;
            }

          `}
        </style>

        {/* --- ZONE A: HEADER --- */}
        <div className="p-header-zone">
            {/* Left: Branding */}
            <div className="p-brand-col">
                <img src={logoImage} className="p-logo-img" alt="Neuron Logo" />
                <div className="p-brand-addr">
                    Unit 301, Great Wall Bldg., 136 Yakal St.,<br/>
                    San Antonio Village, Makati City, Philippines
                </div>
            </div>

            {/* Right: Title & Grid */}
            <div className="p-title-col">
                <div className="p-doc-title">BILLING STATEMENT</div>
                <div className="p-header-grid">
                    <div className="p-h-item">
                        <span className="p-h-label">INVOICE NO.</span>
                        <span className="p-h-val">{t(invoice.invoice_number)}</span>
                    </div>
                    <div className="p-h-item">
                        <span className="p-h-label">DATE ISSUED</span>
                        <span className="p-h-val">{fmtDate(invoice.invoice_date as string | undefined)}</span>
                    </div>
                    <div className="p-h-item">
                        <span className="p-h-label">CREDIT TERMS</span>
                        <span className="p-h-val">{t(invoice.credit_terms, "NET 15")}</span>
                    </div>
                    <div className="p-h-item">
                        <span className="p-h-label">VALID UNTIL</span>
                        <span className="p-h-val">{fmtDate(invoice.due_date as string | undefined)}</span>
                    </div>
                </div>
            </div>
        </div>

        {/* Separator Line */}
        <div className="p-separator"></div>

        {/* --- ZONE B: BILL TO & SHIPMENT INFO --- */}
        <div className="p-zone-b">
            {/* Left Column: Bill To */}
            <div className="p-bill-to-col">
                <div className="p-bill-header">BILL TO:</div>
                <div className="p-cust-name">{t(invoice.customer_name)}</div>
                <div className="p-cust-addr">{t(invoice.customer_address, "No address provided")}</div>
                {invoice.customer_tin && (
                    <div className="p-cust-tin">TIN: {invoice.customer_tin}</div>
                )}
            </div>

            {/* Right Column: Shipment Info */}
            <div className="p-ship-col">
                {invoice.bl_number && (
                    <div className="p-ship-item">
                        <span className="p-ship-label">BL NO.:</span>
                        <span className="p-ship-val">{invoice.bl_number}</span>
                    </div>
                )}
                
                {invoice.commodity_description && (
                     <div className="p-ship-item">
                        <span className="p-ship-label">COMMODITY DESCRIPTION:</span>
                        <span className="p-ship-val">{invoice.commodity_description}</span>
                    </div>
                )}

                {invoice.consignee && (
                    <div className="p-ship-item">
                        <span className="p-ship-label">CONSIGNEE:</span>
                        <span className="p-ship-val">{invoice.consignee}</span>
                    </div>
                )}
            </div>
        </div>

        {/* --- ZONE D: RATE TABLE (New Format) --- */}
        <div className="p-table-container">
            <table className="p-rate-table">
                <thead>
                    <tr>
                        <th className="p-rate-th p-col-desc">PARTICULARS</th>
                        <th className="p-rate-th p-col-rem">REMARKS</th>
                        <th className="p-rate-th p-col-qty">QTY</th>
                        <th className="p-rate-th p-col-rate">RATE</th>
                        <th className="p-rate-th p-col-tax">TAX</th>
                        <th className="p-rate-th p-col-amt">AMOUNT</th>
                    </tr>
                </thead>
                <tbody>
                    {/* VAT ITEMS GROUP */}
                    {vatItems.length > 0 && (
                        <>
                            {vatItems.map((item, idx) => (
                                <tr key={`vat-${item.id || idx}`} className="p-rate-row">
                                    <td className="p-col-desc">{renderDescription(item)}</td>
                                    <td className="p-col-rem">{item.remarks}</td>
                                    <td className="p-col-qty">{item.quantity}</td>
                                    <td className="p-col-rate">{fmtMoney(item.unit_price, invoice.currency)}</td>
                                    <td className="p-col-tax">VAT</td>
                                    <td className="p-col-amt">{fmtMoney(item.amount, invoice.currency)}</td>
                                </tr>
                            ))}
                            <tr className="p-group-subtotal">
                                <td colSpan={6}>
                                    Subtotal: {fmtMoney(vatSubtotal, invoice.currency)}
                                </td>
                            </tr>
                        </>
                    )}

                    {/* SPACER IF BOTH EXIST */}
                    {vatItems.length > 0 && nonVatItems.length > 0 && (
                        <tr className="p-spacer-row"><td colSpan={6}></td></tr>
                    )}

                    {/* NON-VAT ITEMS GROUP */}
                    {nonVatItems.length > 0 && (
                        <>
                            {nonVatItems.map((item, idx) => (
                                <tr key={`nonvat-${item.id || idx}`} className="p-rate-row">
                                    <td className="p-col-desc">{renderDescription(item)}</td>
                                    <td className="p-col-rem">{item.remarks}</td>
                                    <td className="p-col-qty">{item.quantity}</td>
                                    <td className="p-col-rate">{fmtMoney(item.unit_price, invoice.currency)}</td>
                                    <td className="p-col-tax">No VAT</td>
                                    <td className="p-col-amt">{fmtMoney(item.amount, invoice.currency)}</td>
                                </tr>
                            ))}
                            <tr className="p-group-subtotal">
                                <td colSpan={6}>
                                    Subtotal: {fmtMoney(nonVatSubtotal, invoice.currency)}
                                </td>
                            </tr>
                        </>
                    )}

                    {/* EMPTY STATE */}
                    {vatItems.length === 0 && nonVatItems.length === 0 && (
                         <tr><td colSpan={6} className="text-center italic py-4">No items selected</td></tr>
                    )}
                </tbody>
            </table>
        </div>

        {/* --- FOOTER SECTION --- */ }
        <div className="p-footer-grid">
            <div className="p-terms-col">
                <div className="p-terms-text">
                    Please contact us within seven (7) days should there be any discrepancies.<br/>
                    Interest of 1% & penalty of 2% per month will be charged on overdue invoices calculated from due date until the date of actual payment.
                </div>
                {showNotes && customNotes && (
                    <div style={{ marginTop: '16px' }}>
                        <div className="p-terms-header">NOTES / INSTRUCTIONS</div>
                        <div className="p-terms-text">{customNotes}</div>
                    </div>
                )}
            </div>
            <div className="p-totals-col">
                <div className="p-total-row">
                    <span className="p-total-label">SUBTOTAL</span>
                    <span className="p-total-val">{fmtMoney(invoice.subtotal as number | undefined, invoice.currency as string | undefined)}</span>
                </div>
                {showTax && (
                    <div className="p-total-row">
                        <span className="p-total-label">TAX</span>
                        <span className="p-total-val">{fmtMoney(invoice.tax_amount as number | undefined, invoice.currency as string | undefined)}</span>
                    </div>
                )}
                <div className="p-total-row">
                    <span className="p-total-label">TOTAL</span>
                    <span className="p-total-val">{fmtMoney(invoice.total_amount as number | undefined, invoice.currency as string | undefined)}</span>
                </div>
                <div className="p-grand-total">
                    <span className="p-gt-label">BALANCE DUE</span>
                    <span className="p-gt-val">{fmtMoney(invoice.total_amount as number | undefined, invoice.currency as string | undefined)}</span>
                </div>
                {hasUsableRate && (
                    <div className="p-total-row" style={{ marginTop: "6px", fontSize: "10px", color: "#666", justifyContent: "flex-end" }}>
                        <span style={{ fontStyle: "italic" }}>
                            {formatDualCurrency({
                                amount: Number(invoice.total_amount) || 0,
                                currency: invoice.currency as any,
                                exchangeRate: invRate,
                            })}
                        </span>
                    </div>
                )}
            </div>
        </div>

        {/* --- ZONE F: SIGNATORIES --- */}
        <div className="p-signatories-grid">
            <div className="p-sig-box">
                <div className="p-sig-action">Prepared by:</div>
                <div className="p-sig-line"></div>
                <div className="p-sig-name">{preparedBy}</div>
                <div className="p-sig-title">{preparedByTitle}</div>
            </div>
            <div className="p-sig-box">
                <div className="p-sig-action">Approved by:</div>
                <div className="p-sig-line"></div>
                <div className="p-sig-name">{approvedBy}</div>
                <div className="p-sig-title">{approvedByTitle}</div>
            </div>
        </div>

        {/* --- ZONE G: CONTACT FOOTER --- */}
        {showBankDetails && (
            <div className="p-contact-footer">
                <div className="p-contact-col">
                    <span className="p-contact-label">BANK DETAILS</span>
                    <span className="p-contact-text">
                        Bank: BDO Unibank, Inc.<br/>
                        Acct Name: NEURON LOGISTICS INC.<br/>
                        Acct No: 123-456-7890
                    </span>
                </div>
                <div className="p-contact-col">
                    <span className="p-contact-label">CONTACT US</span>
                    <span className="p-contact-text">
                        www.neuron-os.com<br/>
                        support@neuron-os.com<br/>
                        +63 2 8888 1234
                    </span>
                </div>
            </div>
        )}

      </div>
    );
  }
);