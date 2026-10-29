import { expect, it } from "vitest";
import type { Database } from "../../apps/api/src/platform.js";
import { queueNotificationEmail } from "../../apps/worker/src/email.js";
import { scanInvitations } from "../../apps/worker/src/saas.js";

it("closes empty outbox scanners only after their real Redis connections initialize", async () => {
  // A newly provisioned release has no outbox rows: DB work can finish before Redis connects.
  const emptyDatabase = {
    notification: { findMany: async () => [] },
    invitationDelivery: {
      findMany: async () => [],
      updateMany: async () => ({ count: 0 }),
    },
    dataExportJob: { findMany: async () => [] },
  } as unknown as Database;
  for (let attempt = 0; attempt < 10; attempt++) {
    expect(await queueNotificationEmail(emptyDatabase)).toEqual({ queued: 0 });
    expect(await scanInvitations(emptyDatabase)).toEqual({ queued: 0 });
  }
});
