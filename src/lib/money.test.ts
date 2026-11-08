import { describe, expect, it } from "vitest";
import {
  amountInWords,
  basisPointsToInput,
  compactRupees,
  formatPercent,
  formatRupees,
  fromPaise,
  paiseToInput,
  parsePercent,
  parseRupees,
  percentOf,
  roundToRupee,
  toPaise,
} from "./money";

describe("parseRupees (what people type)", () => {
  it("reads plain, decimal, comma and ₹ amounts", () => {
    expect(parseRupees("105")).toBe(10500);
    expect(parseRupees("105.5")).toBe(10550);
    expect(parseRupees("105.50")).toBe(10550);
    expect(parseRupees("1,23,456.75")).toBe(12345675);
    expect(parseRupees("₹ 14,500")).toBe(1450000);
    expect(parseRupees(" 300 ")).toBe(30000);
    expect(parseRupees("0")).toBe(0);
    expect(parseRupees("105.")).toBe(10500);
  });

  it("rejects things that are not amounts", () => {
    expect(parseRupees("")).toBeNull();
    expect(parseRupees("abc")).toBeNull();
    expect(parseRupees("10.555")).toBeNull();
    expect(parseRupees("1.2.3")).toBeNull();
    expect(parseRupees("₹")).toBeNull();
  });

  it("handles negative amounts (refunds)", () => {
    expect(parseRupees("-50")).toBe(-5000);
  });
});

describe("toPaise / fromPaise (database values)", () => {
  it("converts database numbers without floating-point errors", () => {
    expect(toPaise(0.29)).toBe(29); // 0.29 * 100 = 28.999999999999996 in floating point
    expect(toPaise(1234.5)).toBe(123450);
    expect(toPaise(0.1 + 0.2)).toBe(30);
    expect(toPaise("1234.50")).toBe(123450);
    expect(toPaise(null)).toBe(0);
  });

  it("produces exact decimal strings for the database", () => {
    expect(fromPaise(123450)).toBe("1234.50");
    expect(fromPaise(5)).toBe("0.05");
    expect(fromPaise(0)).toBe("0.00");
    expect(fromPaise(-189000)).toBe("-1890.00");
  });

  it("round-trips", () => {
    for (const p of [0, 1, 99, 100, 10550, 99999999]) expect(toPaise(fromPaise(p))).toBe(p);
  });

  it("refuses fractional paise", () => {
    expect(() => fromPaise(10.5)).toThrow();
  });
});

describe("formatRupees (Indian format)", () => {
  it("uses lakh/crore grouping", () => {
    expect(formatRupees(12345650)).toBe("₹1,23,456.50");
    expect(formatRupees(1000000000)).toBe("₹1,00,00,000");
  });

  it("shows paise only when needed by default", () => {
    expect(formatRupees(1450000)).toBe("₹14,500");
    expect(formatRupees(1450050)).toBe("₹14,500.50");
  });

  it("always shows paise on bills", () => {
    expect(formatRupees(1450000, { paise: "always" })).toBe("₹14,500.00");
  });

  it("rounds to rupees on the dashboard", () => {
    expect(formatRupees(1450050, { paise: "never" })).toBe("₹14,501");
    expect(formatRupees(1450049, { paise: "never" })).toBe("₹14,500");
  });

  it("text for input boxes", () => {
    expect(paiseToInput(10500)).toBe("105");
    expect(paiseToInput(10550)).toBe("105.50");
  });
});

describe("percentages", () => {
  it("parses percentages into basis points", () => {
    expect(parsePercent("1")).toBe(100);
    expect(parsePercent("1.5")).toBe(150);
    expect(parsePercent("2%")).toBe(200);
    expect(parsePercent("101")).toBeNull();
    expect(parsePercent("-1")).toBeNull();
    expect(parsePercent("x")).toBeNull();
  });

  it("shows percentages simply", () => {
    expect(basisPointsToInput(150)).toBe("1.5");
    expect(basisPointsToInput(100)).toBe("1");
    expect(basisPointsToInput(125)).toBe("1.25");
    expect(formatPercent(150)).toBe("1.5%");
  });

  it("calculates card charges, rounding half-up to the paisa", () => {
    expect(percentOf(1450000, 150)).toBe(21750); // 1.5% of ₹14,500 = ₹217.50
    expect(percentOf(1999, 150)).toBe(30); // 29.985 paise → 30
    expect(percentOf(1001, 50)).toBe(5); // 5.005 → 5
    expect(percentOf(1000, 0)).toBe(0);
  });
});

describe("roundToRupee", () => {
  it("rounds to the nearest rupee and reports the round-off", () => {
    expect(roundToRupee(1371049)).toEqual({ total: 1371000, roundOff: -49 });
    expect(roundToRupee(1371050)).toEqual({ total: 1371100, roundOff: 50 });
    expect(roundToRupee(1371000)).toEqual({ total: 1371000, roundOff: 0 });
  });
});

describe("compactRupees (chart labels)", () => {
  it("shortens in Indian style", () => {
    expect(compactRupees(95_000)).toBe("₹950");
    expect(compactRupees(1_352_500)).toBe("₹13.5k");
    expect(compactRupees(12_000_000)).toBe("₹1.2L");
    expect(compactRupees(2_450_000_000)).toBe("₹2.5Cr");
    expect(compactRupees(250_000_000)).toBe("₹25L");
  });
});

describe("amountInWords (Indian style)", () => {
  it("writes amounts the way they are printed on bills", () => {
    expect(amountInWords(1371000)).toBe("Rupees Thirteen Thousand Seven Hundred Ten Only");
    expect(amountInWords(12345650)).toBe(
      "Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six and Fifty Paise Only",
    );
    expect(amountInWords(1000000000)).toBe("Rupees One Crore Only");
    expect(amountInWords(10500)).toBe("Rupees One Hundred Five Only");
    expect(amountInWords(50)).toBe("Rupees Zero and Fifty Paise Only");
    expect(amountInWords(250000000000)).toBe("Rupees Two Hundred Fifty Crore Only");
  });
});
