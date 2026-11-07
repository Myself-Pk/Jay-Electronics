import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@/data/defaults";
import { gstinCheckChar } from "@/lib/validation";
import { fromDraft, toDraft } from "./settingsDraft";

const validJharkhandGstin = (() => {
  const first14 = "20ABCDE1234F1Z";
  return first14 + gstinCheckChar(first14);
})();

describe("settings form", () => {
  it("round-trips the default settings unchanged", () => {
    const result = fromDraft(toDraft(DEFAULT_SETTINGS));
    expect(result).toEqual({ ok: true, settings: DEFAULT_SETTINGS });
  });

  it("shows defaults the way a person would type them", () => {
    const draft = toDraft(DEFAULT_SETTINGS);
    expect(draft.scrapRatePerKg).toBe("105");
    expect(draft.compositionRate).toBe("1");
    expect(draft.deliveryPresets).toEqual(["200", "300", "500"]);
  });

  it("converts typed values", () => {
    const draft = {
      ...toDraft(DEFAULT_SETTINGS),
      scrapRatePerKg: "110.50",
      creditCardCharge: "1.75",
      billPrefix: "je",
      nextBillNumber: "1501",
      gstin: validJharkhandGstin.toLowerCase(),
      deliveryPresets: ["500", "", "250", "500"],
    };
    const result = fromDraft(draft);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.settings.scrapRatePerKg).toBe(11050);
    expect(result.settings.creditCardCharge).toBe(175);
    expect(result.settings.billPrefix).toBe("JE");
    expect(result.settings.nextBillNumber).toBe(1501);
    expect(result.settings.gstin).toBe(validJharkhandGstin);
    expect(result.settings.deliveryPresets).toEqual([25000, 50000]); // blanks dropped, duplicates merged, sorted
  });

  it("reports every problem with a friendly message key", () => {
    const draft = {
      ...toDraft(DEFAULT_SETTINGS),
      shopName: " ",
      phone: "123",
      gstin: "27AAPFU0939F1ZV", // valid, but Maharashtra
      upiId: "nope",
      billPrefix: "TOOLONG",
      nextBillNumber: "0",
      scrapRatePerKg: "abc",
      debitCardCharge: "150",
      deliveryPresets: ["200", "x"],
    };
    const result = fromDraft(draft);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual({
      shopName: "validation.required",
      phone: "validation.phone",
      gstin: "validation.gstinState",
      upiId: "validation.upi",
      billPrefix: "validation.prefix",
      nextBillNumber: "validation.wholeNumber",
      scrapRatePerKg: "validation.amount",
      debitCardCharge: "validation.percent",
      "deliveryPresets.1": "validation.amount",
    });
  });

  it("allows GSTIN, UPI and phone to stay empty for now", () => {
    const draft = { ...toDraft(DEFAULT_SETTINGS), gstin: "", upiId: "", phone: "" };
    expect(fromDraft(draft).ok).toBe(true);
  });
});
