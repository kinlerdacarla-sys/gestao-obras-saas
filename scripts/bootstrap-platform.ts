import "dotenv/config";
import { z } from "zod";
import { Database } from "../apps/api/src/platform.js";
import { encryptInvitation } from "../apps/api/src/saas/invitations.js";
import {
  hashPassword,
  opaqueToken,
  tokenHash,
} from "../apps/api/src/auth/crypto.js";
const input = z
  .object({
    email: z.email(),
    name: z.string().min(2),
    reason: z.string().min(10),
  })
  .safeParse({
    email: process.env.PLATFORM_BOOTSTRAP_EMAIL,
    name: process.env.PLATFORM_BOOTSTRAP_NAME,
    reason: process.env.PLATFORM_BOOTSTRAP_REASON,
  });
if (!input.success) throw Error("PLATFORM_BOOTSTRAP_CONFIG_INVALID");
const db = new Database();
try {
  const token = opaqueToken();
  const passwordHash = await hashPassword(opaqueToken());
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(8062026)`;
    if (
      await tx.platformUser.count({
        where: { role: "SUPER_ADMIN", status: "ACTIVE" },
      })
    )
      throw Error("PLATFORM_ALREADY_BOOTSTRAPPED");
    if (await tx.user.findUnique({ where: { email: input.data.email } }))
      throw Error("USE_A_DEDICATED_PLATFORM_IDENTITY");
    const user = await tx.user.create({
      data: {
        email: input.data.email,
        name: input.data.name,
        passwordHash,
        status: "INVITED",
      },
    });
    const operator = await tx.platformUser.create({
      data: { userId: user.id, role: "SUPER_ADMIN" },
    });
    await tx.platformInvitation.create({
      data: {
        userId: user.id,
        tokenHash: tokenHash(token),
        ciphertext: encryptInvitation(token),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    await tx.platformAuditLog.create({
      data: {
        platformUserId: operator.id,
        action: "PLATFORM_BOOTSTRAPPED",
        entityType: "PlatformUser",
        entityId: operator.id,
        newValues: { reason: input.data.reason },
      },
    });
  });
  console.info("Platform invitation queued; expires in one hour.");
} catch {
  console.error(
    "PLATFORM_BOOTSTRAP_FAILED: verify prerequisites through the authorized database operator",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
