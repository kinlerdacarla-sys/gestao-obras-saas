import { describe, it, expect } from "vitest";
import {
  manHours,
  maySeeFile,
  nextLogState,
} from "../../packages/domain/src/daily-log.js";
import {
  activityInput,
  equipmentInput,
} from "../../packages/validation/src/daily-log.js";
describe("diary rules", () => {
  it("computes decimal man hours", () =>
    expect(
      manHours([
        { workerCount: 3, hoursPerWorker: "7.25" },
        { workerCount: 2, hoursPerWorker: "4.50" },
      ]),
    ).toBe("30.75"));
  it("treats unknown hours as zero", () =>
    expect(manHours([{ workerCount: 3, hoursPerWorker: null }])).toBe("0.00"));
  it("enforces workflow", () => {
    expect(nextLogState("DRAFT", "submit", false)).toBe("SUBMITTED");
    expect(nextLogState("SUBMITTED", "approve", true)).toBe("APPROVED");
    expect(nextLogState("APPROVED", "reopen", true)).toBe("REOPENED");
    expect(nextLogState("REOPENED", "submit", false)).toBe("SUBMITTED");
  });
  it("prevents unauthorized approval/reopening", () => {
    expect(nextLogState("SUBMITTED", "approve", false)).toBeNull();
    expect(nextLogState("APPROVED", "reopen", false)).toBeNull();
    expect(nextLogState("DRAFT", "approve", true)).toBeNull();
  });
  it.each(["CLIENT", "FINANCIER", "INSPECTOR"])(
    "hides internal photos from %s",
    (role) => expect(maySeeFile(role, "INTERNAL")).toBe(false),
  );
  it("separates client and financier photos", () => {
    expect(maySeeFile("CLIENT", "CLIENT_VISIBLE")).toBe(true);
    expect(maySeeFile("FINANCIER", "CLIENT_VISIBLE")).toBe(false);
    expect(maySeeFile("CLIENT", "FINANCIER_VISIBLE")).toBe(false);
    expect(maySeeFile("FINANCIER", "FINANCIER_VISIBLE")).toBe(true);
  });
  it("public project visibility still requires known participant role", () => {
    expect(maySeeFile("anonymous", "PUBLIC_PROJECT")).toBe(false);
    expect(maySeeFile("CLIENT", "PUBLIC_PROJECT")).toBe(true);
  });
  it("requires explicit progress update confirmation", () =>
    expect(
      activityInput.safeParse({
        version: 0,
        description: "Work",
        progressAfter: "20",
      }).success,
    ).toBe(false));
  it("requires task version for atomic update", () =>
    expect(
      activityInput.safeParse({
        version: 0,
        description: "Work",
        progressAfter: "20",
        updateTaskProgress: true,
        scheduleTaskId: "c08b7ba3-1fba-4b42-a123-99fbe1592747",
      }).success,
    ).toBe(false));
  it("rejects more than 24 equipment hours", () =>
    expect(
      equipmentInput.safeParse({
        version: 0,
        equipmentName: "Machine",
        hoursWorked: "20",
        hoursIdle: "10",
      }).success,
    ).toBe(false));
});
