export const roles = [
  "ADMIN",
  "MANAGER",
  "INSPECTOR",
  "FINANCIER",
  "CLIENT",
] as const;
export type Role = (typeof roles)[number];
export function canEditProject(tenantRole: Role, projectRole?: Role): boolean {
  return (
    tenantRole === "ADMIN" ||
    (tenantRole === "MANAGER" && projectRole === "MANAGER")
  );
}
export function canReadProject(
  tenantRole: Role,
  activeMembership: boolean,
): boolean {
  return tenantRole === "ADMIN" || activeMembership;
}
export function sameTenant(expected: string, actual: string): boolean {
  return expected === actual;
}
