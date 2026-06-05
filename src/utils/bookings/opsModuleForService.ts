import type { ModuleId } from "../../components/admin/permissionsConfig";

/** NEU-017: which ops module gates writes on a booking of this service type. */
const OPS_MODULE_BY_SERVICE: Record<string, ModuleId> = {
  Forwarding: "ops_forwarding",
  Brokerage: "ops_brokerage",
  Trucking: "ops_trucking",
  "Marine Insurance": "ops_marine_insurance",
  Others: "ops_others",
};

export function opsModuleForService(serviceType: string): ModuleId {
  return OPS_MODULE_BY_SERVICE[serviceType] ?? "ops_others";
}
