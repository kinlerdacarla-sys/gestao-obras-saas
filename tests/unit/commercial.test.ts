import { describe, it, expect } from "vitest";
import {
  expensePatch,
  contractPatch,
  centerPatch,
  supplierPatch,
} from "../../packages/validation/src/commercial.js";
import * as d from "../../packages/domain/src/commercial.js";
describe("M4 commercial domain", () => {
  it("does not inject create defaults into partial updates", () => {
    for (const schema of [
      expensePatch,
      contractPatch,
      centerPatch,
      supplierPatch,
    ])
      expect(schema.parse({ version: 2 })).toEqual({ version: 2 });
  });
  it("keeps original plus approved additions minus omissions", () =>
    expect(d.currentContractValue("10000000", "1500000", "300000")).toBe(
      "11200000.00",
    ));
  it("rejects negative current value", () =>
    expect(() => d.currentContractValue("100", "0", "101")).toThrow());
  it("calculates retention", () =>
    expect(d.calculateRetention("1000000", "5")).toBe("50000.00"));
  it("calculates advance on original", () =>
    expect(d.calculateAdvance("10000000", "10")).toBe("1000000.00"));
  it("accepts fixed advance", () =>
    expect(d.calculateAdvance("1000", "0", "125")).toBe("125.00"));
  it("rejects conflicting advance models", () =>
    expect(() => d.calculateAdvance("1000", "10", "100")).toThrow());
  it("rejects advance over original", () =>
    expect(() => d.calculateAdvance("100", "0", "101")).toThrow());
  it.each(["-1", "100.01", "101", "0.001"])("rejects retention %s", (p) =>
    expect(() => d.calculateRetention("100", p)).toThrow(),
  );
  it("calculates contract item with half-up rounding", () =>
    expect(d.contractItemTotal("1.2345", "100")).toBe("123.45"));
  it("accepts lump sum item", () =>
    expect(d.contractItemTotal(null, null, "150")).toBe("150.00"));
  it("rejects incomplete item", () =>
    expect(() => d.contractItemTotal("2", null, "100")).toThrow());
  it("recalculates supplied total", () =>
    expect(d.contractItemTotal("2", "3", "999")).toBe("6.00"));
  it("calculates expense total", () =>
    expect(d.expenseTotal("100000", "16000")).toBe("116000.00"));
  it("avoids double counting contract expenses", () =>
    expect(d.remainingBudget("25000000", "19200000", "750000")).toBe(
      "5050000.00",
    ));
  it("allows negative remaining budget", () =>
    expect(d.remainingBudget("100", "110", "5")).toBe("-15.00"));
  it("warns overcontracting", () =>
    expect(d.overcontracted("100", "101")).toEqual([
      "BUDGET_ITEM_OVERCONTRACTED",
    ]));
  it("does not warn equal contracting", () =>
    expect(d.overcontracted("100", "100")).toEqual([]));
  it("rejects money overflow", () =>
    expect(() => d.expenseTotal("9999999999999999.99", "1")).toThrow());
  it("does not lose precision beyond safe integer", () =>
    expect(d.expenseTotal("9007199254740993", "0.01")).toBe(
      "9007199254740993.01",
    ));
  it("activates draft contract", () =>
    expect(d.contractTransition("DRAFT", "activate")).toBe("ACTIVE"));
  it("rejects invalid contract transition", () =>
    expect(() => d.contractTransition("COMPLETED", "activate")).toThrow());
  it("approves submitted amendment", () =>
    expect(d.approvalTransition("SUBMITTED", "approve")).toBe("APPROVED"));
  it("rejects approving draft", () =>
    expect(() => d.approvalTransition("DRAFT", "approve")).toThrow());
  it("reverses approved expense only", () =>
    expect(d.approvalTransition("APPROVED", "reverse", true)).toBe("REVERSED"));
  it("prevents approved amendment edits", () =>
    expect(() => d.editable("APPROVED", "CONTRACT_AMENDMENT")).toThrow());
  it("prevents approved expense edits", () =>
    expect(() => d.editable("APPROVED", "EXPENSE")).toThrow());
  it("rejects self approval", () =>
    expect(() => d.selfApproval("a", "a")).toThrow());
  it("allows distinct approver", () =>
    expect(() => d.selfApproval("a", "b")).not.toThrow());
  it("allows explicit policy override", () =>
    expect(() => d.selfApproval("a", "a", false)).not.toThrow());
  it("rejects stale version", () =>
    expect(() => d.assertVersion(2, 1)).toThrow());
  it("accepts current version", () =>
    expect(() => d.assertVersion(2, 2)).not.toThrow());
});
