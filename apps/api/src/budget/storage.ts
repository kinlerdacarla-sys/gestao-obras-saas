import { createHash } from "node:crypto";
import { budgetStorage } from "../../../../packages/config/src/storage.js";
export const checksum = (buffer: Buffer) =>
  createHash("sha256").update(buffer).digest("hex");
export const storeOriginal = (key: string, buffer: Buffer) =>
  budgetStorage().put(key, buffer, { exclusive: true });
export const readOriginal = (key: string) => budgetStorage().read(key);
