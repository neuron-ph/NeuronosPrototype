import { describe, expect, it } from "vitest";
import {
  approvalWorkflow,
  assertWorkflowIsValid,
  canTransition,
  getPrototypeBlockMap,
  getPrototypeBuildSummary,
  prototypeBlueprints,
} from ".";

describe("Neuron platform kit", () => {
  it("keeps workflow definitions internally valid", () => {
    expect(() => assertWorkflowIsValid(approvalWorkflow)).not.toThrow();
  });

  it("allows only declared workflow transitions", () => {
    expect(canTransition(approvalWorkflow, "draft", "submitted")).toBe(true);
    expect(canTransition(approvalWorkflow, "draft", "approved")).toBe(false);
  });

  it("resolves every prototype blueprint to known platform blocks", () => {
    for (const blueprint of prototypeBlueprints) {
      const blocks = getPrototypeBlockMap(blueprint);

      expect(blocks.length).toBeGreaterThan(0);
    }
  });

  it("summarizes prototype build inputs for planning", () => {
    expect(getPrototypeBuildSummary(prototypeBlueprints[0])).toContain("platform blocks");
  });
});
