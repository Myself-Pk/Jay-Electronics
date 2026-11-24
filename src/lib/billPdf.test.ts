import { describe, expect, it } from "vitest";
import { billPdfName } from "./billPdf";

describe("billPdfName", () => {
  it("makes a safe file name from the bill number", () => {
    expect(billPdfName("JE/26-27/0001")).toBe("Bill-JE-26-27-0001.pdf");
    expect(billPdfName("JE//26-27 /12")).toBe("Bill-JE-26-27-12.pdf");
  });
});
