import { describe, expect, it } from "vitest";
import type { ActionId, ModuleId } from "../components/admin/permissionsConfig";
import {
  canUseQuotationLens,
  canViewQuotationComments,
  canViewQuotationFile,
  getQuotationLensModule,
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
});
