import { z } from "zod";
import { isIP } from "node:net";
import path from "node:path";
const schema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    APP_ENV: z
      .enum(["development", "test", "staging", "production"])
      .optional(),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.url(),
    JWT_SECRET: z.string().min(32),
    WEB_ORIGIN: z.url().default("http://localhost:3000"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    TRUST_PROXY: z.string().default("false"),
    DOCUMENT_STORAGE_PATH: z.string().optional(),
    BUDGET_STORAGE_PATH: z.string().optional(),
    STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
    S3_BUCKET: z.string().optional(),
    S3_KMS_KEY_ID: z.string().optional(),
    S3_ENDPOINT: z.string().optional(),
    AWS_REGION: z.string().optional(),
    DB_POOL_MAX: z.coerce.number().int().min(1).max(20).default(5),
    MAIL_TRANSPORT: z.enum(["smtp", "stream", "ses"]).optional(),
    FROM_NAME: z
      .string()
      .regex(/^[^\r\n<>]+$/)
      .default("Obras"),
    REPLY_TO: z.string().optional(),
    SUPPORT_EMAIL: z.string().optional(),
    SES_CONFIGURATION_SET: z.string().optional(),
    SMTP_URL: z.string().optional(),
    MAIL_FROM: z.string().optional(),
    INVITATION_ENCRYPTION_KEY: z.string().optional(),
    TERMS_URL: z.string().optional(),
    PRIVACY_URL: z.string().optional(),
    TERMS_VERSION: z.string().optional(),
    PRIVACY_VERSION: z.string().optional(),
    SALES_EMAIL: z.string().optional(),
  })
  .superRefine((config, ctx) => {
    const issue = (key: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [key], message });
    if (config.S3_ENDPOINT && config.NODE_ENV !== "test")
      issue("S3_ENDPOINT", "Endpoint alternativo permitido apenas em testes");
    if (config.STORAGE_DRIVER === "s3") {
      if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(config.S3_BUCKET ?? ""))
        issue("S3_BUCKET", "Configure bucket privado");
      if (!config.AWS_REGION) issue("AWS_REGION", "Configure região AWS");
      if (config.NODE_ENV === "production" && !config.S3_KMS_KEY_ID)
        issue("S3_KMS_KEY_ID", "Configure chave KMS");
    }
    if (config.TRUST_PROXY !== "false") {
      for (const item of config.TRUST_PROXY.split(",")) {
        const [ip, bits] = item.trim().split("/");
        const family = isIP(ip);
        if (
          !family ||
          (bits !== undefined &&
            (!/^\d+$/.test(bits) ||
              Number(bits) < 1 ||
              Number(bits) > (family === 4 ? 32 : 128)))
        )
          issue(
            "TRUST_PROXY",
            "Use false ou endereços/CIDR explícitos de proxies confiáveis",
          );
      }
    }
    if (config.NODE_ENV !== "production") return;
    if (!["staging", "production"].includes(config.APP_ENV ?? ""))
      issue("APP_ENV", "Identifique staging ou production");
    if (
      config.JWT_SECRET.length < 48 ||
      /replace-with|development|change-this|example|test|demo/i.test(
        config.JWT_SECRET,
      )
    )
      issue(
        "JWT_SECRET",
        "Exige uma chave própria aleatória com pelo menos 48 caracteres",
      );
    if (
      !/^[a-f0-9]{64}$/i.test(config.INVITATION_ENCRYPTION_KEY ?? "") ||
      config.INVITATION_ENCRYPTION_KEY === config.JWT_SECRET
    )
      issue(
        "INVITATION_ENCRYPTION_KEY",
        "Exige chave AES independente de 32 bytes em hexadecimal",
      );
    try {
      const url = new URL(config.WEB_ORIGIN);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.pathname !== "/" ||
        url.search ||
        url.hash
      )
        issue("WEB_ORIGIN", "Exige uma origem HTTPS exata");
    } catch {
      issue("WEB_ORIGIN", "Origem inválida");
    }
    for (const key of ["DATABASE_URL", "REDIS_URL"] as const) {
      try {
        const url = new URL(config[key]);
        if (
          !url.password ||
          !url.hostname ||
          /localhost|127\.0\.0\.1/.test(url.hostname)
        )
          issue(key, "Exige serviço dedicado e autenticado");
      } catch {
        issue(key, "URL inválida");
      }
    }
    for (const key of config.STORAGE_DRIVER === "local"
      ? (["DOCUMENT_STORAGE_PATH", "BUDGET_STORAGE_PATH"] as const)
      : [])
      if (!config[key] || !path.isAbsolute(config[key]!))
        issue(key, "Exige diretório persistente absoluto");
    if (!["smtp", "ses"].includes(config.MAIL_TRANSPORT ?? ""))
      issue("MAIL_TRANSPORT", "Produção exige SMTP ou SES");
    if (
      config.MAIL_TRANSPORT === "smtp" &&
      (!config.SMTP_URL || !/^smtps?:\/\//.test(config.SMTP_URL))
    )
      issue("SMTP_URL", "Configure o serviço de email");
    if (config.MAIL_TRANSPORT === "ses") {
      if (!config.AWS_REGION || !config.SES_CONFIGURATION_SET)
        issue("SES_CONFIGURATION_SET", "Configure região e configuração SES");
      for (const key of ["REPLY_TO", "SUPPORT_EMAIL"] as const)
        if (!z.email().safeParse(config[key]).success)
          issue(key, "Configure contacto real");
    }
    if (!z.email().safeParse(config.MAIL_FROM).success)
      issue("MAIL_FROM", "Configure remetente válido");
    if (!z.email().safeParse(config.SALES_EMAIL).success)
      issue("SALES_EMAIL", "Configure contacto comercial");
    for (const key of ["TERMS_URL", "PRIVACY_URL"] as const)
      if (
        !config[key] ||
        !z.url().safeParse(config[key]).success ||
        !config[key]!.startsWith("https://")
      )
        issue(key, "Configure documento legal HTTPS");
    for (const key of ["TERMS_VERSION", "PRIVACY_VERSION"] as const)
      if (!config[key] || config[key] === "draft")
        issue(key, "Configure a versão legal publicada");
  });
export function configuration(env: NodeJS.ProcessEnv = process.env) {
  const result = schema.safeParse({
    ...env,
    MAIL_FROM: env.FROM_EMAIL ?? env.MAIL_FROM,
  });
  // Never include raw environment values in startup errors (Zod union errors can echo input).
  if (!result.success)
    throw new Error(
      `ENVIRONMENT_INVALID: ${result.error.issues.map((i) => i.path.join(".")).join(", ")}`,
    );
  return result.data;
}
