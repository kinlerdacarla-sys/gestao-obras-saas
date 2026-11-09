import { describe, it, expect } from "vitest";
import { maintenanceActive } from "../../packages/domain/src/maintenance.js";
import {
  ObjectStorage,
  validateObjectKey,
} from "../../packages/config/src/storage.js";
describe("launch controls", () => {
  it("maintenance expires without operator intervention", () => {
    const value = { enabled: true, until: "2026-10-30T00:00:00.000Z" };
    expect(maintenanceActive(value, Date.parse(value.until) - 1)).toBe(true);
    expect(maintenanceActive(value, Date.parse(value.until))).toBe(false);
    expect(maintenanceActive({ enabled: true, until: "invalid" })).toBe(false);
  });
  it("rejects a production S3 endpoint override", () => {
    expect(
      () =>
        new ObjectStorage("documents", {
          STORAGE_DRIVER: "s3",
          S3_BUCKET: "private-bucket",
          AWS_REGION: "af-south-1",
          S3_ENDPOINT: "http://localhost",
          NODE_ENV: "production",
        }),
    ).toThrow("S3_TEST_ENDPOINT_FORBIDDEN");
  });
  it("rejects absolute paths, traversal, null bytes and Windows separators", () => {
    for (const key of [
      "/secret",
      "tenant/../other",
      "tenant//file",
      "x" + String.fromCharCode(0),
      "tenant\\other",
    ])
      expect(() => validateObjectKey(key)).toThrow("INVALID_OBJECT_KEY");
  });
});
