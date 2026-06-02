import { describe, expect, it } from "vitest";
import { getAvailableBookingStatuses } from "./StatusSelector";

describe("getAvailableBookingStatuses", () => {
  it("exposes the full flat brokerage status list regardless of current status", () => {
    expect(getAvailableBookingStatuses("Cancelled", "Brokerage")).toEqual([
      "Draft",
      "Waiting for Arrival",
      "Ongoing",
      "Delivered",
      "Billed",
      "Paid",
      "Audited",
      "Cancelled",
    ]);
  });

  it("exposes the full flat forwarding status list regardless of current status", () => {
    expect(getAvailableBookingStatuses("Completed", "Forwarding")).toEqual([
      "Draft",
      "Ongoing",
      "In Transit",
      "Delivered",
      "Completed",
      "Billed",
      "Paid",
      "Cancelled",
    ]);
  });
});
