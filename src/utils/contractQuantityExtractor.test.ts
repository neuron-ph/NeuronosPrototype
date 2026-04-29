import { describe, expect, it } from "vitest";
import { deriveQuantitiesFromBooking } from "./contractQuantityExtractor";

describe("deriveQuantitiesFromBooking", () => {
  it("handles serialized container arrays on brokerage bookings", () => {
    const result = deriveQuantitiesFromBooking(
      {
        mode: "FCL",
        containers: JSON.stringify([
          { id: "1", type: "20ft", qty: 2 },
          { id: "2", type: "40ft", qty: 1 },
        ]) as unknown as never,
      },
      "Brokerage",
    );

    expect(result).toEqual({
      containers: 3,
      bls: 1,
      sets: 1,
      shipments: 1,
    });
  });

  it("falls back safely when containers is a non-array scalar", () => {
    const result = deriveQuantitiesFromBooking(
      {
        mode: "FCL",
        containers: "not-json" as unknown as never,
      },
      "Brokerage",
    );

    expect(result).toEqual({
      containers: 1,
      bls: 1,
      sets: 1,
      shipments: 1,
    });
  });
});
