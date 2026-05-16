# Dynamic PDF Engine Architecture

## Goal

Neuron PDFs should print only the information present in the source document while keeping a consistent professional layout across quotations, contract quotations, invoices, receipts, and future documents. The renderers must not hardcode business fields for one document type; each source document is resolved into a shared printable model first.

## Shared Information Architecture

Every printable document resolves into this order:

1. Header: company logo and document title only.
2. Party sections: customer, company, attention/addressee, and other recipient-facing identity fields.
3. Details sections: document-specific metadata such as quotation details, contract details, shipment details, invoice details, validity, payment terms, and service facts.
4. Tables: charges, rate matrices, invoice lines, receipt allocations, and any grouped financial tables.
5. Terms/totals area: notes, bank details, tax summary, and grand totals.
6. Signatories: prepared by, approved by, conforme, or document-specific signature blocks.
7. Contact footer: company phone, email, and office address.

Resolvers own content decisions. Renderers own layout decisions. A renderer should never know that a specific quotation field is called `pod_aod`, `rate_matrices`, or `containers`; it should only render normalized sections, fields, tables, totals, signatories, and footer blocks.

## Empty Content Rules

The normalizer strips:

- `null`, `undefined`, empty strings, whitespace strings, empty arrays.
- Placeholder values such as `-`, em dash, `N/A`, `NA`, `None`, and `TBA`.
- Empty fields, empty sections, empty tables, and table columns marked `hideWhenEmpty`.

The normalizer keeps:

- `0`, because zero is a real amount/count.
- `false`, because false is a real boolean answer.
- Non-empty object and array values, which are formatted by the printable value formatter.

## Complex Value Rules

Resolvers should prefer clean primitive values, but the printable model accepts arrays and objects as a defensive layer. Complex values are converted into human-readable text before rendering. Examples:

- Container arrays become values like `2 x 20ft`.
- Objects with `type`, `container_type`, `size`, or `name` use that label.
- Quantified objects with `qty`, `quantity`, or `count` use `qty x type`.
- Unknown objects fall back to `key: value` pairs, excluding technical identifiers like `id`.

This prevents output like `[object Object]` even when upstream form data is imperfect.

## Settings Model

Global defaults are defined by `defaultDocumentDisplay()` in `src/utils/documents/documentSettings.ts`.

Per-document overrides are stored on the quotation/invoice/receipt record. For quotations and contract quotations, display overrides currently live in the `details` JSON block using these keys:

- `pdf_show_bank_details`
- `pdf_show_notes`
- `pdf_show_tax_summary`
- `pdf_show_letterhead`
- `pdf_show_signatories`
- `pdf_show_contact_footer`

The sidebar edits per-document overrides. It must save through every entry point that exposes the PDF view: standalone pricing quotations, contract quotations, and project quotations.

## Page Break Rules

HTML preview and browser print should:

- Repeat table headers when browser print pagination allows it.
- Avoid splitting individual charge rows, subtotal rows, signatory blocks, and contact footers.
- Reserve footer space in print mode so body content cannot overlap the fixed contact footer.

React PDF output should:

- Keep individual table rows together.
- Keep signatory blocks together.
- Use a fixed contact footer and page footer on every page.
- Reserve enough page padding for fixed footer content.

## Visual Regression Plan

After the layout stops changing, add Playwright screenshots for representative fixtures:

- Project quotation with shipment details and charge table.
- Contract quotation with scope, service details, and rate matrices.
- Long contract quotation that spans multiple pages.
- Quotation with signatories, bank details, notes, tax summary, and footer toggles on/off.
- Invoice with line items, totals, and notes.

Screenshots should capture the PDF preview viewport and compare against approved baselines. This should happen after the structure is stable, otherwise snapshot churn will hide real regressions.
