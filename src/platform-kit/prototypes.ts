import type { PrototypeBlueprint } from "./types";
import { resolvePlatformBlockIds } from "./registry";

export const prototypeBlueprints = [
  {
    id: "prototype.crm",
    label: "CRM Prototype",
    description: "A client and pipeline system for sales, account management, or relationship-heavy operations.",
    complexity: "demo",
    defaultNavigation: ["Dashboard", "Customers", "Contacts", "Inquiries", "Activities"],
    modules: [
      {
        id: "crm-directory",
        label: "Customer Directory",
        requiredBlocks: ["design.shell", "design.table", "domain.crm"],
        optionalBlocks: ["core.comments"],
      },
      {
        id: "crm-pipeline",
        label: "Inquiry Pipeline",
        requiredBlocks: ["domain.crm", "workflow.inbox"],
      },
    ],
  },
  {
    id: "prototype.ops-tracker",
    label: "Operations Tracker Prototype",
    description: "A status, assignment, document, and handoff tracker for execution-heavy teams.",
    complexity: "pilot",
    defaultNavigation: ["Dashboard", "Work Queue", "Records", "Documents", "Activity"],
    modules: [
      {
        id: "ops-records",
        label: "Operational Records",
        requiredBlocks: ["design.shell", "design.table", "domain.operations"],
        optionalBlocks: ["domain.crm"],
      },
      {
        id: "ops-handoffs",
        label: "Handoffs and Inbox",
        requiredBlocks: ["workflow.inbox", "core.comments"],
      },
    ],
  },
  {
    id: "prototype.approvals",
    label: "Approval Workflow Prototype",
    description: "A submission, review, approval, and closeout system for controlled internal processes.",
    complexity: "pilot",
    defaultNavigation: ["My Requests", "Approvals", "Inbox", "Reports"],
    modules: [
      {
        id: "approval-requests",
        label: "Approval Requests",
        requiredBlocks: ["design.shell", "design.table", "workflow.approval"],
      },
      {
        id: "approval-audit",
        label: "Approval History",
        requiredBlocks: ["core.comments", "workflow.inbox"],
      },
    ],
  },
  {
    id: "prototype.client-portal",
    label: "Client Portal Prototype",
    description: "A client-facing portal for requests, documents, statuses, and selected account records.",
    complexity: "demo",
    defaultNavigation: ["Overview", "Requests", "Documents", "Messages"],
    modules: [
      {
        id: "portal-records",
        label: "Client Records",
        requiredBlocks: ["design.shell", "design.table", "domain.crm"],
      },
      {
        id: "portal-messages",
        label: "Messages and Updates",
        requiredBlocks: ["workflow.inbox", "core.comments"],
      },
    ],
  },
] satisfies PrototypeBlueprint[];

export function getPrototypeBlueprint(id: string): PrototypeBlueprint | undefined {
  return prototypeBlueprints.find((blueprint) => blueprint.id === id);
}

export function getPrototypeBlockMap(blueprint: PrototypeBlueprint) {
  const blockIds = new Set<string>();

  for (const module of blueprint.modules) {
    module.requiredBlocks.forEach((blockId) => blockIds.add(blockId));
    module.optionalBlocks?.forEach((blockId) => blockIds.add(blockId));
  }

  return resolvePlatformBlockIds([...blockIds]);
}

export function getPrototypeBuildSummary(blueprint: PrototypeBlueprint): string {
  const blocks = getPrototypeBlockMap(blueprint);
  const layers = [...new Set(blocks.map((block) => block.layer))].join(", ");

  return `${blueprint.label}: ${blueprint.modules.length} modules, ${blocks.length} platform blocks, layers: ${layers}.`;
}
