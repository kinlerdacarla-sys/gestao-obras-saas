import { describe, it, expect } from "vitest";
import * as d from "../../packages/domain/src/financial.js";
describe("M5 financial calculations", () => {
  it("calculates previous current and cumulative quantities", () => {
    expect(d.measurementValues("20", "30", "100", "10000", "1000000")).toEqual({
      previousQuantity: "20.0000",
      currentQuantity: "30.0000",
      cumulativeQuantity: "50.0000",
      previousAmount: "200000.00",
      currentAmount: "300000.00",
      cumulativeAmount: "500000.00",
    });
  });
  it("accepts exact quantity limit", () =>
    expect(
      d.measurementValues("20", "80", "100", "10000", "1000000")
        .cumulativeQuantity,
    ).toBe("100.0000"));
  it("rejects excess quantity", () =>
    expect(() =>
      d.measurementValues("20", "81", "100", "10000", "1000000"),
    ).toThrow());
  it("rejects excess value", () =>
    expect(() =>
      d.measurementValues("0", "10", "100", "10000", "99999"),
    ).toThrow());
  it("uses approved previous amounts without rounding again", () =>
    expect(
      d.measurementValues("0.3333", "0.3333", "1", "1", "1", "0.33")
        .cumulativeAmount,
    ).toBe("0.66"));
  it("calculates net certification", () =>
    expect(
      d.measurementTotals("1000000", "5", "100000", "20000").netCertifiedAmount,
    ).toBe("830000.00"));
  it("rejects negative net", () =>
    expect(() => d.measurementTotals("100", "5", "100", "1")).toThrow());
  it.each([
    ["PERCENTAGE", "10", "0", "0", "100000.00"],
    ["FIXED", "0", "50000", "0", "50000.00"],
    ["MANUAL", "0", "0", "23000", "23000.00"],
  ])("recovers with %s", (method, p, f, m, result) =>
    expect(d.recovery("1000000", "700000", method, p, f, m)).toBe(result),
  );
  it("caps automatic recovery", () =>
    expect(d.recovery("1000000", "50000", "PERCENTAGE", "10", "0", "0")).toBe(
      "50000.00",
    ));
  it("rejects excessive manual recovery", () =>
    expect(() => d.recovery("100", "10", "MANUAL", "0", "0", "11")).toThrow());
  it.each([
    ["0", "CERTIFIED"],
    ["500", "PARTIALLY_PAID"],
    ["1000", "PAID"],
  ])("derives paid state %s", (paid, state) =>
    expect(d.paymentState("1000", paid)).toBe(state),
  );
  it("rejects overpayment", () =>
    expect(() => d.paymentState("1000", "1000.01")).toThrow());
  it("forbids self approval", () =>
    expect(() => d.independent("one", "one")).toThrow());
  it("permits independent approval", () =>
    expect(() => d.independent("one", "two")).not.toThrow());
  it("rejects stale versions", () =>
    expect(() => d.assertVersion(2, 1)).toThrow());
  it("balances retention reversals and releases", () =>
    expect(
      d.ledgerBalance(
        [
          { type: "WITHHELD", amount: "100" },
          { type: "RELEASED", amount: "30" },
          { type: "REVERSED", amount: "20" },
        ],
        ["WITHHELD"],
      ),
    ).toBe("50.00"));
  it("restores reversed advances", () =>
    expect(
      d.ledgerBalance(
        [
          { type: "ADVANCE_GRANTED", amount: "700000" },
          { type: "ADVANCE_RECOVERED", amount: "100000" },
          { type: "ADVANCE_REVERSED", amount: "20000" },
        ],
        ["ADVANCE_GRANTED", "ADVANCE_REVERSED"],
      ),
    ).toBe("620000.00"));
});
