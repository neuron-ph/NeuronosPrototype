import type { ActionId, ModuleId } from "../components/admin/permissionsConfig";

type QuotationDepartment = "Business Development" | "Pricing" | undefined;
type CanCheck = (moduleId: ModuleId, action: ActionId) => boolean;

const BD_INQUIRIES: ModuleId = "bd_inquiries";
const PRICING_QUOTATIONS: ModuleId = "pricing_quotations";

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

  if (userDepartment === "Pricing") {
    return can("pricing_quotations_details_tab", "view")
      || can("pricing_quotations_comments_tab", "view");
  }

  return false;
}

export function canViewQuotationComments(
  can: CanCheck,
  userDepartment: QuotationDepartment,
): boolean {
  if (canUseQuotationLens(can, userDepartment, "view")) return true;
  return userDepartment === "Pricing" && can("pricing_quotations_comments_tab", "view");
}
