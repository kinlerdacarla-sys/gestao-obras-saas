import { describe, it, expect } from "vitest";
import {
  duration,
  planned,
  temporal,
  assertDependencies,
  calculateSchedule,
  variance,
  day,
  type TaskLine,
} from "../../packages/domain/src/schedule.js";
const task = (id: string, extra: Partial<TaskLine> = {}): TaskLine => ({
  id,
  parentId: null,
  taskType: "TASK",
  plannedStart: new Date("2026-10-01"),
  plannedEnd: new Date("2026-10-10"),
  actualProgress: "50",
  weight: "1",
  status: "IN_PROGRESS",
  budgetItemId: null,
  code: id,
  name: id,
  sortOrder: 0,
  ...extra,
});
describe("schedule domain", () => {
  it("derives real dates and state of summaries", () => {
    const result = calculateSchedule(
      [
        task("s", { taskType: "SUMMARY" }),
        task("a", {
          parentId: "s",
          actualProgress: "100",
          actualStart: new Date("2026-10-01"),
          actualEnd: new Date("2026-10-03"),
        }),
      ],
      "MANUAL",
      new Map(),
      "2026-10-05",
    );
    expect(result.items[0].status).toBe("COMPLETED");
    expect(result.items[0].actualStart?.toISOString().slice(0, 10)).toBe(
      "2026-10-01",
    );
    expect(result.items[0].actualEnd?.toISOString().slice(0, 10)).toBe(
      "2026-10-03",
    );
  });
  it("counts inclusive days", () =>
    expect(duration("2026-10-01", "2026-10-10", "TASK")).toBe(10));
  it("counts leap days", () =>
    expect(duration("2024-02-28", "2024-03-01", "TASK")).toBe(3));
  it("rejects impossible dates", () =>
    expect(() => day("2026-02-30")).toThrow());
  it("rejects reversed dates", () =>
    expect(() => duration("2026-10-02", "2026-10-01", "TASK")).toThrow());
  it("requires a single day milestone", () => {
    expect(duration("2026-10-01", "2026-10-01", "MILESTONE")).toBe(0);
    expect(() => duration("2026-10-01", "2026-10-02", "MILESTONE")).toThrow();
  });
  it("plans inclusive elapsed days", () =>
    expect(planned("2026-10-01", "2026-10-10", "TASK", "2026-10-05")).toBe(
      "50.00",
    ));
  it("bounds planned progress", () => {
    expect(planned("2026-10-01", "2026-10-10", "TASK", "2026-09-30")).toBe(
      "0.00",
    );
    expect(planned("2026-10-01", "2026-10-10", "TASK", "2026-10-11")).toBe(
      "100.00",
    );
  });
  it("milestone flips on its date", () =>
    expect(planned("2026-10-01", "2026-10-01", "MILESTONE", "2026-10-01")).toBe(
      "100.00",
    ));
  it.each([
    ["0", "10", "DELAYED"],
    ["46", "50", "AT_RISK"],
    ["50", "50", "ON_TIME"],
    ["56", "50", "AHEAD"],
    ["100", "50", "COMPLETED"],
  ])("classifies %s vs %s", (a, b, c) => expect(temporal(a, b)).toBe(c));
  it("prevents dependency cycles", () =>
    expect(() =>
      assertDependencies(
        ["a", "b"],
        [
          { predecessorId: "a", successorId: "b" },
          { predecessorId: "b", successorId: "a" },
        ],
      ),
    ).toThrow());
  it("prevents self dependency", () =>
    expect(() =>
      assertDependencies(["a"], [{ predecessorId: "a", successorId: "a" }]),
    ).toThrow());
  it("accepts a DAG", () =>
    expect(() =>
      assertDependencies(
        ["a", "b", "c"],
        [
          { predecessorId: "a", successorId: "c" },
          { predecessorId: "b", successorId: "c" },
        ],
      ),
    ).not.toThrow());
  it("normalizes leaves without counting summaries twice", () => {
    const result = calculateSchedule(
      [
        task("s", { taskType: "SUMMARY", weight: "999" }),
        task("a", { parentId: "s", weight: "3", actualProgress: "100" }),
        task("b", { parentId: "s", weight: "1", actualProgress: "0" }),
      ],
      "MANUAL",
      new Map(),
      "2026-10-05",
    );
    expect(result.actualProgress).toBe("75.00");
    expect(result.items[0].actualProgress).toBe("75.00");
  });
  it("uses budget weights", () =>
    expect(
      calculateSchedule(
        [
          task("a", { budgetItemId: "x", actualProgress: "100" }),
          task("b", { budgetItemId: "y", actualProgress: "0" }),
        ],
        "BUDGET_VALUE",
        new Map([
          ["x", "30"],
          ["y", "70"],
        ]),
        "2026-10-05",
      ).actualProgress,
    ).toBe("30.00"));
  it("excludes cancelled tasks", () =>
    expect(
      calculateSchedule(
        [task("a"), task("b", { status: "CANCELLED", weight: "999" })],
        "MANUAL",
        new Map(),
        "2026-10-05",
      ).actualProgress,
    ).toBe("50.00"));
  it("rejects hierarchy cycles", () =>
    expect(() =>
      calculateSchedule(
        [
          task("a", { taskType: "SUMMARY", parentId: "b" }),
          task("b", { taskType: "SUMMARY", parentId: "a" }),
        ],
        "MANUAL",
        new Map(),
        "2026-10-05",
      ),
    ).toThrow());
  it("computes baseline variance", () =>
    expect(variance("2026-10-01", "2026-10-06")).toBe(5));
  it.each([500, 2000, 5000])(
    "computes %i tasks without recursive traversal",
    (count) => {
      const start = performance.now();
      const result = calculateSchedule(
        Array.from({ length: count }, (_, i) => task(String(i))),
        "MANUAL",
        new Map(),
        "2026-10-05",
      );
      expect(result.items).toHaveLength(count);
      expect(result.actualProgress).toBe("50.00");
      console.info(
        "SCHEDULE_PERFORMANCE",
        JSON.stringify({ count, ms: performance.now() - start }),
      );
    },
  );
});
