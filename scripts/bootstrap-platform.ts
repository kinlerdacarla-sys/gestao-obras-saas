import "dotenv/config";
import { z } from "zod";
import { Database } from "../apps/api/src/platform.js";
import { hashPassword } from "../apps/api/src/auth/crypto.js";
const input = z
  .object({
    email: z.email(),
    name: z.string().min(2),
    password: z.string().min(16),
    reason: z.string().min(10),
  })
  .safeParse({
    email: process.env.PLATFORM_BOOTSTRAP_EMAIL,
    name: process.env.PLATFORM_BOOTSTRAP_NAME,
    password: process.env.PLATFORM_BOOTSTRAP_PASSWORD,
    reason: process.env.PLATFORM_BOOTSTRAP_REASON,
  });
if (!input.success) throw Error("PLATFORM_BOOTSTRAP_CONFIG_INVALID");
const db = new Database();
try {
  const passwordHash = await hashPassword(input.data.password);
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
        status: "ACTIVE",
      },
    });
    const operator = await tx.platformUser.create({
      data: { userId: user.id, role: "SUPER_ADMIN" },
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
  console.info(
    "Platform bootstrap completed. Rotate the initial credential after first access.",
  );
} catch {
  console.error(
    "PLATFORM_BOOTSTRAP_FAILED: verify prerequisites through the authorized database operator",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
