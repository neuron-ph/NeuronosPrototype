import { describe, expect, it } from "vitest";

import { buildProjectInsertFromQuotation } from "./projectHydration";

describe("buildProjectInsertFromQuotation", () => {
  it("stores quotation_name in details instead of as a top-level projects column", () => {
    const payload = buildProjectInsertFromQuotation(
      {
        id: "quo-1",
        quote_number: "QUO-123",
        quotation_name: "Test Quotation",
        customer_id: "cust-1",
        customer_name: "Batangas Steel Fabricators Inc.",
        services: ["Forwarding", "Brokerage"],
      },
      {
        id: "user-1",
        name: "Jake Villanueva",
      },
      {
        id: "proj-1",
        projectNumber: "PRJ-123",
      },
    );

    expect(payload).not.toHaveProperty("quotation_name");
    expect(payload).toMatchObject({
      id: "proj-1",
      project_number: "PRJ-123",
      quotation_id: "quo-1",
      customer_id: "cust-1",
      customer_name: "Batangas Steel Fabricators Inc.",
      services: ["Forwarding", "Brokerage"],
      created_by: "user-1",
      created_by_name: "Jake Villanueva",
    });
    expect(payload).toHaveProperty("details");
    expect(payload.details).toMatchObject({
      quotation_number: "QUO-123",
      quotation_name: "Test Quotation",
      customer_id: "cust-1",
      customer_name: "Batangas Steel Fabricators Inc.",
    });
  });
});
