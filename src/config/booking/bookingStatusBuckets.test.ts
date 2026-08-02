import { describe, it, expect } from "vitest";
import { BOOKING_STATUS_BUCKETS, SERVICE_STATUS_OPTIONS } from "./bookingFieldOptions";

// The booking list tabs used to filter on hardcoded status strings that no
// service actually offers ("In Progress"), while submitted bookings were written
// as "Created" — so ~92% of rows matched no tab. These tests exist so that
// adding a status without bucketing it fails the build instead of silently
// making rows unreachable from every status tab.

const ALL_BUCKETED = Object.values(BOOKING_STATUS_BUCKETS).flat() as string[];

describe("booking status buckets", () => {
  it("assigns every status offered by every service to a bucket", () => {
    const offered = [...new Set(Object.values(SERVICE_STATUS_OPTIONS).flat())];
    const unbucketed = offered.filter((s) => !ALL_BUCKETED.includes(s));
    expect(unbucketed).toEqual([]);
  });

  it("buckets 'Created' — the status every submitted booking is written with", () => {
    // Regression guard for the original bug: Created matched no tab.
    expect(BOOKING_STATUS_BUCKETS.inProgress).toContain("Created");
  });

  it("never puts the same status in two buckets", () => {
    const dupes = ALL_BUCKETED.filter((s, i) => ALL_BUCKETED.indexOf(s) !== i);
    expect(dupes).toEqual([]);
  });

  it("keeps Draft as the only draft-bucket status", () => {
    // "Created" means submitted, not drafted — the two must not merge.
    expect(BOOKING_STATUS_BUCKETS.draft).toEqual(["Draft"]);
  });
});
