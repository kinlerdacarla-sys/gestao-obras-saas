import { test, expect, type Page } from "@playwright/test";
import { Redis } from "ioredis";
test.beforeEach(async () => {
  if (
    process.env.NODE_ENV !== "test" ||
    !process.env.DATABASE_URL?.includes("test")
  )
    throw new Error("Dedicated test environment required");
  const redis = new Redis(process.env.REDIS_URL!);
  await redis.del("auth:ip:127.0.0.1", "auth:ip:::ffff:127.0.0.1");
  await redis.quit();
});
async function login(page: Page, email: string) {
  // Unload pending authenticated requests before switching identities.
  await page.goto("about:blank");
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Empresa").fill("construtora-demo");
  await page.getByLabel("E-mail").fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.DEMO_PASSWORD ?? "Demo-Obras!2026");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Dashboard", exact: true }),
  ).toBeVisible();
}
async function demo(page: Page) {
  await page.goto("/projects");
  await page.getByText("Edifício Demo", { exact: true }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]+$/);
  return page.url().split("/projects/")[1];
}
test("M5 manager fiscal financier certification and partial/full payments", async ({
  page,
}) => {
  test.setTimeout(150000);
  await login(page, "gestor@example.com");
  const project = await demo(page);
  await page.goto(`/projects/${project}/measurements`);
  await page.getByRole("button", { name: "Nova medição", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Contrato", exact: true })
    .selectOption({ label: "SUB-001" });
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await page.waitForURL(/measurements\/[0-9a-f-]+$/);
  const detail = page.url();
  await page
    .getByRole("combobox", { name: "Item contratual", exact: true })
    .selectOption({ index: 0 });
  await page.getByLabel("Quantidade atual", { exact: true }).fill("0.1");
  await page
    .locator("section")
    .filter({
      has: page.getByRole("heading", {
        name: "Adicionar quantidade executada",
        exact: true,
      }),
    })
    .getByRole("button", { name: "Guardar", exact: true })
    .click();
  await expect(page.getByText("425 000.00 MZN").first()).toBeVisible();
  await page
    .getByRole("button", { name: "Submeter medição", exact: true })
    .click();
  await expect(
    page.getByText("Submetido", { exact: true }).first(),
  ).toBeVisible();
  await login(page, "fiscal@example.com");
  await page.goto(detail);
  await page
    .getByRole("button", { name: "Aprovar revisão fiscal", exact: true })
    .click();
  await expect(
    page.getByText("Aprovação final", { exact: true }).first(),
  ).toBeVisible();
  await login(page, "financiador@example.com");
  await page.goto(detail);
  await page
    .getByRole("button", { name: "Aprovar medição", exact: true })
    .click();
  await expect(
    page.getByText("Aprovado", { exact: true }).first(),
  ).toBeVisible();
  await login(page, "admin@example.com");
  await page.goto(detail);
  await page
    .getByRole("button", { name: "Certificar medição", exact: true })
    .click();
  await expect(
    page.getByText("Certificado", { exact: true }).first(),
  ).toBeVisible();
  const code = await page.getByRole("heading", { level: 1 }).innerText();
  await page.screenshot({ path: "work/m5-measurement.png", fullPage: true });
  await page.goto(`/projects/${project}/payments`);
  await page
    .getByRole("combobox", { name: "Origem do pagamento", exact: true })
    .selectOption({ label: `Medição ${code} · 425 000.00 MZN` });
  await page.getByLabel("Valor do pagamento", { exact: true }).fill("100000");
  await page
    .getByRole("button", { name: "Registar pagamento", exact: true })
    .click();
  await expect(
    page
      .getByRole("combobox", { name: "Origem do pagamento", exact: true })
      .locator("option:checked"),
  ).toHaveText(`Medição ${code} · 325 000.00 MZN`);
  await page.getByLabel("Valor do pagamento", { exact: true }).fill("325000");
  await page
    .getByRole("button", { name: "Registar pagamento", exact: true })
    .click();
  await expect(
    page
      .getByRole("combobox", { name: "Origem do pagamento", exact: true })
      .locator("option", { hasText: `Medição ${code} ·` }),
  ).toHaveCount(0);
  await page.goto(detail);
  await expect(
    page.locator("p > strong").filter({ hasText: /^Pago$/ }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/projects/${project}/financial`);
  await expect(
    page.getByRole("heading", { name: "Dashboard financeiro" }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Curva S física e financeira" }),
  ).toBeVisible();
  await page.screenshot({
    path: "work/m5-financial-mobile.png",
    fullPage: true,
  });
});
test("M5 funding agreement request approval and disbursement", async ({
  page,
}) => {
  test.setTimeout(120000);
  await login(page, "admin@example.com");
  const project = await demo(page),
    code = `FIN-E2E-${Date.now()}`;
  await page.goto(`/projects/${project}/funding`);
  await page
    .getByRole("combobox", { name: "Organização financiadora", exact: true })
    .selectOption({ label: "Fundo de Desenvolvimento Demo" });
  await page.getByLabel("Número do acordo").fill(code);
  await page.getByLabel("Título", { exact: true }).fill("Financiamento E2E");
  await page.getByLabel("Montante aprovado", { exact: true }).fill("3000000");
  await page
    .getByRole("combobox", { name: "Estado", exact: true })
    .selectOption("ACTIVE");
  await page
    .locator("section")
    .filter({
      has: page.getByRole("heading", {
        name: "Novo acordo de financiamento",
        exact: true,
      }),
    })
    .getByRole("button", { name: "Guardar", exact: true })
    .click();
  await expect(
    page.getByRole("cell", { name: code, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Acordo", exact: true })
    .selectOption({ label: code });
  await page.getByLabel("Montante solicitado").fill("2000000");
  await page
    .locator("section")
    .filter({
      has: page.getByRole("heading", {
        name: "Novo pedido de desembolso",
        exact: true,
      }),
    })
    .getByRole("button", { name: "Guardar", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Submeter pedido", exact: true })
    .click();
  await expect(
    page.getByRole("cell", { name: "Submetido", exact: true }),
  ).toBeVisible();
  await login(page, "financiador@example.com");
  await page.goto(`/projects/${project}/funding`);
  await page
    .getByRole("button", { name: "Aprovar pedido", exact: true })
    .click();
  await page.getByLabel("Valor do desembolso", { exact: true }).fill("2000000");
  await page
    .getByRole("button", { name: "Registar desembolso", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Registar desembolso", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "Abrir acordo", exact: true })
    .selectOption({ label: code });
  await expect(
    page.getByText("Desembolsado: 2 000 000.00 MZN · Saldo: 1 000 000.00 MZN", {
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({ path: "work/m5-funding.png", fullPage: true });
});
