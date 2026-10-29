import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Redis } from "ioredis";
import { Database } from "../../apps/api/src/platform.js";
import { hashPassword } from "../../apps/api/src/auth/crypto.js";
const password = "M8-Journey!2026";
test.beforeEach(async () => {
  if (
    process.env.NODE_ENV !== "test" ||
    !process.env.DATABASE_URL?.includes("test")
  )
    throw Error("Isolated test database required");
  const redis = new Redis(process.env.REDIS_URL!);
  await redis.del(
    "auth:ip:127.0.0.1",
    "auth:ip:::ffff:127.0.0.1",
    "onboarding:ip:::ffff:127.0.0.1",
    "platform:login:ip:::ffff:127.0.0.1",
  );
  await redis.quit();
});
async function tenantLogin(page: Page, slug: string, email: string) {
  await page.goto("/login");
  await page.getByLabel("Empresa").fill(slug);
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Dashboard", exact: true }),
  ).toBeVisible();
}
async function fixture(platformRole?: "SUPER_ADMIN" | "SUPPORT") {
  const db = new Database(),
    id = randomUUID();
  try {
    const tenant = await db.tenant.create({
        data: { name: `Empresa M8 ${id}`, slug: `m8-${id}` },
      }),
      user = await db.user.create({
        data: {
          name: "M8 journey",
          email: `m8-${id}@example.test`,
          passwordHash: await hashPassword(password),
          status: "ACTIVE",
        },
      });
    await db.tenantUser.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        role: "ADMIN",
        status: "ACTIVE",
      },
    });
    const plan = await db.subscriptionPlan.findUniqueOrThrow({
      where: { code: "STARTER" },
    });
    await db.subscription.create({
      data: {
        tenantId: tenant.id,
        planId: plan.id,
        status: "ACTIVE",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
      },
    });
    const operator = platformRole
      ? await db.platformUser.create({
          data: { userId: user.id, role: platformRole },
        })
      : null;
    return { tenant, user, operator };
  } finally {
    await db.$disconnect();
  }
}
async function platformLogin(page: Page, email: string) {
  await page.goto("/platform/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Entrar na plataforma" }).click();
  await expect(page).toHaveURL(/\/platform$/);
}
test("M8 anonymous signup → worker invitation → password → checklist → first project", async ({
  page,
}) => {
  test.setTimeout(120000);
  const id = randomUUID(),
    email = `signup-${id}@example.test`,
    slug = `signup-${id}`;
  await page.goto("/signup");
  await page.getByLabel("Razão social").fill("Empresa de onboarding");
  await page.getByLabel("E-mail da empresa").fill(email);
  await page.getByLabel("Identificador da empresa").fill(slug);
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page
    .getByLabel("Nome do administrador")
    .fill("Administrador Onboarding");
  await page.getByLabel("E-mail do administrador").fill(email);
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Plano", exact: true })
    .selectOption({ label: "Starter" });
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(page.getByText(/dias de avaliação/)).toBeVisible();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Criar empresa e enviar convite" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Empresa criada" }),
  ).toBeVisible();
  let token = "";
  await expect
    .poll(
      async () => {
        const folder = path.resolve(
          process.env.MAIL_OUTBOX_PATH ?? "work/mail-outbox",
        );
        for (const name of await readdir(folder).catch(() => [])) {
          const text = (await readFile(path.join(folder, name), "utf8"))
            .replace(/=\r?\n/g, "")
            .replace(/=3D/g, "=");
          if (text.includes(email))
            token = text.match(/token=([a-f0-9]{64})/)?.[1] ?? "";
        }
        return token.length;
      },
      { timeout: 45000 },
    )
    .toBe(64);
  await page.goto(`/reset-password?token=${token}`);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Guardar password" }).click();
  await expect(page.getByRole("status")).toBeVisible();
  await tenantLogin(page, slug, email);
  await expect(
    page.getByRole("region", { name: "Primeiros passos" }),
  ).toBeVisible();
  await page.getByRole("link", { name: /Criar primeira obra/i }).click();
  await page.getByRole("button", { name: "Criar obra", exact: true }).click();
  await page
    .getByLabel("Nome", { exact: true })
    .fill("Primeira obra onboarding");
  await page.getByLabel("Código", { exact: true }).fill("ONBOARD-1");
  await page.getByRole("button", { name: "Guardar obra" }).click();
  await expect(
    page.getByRole("link", { name: "Primeira obra onboarding", exact: true }),
  ).toBeVisible();
});
test("M8 subscription upgrade changes entitlements and provides export", async ({
  page,
}) => {
  test.setTimeout(120000);
  const f = await fixture();
  await tenantLogin(page, f.tenant.slug, f.user.email);
  await page.getByRole("link", { name: "Subscrição", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Starter", exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Selecionar Professional" }).click();
  await page
    .getByRole("button", { name: "Confirmar alteração", exact: true })
    .click();
  await expect(
    page.getByText("Subscrição atualizada.", { exact: true }),
  ).toBeVisible();
  expect(
    (await (await page.request.get("/api/v1/entitlements")).json()).features,
  ).toContain("ADVANCED_REPORTS");
  await page.getByRole("link", { name: "Faturação", exact: true }).click();
  await expect(page.getByText("Ainda não existem faturas")).toBeVisible();
  await page.getByRole("link", { name: "Exportar dados", exact: true }).click();
  await page.getByRole("button", { name: "Solicitar exportação" }).click();
  await expect(
    page.getByRole("button", { name: "Descarregar exportação" }),
  ).toBeVisible({ timeout: 60000 });
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descarregar exportação" }).click();
  expect(await (await download).failure()).toBeNull();
});
test("M8 platform operator suspends and reactivates with audit", async ({
  page,
}) => {
  const f = await fixture("SUPER_ADMIN");
  await platformLogin(page, f.user.email);
  await page.getByLabel("Pesquisar empresa").fill(f.tenant.name);
  await page.getByRole("link", { name: new RegExp(f.tenant.name) }).click();
  await page.getByRole("button", { name: "Usage", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Obras ativas" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page
    .getByLabel("Motivo", { exact: true })
    .fill("Suspender para verificação de jornada");
  await page
    .getByLabel(`Escreva ${f.tenant.slug} para confirmar`)
    .fill(f.tenant.slug);
  await page.getByRole("button", { name: "Suspender empresa" }).click();
  await expect(
    page.getByRole("heading", { name: "Estado: SUSPENDED" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Audit", exact: true }).click();
  await expect(page.getByText(/TENANT_SUSPENDED/)).toBeVisible();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page
    .getByLabel("Motivo", { exact: true })
    .fill("Reativar após verificação de jornada");
  await page
    .getByLabel(`Escreva ${f.tenant.slug} para confirmar`)
    .fill(f.tenant.slug);
  await page.getByRole("button", { name: "Reativar empresa" }).click();
  await expect(
    page.getByRole("heading", { name: "Estado: ACTIVE" }),
  ).toBeVisible();
});
test("M8 authorized support displays banner and audits termination", async ({
  page,
  browser,
}) => {
  const admin = await fixture("SUPER_ADMIN"),
    support = await fixture("SUPPORT");
  await platformLogin(page, admin.user.email);
  await page.goto(`/platform/tenants/${admin.tenant.id}`);
  await page.getByRole("button", { name: "Support", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Operador", exact: true })
    .selectOption(support.operator!.id);
  await page
    .getByLabel("Motivo", { exact: true })
    .fill("Diagnóstico solicitado pela empresa");
  await page.getByRole("button", { name: "Iniciar sessão autorizada" }).click();
  const context = await browser.newContext({
      baseURL: "http://localhost:3000",
    }),
    supportPage = await context.newPage();
  try {
    await platformLogin(supportPage, support.user.email);
    await supportPage.getByRole("button", { name: "Abrir suporte" }).click();
    await expect(supportPage.getByRole("status")).toContainText(
      "Modo de Suporte",
    );
    await expect(supportPage.getByRole("status")).toContainText(
      admin.tenant.name,
    );
    await supportPage.getByRole("button", { name: "Encerrar sessão" }).click();
    await expect(
      supportPage.getByText("Nenhuma sessão autorizada ativa."),
    ).toBeVisible();
    const db = new Database();
    try {
      expect(
        await db.platformAuditLog.count({
          where: { tenantId: admin.tenant.id, action: "SUPPORT_SESSION_ENDED" },
        }),
      ).toBe(1);
    } finally {
      await db.$disconnect();
    }
  } finally {
    await context.close();
  }
});
