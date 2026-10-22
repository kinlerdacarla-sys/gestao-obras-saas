import { describe, it, expect } from "vitest";
import * as d from "../../packages/domain/src/quality.js";
const answer = {
  result: "PASS",
  textValue: null,
  numericValue: null,
  dateValue: null,
  comment: null,
  holdPointReleasedAt: null,
};
const rules = {
  responseType: "PASS_FAIL_NA",
  isRequired: true,
  requirePhotoOnFail: true,
  isHoldPoint: false,
};
describe("M6 quality domain", () => {
  it("freezes published and superseded versions", () => {
    expect(() => d.editableChecklist("PUBLISHED")).toThrow();
    expect(() => d.editableChecklist("SUPERSEDED")).toThrow();
    d.editableChecklist("DRAFT");
  });
  it("computes FAIL from mixed checklist", () =>
    expect(d.overall([answer, answer, { ...answer, result: "FAIL" }])).toBe(
      "FAIL",
    ));
  it("computes observations without FAIL", () =>
    expect(d.overall([{ ...answer, comment: "Confirmar acabamento" }])).toBe(
      "PASS_WITH_OBSERVATIONS",
    ));
  it("computes PASS", () => expect(d.overall([answer])).toBe("PASS"));
  it("requires mandatory response", () =>
    expect(() =>
      d.validateAnswer({ ...answer, result: null }, rules, false),
    ).toThrow());
  it("requires confirmed photo on failure", () =>
    expect(() =>
      d.validateAnswer({ ...answer, result: "FAIL" }, rules, false),
    ).toThrow());
  it("accepts evidenced failure", () =>
    d.validateAnswer({ ...answer, result: "FAIL" }, rules, true));
  it("requires TEXT", () =>
    expect(() =>
      d.validateAnswer(answer, { ...rules, responseType: "TEXT" }, false),
    ).toThrow());
  it("accepts numeric zero", () =>
    d.validateAnswer(
      { ...answer, numericValue: 0 },
      { ...rules, responseType: "NUMBER" },
      false,
    ));
  it("requires DATE", () =>
    expect(() =>
      d.validateAnswer(answer, { ...rules, responseType: "DATE" }, false),
    ).toThrow());
  it("blocks unreleased hold point", () =>
    expect(() =>
      d.holdPoint(
        { ...answer, result: "FAIL" },
        { ...rules, isHoldPoint: true },
      ),
    ).toThrow());
  it("keeps original failure after hold release", () =>
    expect(
      d.overall([
        { ...answer, result: "FAIL", holdPointReleasedAt: new Date() },
      ]),
    ).toBe("FAIL"));
  it("executes NCR workflow", () => {
    for (const [a, b] of [
      ["OPEN", "ASSIGNED"],
      ["ASSIGNED", "CORRECTION_IN_PROGRESS"],
      ["CORRECTION_IN_PROGRESS", "READY_FOR_VERIFICATION"],
      ["READY_FOR_VERIFICATION", "CLOSED"],
      ["CLOSED", "REOPENED"],
    ])
      d.transition(a, b, "NCR");
  });
  it("reopens rejected corrections", () =>
    d.transition("READY_FOR_VERIFICATION", "REOPENED", "NCR"));
  it("rejects NCR shortcuts", () =>
    expect(() => d.transition("OPEN", "CLOSED", "NCR")).toThrow());
  it("executes correction workflow", () => {
    for (const [a, b] of [
      ["OPEN", "IN_PROGRESS"],
      ["IN_PROGRESS", "COMPLETED"],
      ["COMPLETED", "VERIFIED"],
    ])
      d.transition(a, b, "CORRECTIVE_ACTION");
  });
  it("protects verified correction", () =>
    expect(() =>
      d.transition("VERIFIED", "IN_PROGRESS", "CORRECTIVE_ACTION"),
    ).toThrow());
  it("uses Maputo date for overdue", () => {
    expect(
      d.overdue(
        new Date("2026-10-12"),
        "OPEN",
        new Date("2026-10-12T23:00:00Z"),
      ),
    ).toBe(true);
    expect(
      d.overdue(new Date("2026-10-12"), "CLOSED", new Date("2026-10-14")),
    ).toBe(false);
    expect(
      d.overdue(new Date("2026-10-12"), "CANCELLED", new Date("2026-10-14")),
    ).toBe(false);
  });
  it("calculates rates without zero division", () => {
    expect(d.rate(34, 48)).toBe(70.83);
    expect(d.rate(0, 0)).toBe(0);
    expect(d.rate(35, 50)).toBe(70);
  });
  it("averages closure duration", () =>
    expect(
      d.averageClosure([
        {
          detectedAt: new Date("2026-10-01"),
          closedAt: new Date("2026-10-06"),
        },
        { detectedAt: new Date(), closedAt: null },
      ]),
    ).toBe(5));
  it("prevents self verification", () =>
    expect(() => d.independent("a", "a")).toThrow());
  it("allows independent verifier", () => d.independent("a", "b"));
  it("blocks critical NCR until CLOSED, including cancelled", () => {
    for (const status of ["OPEN", "REOPENED", "CANCELLED"])
      expect(d.blocksMeasurement({ severity: "CRITICAL", status })).toBe(true);
    expect(
      d.blocksMeasurement({ severity: "CRITICAL", status: "CLOSED" }),
    ).toBe(false);
    expect(d.blocksMeasurement({ severity: "HIGH", status: "OPEN" })).toBe(
      false,
    );
    expect(
      d.blocksMeasurement({ severity: "CRITICAL", status: "OPEN" }, false),
    ).toBe(false);
  });
  it("rejects optimistic lock mismatch", () =>
    expect(() => d.assertVersion(2, 1)).toThrow());
});
