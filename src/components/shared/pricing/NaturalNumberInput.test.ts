import { describe, expect, it } from "vitest";
import { commitNumberDraft, isAllowedNumberDraft } from "./NaturalNumberInput";

describe("NaturalNumberInput draft helpers", () => {
  it("allows temporary empty and partial decimal drafts", () => {
    expect(isAllowedNumberDraft("")).toBe(true);
    expect(isAllowedNumberDraft(".")).toBe(true);
    expect(isAllowedNumberDraft("12.")).toBe(true);
    expect(isAllowedNumberDraft("12.34")).toBe(true);
    expect(isAllowedNumberDraft("12.3.4")).toBe(false);
    expect(isAllowedNumberDraft("abc")).toBe(false);
  });

  it("commits a draft to a number only when editing is finished", () => {
    expect(commitNumberDraft("", 0)).toBe(0);
    expect(commitNumberDraft(".", 0)).toBe(0);
    expect(commitNumberDraft("234", 0)).toBe(234);
    expect(commitNumberDraft("234.5", 0)).toBe(234.5);
  });
});
