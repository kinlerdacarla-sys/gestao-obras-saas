import { z } from "zod";
export function configuration() {
  return z
    .object({
      NODE_ENV: z
        .enum(["development", "test", "production"])
        .default("development"),
      DATABASE_URL: z.string().min(1),
      REDIS_URL: z.url(),
      JWT_SECRET: z.string().min(32),
      WEB_ORIGIN: z.url().default("http://localhost:3000"),
      PORT: z.coerce.number().default(3001),
    })
    .superRefine((config, ctx) => {
      if (config.NODE_ENV === "production") {
        if (/replace-with|development|change-this/i.test(config.JWT_SECRET))
          ctx.addIssue({
            code: "custom",
            path: ["JWT_SECRET"],
            message: "Produção exige uma chave própria aleatória",
          });
        if (!config.WEB_ORIGIN.startsWith("https://"))
          ctx.addIssue({
            code: "custom",
            path: ["WEB_ORIGIN"],
            message: "Produção exige HTTPS",
          });
      }
    })
    .parse(process.env);
}
