import type { PlatformBlock } from "./types";

export const platformBlocks = [
  {
    id: "design.shell",
    label: "Neuron App Shell",
    layer: "design",
    description: "Shared page frame, sidebar, module navigation, header actions, and route shell.",
    source: "src/components/Layout.tsx",
  },
  {
    id: "design.table",
    label: "Responsive Data Table",
    layer: "design",
    description: "Desktop table and mobile card pattern for operational records.",
    source: "src/components/common/DataTable.tsx",
  },
  {
    id: "design.modal",
    label: "System Confirmation Modal",
    layer: "design",
    description: "Standard high-consequence confirmation surface; not for normal create/edit forms.",
    source: "src/components/ui/NeuronModal.tsx",
    recommendedSurface: "modal",
  },
  {
    id: "core.identity",
    label: "Users, Teams, Roles",
    layer: "core",
    description: "User identity, team membership, role labels, and assignment profile primitives.",
    source: "src/components/admin",
  },
  {
    id: "core.permissions",
    label: "Access Profiles and Visibility",
    layer: "core",
    description: "Reusable permission grants, visibility dials, record scope, and guarded route behavior.",
    source: "src/config/access",
  },
  {
    id: "core.comments",
    label: "Comments and Activity",
    layer: "core",
    description: "Record timeline, comments, chronological logs, and audit-style activity patterns.",
    source: "src/utils/activityLog.ts",
  },
  {
    id: "workflow.inbox",
    label: "Workflow Inbox",
    layer: "workflow",
    description: "Shared inbox primitive for routed messages, handoffs, tasks, and record-linked notifications.",
    source: "src/components/InboxPage.tsx",
    dependencies: ["core.identity", "core.permissions"],
  },
  {
    id: "workflow.approval",
    label: "Approval Flow",
    layer: "workflow",
    description: "Submit, review, approve, reject, disburse, and close state machine for operational approvals.",
    source: "src/components/accounting/EVoucherDetailView.tsx",
    dependencies: ["workflow.inbox", "core.comments"],
  },
  {
    id: "domain.crm",
    label: "Customer and Contact System",
    layer: "domain",
    description: "Customers, contacts, consignees, inquiries, activities, and customer relationship views.",
    source: "src/components/bd",
    dependencies: ["design.table", "core.permissions"],
  },
  {
    id: "domain.pricing",
    label: "Quotation and Rate Builder",
    layer: "domain",
    description: "Quotation creation, vendor rate cards, service forms, charge categories, and price summaries.",
    source: "src/components/pricing",
    dependencies: ["domain.crm", "core.permissions"],
    recommendedSurface: "full-screen",
  },
  {
    id: "domain.operations",
    label: "Operations Tracker",
    layer: "domain",
    description: "Bookings, service-specific operations, assignment sections, status tracking, and booking timelines.",
    source: "src/components/operations",
    dependencies: ["domain.crm", "workflow.inbox"],
  },
  {
    id: "domain.accounting",
    label: "Accounting Workspace",
    layer: "domain",
    description: "E-vouchers, invoices, billings, collections, chart of accounts, journals, and reports.",
    source: "src/components/accounting",
    dependencies: ["workflow.approval", "core.permissions"],
  },
  {
    id: "template.admin-ops",
    label: "Admin Operations Prototype",
    layer: "template",
    description: "Starter shape for internal admin systems with records, approvals, documents, and activity logs.",
    dependencies: ["design.shell", "design.table", "workflow.approval", "core.comments"],
  },
] satisfies PlatformBlock[];

export function getPlatformBlock(id: string): PlatformBlock | undefined {
  return platformBlocks.find((block) => block.id === id);
}

export function resolvePlatformBlockIds(blockIds: string[]): PlatformBlock[] {
  const missing: string[] = [];
  const blocks = blockIds.flatMap((id) => {
    const block = getPlatformBlock(id);
    if (!block) {
      missing.push(id);
      return [];
    }
    return [block];
  });

  if (missing.length > 0) {
    throw new Error(`Unknown platform block(s): ${missing.join(", ")}`);
  }

  return blocks;
}
