import type { WorkflowDefinition } from "./types";

export const approvalWorkflow = {
  id: "approval.standard",
  label: "Standard Approval Flow",
  recordType: "approval_request",
  steps: [
    {
      id: "draft",
      label: "Draft",
      actor: "requester",
      next: ["submitted"],
    },
    {
      id: "submitted",
      label: "Submitted",
      actor: "owner",
      next: ["in_review", "rejected"],
    },
    {
      id: "in_review",
      label: "In Review",
      actor: "reviewer",
      next: ["approved", "rejected", "needs_revision"],
    },
    {
      id: "needs_revision",
      label: "Needs Revision",
      actor: "requester",
      next: ["submitted", "cancelled"],
    },
    {
      id: "approved",
      label: "Approved",
      actor: "approver",
      next: ["closed"],
    },
    {
      id: "rejected",
      label: "Rejected",
      actor: "approver",
      next: ["closed"],
    },
    {
      id: "cancelled",
      label: "Cancelled",
      actor: "requester",
      next: [],
      terminal: true,
    },
    {
      id: "closed",
      label: "Closed",
      actor: "owner",
      next: [],
      terminal: true,
    },
  ],
} satisfies WorkflowDefinition;

export const workflowDefinitions = [approvalWorkflow] satisfies WorkflowDefinition[];

export function getWorkflowStep(workflow: WorkflowDefinition, stepId: string) {
  return workflow.steps.find((step) => step.id === stepId);
}

export function canTransition(workflow: WorkflowDefinition, fromStepId: string, toStepId: string): boolean {
  const fromStep = getWorkflowStep(workflow, fromStepId);
  return Boolean(fromStep?.next.includes(toStepId));
}

export function assertWorkflowIsValid(workflow: WorkflowDefinition): void {
  const ids = new Set(workflow.steps.map((step) => step.id));
  const duplicateCount = workflow.steps.length - ids.size;

  if (duplicateCount > 0) {
    throw new Error(`Workflow ${workflow.id} has duplicate step ids`);
  }

  for (const step of workflow.steps) {
    for (const nextStep of step.next) {
      if (!ids.has(nextStep)) {
        throw new Error(`Workflow ${workflow.id} step ${step.id} points to unknown step ${nextStep}`);
      }
    }

    if (step.terminal && step.next.length > 0) {
      throw new Error(`Workflow ${workflow.id} terminal step ${step.id} cannot have next steps`);
    }
  }
}
