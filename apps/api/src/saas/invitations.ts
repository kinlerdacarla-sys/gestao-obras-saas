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
import { DeliveryError } from "../../../../packages/config/src/mail.js";
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
export function decryptInvitation(value: string) {
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
  async processPlatform(id: string) {
    const claimed = await this.db.platformInvitation.updateMany({
      where: {
        id,
        sentAt: null,
        usedAt: null,
        attempts: { lt: 5 },
        expiresAt: { gt: new Date() },
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
      },
      data: {
        attempts: { increment: 1 },
        leaseUntil: new Date(Date.now() + 300000),
      },
    });
    if (!claimed.count) return;
    const row = await this.db.platformInvitation.findUniqueOrThrow({
      where: { id },
    });
    try {
      const user = await this.db.user.findUniqueOrThrow({
        where: { id: row.userId },
      });
      if (!row.ciphertext || user.status !== "INVITED")
        throw new DeliveryError(true);
      await this.mail.deliverReset(
        user.email,
        decryptInvitation(row.ciphertext),
      );
      await this.db.platformInvitation.update({
        where: { id },
        data: { sentAt: new Date(), ciphertext: null, leaseUntil: null },
      });
    } catch (error) {
      await this.db.platformInvitation.update({
        where: { id },
        data: {
          leaseUntil: null,
          ...(error instanceof DeliveryError && error.permanent
            ? { attempts: 5, ciphertext: null }
            : {}),
        },
      });
      throw Error("PLATFORM_INVITATION_DELIVERY_FAILED");
    }
  }
  async process(id: string) {
    const claimed = await this.db.invitationDelivery.updateMany({
      where: {
        id,
        sentAt: null,
        attempts: { lt: 5 },
        expiresAt: { gt: new Date() },
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
      },
      data: {
        leaseUntil: new Date(Date.now() + 5 * 60000),
        attempts: { increment: 1 },
      },
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
    } catch (error) {
      await this.db.invitationDelivery.updateMany({
        where: { id, sentAt: null },
        data: {
          leaseUntil: null,
          lastErrorCode:
            error instanceof DeliveryError && error.permanent
              ? "PERMANENT_DELIVERY_FAILURE"
              : "TEMPORARY_DELIVERY_FAILURE",
          ...(error instanceof DeliveryError && error.permanent
            ? { attempts: 5, ciphertext: null }
            : {}),
        },
      });
      throw Error("INVITATION_DELIVERY_FAILED");
    }
  }
}
