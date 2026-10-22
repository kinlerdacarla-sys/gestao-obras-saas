import { Decimal } from "decimal.js";

export const executiveDefaults = {
  scheduleDelayThresholdPP: 5,
  fundingLowThresholdPercentage: 10,
  contractExpiryDays: 30,
  missingDailyLogDays: 3,
};
export function ratio(numerator: string, denominator: string): string | null {
  const d = new Decimal(denominator);
  return d.gt(0) ? new Decimal(numerator).div(d).mul(100).toFixed(2) : null;
}
export function financialIndicators(input: {
  approvedBudget: string;
  currentContracts: string;
  certified: string;
  paid: string;
  fundingApproved: string;
  fundingDisbursed: string;
  directExpenses: string;
  otherApprovedCommitments?: string;
}) {
  const forecast = new Decimal(input.currentContracts)
    .plus(input.directExpenses)
    .plus(input.otherApprovedCommitments ?? "0");
  return {
    financialProgressPercentage: ratio(input.certified, input.currentContracts),
    paymentProgressPercentage: ratio(input.paid, input.certified),
    fundingUtilizationPercentage: ratio(
      input.fundingDisbursed,
      input.fundingApproved,
    ),
    budgetCommitmentPercentage: ratio(
      input.currentContracts,
      input.approvedBudget,
    ),
    forecastFinalCost: forecast.toFixed(2),
    costVarianceAtCompletion: new Decimal(input.approvedBudget)
      .minus(forecast)
      .toFixed(2),
  };
}
export function executiveStatus(
  input: {
    plannedProgress: string;
    actualProgress: string;
    criticalNcr: number;
    approvedBudget: string;
    forecastFinalCost: string;
    fundingApproved: string;
    fundingBalance: string;
    overdueNcr: number;
  },
  settings = executiveDefaults,
) {
  const reasons: string[] = [];
  const delay = new Decimal(input.plannedProgress).minus(input.actualProgress);
  const overrun =
    new Decimal(input.approvedBudget).gt(0) &&
    new Decimal(input.forecastFinalCost).gt(input.approvedBudget);
  const fundingRatio = ratio(input.fundingBalance, input.fundingApproved);
  if (input.criticalNcr > 0) reasons.push("NCR_CRITICAL");
  if (delay.gt(settings.scheduleDelayThresholdPP))
    reasons.push("SCHEDULE_DELAY");
  if (overrun) reasons.push("BUDGET_OVERRUN_RISK");
  if (
    fundingRatio !== null &&
    new Decimal(fundingRatio).lt(settings.fundingLowThresholdPercentage)
  )
    reasons.push("FUNDING_LOW");
  if (input.overdueNcr > 0) reasons.push("NCR_OVERDUE");
  const status =
    input.criticalNcr > 0
      ? "CRITICAL"
      : overrun || delay.gt(settings.scheduleDelayThresholdPP * 2)
        ? "AT_RISK"
        : reasons.length
          ? "ATTENTION"
          : "ON_TRACK";
  return { status, reasons };
}
export function forecastSchedule(input: {
  start: string | null;
  plannedEnd: string | null;
  actualProgress: string;
  reference: string;
  observations: number;
  actualEnd?: string | null;
}) {
  const empty = {
    forecastEnd: null,
    scheduleVarianceDays: null,
    forecastConfidence: "LOW" as const,
  };
  if (!input.start || !input.plannedEnd) return empty;
  const start = Date.parse(input.start),
    end = Date.parse(input.plannedEnd),
    reference = Date.parse(input.reference);
  const elapsed = (reference - start) / 86400000;
  const actual = new Decimal(input.actualProgress);
  if (
    ![start, end, reference].every(Number.isFinite) ||
    elapsed < 7 ||
    actual.lt(5) ||
    input.observations < 2
  )
    return empty;
  if (actual.gte(100) && !input.actualEnd) return empty;
  const projected = actual.gte(100)
    ? Date.parse(input.actualEnd!)
    : start + (elapsed / actual.div(100).toNumber()) * 86400000;
  if (!Number.isFinite(projected) || projected > reference + 36525 * 86400000)
    return empty;
  const forecast = new Date(
    Math.max(projected, actual.lt(100) ? reference : projected),
  );
  return {
    forecastEnd: forecast.toISOString().slice(0, 10),
    scheduleVarianceDays: Math.ceil((forecast.getTime() - end) / 86400000),
    forecastConfidence: actual.gte(100)
      ? ("HIGH" as const)
      : input.observations >= 4 && actual.gte(20)
        ? ("MEDIUM" as const)
        : ("LOW" as const),
  };
}
