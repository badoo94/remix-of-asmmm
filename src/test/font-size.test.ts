import { describe, expect, it } from "vitest";
import { clampReaderFont, pageCharBudget } from "@/lib/settings";

describe("reader font size", () => {
  it("stays between 18 and 27 pt in 1 pt steps", () => {
    expect(clampReaderFont(17)).toBe(18);
    expect(clampReaderFont(28)).toBe(27);
    expect(clampReaderFont(20.4)).toBe(20);
  });
  it("gives the AI fewer characters per page at larger sizes", () => {
    expect(pageCharBudget(27)).toBeLessThan(pageCharBudget(18));
  });
});
