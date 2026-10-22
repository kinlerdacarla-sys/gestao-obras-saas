import { test, expect, type Page } from "@playwright/test";
import { Redis } from "ioredis";
test.beforeEach(async () => {
  if (
    process.env.NODE_ENV !== "test" ||
    !process.env.DATABASE_URL?.includes("test")
  )
    throw Error("Test database required");
  const redis = new Redis(process.env.REDIS_URL!);
  await redis.del("auth:ip:127.0.0.1", "auth:ip:::ffff:127.0.0.1");
  await redis.quit();
});
async function login(page: Page, email: string) {
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
async function downloadReport(page: Page, format: "PDF" | "XLSX") {
  await page.goto("/reports");
  await page
    .getByRole("combobox", { name: "Obra", exact: true })
    .selectOption({ label: "Centro de Saúde · Demo" });
  await page
    .getByRole("combobox", { name: "Formato", exact: true })
    .selectOption(format);
  await page
    .getByRole("button", { name: "Gerar relatório", exact: true })
    .click();
  const row = page
    .getByRole("row")
    .filter({ has: page.getByRole("cell", { name: format, exact: true }) })
    .first();
  await expect(row).toContainText("COMPLETED", { timeout: 90000 });
  const event = page.waitForEvent("download");
  await row.getByRole("button", { name: "Descarregar" }).click();
  const file = await event;
  expect(await file.failure()).toBeNull();
  expect(file.suggestedFilename()).toMatch(
    new RegExp(`\\.${format.toLowerCase()}$`),
  );
}
test("M7 ADMIN portfolio, risk drilldown, curve and executive PDF", async ({
  page,
}) => {
  test.setTimeout(150000);
  await login(page, "admin@example.com");
  await expect(
    page.getByRole("heading", { name: "Portfólio executivo", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Estrada Municipal · Demo", exact: true })
    .click();
  await expect(page.getByText("Crítico", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Curva S consolidada" }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Consultar não conformidades →" })
    .click();
  await expect(
    page.getByText(/Falha crítica na compactação/).first(),
  ).toBeVisible();
  await page.goto("/alerts");
  await expect(
    page.getByRole("heading", { name: "Alertas", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/Falha crítica na compactação/).first(),
  ).toBeVisible();
  await downloadReport(page, "PDF");
});
test("M7 FINANCIER authorized portal, funding and XLSX report", async ({
  page,
}) => {
  test.setTimeout(150000);
  await login(page, "financiador@example.com");
  await expect(
    page.getByRole("link", { name: "Centro de Saúde · Demo", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Estrada Municipal · Demo", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("link", { name: "Centro de Saúde · Demo", exact: true })
    .click();
  await expect(
    page.getByText("Portal do financiador", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Despesas", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("link", { name: "Financiamento e desembolsos", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: /Financiamento/ }).first(),
  ).toBeVisible();
  await downloadReport(page, "XLSX");
});
test("M7 CLIENT mobile portal, permitted photos and report isolation", async ({
  page,
}) => {
  test.setTimeout(150000);
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "cliente@example.com");
  await expect(
    page.getByRole("link", { name: "Centro de Saúde · Demo", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Estrada Municipal · Demo", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("link", { name: "Centro de Saúde · Demo", exact: true })
    .click();
  await expect(
    page.getByText("Portal do cliente", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Fotografias", exact: true }).click();
  await expect(
    page.getByRole("img", {
      name: "Avanço da obra - demonstração.png",
      exact: true,
    }),
  ).toBeVisible();
  await page.goto("/reports");
  await expect(
    page
      .getByRole("combobox", { name: "Tipo", exact: true })
      .locator("option[value=FINANCIAL]"),
  ).toHaveCount(0);
  await downloadReport(page, "PDF");
});

test("M7 MANAGER operational dashboard and project progress", async ({
  page,
}) => {
  await login(page, "gestor@example.com");
  await expect(
    page.getByText("As minhas obras", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Centro de Saúde · Demo", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Curva S consolidada", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: "Consultar cronograma e atrasos →",
      exact: true,
    }),
  ).toBeVisible();
});

test("M7 INSPECTOR dashboard and financial report restrictions", async ({
  page,
}) => {
  await login(page, "fiscal@example.com");
  await expect(
    page.getByText("Fiscalização", { exact: true }).first(),
  ).toBeVisible();
  await page.goto("/reports");
  const types = page.getByRole("combobox", { name: "Tipo", exact: true });
  await expect(types.locator("option[value=FINANCIAL]")).toHaveCount(0);
  await expect(types.locator("option[value=QUALITY]")).toHaveCount(1);
  await types.selectOption("QUALITY");
  await page
    .getByRole("combobox", { name: "Obra", exact: true })
    .selectOption({ label: "Centro de Saúde · Demo" });
  await page
    .getByRole("button", { name: "Gerar relatório", exact: true })
    .click();
  await expect(
    page
      .getByRole("row")
      .filter({
        has: page.getByRole("cell", { name: "Qualidade", exact: true }),
      })
      .first(),
  ).toContainText("COMPLETED", { timeout: 90000 });
});
