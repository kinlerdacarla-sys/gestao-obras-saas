export function mayRequestReport(role: string, type: string) {
  const allowed: Record<string, string[]> = {
    ADMIN: [
      "PROJECT_EXECUTIVE",
      "PROJECT_PROGRESS",
      "FINANCIAL",
      "MEASUREMENTS",
      "CONTRACTS",
      "QUALITY",
      "DAILY_LOG",
      "FUNDING",
      "PORTFOLIO",
    ],
    MANAGER: [
      "PROJECT_EXECUTIVE",
      "PROJECT_PROGRESS",
      "FINANCIAL",
      "MEASUREMENTS",
      "CONTRACTS",
      "QUALITY",
      "DAILY_LOG",
      "FUNDING",
    ],
    INSPECTOR: ["PROJECT_PROGRESS", "MEASUREMENTS", "QUALITY", "DAILY_LOG"],
    FINANCIER: [
      "PROJECT_EXECUTIVE",
      "PROJECT_PROGRESS",
      "FINANCIAL",
      "MEASUREMENTS",
      "QUALITY",
      "FUNDING",
    ],
    CLIENT: ["PROJECT_EXECUTIVE", "PROJECT_PROGRESS", "QUALITY"],
  };
  return allowed[role]?.includes(type) ?? false;
}
