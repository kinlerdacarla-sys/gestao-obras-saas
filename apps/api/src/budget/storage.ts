import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, dirname, sep } from "node:path";
import { createHash } from "node:crypto";
export const checksum = (buffer: Buffer) =>
  createHash("sha256").update(buffer).digest("hex");
function storagePath(key: string) {
  const root = resolve(
    process.env.BUDGET_STORAGE_PATH ?? "work/budget-storage",
  );
  const path = resolve(root, key);
  if (!path.startsWith(root + sep)) throw new Error("Invalid storage path");
  return path;
}
export async function storeOriginal(key: string, buffer: Buffer) {
  const path = storagePath(key);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, buffer, { flag: "wx" });
}
export const readOriginal = (key: string) => readFile(storagePath(key));
