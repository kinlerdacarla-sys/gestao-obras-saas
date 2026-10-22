export type NotificationPreferences = {
  emailEnabled: boolean;
  inAppEnabled: boolean;
  dailyDigestEnabled: boolean;
  inspectionNotifications: boolean;
  measurementNotifications: boolean;
  qualityNotifications: boolean;
  financialNotifications: boolean;
  scheduleNotifications: boolean;
};
export function notificationCategory(
  type: string,
): keyof NotificationPreferences {
  return type === "DAILY_DIGEST"
    ? "dailyDigestEnabled"
    : type.includes("INSPECTION")
      ? "inspectionNotifications"
      : type.includes("MEASUREMENT")
        ? "measurementNotifications"
        : type.includes("NCR") || type.includes("CORRECTIVE")
          ? "qualityNotifications"
          : type.includes("SCHEDULE") || type.includes("DAILY_LOG")
            ? "scheduleNotifications"
            : "financialNotifications";
}
export function notificationChannels(
  type: string,
  pref: NotificationPreferences | null,
) {
  const enabled = pref?.[notificationCategory(type)] ?? true;
  return {
    inApp: enabled && (pref?.inAppEnabled ?? true),
    email: enabled && (pref?.emailEnabled ?? false),
  };
}
