import { it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { CreateBucketCommand } from "@aws-sdk/client-s3";
import { ObjectStorage } from "../../packages/config/src/storage.js";
it("persists staged objects, preserves exclusive writes and scopes signed downloads to a tenant", async () => {
  const bucket = "validation-" + randomUUID(),
    tenant = randomUUID();
  const store = new ObjectStorage("documents", {
    NODE_ENV: "test",
    AWS_REGION: "af-south-1",
    S3_ENDPOINT: "http://127.0.0.1:19009",
    S3_BUCKET: bucket,
    STORAGE_DRIVER: "s3",
  });
  const key = `tenant/${tenant}/projects/${randomUUID()}/photo`;
  try {
    await store.s3!.send(new CreateBucketCommand({ Bucket: bucket }));
    const data = Buffer.from("test object");
    await store.put(key, data, { temporary: true, exclusive: true });
    await expect(
      store.put(key, data, { temporary: true, exclusive: true }),
    ).rejects.toMatchObject({ code: "EEXIST" });
    expect(await store.exists(key)).toBe(false);
    await store.confirm(
      key,
      await store.read(key, true),
      "application/octet-stream",
    );
    expect(await store.exists(key)).toBe(true);
    const url = await store.signedDownload(key, tenant);
    expect(new URL(url!).searchParams.get("X-Amz-Expires")).toBe("60");
    expect(await (await fetch(url!)).text()).toBe("test object");
    await expect(store.signedDownload(key, randomUUID())).rejects.toThrow(
      "STORAGE_TENANT_MISMATCH",
    );
    await store.remove(key);
    expect(await store.exists(key)).toBe(false);
  } finally {
    store.s3!.destroy();
  }
});
