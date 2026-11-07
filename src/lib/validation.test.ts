import { describe, expect, it } from "vitest";
import {
  gstinCheckChar,
  isValidGstin,
  isValidMobile,
  isValidPhone,
  isValidPin,
  isValidUpiId,
  normalizeMobile,
} from "./validation";

describe("GSTIN", () => {
  it("accepts GSTINs with a correct check character", () => {
    // Build a valid Jharkhand GSTIN from a made-up PAN and check its checksum both ways.
    const first14 = "20ABCDE1234F1Z";
    const gstin = first14 + gstinCheckChar(first14);
    expect(isValidGstin(gstin)).toBe(true);
    expect(isValidGstin(gstin.toLowerCase())).toBe(true);
  });

  it("matches a widely published sample GSTIN", () => {
    expect(isValidGstin("27AAPFU0939F1ZV")).toBe(true);
  });

  it("rejects wrong check characters and bad shapes", () => {
    expect(isValidGstin("27AAPFU0939F1ZA")).toBe(false);
    expect(isValidGstin("27AAPFU0939F1Z")).toBe(false);
    expect(isValidGstin("")).toBe(false);
    expect(isValidGstin("ABCDEFGHIJKLMNO")).toBe(false);
  });
});

describe("phone numbers", () => {
  it("normalises Indian mobile numbers", () => {
    expect(normalizeMobile("+91 98765 43210")).toBe("9876543210");
    expect(normalizeMobile("09876543210")).toBe("9876543210");
    expect(isValidMobile("98765-43210")).toBe(true);
    expect(isValidMobile("5876543210")).toBe(false);
    expect(isValidMobile("98765")).toBe(false);
  });

  it("allows landlines with STD code for the shop phone", () => {
    expect(isValidPhone("06542 123456")).toBe(true);
    expect(isValidPhone("9876543210")).toBe(true);
    expect(isValidPhone("12345")).toBe(false);
  });
});

describe("UPI ID and PIN", () => {
  it("checks UPI IDs", () => {
    expect(isValidUpiId("jayelectronics@okaxis")).toBe(true);
    expect(isValidUpiId("9876543210@ybl")).toBe(true);
    expect(isValidUpiId("jayelectronics")).toBe(false);
    expect(isValidUpiId("@okaxis")).toBe(false);
  });

  it("PINs are exactly 6 digits", () => {
    expect(isValidPin("123456")).toBe(true);
    expect(isValidPin("12345")).toBe(false);
    expect(isValidPin("12345a")).toBe(false);
  });
});
