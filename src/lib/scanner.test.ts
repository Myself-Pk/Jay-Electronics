import { describe, expect, it } from "vitest";
import { makeRepeatGuard } from "./scanner";

describe("makeRepeatGuard", () => {
  it("lets a code through once, then again only after a pause; other codes go straight through", () => {
    const fresh = makeRepeatGuard(1500);
    expect(fresh("8901234567890", 0)).toBe(true);
    expect(fresh("8901234567890", 400)).toBe(false);
    expect(fresh("8901234567890", 1300)).toBe(false);
    expect(fresh("8901234567890", 3000)).toBe(true);
    expect(fresh("QR-ABC", 3100)).toBe(true);
    expect(fresh("8901234567890", 3200)).toBe(true);
  });
});
