import { describe, expect, it } from "vitest";
import { addMonths, isOverdueRegistration, timeLeft, warrantyStatus } from "./warranty";

describe("timeLeft", () => {
  it("counts years and months, then days", () => {
    expect(timeLeft("2026-11-08", "2030-11-07")).toEqual({ years: 3, months: 11, days: 30 });
    expect(timeLeft("2026-11-08", "2028-03-08")).toEqual({ years: 1, months: 4, days: 0 });
    expect(timeLeft("2026-11-08", "2026-11-28")).toEqual({ years: 0, months: 0, days: 20 });
    expect(timeLeft("2026-11-08", "2026-11-08")).toEqual({ years: 0, months: 0, days: 0 });
    expect(timeLeft("2026-11-08", "2026-11-07")).toBeNull();
  });

  it("marks registrations from earlier days as overdue", () => {
    expect(isOverdueRegistration("2026-11-07", "2026-11-08")).toBe(true);
    expect(isOverdueRegistration("2026-11-08", "2026-11-08")).toBe(false);
    expect(isOverdueRegistration(null, "2026-11-08")).toBe(false);
  });
});

describe("addMonths", () => {
  it("adds calendar months, clamping to the end of short months", () => {
    expect(addMonths("2026-11-07", 48)).toBe("2030-11-07");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
  });
});

describe("warrantyStatus", () => {
  const sold = "2026-11-07";
  it("free replacement, then pro-rata, then expired", () => {
    expect(warrantyStatus(sold, 48, 24, "2027-01-01")).toEqual({ state: "free", until: "2030-11-07", prorataUntil: "2032-11-07" });
    expect(warrantyStatus(sold, 48, 24, "2030-11-07").state).toBe("free"); // last day still free
    expect(warrantyStatus(sold, 48, 24, "2030-11-08")).toEqual({ state: "prorata", until: "2032-11-07" });
    expect(warrantyStatus(sold, 48, 24, "2032-11-08")).toEqual({ state: "expired", endedOn: "2032-11-07" });
  });
  it("no pro-rata period, or no warranty at all", () => {
    expect(warrantyStatus(sold, 24, 0, "2029-01-01")).toEqual({ state: "expired", endedOn: "2028-11-07" });
    expect(warrantyStatus(sold, 0, 0, "2027-01-01")).toEqual({ state: "none" });
    expect(warrantyStatus(null, 24, 0, "2027-01-01")).toEqual({ state: "none" });
  });
});
