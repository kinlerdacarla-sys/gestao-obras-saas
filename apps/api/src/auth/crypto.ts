import { hash, verify, argon2id } from "argon2";
import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
export const hashPassword = (password: string) =>
  hash(password, {
    type: argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
export const verifyPassword = (hash: string, password: string) =>
  verify(hash, password);
export const opaqueToken = () => randomBytes(32).toString("hex");
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const signAccess = (
  secret: string,
  userId: string,
  tenantId: string,
  sessionId: string,
) =>
  new SignJWT({ tenantId, sessionId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer("obras-api")
    .setAudience("obras-web")
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(new TextEncoder().encode(secret));
export const verifyAccess = async (secret: string, token: string) =>
  (
    await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ["HS256"],
      issuer: "obras-api",
      audience: "obras-web",
    })
  ).payload;
