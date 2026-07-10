import { describe, it, expect } from "vitest";
import { parseCreditTermDays } from "./creditTerms";

describe("parseCreditTermDays (NEU-068)", () => {
  it("reads the day count from NET terms", () => {
    expect(parseCreditTermDays("NET 15")).toBe(15);
    expect(parseCreditTermDays("NET 30")).toBe(30);
    expect(parseCreditTermDays("Net 45 days")).toBe(45);
  });

  it("treats COD / cash / due-on-receipt as same-day", () => {
    expect(parseCreditTermDays("COD")).toBe(0);
    expect(parseCreditTermDays("Cash on delivery")).toBe(0);
    expect(parseCreditTermDays("Due on receipt")).toBe(0);
  });

  it("defaults to 15 when blank or unparseable", () => {
    expect(parseCreditTermDays("")).toBe(15);
    expect(parseCreditTermDays(undefined as unknown as string)).toBe(15);
    expect(parseCreditTermDays("on account")).toBe(15);
  });

  it("produces the reported repro: Jul 9 + NET 15 = Jul 24", () => {
    const d = new Date("2026-07-09");
    d.setDate(d.getDate() + parseCreditTermDays("NET 15"));
    expect(d.toISOString().split("T")[0]).toBe("2026-07-24");
  });
});
