import { Decimal } from "decimal.js";
export function manHours(
  rows: { workerCount: number; hoursPerWorker: string | null }[],
) {
  return rows
    .reduce(
      (sum, r) =>
        sum.plus(new Decimal(r.workerCount).mul(r.hoursPerWorker ?? 0)),
      new Decimal(0),
    )
    .toFixed(2);
}
export function maySeeFile(role: string, visibility: string) {
  return (
    role === "ADMIN" ||
    role === "MANAGER" ||
    (role === "INSPECTOR" && visibility !== "INTERNAL") ||
    (role === "CLIENT" &&
      ["CLIENT_VISIBLE", "PUBLIC_PROJECT"].includes(visibility)) ||
    (role === "FINANCIER" &&
      ["FINANCIER_VISIBLE", "PUBLIC_PROJECT"].includes(visibility))
  );
}
export function nextLogState(
  current: string,
  action: string,
  admin: boolean,
): string | null {
  if (action === "submit" && ["DRAFT", "REOPENED"].includes(current))
    return "SUBMITTED";
  if (action === "approve" && admin && current === "SUBMITTED")
    return "APPROVED";
  if (action === "reopen" && admin && current === "APPROVED") return "REOPENED";
  return null;
}
