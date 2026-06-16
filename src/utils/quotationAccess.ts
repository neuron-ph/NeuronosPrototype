import type { ActionId, ModuleId } from "../components/admin/permissionsConfig";
import { QUOTATION_MODULE_IDS, type QuotationDept } from "../config/access/accessSchema";

type QuotationDepartment = "Business Development" | "Pricing" | undefined;
type CanCheck = (moduleId: ModuleId, action: ActionId) => boolean;

const BD_INQUIRIES: ModuleId = "bd_inquiries";
const PRICING_QUOTATIONS: ModuleId = "pricing_quotations";

/** Which door (and therefore which tab family) the file is opened through. */
export function getQuotationVariant(userDepartment: QuotationDepartment): QuotationDept {
  return userDepartment === "Business Development" ? "bd" : "pricing";
}

/** The tab moduleId family (details/comments/attachments) for the open door. */
export function quotationTabModules(userDepartment: QuotationDepartment) {
  return QUOTATION_MODULE_IDS[getQuotationVariant(userDepartment)];
}

export function getQuotationLensModule(userDepartment: QuotationDepartment): ModuleId {
  return userDepartment === "Business Development" ? BD_INQUIRIES : PRICING_QUOTATIONS;
}

export function canUseQuotationLens(
  can: CanCheck,
  userDepartment: QuotationDepartment,
  action: ActionId,
): boolean {
  if (userDepartment === "Business Development") return can(BD_INQUIRIES, action);
  if (userDepartment === "Pricing") return can(PRICING_QUOTATIONS, action);
  return can(BD_INQUIRIES, action) || can(PRICING_QUOTATIONS, action);
}

export function canViewQuotationFile(
  can: CanCheck,
  userDepartment: QuotationDepartment,
): boolean {
  if (canUseQuotationLens(can, userDepartment, "view")) return true;

  // Fall back to the door's own Details/Comments tab knobs.
  const tabs = quotationTabModules(userDepartment);
  if (userDepartment === undefined) {
    return can(QUOTATION_MODULE_IDS.bd.details, "view")
      || can(QUOTATION_MODULE_IDS.bd.comments, "view")
      || can(QUOTATION_MODULE_IDS.pricing.details, "view")
      || can(QUOTATION_MODULE_IDS.pricing.comments, "view");
  }
  return can(tabs.details, "view") || can(tabs.comments, "view");
}

export function canViewQuotationComments(
  can: CanCheck,
  userDepartment: QuotationDepartment,
): boolean {
  if (canUseQuotationLens(can, userDepartment, "view")) return true;
  const tabs = quotationTabModules(userDepartment);
  if (userDepartment === undefined) {
    return can(QUOTATION_MODULE_IDS.bd.comments, "view")
      || can(QUOTATION_MODULE_IDS.pricing.comments, "view");
  }
  return can(tabs.comments, "view");
}
