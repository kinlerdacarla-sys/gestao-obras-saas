import { mkdir, readFile, writeFile, unlink, stat } from "node:fs/promises";
import path from "node:path";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type StorageArea = "documents" | "budgets";
export function validateObjectKey(key: string) {
  if (
    !key ||
    key.startsWith("/") ||
    key.includes("\\") ||
    key.split("/").some((part) => !part || part === "." || part === "..") ||
    Array.from(key).some((c) => c.charCodeAt(0) < 32)
  )
    throw Error("INVALID_OBJECT_KEY");
  return key;
}
export function objectPrefix(key: string, temporary = false) {
  validateObjectKey(key);
  return `${temporary ? "temporary" : key.includes("/reports/") ? "reports" : key.includes("/exports/") || key.startsWith("tenant-exports/") ? "exports" : "projects"}/${key}`;
}
export class ObjectStorage {
  readonly s3: S3Client | undefined;
  readonly bucket: string | undefined;
  constructor(
    readonly area: StorageArea = "documents",
    readonly env: NodeJS.ProcessEnv = process.env,
  ) {
    if (env.STORAGE_DRIVER === "s3") {
      if (!env.S3_BUCKET || !env.AWS_REGION)
        throw Error("S3_CONFIGURATION_REQUIRED");
      if (env.S3_ENDPOINT && env.NODE_ENV !== "test")
        throw Error("S3_TEST_ENDPOINT_FORBIDDEN");
      this.bucket = env.S3_BUCKET;
      this.s3 = new S3Client({
        region: env.AWS_REGION,
        ...(env.S3_ENDPOINT
          ? { endpoint: env.S3_ENDPOINT, forcePathStyle: true }
          : {}),
        maxAttempts: 3,
      });
    }
  }
  file(key: string) {
    validateObjectKey(key);
    const base = path.resolve(
      this.area === "budgets"
        ? (this.env.BUDGET_STORAGE_PATH ?? "work/budget-storage")
        : (this.env.DOCUMENT_STORAGE_PATH ?? "work/document-storage"),
    );
    const file = path.resolve(base, key);
    if (!file.startsWith(base + path.sep)) throw Error("INVALID_OBJECT_KEY");
    return file;
  }
  async put(
    key: string,
    bytes: Buffer,
    options: {
      exclusive?: boolean;
      temporary?: boolean;
      contentType?: string;
    } = {},
  ) {
    validateObjectKey(key);
    if (this.s3) {
      try {
        await this.s3.send(
          new PutObjectCommand({
            Bucket: this.bucket,
            Key: objectPrefix(key, options.temporary),
            Body: bytes,
            ContentType: options.contentType ?? "application/octet-stream",
            ...(options.exclusive ? { IfNoneMatch: "*" } : {}),
            ...(this.env.S3_KMS_KEY_ID
              ? {
                  ServerSideEncryption: "aws:kms",
                  SSEKMSKeyId: this.env.S3_KMS_KEY_ID,
                }
              : {}),
          }),
        );
      } catch (error) {
        if (
          (error as { $metadata?: { httpStatusCode?: number } }).$metadata
            ?.httpStatusCode === 412
        )
          throw Object.assign(Error("OBJECT_EXISTS"), { code: "EEXIST" });
        throw Error("STORAGE_WRITE_FAILED");
      }
      return;
    }
    const file = this.file(key);
    await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    await writeFile(file, bytes, {
      flag: options.exclusive ? "wx" : "w",
      mode: 0o600,
    });
  }
  async read(key: string, temporary = false): Promise<Buffer> {
    if (!this.s3) return readFile(this.file(key));
    const value = await this.s3.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: objectPrefix(key, temporary),
      }),
    );
    if (!value.Body) throw Error("STORAGE_OBJECT_MISSING");
    return Buffer.from(await value.Body.transformToByteArray());
  }
  async confirm(key: string, bytes: Buffer, contentType: string) {
    if (!this.s3) return;
    await this.put(key, bytes, { contentType });
    // The temporary copy is retained until lifecycle expiry so a rolled-back DB confirmation can retry.
  }
  async remove(key: string) {
    if (this.s3) {
      for (const temporary of [false, true])
        await this.s3.send(
          new DeleteObjectCommand({
            Bucket: this.bucket,
            Key: objectPrefix(key, temporary),
          }),
        );
      return;
    }
    await unlink(this.file(key)).catch((e: NodeJS.ErrnoException) => {
      if (e.code !== "ENOENT") throw Error("STORAGE_CLEANUP_FAILED");
    });
  }
  async exists(key: string) {
    try {
      if (this.s3)
        await this.s3.send(
          new HeadObjectCommand({
            Bucket: this.bucket,
            Key: objectPrefix(key),
          }),
        );
      else await stat(this.file(key));
      return true;
    } catch (e) {
      if (
        (e as NodeJS.ErrnoException).code === "ENOENT" ||
        (e as { $metadata?: { httpStatusCode?: number } }).$metadata
          ?.httpStatusCode === 404
      )
        return false;
      throw Error("STORAGE_CHECK_FAILED");
    }
  }
  async authorizedRead(key: string, tenantId: string) {
    if (!this.s3) return this.read(key);
    const signed = await this.signedDownload(key, tenantId);
    const response = await fetch(signed!, {
      signal: AbortSignal.timeout(30000),
      redirect: "error",
    });
    if (!response.ok) throw Error("STORAGE_READ_FAILED");
    return Buffer.from(await response.arrayBuffer());
  }
  async signedDownload(key: string, tenantId: string) {
    validateObjectKey(key);
    if (
      !/^[a-f0-9-]{36}$/i.test(tenantId) ||
      !key.startsWith(`tenant/${tenantId}/`)
    )
      throw Error("STORAGE_TENANT_MISMATCH");
    if (!this.s3) return null;
    return getSignedUrl(
      this.s3,
      new GetObjectCommand({ Bucket: this.bucket, Key: objectPrefix(key) }),
      { expiresIn: 60 },
    );
  }
}
const shared = new Map<StorageArea, ObjectStorage>();
function storage(area: StorageArea) {
  if (process.env.STORAGE_DRIVER !== "s3") return new ObjectStorage(area);
  if (!shared.has(area)) shared.set(area, new ObjectStorage(area));
  return shared.get(area)!;
}
export const documentStorage = () => storage("documents");
export const budgetStorage = () => storage("budgets");
