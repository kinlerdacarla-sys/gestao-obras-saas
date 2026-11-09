export function maintenanceActive(value: unknown, now = Date.now()) {
  const v = value as { enabled?: unknown; until?: unknown } | null;
  return (
    v?.enabled === true &&
    typeof v.until === "string" &&
    Date.parse(v.until) > now
  );
}
