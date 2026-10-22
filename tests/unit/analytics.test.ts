import { describe, it, expect } from "vitest";
import {
  financialIndicators,
  executiveStatus,
  forecastSchedule,
  ratio,
} from "../../packages/domain/src/analytics.js";
describe("M7 analytical rules", () => {
  it("calculates certified and paid percentages on their respective denominators", () => {
    const result = financialIndicators({
      approvedBudget: "25000000",
      currentContracts: "20000000",
      certified: "10000000",
      paid: "8000000",
      fundingApproved: "25000000",
      fundingDisbursed: "5000000",
      directExpenses: "100000",
    });
    expect(result.financialProgressPercentage).toBe("50.00");
    expect(result.paymentProgressPercentage).toBe("80.00");
    expect(result.forecastFinalCost).toBe("20100000.00");
    expect(result.costVarianceAtCompletion).toBe("4900000.00");
  });
  it("reports unavailable percentages when no denominator exists", () => {
    expect(ratio("10", "0")).toBeNull();
  });
  it("detects a 15pp delay and prioritizes critical NCR", () => {
    const input = {
      plannedProgress: "60",
      actualProgress: "45",
      criticalNcr: 0,
      approvedBudget: "100",
      forecastFinalCost: "90",
      fundingApproved: "100",
      fundingBalance: "50",
      overdueNcr: 0,
    };
    expect(executiveStatus(input)).toEqual({
      status: "AT_RISK",
      reasons: ["SCHEDULE_DELAY"],
    });
    expect(executiveStatus({ ...input, criticalNcr: 1 }).status).toBe(
      "CRITICAL",
    );
  });
  it("does not invent a completion date without enough observations", () => {
    expect(
      forecastSchedule({
        start: "2026-01-01",
        plannedEnd: "2026-03-01",
        reference: "2026-01-15",
        actualProgress: "0",
        observations: 1,
      }).forecastEnd,
    ).toBeNull();
  });
  it("extrapolates elapsed duration with an explicit medium confidence ceiling", () => {
    expect(
      forecastSchedule({
        start: "2026-01-01",
        plannedEnd: "2026-03-01",
        reference: "2026-01-31",
        actualProgress: "50",
        observations: 4,
      }),
    ).toEqual({
      forecastEnd: "2026-03-02",
      scheduleVarianceDays: 1,
      forecastConfidence: "MEDIUM",
    });
  });
});
