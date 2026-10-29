import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { Database, fail } from "../platform.js";
import { NotificationService } from "../notification/notification.module.js";
import { configuration } from "../../../../packages/config/src/index.js";
function key() {
  const value = process.env.INVITATION_ENCRYPTION_KEY;
  if (
    configuration().NODE_ENV === "production" &&
    (!value || !/^[a-f0-9]{64}$/i.test(value))
  )
    throw Error("Invitation encryption key required");
  return value
    ? Buffer.from(value, "hex")
    : createHash("sha256")
        .update(`invitation-outbox:${configuration().JWT_SECRET}`)
        .digest();
}
export function encryptInvitation(token: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}
function decryptInvitation(value: string) {
  const data = Buffer.from(value, "base64"),
    decipher = createDecipheriv("aes-256-gcm", key(), data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([
    decipher.update(data.subarray(28)),
    decipher.final(),
  ]).toString("utf8");
}
@Injectable()
export class InvitationService {
  constructor(
    @Inject(Database) readonly db: Database,
    @Inject(NotificationService) readonly mail: NotificationService,
  ) {}
  async process(id: string) {
    const claimed = await this.db.invitationDelivery.updateMany({
      where: {
        id,
        sentAt: null,
        expiresAt: { gt: new Date() },
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
      },
      data: { leaseUntil: new Date(Date.now() + 5 * 60000) },
    });
    if (!claimed.count) return;
    try {
      const row = await this.db.invitationDelivery.findUniqueOrThrow({
        where: { id },
      });
      const reset = await this.db.passwordReset.findFirst({
        where: {
          id: row.resetId,
          tenantId: row.tenantId,
          userId: row.userId,
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
      });
      if (!reset || !row.ciphertext) {
        await this.db.invitationDelivery.update({
          where: { id },
          data: { ciphertext: null, sentAt: new Date(), leaseUntil: null },
        });
        return;
      }
      const user = await this.db.user.findUniqueOrThrow({
        where: { id: row.userId },
      });
      if (!["INVITED", "ACTIVE"].includes(user.status))
        fail(403, "INVITATION_REVOKED", "Convite revogado");
      await this.mail.deliverReset(
        user.email,
        decryptInvitation(row.ciphertext),
      );
      await this.db.invitationDelivery.update({
        where: { id },
        data: { ciphertext: null, sentAt: new Date(), leaseUntil: null },
      });
    } catch {
      await this.db.invitationDelivery.updateMany({
        where: { id, sentAt: null },
        data: { leaseUntil: null },
      });
      throw Error("INVITATION_DELIVERY_FAILED");
    }
  }
}
