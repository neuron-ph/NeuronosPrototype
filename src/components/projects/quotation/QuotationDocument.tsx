import React from "react";
import type { Project, QuotationNew, AddressStruct, QuotationChargeCategory } from "../../../types/pricing";
import { QuotationPrintOptions } from "./screen/useQuotationDocumentState";
import logoImage from "figma:asset/28c84ed117b026fbf800de0882eb478561f37f4f.png";

interface QuotationDocumentProps {
  project: Project;
  quotation?: QuotationNew;
  mode?: "print" | "preview";
  currentUser?: { name: string; email: string; } | null;
  options?: QuotationPrintOptions;
}

export const QuotationDocument = React.forwardRef<HTMLDivElement, QuotationDocumentProps>(
  ({ project, quotation: quotationProp, mode = "print", currentUser, options }, ref) => {
    // Prefer the direct quotation prop, then project.quotation, then project itself.
    const quote = quotationProp ?? (project as any).quotation ?? (project as any) as QuotationNew;
    // Backward-compat: old saves stored PDF fields in details JSONB with pdf_ prefix.
    const legacy = quote as any;

    // Signatories — never fall back to created_by (it is a raw auth UUID)
    const preparedBy = options?.signatories.prepared_by.name || quote?.prepared_by || legacy?.pdf_prepared_by || currentUser?.name || "System User";
    const preparedByTitle = options?.signatories.prepared_by.title || quote?.prepared_by_title || legacy?.pdf_prepared_by_title || "Sales Representative";
    const approvedBy = options?.signatories.approved_by.name || quote?.approved_by || legacy?.pdf_approved_by || "Management";
    // NOTE: old data used prepared_by_title here by mistake — now reads the correct field
    const approvedByTitle = options?.signatories.approved_by.title || quote?.approved_by_title || legacy?.pdf_approved_by_title || "Authorized Signatory";

    // Addressed-to (Conforme signatory)
    const addressedName = options?.addressed_to?.name || quote?.addressed_to_name || legacy?.pdf_addressed_to_name || quote?.contact_person_name || "";
    const addressedTitle = options?.addressed_to?.title || quote?.addressed_to_title || legacy?.pdf_addressed_to_title || "";

    // Validity & payment terms
    const validUntil = options?.validity_override || quote?.valid_until || quote?.expiry_date;
    const paymentTerms = options?.payment_terms || quote?.payment_terms || legacy?.pdf_payment_terms || "";

    // Display toggles (default to true if options not provided)
    const showBankDetails = options ? options.display.show_bank_details : true;
    const showNotes = options ? options.display.show_notes : true;
    const showTax = options ? options.display.show_tax_summary : true;
    const customNotes = options?.custom_notes || legacy?.pdf_custom_notes || quote?.notes || "";

    // Helper to safe render
    const t = (val: any, fallback = "-") => {
      if (val === 0) return "0";
      return val || fallback;
    };

    // Helper to format weight
    const fmtWeight = (val?: number) => val ? `${val} kg` : "-";

    // Helper to format money
    const fmtMoney = (val?: number, currency = "") => {
        if (val === undefined || val === null) return "0.00";
        return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    // Helper to format address
    const fmtAddress = (addr: string | AddressStruct | undefined) => {
        if (!addr) return "-";
        if (typeof addr === 'string') return addr;
        return [addr.address, addr.city, addr.province, addr.country, addr.postal_code].filter(Boolean).join(", ");
    };
    
    // Helper: effective amount for one line item.
    // Prefers stored amount when non-zero; falls back to final_price (selling items) or
    // price × qty × forex (legacy items).
    const effectiveAmt = (item: any): number => {
        if (item.amount !== undefined && item.amount !== null && item.amount !== 0) return item.amount;
        const unitPrice = item.final_price ?? item.price ?? 0;
        return Number(unitPrice) * Number(item.quantity || 1) * Number(item.forex_rate || 1);
    };

    // Prefer selling_price (dual-section pricing with margins) over legacy charge_categories.
    // Both share the same { id, category_name, line_items, subtotal } shape.
    const categories: QuotationChargeCategory[] =
        (quote?.selling_price?.length ? quote.selling_price : null) ??
        (project.charge_categories?.length ? project.charge_categories : null) ??
        (quote?.charge_categories?.length ? quote.charge_categories : null) ??
        [];

    const storedSummary = (project as any).financial_summary || quote?.financial_summary;
    let summary = storedSummary && storedSummary.grand_total > 0 ? storedSummary : (() => {
        let taxable = 0;
        let nonTaxable = 0;
        categories.forEach(cat => {
            cat.line_items?.forEach(item => {
                const amt = effectiveAmt(item);
                if (item.is_taxed) taxable += amt;
                else nonTaxable += amt;
            });
        });
        const taxRate = storedSummary?.tax_rate ?? 0.12;
        const taxAmt = taxable * taxRate;
        return { subtotal_non_taxed: nonTaxable, subtotal_taxed: taxable, tax_rate: taxRate, tax_amount: taxAmt, other_charges: 0, grand_total: nonTaxable + taxable + taxAmt };
    })();

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

            /* Neuron Brand Colors */
            .p-text-green { color: #12332B !important; }
            .p-text-teal { color: #0F766E !important; }
            .p-bg-green { background-color: #12332B !important; }
            
            /* Typography Utilities */
            .p-font-bold { font-weight: 700 !important; }
            .p-font-black { font-weight: 900 !important; }
            .p-text-xs { font-size: 7pt !important; }
            .p-text-lg { font-size: 11pt !important; }
            .p-italic { font-style: italic !important; }
            .p-uppercase { text-transform: uppercase !important; }
            .p-text-gray { color: #6B7280 !important; }
            .p-text-right { text-align: right !important; }
            .p-text-center { text-align: center !important; }

            /* Label / Value System */
            .p-label {
                font-size: 6.5pt !important;
                color: #6B7280 !important;
                text-transform: uppercase !important;
                font-weight: 600 !important;
                letter-spacing: 0.05em !important;
                display: block !important;
                margin-bottom: 1px !important;
            }
            .p-value {
                font-size: 8.5pt !important;
                font-weight: 600 !important;
                color: #111827 !important;
            }

            /* --- HEADER SECTION (Merged Zone A & B) --- */
            .p-header-top {
                display: flex !important;
                justify-content: space-between !important;
                align-items: flex-start !important;
                margin-bottom: 12px !important;
                border-bottom: 3px solid #12332B !important;
                padding-bottom: 12px !important;
            }

            /* Left: Logo & Address */
            .p-brand-col {
                display: flex !important;
                flex-direction: column !important;
                gap: 8px !important;
                width: 50% !important;
            }
            .p-logo-img {
                height: 40px !important; /* Fixed height for Neuron Logo */
                object-fit: contain !important;
                object-position: left !important;
            }
            .p-address-block {
                font-size: 7.5pt !important;
                color: #6B7280 !important;
                line-height: 1.3 !important;
            }

            /* Right: Title & Ref Grid */
            .p-title-col {
                width: 50% !important;
                display: flex !important;
                flex-direction: column !important;
                align-items: flex-end !important;
            }
            .p-doc-title {
                font-size: 24pt !important;
                font-weight: 900 !important;
                color: #12332B !important;
                letter-spacing: 0.05em !important;
                margin-bottom: 8px !important;
                line-height: 1 !important;
            }
            .p-ref-grid {
                display: flex !important;
                gap: 24px !important;
            }
            .p-ref-item {
                text-align: right !important;
            }
            .p-ref-label {
                font-size: 6.5pt !important;
                color: #6B7280 !important;
                text-transform: uppercase !important;
                font-weight: 700 !important;
                display: block !important;
                margin-bottom: 2px !important;
            }
            .p-ref-value {
                font-size: 9pt !important;
                color: #111827 !important;
                font-weight: 600 !important;
            }

            /* Customer Section */
            .p-customer-header {
                font-size: 8pt !important;
                font-weight: 800 !important;
                color: #0F766E !important; /* Teal Accent */
                text-transform: uppercase !important;
                letter-spacing: 0.05em !important;
                margin-bottom: 6px !important;
            }
            .p-customer-grid {
                display: grid !important;
                grid-template-columns: 1fr 1fr !important;
                gap: 24px !important;
                margin-bottom: 16px !important;
                padding-bottom: 12px !important;
                border-bottom: 1px dashed #E5E7EB !important;
            }
            .p-cust-row {
                display: flex !important;
                margin-bottom: 2px !important;
                align-items: baseline !important;
            }
            .p-cust-label {
                width: 100px !important;
                flex-shrink: 0 !important;
                font-size: 7pt !important;
                color: #6B7280 !important;
                font-weight: 600 !important;
                text-transform: uppercase !important;
            }
            .p-cust-val {
                font-size: 9pt !important;
                font-weight: 600 !important;
                color: #111827 !important;
            }

            /* --- ZONE C: SHIPMENT DETAILS --- */
            .p-section-header {
                font-size: 9pt !important;
                font-weight: 800 !important;
                color: #12332B !important;
                text-transform: uppercase !important;
                letter-spacing: 0.05em !important;
                border-bottom: 1px solid var(--theme-border-default) !important;
                padding-bottom: 6px !important;
                margin-bottom: 10px !important;
                margin-top: 16px !important;
            }
            .p-shipment-grid {
                display: grid !important;
                grid-template-columns: repeat(4, 1fr) !important;
                gap: 10px 24px !important; /* Row gap 10px, Col gap 24px */
                margin-bottom: 20px !important;
            }
            .p-shipment-cell {
                display: flex !important;
                flex-direction: column !important;
                gap: 1px !important;
            }
            .p-col-span-2 { grid-column: span 2 !important; }
            .p-col-span-4 { grid-column: span 4 !important; }

            .p-shipment-label {
                font-size: 6.5pt !important;
                color: #6B7280 !important;
                text-transform: uppercase !important;
                font-weight: 700 !important;
                letter-spacing: 0.05em !important;
            }
            .p-shipment-value {
                font-size: 8.5pt !important;
                font-weight: 700 !important;
                color: #111827 !important;
                line-height: 1.3 !important;
            }

            /* --- ZONE D: RATE TABLE --- */
            .p-table-container {
                margin-bottom: 16px !important;
            }
            .p-rate-table {
                width: 100% !important;
                border-collapse: collapse !important;
            }
            .p-rate-table thead {
                display: table-header-group !important;
            }
            .p-rate-table tr {
                page-break-inside: avoid !important;
                break-inside: avoid !important;
            }
            .p-rate-th {
                text-align: left !important;
                font-size: 7pt !important;
                font-weight: 700 !important;
                color: #111827 !important;
                text-transform: uppercase !important;
                letter-spacing: 0.05em !important;
                border-bottom: 2px solid #111827 !important;
                border-top: 2px solid #111827 !important;
                padding: 4px 4px !important;
            }
            .p-cat-header {
                font-size: 8pt !important;
                font-weight: 800 !important;
                color: #12332B !important;
                text-transform: uppercase !important;
                padding: 8px 4px 4px 4px !important;
                page-break-after: avoid !important;
                break-after: avoid !important;
            }
            .p-rate-row td {
                padding: 2px 4px !important;
                font-size: 8pt !important;
                color: #374151 !important;
                vertical-align: top !important;
                page-break-inside: avoid !important;
                break-inside: avoid !important;
            }
            .p-rate-desc { width: 32% !important; }
            .p-rate-price { width: 12% !important; text-align: right !important; }
            .p-rate-cur { width: 6% !important; text-align: center !important; }
            .p-rate-qty { width: 6% !important; text-align: center !important; }
            .p-rate-forex { width: 6% !important; text-align: center !important; }
            .p-rate-tax { width: 6% !important; text-align: center !important; }
            .p-rate-remarks { width: 15% !important; }
            .p-rate-amount { width: 17% !important; text-align: right !important; font-weight: 600 !important; color: #111827 !important; }
            
            .p-subtotal-row td {
                padding-top: 4px !important;
                padding-bottom: 8px !important;
            }
            .p-subtotal-label {
                font-size: 7pt !important;
                font-weight: 700 !important;
                text-transform: uppercase !important;
                text-align: right !important;
                padding-right: 12px !important;
            }
            .p-subtotal-val {
                border-top: 1px solid #111827 !important;
                padding-top: 2px !important;
                font-weight: 700 !important;
                text-align: right !important;
            }

            /* --- FOOTER SECTION --- */
            .p-footer-grid {
                display: flex !important;
                justify-content: space-between !important;
                align-items: flex-start !important;
                margin-top: 8px !important;
                padding-top: 8px !important;
                border-top: 2px solid #111827 !important;
            }
            .p-terms-col {
                width: 60% !important;
                padding-right: 24px !important;
            }
            .p-terms-header {
                font-size: 7pt !important;
                font-weight: 800 !important;
                text-transform: uppercase !important;
                margin-bottom: 4px !important;
            }
            .p-terms-list {
                font-size: 7.5pt !important;
                color: #4B5563 !important;
                list-style-type: disc !important;
                padding-left: 12px !important;
                line-height: 1.3 !important;
            }
            .p-totals-col {
                width: 35% !important;
            }
            .p-total-row {
                display: flex !important;
                justify-content: space-between !important;
                margin-bottom: 2px !important;
                font-size: 8.5pt !important;
            }
            .p-total-label {
                color: #4B5563 !important;
            }
            .p-total-val {
                font-weight: 600 !important;
                color: #111827 !important;
            }
            .p-grand-total {
                border-top: 2px solid #111827 !important;
                margin-top: 6px !important;
                padding-top: 6px !important;
                font-size: 10pt !important;
                font-weight: 900 !important;
                color: #12332B !important;
                display: flex !important;
                justify-content: space-between !important;
            }

            /* --- ZONE F: SIGNATORIES --- */
            .p-signatories-grid {
                display: grid !important;
                grid-template-columns: 1fr 1fr 1fr !important;
                gap: 48px !important;
                margin-top: 32px !important;
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

            /* --- ZONE G: CONTACT FOOTER --- */
            .p-contact-footer {
                margin-top: 32px !important;
                padding-top: 16px !important;
                border-top: 3px solid #12332B !important;
                display: flex !important;
                justify-content: space-between !important;
                page-break-inside: avoid !important;
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

        {/* --- ZONE A: HEADER TOP --- */}
        <div className="p-header-top">
            {/* Left Column: Logo & Address */}
            <div className="p-brand-col">
                <img src={logoImage} className="p-logo-img" alt="Neuron Logo" />
                <div className="p-address-block">
                    Unit 301, Great Wall Bldg., 136 Yakal St.,<br/>
                    San Antonio Village, Makati City, Philippines<br/>
                    +63 2 8888 1234 | inquiries@neuron-os.com
                </div>
            </div>

            {/* Right Column: Title & Refs */}
            <div className="p-title-col">
                <div className="p-doc-title">QUOTATION</div>
                
                <div className="p-ref-grid">
                    <div className="p-ref-item">
                        <span className="p-ref-label">Reference No.</span>
                        <span className="p-ref-value">{t(quote?.quote_number || (quote as any)?.quotation_number || project.quotation_number || project.project_number)}</span>
                    </div>
                    <div className="p-ref-item">
                        <span className="p-ref-label">Date Issued</span>
                        <span className="p-ref-value">{quote?.created_date || quote?.created_at ? new Date(quote.created_date || quote.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : new Date().toLocaleDateString()}</span>
                    </div>
                    <div className="p-ref-item">
                        <span className="p-ref-label">Valid Until</span>
                        <span className="p-ref-value">{validUntil ? new Date(validUntil).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "30 Days"}</span>
                    </div>
                </div>
            </div>
        </div>

        {/* --- ZONE B: CUSTOMER DETAILS --- */}
        <div className="p-customer-header">PREPARED FOR:</div>
        <div className="p-customer-grid">
            {/* Col 1 */}
            <div>
                <div className="p-cust-row">
                    <span className="p-cust-label">Customer:</span>
                    <span className="p-cust-val">{t(project.customer_name)}</span>
                </div>
                {quote?.contact_person_name && (
                    <div className="p-cust-row">
                        <span className="p-cust-label">Attention:</span>
                        <span className="p-cust-val">{quote.contact_person_name}</span>
                    </div>
                )}
            </div>

            {/* Col 2 */}
            <div>
                 <div className="p-cust-row">
                    <span className="p-cust-label">Company:</span>
                    <span className="p-cust-val">{t(quote?.customer_company || quote?.customer_organization || project.customer_name)}</span>
                </div>
            </div>
        </div>

        {/* --- ZONE C: SHIPMENT DETAILS --- */}
        <div className="p-section-header">SHIPMENT DETAILS</div>
        <div className="p-shipment-grid">
            
            {/* ROW 1 */}
            <div className="p-shipment-cell">
                <span className="p-shipment-label">MOVEMENT</span>
                <span className="p-shipment-value">{t(project.movement)}</span>
            </div>
            <div className="p-shipment-cell">
                <span className="p-shipment-label">CATEGORY</span>
                <span className="p-shipment-value">{t(project.category)}</span>
            </div>
            <div className="p-shipment-cell">
                <span className="p-shipment-label">FREIGHT TYPE</span>
                <span className="p-shipment-value">{t(quote?.shipment_freight || "LCL")}</span>
            </div>
            <div className="p-shipment-cell">
                <span className="p-shipment-label">SERVICES</span>
                <span className="p-shipment-value">{t(project.services?.join(", "))}</span>
            </div>

            {/* ROW 2 */}
            <div className="p-shipment-cell">
                <span className="p-shipment-label">INCOTERM</span>
                <span className="p-shipment-value">{t(project.incoterm)}</span>
            </div>
            <div className="p-shipment-cell">
                <span className="p-shipment-label">CARRIER</span>
                <span className="p-shipment-value">{t(project.carrier, "TBA")}</span>
            </div>
            <div className="p-shipment-cell">
                <span className="p-shipment-label">TRANSIT & ROUTING</span>
                <span className="p-shipment-value">{t(
                    project.transit_time
                        ? `${project.transit_time}${project.routing_info ? ` · ${project.routing_info}` : ""}`
                        : (quote as any)?.transit_days
                            ? `${(quote as any).transit_days} day(s)${project.routing_info ? ` · ${project.routing_info}` : ""}`
                            : project.routing_info
                )}</span>
            </div>
            <div className="p-shipment-cell">
                <span className="p-shipment-label">COMMODITY</span>
                <span className="p-shipment-value">{t(project.commodity)}</span>
            </div>

            {/* ROW 3 */}
            <div className="p-shipment-cell">
                <span className="p-shipment-label">GROSS WEIGHT</span>
                <span className="p-shipment-value">{fmtWeight(project.gross_weight)}</span>
            </div>
            <div className="p-shipment-cell">
                <span className="p-shipment-label">CHG. WEIGHT</span>
                <span className="p-shipment-value">{fmtWeight(project.chargeable_weight)}</span>
            </div>
            <div className="p-shipment-cell">
                <span className="p-shipment-label">DIMS</span>
                <span className="p-shipment-value">{t(project.dimensions)}</span>
            </div>
            <div className="p-shipment-cell">
                <span className="p-shipment-label">VOLUME</span>
                <span className="p-shipment-value">{t(project.volume)}</span>
            </div>

            {/* ROW 4 */}
            <div className="p-shipment-cell p-col-span-2">
                <span className="p-shipment-label">PORT OF LOADING</span>
                <span className="p-shipment-value">{t(project.pol_aol)}</span>
            </div>
            <div className="p-shipment-cell p-col-span-2">
                <span className="p-shipment-label">PORT OF DISCHARGE</span>
                <span className="p-shipment-value">{t(project.pod_aod)}</span>
            </div>

            {/* ROW 5 (Address) */}
            <div className="p-shipment-cell p-col-span-4">
                <span className="p-shipment-label">COLLECTION ADDRESS</span>
                <span className="p-shipment-value" style={{ fontWeight: 500 }}>
                    {fmtAddress(project.collection_address || project.pickup_address)}
                </span>
            </div>

        </div>

        {/* --- ZONE D: RATE TABLE --- */}
        <div className="p-table-container">
            <table className="p-rate-table">
                <thead>
                    <tr>
                        <th className="p-rate-th p-rate-desc">DESCRIPTION</th>
                        <th className="p-rate-th p-rate-price">PRICE</th>
                        <th className="p-rate-th p-rate-cur">CUR</th>
                        <th className="p-rate-th p-rate-qty">QTY</th>
                        <th className="p-rate-th p-rate-forex">FOREX</th>
                        <th className="p-rate-th p-rate-tax">TAXED</th>
                        <th className="p-rate-th p-rate-remarks">REMARKS</th>
                        <th className="p-rate-th p-rate-amount">AMOUNT</th>
                    </tr>
                </thead>
                <tbody>
                    {categories.flatMap((cat, idx) => {
                        const categoryKey = cat.id || idx;
                        const rows = [];

                        // Category Header
                        rows.push(
                            <tr key={`cat-${categoryKey}-header`}>
                                <td colSpan={8} className="p-cat-header">{cat.category_name}</td>
                            </tr>
                        );
                        
                        // Line Items
                        if (cat.line_items) {
                            cat.line_items.forEach((item: any, itemIdx: number) => {
                                // SellingPriceLineItem has final_price (base_cost + markup).
                                const displayPrice = item.final_price ?? item.price;
                                rows.push(
                                    <tr key={`cat-${categoryKey}-item-${item.id || itemIdx}`} className="p-rate-row">
                                        <td>{item.description}</td>
                                        <td className="p-rate-price">{fmtMoney(displayPrice)}</td>
                                        <td className="p-rate-cur">{item.currency}</td>
                                        <td className="p-rate-qty">{item.quantity}</td>
                                        <td className="p-rate-forex">{item.forex_rate}</td>
                                        <td className="p-rate-tax">{item.is_taxed ? "x" : ""}</td>
                                        <td>{item.remarks || item.unit}</td>
                                        <td className="p-rate-amount">{fmtMoney(effectiveAmt(item))}</td>
                                    </tr>
                                );
                            });
                        }

                        // Category Subtotal — recompute from line items when stored subtotal is 0
                        const catSubtotal = (cat.subtotal && cat.subtotal !== 0)
                            ? cat.subtotal
                            : cat.line_items?.reduce((s: number, i: any) => s + effectiveAmt(i), 0) ?? 0;
                        rows.push(
                            <tr key={`cat-${categoryKey}-subtotal`} className="p-subtotal-row">
                                <td colSpan={7} className="p-subtotal-label">SUBTOTAL</td>
                                <td className="p-subtotal-val">{fmtMoney(catSubtotal)}</td>
                            </tr>
                        );

                        return rows;
                    })}
                    
                    {categories.length === 0 && (
                         <tr>
                            <td colSpan={8} style={{ padding: '24px', textAlign: 'center', color: '#9CA3AF', fontStyle: 'italic' }}>
                                No charges added to this quotation.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
        
        {/* --- ZONE E: FOOTER & FINANCIALS --- */}
        <div className="p-footer-grid">
            {/* Left: Terms & Notes */}
            <div className="p-terms-col">
                {showNotes && (
                    <>
                        <div className="p-terms-header">TERMS AND CONDITIONS</div>
                        <div className="p-terms-list" style={{ whiteSpace: "pre-line" }}>
                            {customNotes || (
                                <ul style={{ margin: 0, paddingLeft: "12px" }}>
                                    <li>Customer will be billed after indicating acceptance of this quote.</li>
                                    <li>Please mail the signed price quote to the address above.</li>
                                    <li>5% percent of the freight and the brokerage charges are both subject to 12% VAT.</li>
                                    <li>Rates are subject to change without prior notice.</li>
                                </ul>
                            )}
                        </div>
                    </>
                )}

                {showBankDetails && (
                    <div style={{ marginTop: "16px" }}>
                        <div className="p-terms-header">BANK DETAILS</div>
                        <div className="p-terms-list">
                            <div>Bank: <strong>BDO Unibank</strong></div>
                            <div>Acct Name: <strong>Neuron Logistics Inc.</strong></div>
                            <div>Acct No: <strong>0012-3456-7890</strong></div>
                        </div>
                    </div>
                )}
            </div>
            
            {/* Right: Totals */}
            <div className="p-totals-col">
                 <div className="p-total-row">
                    <span className="p-total-label">Subtotal</span>
                    <span className="p-total-val">{project.currency} {fmtMoney(summary.subtotal_non_taxed + summary.subtotal_taxed)}</span>
                 </div>
                 
                 {showTax && (
                     <>
                         <div className="p-total-row">
                            <span className="p-total-label">Taxable</span>
                            <span className="p-total-val">{project.currency} {fmtMoney(summary.subtotal_taxed)}</span>
                         </div>
                         <div className="p-total-row">
                            <span className="p-total-label">Tax rate</span>
                            <span className="p-total-val">{(summary.tax_rate * 100).toFixed(2)}%</span>
                         </div>
                         <div className="p-total-row">
                            <span className="p-total-label">Tax due</span>
                            <span className="p-total-val">{project.currency} {fmtMoney(summary.tax_amount)}</span>
                         </div>
                     </>
                 )}

                 {summary.other_charges > 0 && (
                     <div className="p-total-row">
                        <span className="p-total-label">Other</span>
                        <span className="p-total-val">{project.currency} {fmtMoney(summary.other_charges)}</span>
                     </div>
                 )}
                 
                 <div className="p-grand-total">
                    <span>TOTAL</span>
                    <span>{project.currency} {fmtMoney(summary.grand_total)}</span>
                 </div>
            </div>
        </div>

        {/* --- ZONE F: SIGNATORIES --- */}
        <div className="p-signatories-grid">
            {/* Prepared By */}
            <div className="p-sig-box">
                <span className="p-sig-action">Prepared by:</span>
                <div className="p-sig-line"></div>
                <span className="p-sig-name">{preparedBy}</span>
                <span className="p-sig-title">{preparedByTitle}</span>
            </div>

            {/* Approved By */}
            <div className="p-sig-box">
                <span className="p-sig-action">Approved by:</span>
                <div className="p-sig-line"></div>
                <span className="p-sig-name">{approvedBy}</span>
                <span className="p-sig-title">{approvedByTitle}</span>
            </div>

            {/* Conforme */}
            <div className="p-sig-box">
                <span className="p-sig-action">Conforme:</span>
                <div className="p-sig-line"></div>
                <span className="p-sig-name">{addressedName}</span>
                <span className="p-sig-title">{addressedTitle || "Date: _________________"}</span>
            </div>
        </div>

        {/* --- ZONE G: CONTACT FOOTER --- */}
        <div className="p-contact-footer">
            {/* Call */}
            <div className="p-contact-col">
                <span className="p-contact-label">Call</span>
                <span className="p-contact-text">+63 (2) 5310 4083</span>
                <span className="p-contact-text">+63 (2) 7004 7583</span>
                <span className="p-contact-text">+63 935 981 6652</span>
            </div>

            {/* Message */}
            <div className="p-contact-col">
                <span className="p-contact-label">Message</span>
                <span className="p-contact-text">inquiries@neuron-os.com</span>
            </div>

            {/* Office Address */}
            <div className="p-contact-col" style={{ width: '40%' }}>
                <span className="p-contact-label">Office Address</span>
                <span className="p-contact-text">
                    Unit 301, Great Wall Bldg., 136 Yakal St.,<br/>
                    San Antonio Village, Makati City, Philippines
                </span>
            </div>
        </div>

      </div>
    );
  }
);

QuotationDocument.displayName = "QuotationDocument";
