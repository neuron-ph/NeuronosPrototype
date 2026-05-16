// HTML / native-print renderer for a PrintableDocument.
//
// This is the browser-side counterpart to PrintableDocumentPdf — both consume
// the same normalized PrintableDocument so what the user sees in the preview
// is what they get in the downloaded PDF.

import React from "react";
import type {
  PrintableCompanyBlock,
  PrintableDocument,
  PrintableField,
  PrintableSection,
  PrintableSignatory,
  PrintableTable,
  PrintableTableColumn,
  PrintableTableGroup,
  PrintableTableRow,
  PrintableTotalRow,
} from "../../utils/documents/printableDocument";
import { formatPrintableValue } from "../../utils/documents/printableDocumentFormat";
import { isPrintableValue } from "../../utils/documents/printableDocumentNormalize";

interface PrintableDocumentHtmlProps {
  document: PrintableDocument;
  mode?: "preview" | "print";
}

function widthClass(width?: PrintableField["width"]): string {
  if (width === "full") return "p-col-span-4";
  if (width === "wide") return "p-col-span-2";
  return "";
}

function FieldCell({ field }: { field: PrintableField }) {
  const formatted = formatPrintableValue(field.value, field.format, field.currency);
  if (!formatted) return null;
  return (
    <div className={`p-shipment-cell ${widthClass(field.width)}`}>
      <span className="p-shipment-label">{field.label.toUpperCase()}</span>
      <span className="p-shipment-value">{formatted}</span>
    </div>
  );
}

function SectionBlock({ section }: { section: PrintableSection }) {
  if (section.fields.length === 0) return null;
  if (section.layout === "stack") {
    return (
      <div className="p-section">
        {section.title ? <div className="p-section-header">{section.title.toUpperCase()}</div> : null}
        {section.fields.map((f) => {
          const formatted = formatPrintableValue(f.value, f.format, f.currency);
          if (!formatted) return null;
          if (Array.isArray(f.value)) {
            return (
              <ul key={f.id} className="p-bullet-list">
                {(f.value as string[]).map((v, i) => (
                  <li key={i}>{v}</li>
                ))}
              </ul>
            );
          }
          return (
            <div key={f.id} className="p-stack-text" style={{ whiteSpace: "pre-line" }}>
              {formatted}
            </div>
          );
        })}
      </div>
    );
  }
  if (section.layout === "two-column") {
    return (
      <div className="p-section">
        {section.title ? <div className="p-customer-header">{section.title.toUpperCase()}:</div> : null}
        <div className="p-customer-grid">
          {section.fields.map((f) => {
            const formatted = formatPrintableValue(f.value, f.format, f.currency);
            if (!formatted) return null;
            return (
              <div className="p-cust-row" key={f.id}>
                <span className="p-cust-label">{f.label}:</span>
                <span className="p-cust-val">{formatted}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  // default = grid
  return (
    <div className="p-section">
      {section.title ? <div className="p-section-header">{section.title.toUpperCase()}</div> : null}
      <div className="p-shipment-grid">
        {section.fields.map((f) => (
          <FieldCell key={f.id} field={f} />
        ))}
      </div>
    </div>
  );
}

function TableBlock({ table }: { table: PrintableTable }) {
  if (table.rows.length === 0) {
    if (table.hideWhenEmpty !== false) return null;
    if (!table.emptyMessage) return null;
    return (
      <div className="p-table-container">
        <div className="p-empty-row">{table.emptyMessage}</div>
      </div>
    );
  }

  const groups = table.groups || [];
  const groupedRows = groups.length > 0
    ? groups.map((g) => ({
        group: g,
        rows: table.rows.filter((r) => r.groupId === g.id),
      }))
    : [{ group: null as PrintableTableGroup | null, rows: table.rows }];

  return (
    <div className="p-table-container">
      {table.title ? <div className="p-table-title">{table.title.toUpperCase()}</div> : null}
      <table className="p-rate-table">
        <thead>
          <tr>
            {table.columns.map((c) => (
              <th
                key={c.id}
                className="p-rate-th"
                style={{
                  width: c.widthHint,
                  textAlign: c.align || "left",
                }}
              >
                {c.label.toUpperCase()}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groupedRows.flatMap(({ group, rows }) => {
            const out: React.ReactNode[] = [];
            if (group) {
              out.push(
                <tr key={`g-${group.id}`}>
                  <td colSpan={table.columns.length} className="p-cat-header">
                    {group.title}
                  </td>
                </tr>,
              );
            }
            rows.forEach((row) => {
              out.push(
                <tr key={row.id} className={`p-rate-row ${row.emphasis === "subtotal" ? "p-rate-row-emphasis" : ""}`}>
                  {table.columns.map((c) => {
                    const raw = row.cells[c.id];
                    const formatted = formatPrintableValue(raw, c.format);
                    return (
                      <td key={c.id} style={{ textAlign: c.align || "left" }}>
                        {formatted}
                      </td>
                    );
                  })}
                </tr>,
              );
            });
            if (group?.subtotal) {
              const subAmount = group.subtotal.cells["amount"];
              const subLabel = group.subtotal.cells["description"] || "Subtotal";
              out.push(
                <tr key={`s-${group.id}`} className="p-subtotal-row">
                  <td
                    colSpan={table.columns.length - 1}
                    className="p-subtotal-label"
                  >
                    {String(subLabel).toUpperCase()}
                  </td>
                  <td className="p-subtotal-val">
                    {formatPrintableValue(subAmount, "money")}
                  </td>
                </tr>,
              );
            }
            return out;
          })}
        </tbody>
      </table>
    </div>
  );
}

function TotalsBlock({ doc }: { doc: PrintableDocument }) {
  const totals = doc.totals;
  if (!totals) return null;
  return (
    <div className="p-totals-col">
      {totals.rows.map((row: PrintableTotalRow) => {
        const formatted = formatPrintableValue(row.value, row.format || "money", row.currency);
        if (!formatted && row.value === 0 && row.id !== "subtotal") return null;
        return (
          <div className="p-total-row" key={row.id}>
            <span className="p-total-label">{row.label}</span>
            <span className="p-total-val">{formatted}</span>
          </div>
        );
      })}
      {totals.grandTotal ? (
        <div className="p-grand-total">
          <span>{totals.grandTotal.label}</span>
          <span>
            {formatPrintableValue(
              totals.grandTotal.value,
              totals.grandTotal.format || "money",
              totals.grandTotal.currency,
            )}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function CompanyBlock({ company, title, subtitle, headerFields }: {
  company?: PrintableCompanyBlock;
  title: string;
  subtitle?: string;
  headerFields: PrintableField[];
}) {
  return (
    <div className="p-header-top">
      <div className="p-brand-col">
        {company?.logoUrl ? (
          <img src={company.logoUrl} className="p-logo-img" alt={company.name || "Logo"} />
        ) : company?.fallbackLogo ? (
          <img src={company.fallbackLogo} className="p-logo-img" alt={company.name || "Logo"} />
        ) : null}
        {company ? (
          <div className="p-address-block">
            {company.addressLines.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
            {company.phoneNumbers.length > 0 || company.email ? (
              <div>
                {company.phoneNumbers[0] || ""}
                {company.phoneNumbers[0] && company.email ? " | " : ""}
                {company.email || ""}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="p-title-col">
        <div className="p-doc-title">{title}</div>
        {subtitle ? <div className="p-doc-subtitle">{subtitle}</div> : null}
        <div className="p-ref-grid">
          {headerFields.map((f) => {
            const formatted = formatPrintableValue(f.value, f.format, f.currency);
            if (!formatted) return null;
            return (
              <div className="p-ref-item" key={f.id}>
                <span className="p-ref-label">{f.label}</span>
                <span className="p-ref-value">{formatted}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SignatoriesBlock({ signatories }: { signatories: PrintableSignatory[] }) {
  if (signatories.length === 0) return null;
  return (
    <div className="p-signatories-grid">
      {signatories.map((s) => (
        <div key={s.id} className="p-sig-box">
          <span className="p-sig-action">{s.label}:</span>
          <div className="p-sig-line"></div>
          {isPrintableValue(s.name) ? <span className="p-sig-name">{s.name}</span> : <span className="p-sig-name">&nbsp;</span>}
          {isPrintableValue(s.title) ? <span className="p-sig-title">{s.title}</span> : null}
        </div>
      ))}
    </div>
  );
}

export const PrintableDocumentHtml = React.forwardRef<HTMLDivElement, PrintableDocumentHtmlProps>(
  ({ document: doc, mode = "print" }, ref) => {
    const { company, title, subtitle, headerFields, partySections, sections, tables, notes, bank, signatories, contactFooter } = doc;

    return (
      <div ref={ref} className={`p-page ${mode === "print" ? "p-mode-print" : "p-mode-preview"}`}>
        <style>{`
          .p-page {
              width: 210mm;
              min-height: 297mm;
              padding: 12mm 12mm 34mm;
              background: white;
              box-sizing: border-box;
              font-family: 'Inter', Arial, Helvetica, sans-serif !important;
              color: #111827 !important;
              position: relative;
              display: flex !important;
              flex-direction: column !important;
              font-size: 8.5pt;
              line-height: 1.25;
          }
          .p-header-top {
              display: flex !important;
              justify-content: space-between !important;
              align-items: flex-start !important;
              margin-bottom: 10px !important;
              border-bottom: 3px solid #12332B !important;
              padding-bottom: 10px !important;
          }
          .p-brand-col { display: flex !important; flex-direction: column !important; gap: 0 !important; width: 47% !important; }
          .p-logo-img { height: 38px !important; object-fit: contain !important; object-position: left !important; }
          .p-address-block { display: none !important; }
          .p-title-col { width: 53% !important; display: flex !important; flex-direction: column !important; align-items: flex-end !important; }
          .p-doc-title { font-size: 22pt !important; font-weight: 900 !important; color: #12332B !important; letter-spacing: 0.05em !important; margin-bottom: 4px !important; line-height: 1 !important; text-align: right !important; max-width: 100% !important; }
          .p-doc-subtitle { font-size: 8pt !important; color: #475467 !important; margin-bottom: 8px !important; text-align: right !important; }
          .p-ref-grid { display: grid !important; grid-template-columns: repeat(3, minmax(52px, auto)) !important; gap: 4px 14px !important; justify-content: end !important; max-width: 360px !important; }
          .p-ref-item { min-width: 52px !important; text-align: right !important; display: flex !important; flex-direction: column !important; align-items: flex-end !important; }
          .p-ref-label { font-size: 6pt !important; color: #6B7280 !important; text-transform: uppercase !important; font-weight: 700 !important; display: block !important; margin-bottom: 2px !important; line-height: 1.1 !important; }
          .p-ref-value { font-size: 8pt !important; color: #111827 !important; font-weight: 700 !important; line-height: 1.15 !important; }
          .p-section { margin-top: 9px !important; }
          .p-customer-header { font-size: 8pt !important; font-weight: 800 !important; color: #0F766E !important; text-transform: uppercase !important; letter-spacing: 0.05em !important; margin-bottom: 6px !important; }
          .p-customer-grid { display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 5px 22px !important; margin-bottom: 8px !important; padding-bottom: 8px !important; border-bottom: 1px dashed #E5E7EB !important; }
          .p-cust-row { display: flex !important; align-items: baseline !important; }
          .p-cust-label { width: 100px !important; flex-shrink: 0 !important; font-size: 7pt !important; color: #6B7280 !important; font-weight: 600 !important; text-transform: uppercase !important; }
          .p-cust-val { font-size: 9pt !important; font-weight: 600 !important; color: #111827 !important; }
          .p-section-header { font-size: 8.5pt !important; font-weight: 800 !important; color: #12332B !important; text-transform: uppercase !important; letter-spacing: 0.05em !important; border-bottom: 1px solid #E5E9F0 !important; padding-bottom: 4px !important; margin-bottom: 6px !important; }
          .p-shipment-grid { display: grid !important; grid-template-columns: repeat(4, 1fr) !important; gap: 6px 20px !important; margin-bottom: 8px !important; }
          .p-shipment-cell { display: flex !important; flex-direction: column !important; gap: 1px !important; }
          .p-col-span-2 { grid-column: span 2 !important; }
          .p-col-span-4 { grid-column: span 4 !important; }
          .p-shipment-label { font-size: 6.5pt !important; color: #6B7280 !important; text-transform: uppercase !important; font-weight: 700 !important; letter-spacing: 0.05em !important; }
          .p-shipment-value { font-size: 8.5pt !important; font-weight: 700 !important; color: #111827 !important; line-height: 1.3 !important; }
          .p-table-container { margin: 9px 0 !important; break-inside: auto !important; }
          .p-table-title { font-size: 9pt !important; font-weight: 800 !important; color: #12332B !important; text-transform: uppercase !important; letter-spacing: 0.05em !important; border-bottom: 1px solid #E5E9F0 !important; padding-bottom: 4px !important; margin-bottom: 6px !important; margin-top: 10px !important; }
          .p-rate-table { width: 100% !important; border-collapse: collapse !important; }
          .p-rate-table thead { display: table-header-group !important; }
          .p-rate-table tr { page-break-inside: avoid !important; break-inside: avoid !important; }
          .p-rate-th { font-size: 7pt !important; font-weight: 700 !important; color: #111827 !important; text-transform: uppercase !important; letter-spacing: 0.05em !important; border-bottom: 2px solid #111827 !important; border-top: 2px solid #111827 !important; padding: 4px 4px !important; }
          .p-cat-header { font-size: 8pt !important; font-weight: 800 !important; color: #12332B !important; text-transform: uppercase !important; padding: 8px 4px 4px 4px !important; break-after: avoid !important; page-break-after: avoid !important; }
          .p-rate-row td { padding: 2px 4px !important; font-size: 8pt !important; color: #374151 !important; vertical-align: top !important; }
          .p-rate-row-emphasis td { font-weight: 800 !important; color: #111827 !important; text-transform: uppercase !important; padding-top: 5px !important; }
          .p-subtotal-row td { padding-top: 4px !important; padding-bottom: 8px !important; }
          .p-subtotal-label { font-size: 7pt !important; font-weight: 700 !important; text-transform: uppercase !important; text-align: right !important; padding-right: 12px !important; }
          .p-subtotal-val { border-top: 1px solid #111827 !important; padding-top: 2px !important; font-weight: 700 !important; text-align: right !important; }
          .p-empty-row { padding: 24px !important; text-align: center !important; color: #9CA3AF !important; font-style: italic !important; }
          .p-footer-grid { display: flex !important; justify-content: space-between !important; align-items: flex-start !important; margin-top: 8px !important; padding-top: 8px !important; border-top: 2px solid #111827 !important; break-inside: avoid !important; page-break-inside: avoid !important; }
          .p-terms-col { width: 60% !important; padding-right: 24px !important; }
          .p-totals-col { width: 35% !important; }
          .p-total-row { display: flex !important; justify-content: space-between !important; margin-bottom: 2px !important; font-size: 8.5pt !important; }
          .p-total-label { color: #4B5563 !important; }
          .p-total-val { font-weight: 600 !important; color: #111827 !important; }
          .p-grand-total { border-top: 2px solid #111827 !important; margin-top: 6px !important; padding-top: 6px !important; font-size: 10pt !important; font-weight: 900 !important; color: #12332B !important; display: flex !important; justify-content: space-between !important; }
          .p-terms-header { font-size: 7pt !important; font-weight: 800 !important; text-transform: uppercase !important; margin-bottom: 4px !important; color: #111827 !important; }
          .p-stack-text { font-size: 7.5pt !important; color: #4B5563 !important; line-height: 1.4 !important; }
          .p-bullet-list { font-size: 7.5pt !important; color: #4B5563 !important; line-height: 1.4 !important; padding-left: 16px !important; margin: 0 !important; }
          .p-bank-grid { display: flex !important; gap: 16px !important; margin-top: 4px !important; }
          .p-bank-item { display: flex !important; flex-direction: column !important; }
          .p-bank-label { font-size: 7pt !important; color: #6B7280 !important; }
          .p-bank-value { font-size: 8pt !important; color: #111827 !important; font-weight: 600 !important; }
          .p-signatories-grid { display: grid !important; grid-template-columns: 1fr 1fr 1fr !important; gap: 48px !important; margin-top: 32px !important; page-break-inside: avoid !important; break-inside: avoid !important; }
          .p-sig-box { display: flex !important; flex-direction: column !important; }
          .p-sig-action { font-size: 7pt !important; color: #6B7280 !important; margin-bottom: 32px !important; font-style: italic !important; }
          .p-sig-line { border-bottom: 1px solid #111827 !important; margin-bottom: 8px !important; }
          .p-sig-name { font-size: 9pt !important; font-weight: 700 !important; color: #111827 !important; text-transform: uppercase !important; min-height: 12pt !important; }
          .p-sig-title { font-size: 7pt !important; color: #4B5563 !important; }
          .p-contact-footer { margin-top: auto !important; padding-top: 10px !important; border-top: 2px solid #12332B !important; display: flex !important; justify-content: space-between !important; page-break-inside: avoid !important; gap: 18px !important; }
          .p-mode-preview .p-contact-footer {
            position: absolute !important;
            left: 12mm !important;
            right: 12mm !important;
            bottom: 12mm !important;
            background: white !important;
          }
          .p-contact-col { display: flex !important; flex-direction: column !important; }
          .p-contact-label { font-size: 8pt !important; font-weight: 800 !important; color: #12332B !important; margin-bottom: 4px !important; }
          .p-contact-text { font-size: 7.5pt !important; color: #111827 !important; line-height: 1.4 !important; }
          @media print {
            .p-page {
              min-height: auto !important;
              padding-bottom: 34mm !important;
            }
            .p-contact-footer {
              position: fixed !important;
              left: 12mm !important;
              right: 12mm !important;
              bottom: 12mm !important;
              background: white !important;
            }
          }
        `}</style>

        {/* Header */}
        <CompanyBlock company={company} title={title} subtitle={subtitle} headerFields={headerFields} />

        {/* Party sections */}
        {partySections.map((s) => (
          <SectionBlock key={s.id} section={s} />
        ))}

        {/* Body sections */}
        {sections.map((s) => (
          <SectionBlock key={s.id} section={s} />
        ))}

        {/* Tables */}
        {tables.map((t) => (
          <TableBlock key={t.id} table={t} />
        ))}

        {/* Footer: notes + bank | totals */}
        {(notes.length > 0 || bank || doc.totals) && (
          <div className="p-footer-grid">
            <div className="p-terms-col">
              {notes.map((n) => (
                <div key={n.id} style={{ marginBottom: 12 }}>
                  {n.title ? <div className="p-terms-header">{n.title.toUpperCase()}</div> : null}
                  {n.fields.map((f) => {
                    if (Array.isArray(f.value)) {
                      return (
                        <ul key={f.id} className="p-bullet-list">
                          {(f.value as string[]).map((v, i) => (
                            <li key={i}>{v}</li>
                          ))}
                        </ul>
                      );
                    }
                    const formatted = formatPrintableValue(f.value, f.format);
                    if (!formatted) return null;
                    return (
                      <div key={f.id} className="p-stack-text" style={{ whiteSpace: "pre-line" }}>
                        {formatted}
                      </div>
                    );
                  })}
                </div>
              ))}
              {bank ? (
                <div style={{ marginTop: 12 }}>
                  <div className="p-terms-header">BANK DETAILS</div>
                  <div className="p-bank-grid">
                    {bank.bankName ? (
                      <div className="p-bank-item">
                        <span className="p-bank-label">Bank</span>
                        <span className="p-bank-value">{bank.bankName}</span>
                      </div>
                    ) : null}
                    {bank.accountName ? (
                      <div className="p-bank-item">
                        <span className="p-bank-label">Acct Name</span>
                        <span className="p-bank-value">{bank.accountName}</span>
                      </div>
                    ) : null}
                    {bank.accountNumber ? (
                      <div className="p-bank-item">
                        <span className="p-bank-label">Acct No</span>
                        <span className="p-bank-value">{bank.accountNumber}</span>
                      </div>
                    ) : null}
                    {bank.swift ? (
                      <div className="p-bank-item">
                        <span className="p-bank-label">SWIFT</span>
                        <span className="p-bank-value">{bank.swift}</span>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
            <TotalsBlock doc={doc} />
          </div>
        )}

        {/* Signatories */}
        <SignatoriesBlock signatories={signatories} />

        {/* Contact footer */}
        {contactFooter && doc.options.showContactFooter ? (
          <div className="p-contact-footer">
            {contactFooter.callNumbers.length > 0 ? (
              <div className="p-contact-col">
                <span className="p-contact-label">Call</span>
                {contactFooter.callNumbers.map((p, i) => (
                  <span key={i} className="p-contact-text">{p}</span>
                ))}
              </div>
            ) : null}
            {contactFooter.emails.length > 0 ? (
              <div className="p-contact-col">
                <span className="p-contact-label">Message</span>
                {contactFooter.emails.map((e, i) => (
                  <span key={i} className="p-contact-text">{e}</span>
                ))}
              </div>
            ) : null}
            {contactFooter.addressLines.length > 0 ? (
              <div className="p-contact-col" style={{ width: "40%" }}>
                <span className="p-contact-label">Office Address</span>
                {contactFooter.addressLines.map((line, i) => (
                  <span key={i} className="p-contact-text">{line}</span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  },
);

PrintableDocumentHtml.displayName = "PrintableDocumentHtml";
