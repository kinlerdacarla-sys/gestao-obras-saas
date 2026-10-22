import { problem } from "./commercial.js";
export { assertVersion } from "./commercial.js";
export const ncrTransitions: Record<string, string[]> = {
  OPEN: ["ASSIGNED", "CANCELLED"],
  ASSIGNED: ["CORRECTION_IN_PROGRESS", "CANCELLED"],
  CORRECTION_IN_PROGRESS: ["READY_FOR_VERIFICATION", "CANCELLED"],
  READY_FOR_VERIFICATION: ["CLOSED", "REOPENED"],
  CLOSED: ["REOPENED"],
  REOPENED: ["CORRECTION_IN_PROGRESS", "ASSIGNED", "CANCELLED"],
  CANCELLED: [],
};
export const actionTransitions: Record<string, string[]> = {
  OPEN: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: ["VERIFIED", "REJECTED"],
  REJECTED: ["IN_PROGRESS", "CANCELLED"],
  VERIFIED: [],
  CANCELLED: [],
};
export function transition(
  from: string,
  to: string,
  kind: "NCR" | "CORRECTIVE_ACTION",
) {
  if (
    !(kind === "NCR" ? ncrTransitions : actionTransitions)[from]?.includes(to)
  )
    problem(`INVALID_${kind}_TRANSITION`, "Transição não permitida", 409);
}
export function independent(executor: string | null, verifier: string) {
  if (executor === verifier)
    problem(
      "SELF_VERIFICATION_NOT_ALLOWED",
      "A correção exige verificação independente",
      403,
    );
}
export function editableChecklist(status: string) {
  if (status !== "DRAFT")
    problem(
      "CHECKLIST_VERSION_IMMUTABLE",
      "Crie uma nova versão do checklist",
      409,
    );
}
export type Answer = {
  result: string | null;
  textValue: string | null;
  numericValue: unknown;
  dateValue: Date | null;
  comment: string | null;
  holdPointReleasedAt: Date | null;
};
export type ItemRules = {
  responseType: string;
  isRequired: boolean;
  requirePhotoOnFail: boolean;
  isHoldPoint: boolean;
};
export function validateAnswer(item: Answer, rules: ItemRules, photo: boolean) {
  const answered =
    rules.responseType === "TEXT"
      ? !!item.textValue?.trim()
      : rules.responseType === "NUMBER"
        ? item.numericValue !== null
        : rules.responseType === "DATE"
          ? item.dateValue !== null
          : item.result !== null;
  if (rules.isRequired && !answered)
    problem(
      "INSPECTION_REQUIRED_ITEM_MISSING",
      "Preencha todos os itens obrigatórios",
    );
  if (item.result === "FAIL" && rules.requirePhotoOnFail && !photo)
    problem(
      "INSPECTION_FAIL_REQUIRES_EVIDENCE",
      "O item não conforme exige fotografia confirmada",
    );
}
export function overall(
  items: Pick<Answer, "result" | "comment" | "holdPointReleasedAt">[],
  comments?: string | null,
): "PASS" | "PASS_WITH_OBSERVATIONS" | "FAIL" {
  if (items.some((i) => i.result === "FAIL")) return "FAIL";
  return comments?.trim() || items.some((i) => i.comment?.trim())
    ? "PASS_WITH_OBSERVATIONS"
    : "PASS";
}
export function holdPoint(item: Answer, rules: ItemRules) {
  if (rules.isHoldPoint && item.result === "FAIL" && !item.holdPointReleasedAt)
    problem(
      "HOLD_POINT_NOT_RELEASED",
      "Ponto de paragem exige liberação do fiscal",
      409,
    );
}
export function projectDate(now = new Date()) {
  return now.toLocaleDateString("en-CA", { timeZone: "Africa/Maputo" });
}
export function overdue(due: Date | null, status: string, now = new Date()) {
  return (
    !!due &&
    !["CLOSED", "CANCELLED"].includes(status) &&
    due.toISOString().slice(0, 10) < projectDate(now)
  );
}
export const rate = (part: number, total: number) =>
  total ? Math.round((part / total) * 10000) / 100 : 0;
export function averageClosure(
  rows: { detectedAt: Date; closedAt: Date | null }[],
) {
  const closed = rows.filter((r) => r.closedAt);
  return closed.length
    ? closed.reduce(
        (n, r) =>
          n + (r.closedAt!.getTime() - r.detectedAt.getTime()) / 86400000,
        0,
      ) / closed.length
    : 0;
}
export function blocksMeasurement(
  ncr: { severity: string; status: string },
  enabled = true,
) {
  // The specification uses status != CLOSED, including a cancelled critical record.
  return enabled && ncr.severity === "CRITICAL" && ncr.status !== "CLOSED";
}
