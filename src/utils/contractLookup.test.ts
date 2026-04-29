import { describe, expect, it } from "vitest";
import type { ContractSummary } from "../types/pricing";
import {
  filterContractsForService,
  pickBestContractForService,
} from "./contractLookup";

function makeContract(
  id: string,
  services: string[],
  quoteNumber = `QUO-${id}`
): ContractSummary {
  return {
    id,
    quote_number: quoteNumber,
    quotation_name: `Contract ${id}`,
    customer_name: "Falcon Logistics",
    contract_status: "Active" as any,
    services,
  };
}

describe("filterContractsForService", () => {
  it("returns only contracts covering the requested service", () => {
    const contracts = [
      makeContract("1", ["Brokerage"]),
      makeContract("2", ["Trucking"]),
      makeContract("3", ["Brokerage", "Others"]),
    ];

    expect(filterContractsForService(contracts, "Brokerage").map((contract) => contract.id)).toEqual(["1", "3"]);
  });

  it("matches services case-insensitively", () => {
    const contracts = [makeContract("1", ["brokerage"])];
    expect(filterContractsForService(contracts, "Brokerage").map((contract) => contract.id)).toEqual(["1"]);
  });
});

describe("pickBestContractForService", () => {
  it("returns the first service-matching contract when available", () => {
    const contracts = [
      makeContract("1", ["Trucking"]),
      makeContract("2", ["Brokerage"]),
      makeContract("3", ["Brokerage"]),
    ];

    expect(pickBestContractForService(contracts, "Brokerage")?.id).toBe("2");
  });

  it("falls back to the first active contract when exact match is not required", () => {
    const contracts = [
      makeContract("1", ["Trucking"]),
      makeContract("2", ["Others"]),
    ];

    expect(pickBestContractForService(contracts, "Brokerage")?.id).toBe("1");
  });

  it("returns null when exact match is required and no service contract exists", () => {
    const contracts = [
      makeContract("1", ["Trucking"]),
      makeContract("2", ["Others"]),
    ];

    expect(
      pickBestContractForService(contracts, "Brokerage", { requireExactServiceMatch: true })
    ).toBeNull();
  });
});
