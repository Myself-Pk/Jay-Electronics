import { describe, expect, it } from "vitest";
import { financialYearOf, formatBillNumber, isValidBillPrefix } from "./billNumber";

describe("financialYearOf (April–March)", () => {
  it("April onwards belongs to the new financial year", () => {
    expect(financialYearOf(new Date(2026, 3, 1))).toEqual({ startYear: 2026, label: "26-27" });
    expect(financialYearOf(new Date(2026, 10, 7))).toEqual({ startYear: 2026, label: "26-27" });
    expect(financialYearOf(new Date(2026, 11, 31))).toEqual({ startYear: 2026, label: "26-27" });
  });

  it("January–March belongs to the previous one", () => {
    expect(financialYearOf(new Date(2027, 0, 4))).toEqual({ startYear: 2026, label: "26-27" });
    expect(financialYearOf(new Date(2027, 2, 31))).toEqual({ startYear: 2026, label: "26-27" });
  });

  it("handles the century turn", () => {
    expect(financialYearOf(new Date(2099, 5, 1)).label).toBe("99-00");
  });
});

describe("formatBillNumber", () => {
  const nov2026 = new Date(2026, 10, 7);

  it("builds JE/26-27/0001 style numbers", () => {
    expect(formatBillNumber("JE", nov2026, 1)).toBe("JE/26-27/0001");
    expect(formatBillNumber("JE", nov2026, 1501)).toBe("JE/26-27/1501");
    expect(formatBillNumber("JE", nov2026, 12345)).toBe("JE/26-27/12345");
  });

  it("never goes over the GST limit of 16 characters", () => {
    expect(formatBillNumber("ABCD", nov2026, 99999)).toHaveLength(16);
    expect(() => formatBillNumber("ABCD", nov2026, 100000)).toThrow();
  });

  it("rejects bad prefixes and sequences", () => {
    expect(() => formatBillNumber("je", nov2026, 1)).toThrow();
    expect(() => formatBillNumber("JE", nov2026, 0)).toThrow();
    expect(() => formatBillNumber("JE", nov2026, 1.5)).toThrow();
  });
});

describe("isValidBillPrefix", () => {
  it("allows 1–4 capital letters or digits", () => {
    expect(isValidBillPrefix("JE")).toBe(true);
    expect(isValidBillPrefix("J")).toBe(true);
    expect(isValidBillPrefix("JE26")).toBe(true);
    expect(isValidBillPrefix("")).toBe(false);
    expect(isValidBillPrefix("JELEC")).toBe(false);
    expect(isValidBillPrefix("J/E")).toBe(false);
  });
});
