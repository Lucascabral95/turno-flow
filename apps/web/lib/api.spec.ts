import { describe, expect, it } from "vitest";

import { formatMoney } from "./api";

describe("formatMoney", () => {
  it("formats cents as Argentine pesos", () => {
    expect(formatMoney(123400)).toContain("1.234");
  });
});
