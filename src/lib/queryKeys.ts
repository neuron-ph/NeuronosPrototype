/**
 * queryKeys — Typed factory for all TanStack Query cache keys.
 *
 * Hierarchy matters: invalidating a parent key invalidates all children.
 * e.g. invalidateQueries({ queryKey: queryKeys.projects.all() })
 *      → invalidates list, detail, and financials for all projects.
 */
export const queryKeys = {
  users: {
    all: () => ["users"] as const,
    list: () => ["users", "list"] as const,
    filtered: (filters: {
      department?: string;
      role?: string;
      service_type?: string;
      operations_role?: string;
    }) => ["users", "filtered", filters] as const,
    teamMembers: (teamId: string) => ["users", "team", teamId] as const,
  },
  customers: {
    all: () => ["customers"] as const,
    list: () => ["customers", "list"] as const,
    detail: (id: string) => ["customers", id] as const,
    consignees: (customerId: string) => ["customers", customerId, "consignees"] as const,
  },
  contacts: {
    all: () => ["contacts"] as const,
    list: () => ["contacts", "list"] as const,
    detail: (id: string) => ["contacts", id] as const,
  },
  projects: {
    all: () => ["projects"] as const,
    list: () => ["projects", "list"] as const,
    detail: (id: string) => ["projects", id] as const,
    financials: (ref: string) => ["projects", ref, "financials"] as const,
  },
  contracts: {
    all: () => ["contracts"] as const,
    list: () => ["contracts", "list"] as const,
    detail: (id: string) => ["contracts", id] as const,
    financials: (ref: string) => ["contracts", ref, "financials"] as const,
    rateCard: (contractId: string) => ["contracts", contractId, "rateCard"] as const,
  },
  bookings: {
    all: () => ["bookings"] as const,
    list: (type: string) => ["bookings", "list", type] as const,
    detail: (id: string) => ["bookings", id] as const,
    financials: (ref: string) => ["bookings", ref, "financials"] as const,
  },
  evouchers: {
    all: () => ["evouchers"] as const,
    list: (view: string, userId?: string) =>
      userId ? (["evouchers", view, userId] as const) : (["evouchers", view] as const),
    detail: (id: string) => ["evouchers", id] as const,
  },
  quotations: {
    all: () => ["quotations"] as const,
    list: () => ["quotations", "list"] as const,
    detail: (id: string) => ["quotations", id] as const,
  },
  catalog: {
    all: () => ["catalog"] as const,
    items: () => ["catalog", "items"] as const,
    categories: () => ["catalog", "categories"] as const,
    usageCounts: () => ["catalog", "usageCounts"] as const,
    matrix: () => ["catalog", "matrix"] as const,
  },
  vendors: {
    all: () => ["vendors"] as const,
    list: () => ["vendors", "list"] as const,
    detail: (id: string) => ["vendors", id] as const,
  },
  networkPartners: {
    all: () => ["networkPartners"] as const,
    list: () => ["networkPartners", "list"] as const,
    detail: (id: string) => ["networkPartners", id] as const,
  },
  inbox: {
    all: () => ["inbox"] as const,
    list: () => ["inbox", "list"] as const,
    thread: (id: string) => ["inbox", "thread", id] as const,
  },
  transactions: {
    all: () => ["transactions"] as const,
    accounts: () => ["transactions", "accounts"] as const,
    list: () => ["transactions", "list"] as const,
    settings: () => ["transactions", "settings"] as const,
  },
  financials: {
    container: (type: string, ref: string, bookingIds: string[]) =>
      ["financials", type, ref, bookingIds.sort().join(",")] as const,
    health: () => ["financials", "health"] as const,
    projectsMap: () => ["financials", "projectsMap"] as const,
    reportsData: () => ["financials", "reportsData"] as const,
    bookingCashFlow: (filters: Record<string, unknown>) =>
      ["financials", "bookingCashFlow", filters] as const,
    collectionsReport: (filters: Record<string, unknown>) =>
      ["financials", "collectionsReport", filters] as const,
    receivablesAging: (filters: Record<string, unknown>) =>
      ["financials", "receivablesAging", filters] as const,
    unbilledRevenue: (filters: Record<string, unknown>) =>
      ["financials", "unbilledRevenue", filters] as const,
  },
  dataScope: {
    user: (userId: string) => ["dataScope", userId] as const,
  },
};
