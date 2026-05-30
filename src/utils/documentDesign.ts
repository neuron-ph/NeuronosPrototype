import type { PrintableContactFooter, PrintableDocument } from "./documents/printableDocument";
import fullPageImage from "../assets/Full page.png";
import brandedLogoUrl from "../assets/white.svg";

const STORAGE_KEY = "neuron_doc_design";
const VOUCHER_LOGO_KEY = "neuron_voucher_logo";

export type DocumentDesign = "branded" | "classic";

// E-voucher heading logo. Locked to "aplus" in prod; togglable in dev.
export type VoucherLogo = "aplus" | "neuron";

export function getVoucherLogo(): VoucherLogo {
  if (import.meta.env.PROD) return "aplus";
  return (localStorage.getItem(VOUCHER_LOGO_KEY) as VoucherLogo) || "aplus";
}

export function setVoucherLogo(logo: VoucherLogo): void {
  localStorage.setItem(VOUCHER_LOGO_KEY, logo);
}

const BRANDED_CONTACT_FOOTER: PrintableContactFooter = {
  callNumbers: ["+63 (2) 8283 8046", "+63 (2) 7000 1665", "+63 920 2821730"],
  emails: ["inquiry@falconslogistics-ph.com"],
  addressLines: [
    "Suite 400, 4/F Ermita Center Building",
    "1350 Roxas Boulevard, Ermita, Manila",
    "1000 Philippines",
  ],
};

export function getDocumentDesign(): DocumentDesign {
  if (import.meta.env.PROD) return "branded";
  return (localStorage.getItem(STORAGE_KEY) as DocumentDesign) || "branded";
}

export function setDocumentDesign(design: DocumentDesign): void {
  localStorage.setItem(STORAGE_KEY, design);
}

export function isDocumentDesignToggleable(): boolean {
  return !import.meta.env.PROD;
}

export function getBrandedLogo(): string {
  return brandedLogoUrl;
}

export function applyBrandedDesign(doc: PrintableDocument): PrintableDocument {
  if (getDocumentDesign() !== "branded") return doc;

  return {
    ...doc,
    contactFooter: BRANDED_CONTACT_FOOTER,
    brandedHeaderImage: fullPageImage,
    brandedFooterImage: fullPageImage,
  };
}
