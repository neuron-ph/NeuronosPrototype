export type PlatformLayer = "design" | "core" | "domain" | "workflow" | "template";

export type SurfaceLevel = "full-screen" | "side-panel" | "inline" | "modal";

export type PrototypeComplexity = "demo" | "pilot" | "production";

export type WorkflowActor = "requester" | "owner" | "reviewer" | "approver" | "observer";

export interface PlatformBlock {
  id: string;
  label: string;
  layer: PlatformLayer;
  description: string;
  source?: string;
  dependencies?: string[];
  recommendedSurface?: SurfaceLevel;
}

export interface PrototypeModule {
  id: string;
  label: string;
  requiredBlocks: string[];
  optionalBlocks?: string[];
}

export interface PrototypeBlueprint {
  id: string;
  label: string;
  description: string;
  complexity: PrototypeComplexity;
  modules: PrototypeModule[];
  defaultNavigation: string[];
}

export interface WorkflowStepDefinition {
  id: string;
  label: string;
  actor: WorkflowActor;
  next: string[];
  terminal?: boolean;
}

export interface WorkflowDefinition {
  id: string;
  label: string;
  recordType: string;
  steps: WorkflowStepDefinition[];
}
