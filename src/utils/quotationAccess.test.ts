import { describe, expect, it } from "vitest";
import type { ActionId, ModuleId } from "../components/admin/permissionsConfig";
import {
  canUseQuotationLens,
  canViewQuotationComments,
  canViewQuotationFile,
  getQuotationLensModule,
  quotationTabModules,
} from "./quotationAccess";

const makeCan = (enabled: string[]) =>
  ((moduleId: ModuleId, action: ActionId) => enabled.includes(`${moduleId}:${action}`));

describe("quotationAccess", () => {
  it("maps BD context to the Inquiries access-profile module", () => {
    expect(getQuotationLensModule("Business Development")).toBe("bd_inquiries");
    expect(canUseQuotationLens(makeCan(["bd_inquiries:view"]), "Business Development", "view")).toBe(true);
    expect(canUseQuotationLens(makeCan(["pricing_quotations:view"]), "Business Development", "view")).toBe(false);
  });

  it("maps Pricing context to the Quotations access-profile module", () => {
    expect(getQuotationLensModule("Pricing")).toBe("pricing_quotations");
    expect(canUseQuotationLens(makeCan(["pricing_quotations:view"]), "Pricing", "view")).toBe(true);
    expect(canUseQuotationLens(makeCan(["bd_inquiries:view"]), "Pricing", "view")).toBe(false);
  });

  it("lets the parent module grant open the shared quotation file", () => {
    const can = makeCan(["bd_inquiries:view"]);

    expect(canViewQuotationFile(can, "Business Development")).toBe(true);
    expect(canViewQuotationComments(can, "Business Development")).toBe(true);
  });

  it("preserves legacy Pricing quotation tab grants", () => {
    expect(canViewQuotationFile(makeCan(["pricing_quotations_details_tab:view"]), "Pricing")).toBe(true);
    expect(canViewQuotationComments(makeCan(["pricing_quotations_comments_tab:view"]), "Pricing")).toBe(true);
  });

  it("resolves the per-door tab family (BD inquiries vs Pricing quotations)", () => {
    expect(quotationTabModules("Business Development")).toEqual({
      root: "bd_inquiries",
      details: "bd_inquiries_details_tab",
      comments: "bd_inquiries_comments_tab",
      attachments: "bd_inquiries_attachments_tab",
    });
    expect(quotationTabModules("Pricing")).toEqual({
      root: "pricing_quotations",
      details: "pricing_quotations_details_tab",
      comments: "pricing_quotations_comments_tab",
      attachments: "pricing_quotations_attachments_tab",
    });
  });

  it("opens the inquiry file via the BD door's own Details/Comments tab knobs", () => {
    expect(canViewQuotationFile(makeCan(["bd_inquiries_details_tab:view"]), "Business Development")).toBe(true);
    expect(canViewQuotationComments(makeCan(["bd_inquiries_comments_tab:view"]), "Business Development")).toBe(true);
  });
});
