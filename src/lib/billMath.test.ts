import { describe, expect, it } from "vitest";
import { cardCharge, computeTotals, scrapByWeight, warrantyText } from "./billMath";

describe("cardCharge", () => {
  it("is a percentage rounded to whole rupees", () => {
    expect(cardCharge(1_000_000, 200)).toBe(20_000); // 2% of ₹10,000 = ₹200
    expect(cardCharge(1_371_000, 200)).toBe(27_400); // 2% of ₹13,710 = ₹274.20 → ₹274
    expect(cardCharge(1_372_500, 200)).toBe(27_500); // ₹274.50 → ₹275
    expect(cardCharge(1_000_000, 150)).toBe(15_000); // 1.5%
    expect(cardCharge(0, 200)).toBe(0);
    expect(cardCharge(1_000_000, 0)).toBe(0);
  });
});

describe("scrapByWeight", () => {
  it("multiplies kg by the rate per kg", () => {
    expect(scrapByWeight(1800, 10_500)).toBe(189_000); // 18 kg × ₹105 = ₹1,890
    expect(scrapByWeight(1850, 10_500)).toBe(194_250); // 18.5 kg × ₹105 = ₹1,942.50
    expect(scrapByWeight(0, 10_500)).toBe(0);
  });
});

describe("computeTotals", () => {
  it("works out the sketch bill from the plan", () => {
    const t = computeTotals({
      lines: [
        { qty: 1, rate: 1_450_000 }, // battery
        { qty: 1, rate: 80_000 }, // trolley
        { qty: 1, rate: 30_000 }, // delivery
      ],
      scrapValues: [189_000],
      payments: [
        { towards: 1_000_000, charges: 0 }, // UPI
        { towards: 371_000, charges: 0 }, // cash
      ],
    });
    expect(t).toEqual({
      subtotal: 1_560_000,
      scrapCredit: 189_000,
      extraCharges: 0,
      roundOff: 0,
      total: 1_371_000,
      paid: 1_371_000,
      balance: 0,
    });
  });

  it("adds card charges to the bill and to what was paid", () => {
    const towards = 1_371_000;
    const charges = cardCharge(towards, 200);
    const t = computeTotals({
      lines: [{ qty: 1, rate: 1_371_000 }],
      scrapValues: [],
      payments: [{ towards, charges }],
    });
    expect(t.extraCharges).toBe(27_400);
    expect(t.total).toBe(1_398_400);
    expect(t.balance).toBe(0); // paying the full due by card always settles the bill exactly
  });

  it("keeps the bill settled even when old battery value has paise", () => {
    const lines = [{ qty: 1, rate: 1_450_000 }];
    const scrapValues = [scrapByWeight(1850, 10_500)]; // ₹1,942.50
    const before = computeTotals({ lines, scrapValues, payments: [] });
    expect(before.total).toBe(1_255_800); // ₹12,557.50 → ₹12,558
    expect(before.roundOff).toBe(50);
    const towards = before.balance;
    const after = computeTotals({
      lines,
      scrapValues,
      payments: [{ towards, charges: cardCharge(towards, 200) }],
    });
    expect(after.balance).toBe(0);
  });

  it("leaves the unpaid part as udhaar", () => {
    const t = computeTotals({
      lines: [{ qty: 2, rate: 80_000 }],
      scrapValues: [],
      payments: [{ towards: 100_000, charges: 0 }],
    });
    expect(t.total).toBe(160_000);
    expect(t.balance).toBe(60_000);
  });

  it("counts the Bajaj loan as paid and its charges on the bill", () => {
    const t = computeTotals({
      lines: [{ qty: 1, rate: 2_000_000 }],
      scrapValues: [],
      payments: [{ towards: 550_000, charges: 0 }], // down payment incl. charges
      finance: { loanAmount: 1_500_000, customerCharges: 50_000 },
    });
    expect(t.total).toBe(2_050_000);
    expect(t.paid).toBe(2_050_000);
    expect(t.balance).toBe(0);
  });
});

describe("warrantyText", () => {
  it("describes warranty in plain words", () => {
    expect(warrantyText(48, 24)).toBe("48 months free + 24 months pro-rata");
    expect(warrantyText(24, 0)).toBe("24 months warranty");
    expect(warrantyText(0, 0)).toBe("");
  });
});
