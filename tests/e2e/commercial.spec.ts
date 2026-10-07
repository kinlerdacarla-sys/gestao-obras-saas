import { test, expect, type Page } from "@playwright/test";
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
async function demo(page: Page) {
  await page.goto("/projects");
  await page.getByText("Edifício Demo", { exact: true }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]+$/);
  return page.url().split("/projects/")[1];
}
test("M4 admin creates supplier contract budget item and amendment; distinct admin approves", async ({
  page,
}) => {
  test.setTimeout(120000);
  await login(page, "admin@example.com");
  const project = await demo(page),
    suffix = Date.now();
  await page.getByRole("link", { name: "Fornecedores", exact: true }).click();
  await page
    .getByRole("button", { name: "Novo fornecedor", exact: true })
    .click();
  await page
    .getByLabel("Nome legal", { exact: true })
    .fill(`Subempreiteiro ${suffix}`);
  await page
    .getByRole("combobox", { name: "Tipo", exact: true })
    .last()
    .selectOption("SUBCONTRACTOR");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(
    page.getByText(`Subempreiteiro ${suffix}`, { exact: true }),
  ).toBeVisible();
  await page.goto(`/projects/${project}/contracts`);
  await page
    .getByRole("button", { name: "Novo contrato", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Fornecedor", exact: true })
    .selectOption({ label: `Subempreiteiro ${suffix}` });
  await page.getByLabel("Número do contrato").fill(`E2E-${suffix}`);
  await page.getByLabel("Título", { exact: true }).fill("Contrato E2E");
  await page.getByLabel("Valor original (MZN)").fill("10000000");
  await page.getByLabel("Retenção (%)").fill("5");
  await page.getByLabel("Adiantamento (%)").fill("10");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: `E2E-${suffix} · Contrato E2E` }),
  ).toBeVisible();
  const url = page.url();
  await page.getByRole("button", { name: "Itens", exact: true }).click();
  await page
    .getByRole("button", { name: "Adicionar item", exact: true })
    .click();
  await page.getByLabel("Descrição do item").fill("Fundações E2E");
  await page
    .getByRole("combobox", { name: "Item orçamental", exact: true })
    .selectOption({ index: 1 });
  await page.getByLabel("Quantidade", { exact: true }).fill("100");
  await page.getByLabel("Preço unitário", { exact: true }).fill("100000");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByText("Fundações E2E", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Resumo", exact: true }).click();
  await page
    .getByRole("button", { name: "Ativar contrato", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Suspender", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Adendas", exact: true }).click();
  await page.getByRole("button", { name: "Nova adenda", exact: true }).click();
  await page.getByLabel("Descrição da adenda").fill("Adição E2E");
  await page.getByLabel("Valor da adenda (MZN)").fill("1500000");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await page
    .getByRole("button", { name: "Submeter adenda", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Aprovar adenda", exact: true })
    .click();
  await expect(
    page.getByText("Outro administrador deve aprovar este registo"),
  ).toBeVisible();
  await login(page, "diretor@example.com");
  await page.goto(url);
  await page.getByRole("button", { name: "Adendas", exact: true }).click();
  await page
    .getByRole("button", { name: "Aprovar adenda", exact: true })
    .click();
  await expect(
    page.getByText(/Adição · 1 500 000.00 MZN · Aprovado/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Resumo", exact: true }).click();
  await expect(
    page.getByText("11 500 000.00 MZN", { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "work/m4-contract.png", fullPage: true });
});
test("M4 manager records expense receipt; admin approves and formally reverses", async ({
  browser,
}) => {
  test.setTimeout(120000);
  const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    }),
    page = await context.newPage();
  await login(page, "gestor@example.com");
  const project = await demo(page),
    suffix = Date.now();
  await page
    .getByRole("link", { name: "Centros de custo", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Novo centro de custo", exact: true })
    .click();
  await page.getByLabel("Código", { exact: true }).fill(`E2E-${suffix}`);
  await page.getByLabel("Nome", { exact: true }).fill(`Logística ${suffix}`);
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(
    page.getByText(`Logística ${suffix}`, { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Despesas", exact: true }).click();
  await page.getByRole("button", { name: "Nova despesa", exact: true }).click();
  await page.getByLabel("Número da despesa").fill(`E2E-${suffix}`);
  await page
    .getByRole("combobox", { name: "Centro de custo", exact: true })
    .last()
    .selectOption({ label: `Logística ${suffix}` });
  await page.getByLabel("Descrição", { exact: true }).fill("Transporte E2E");
  await page.getByLabel("Subtotal (MZN)").fill("100000");
  await page.getByLabel("Imposto (MZN)").fill("16000");
  await expect(page.getByText("Total calculado: 116 000.00 MZN")).toBeVisible();
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Submeter despesa", exact: true }),
  ).toBeVisible();
  const url = page.url();
  await page.getByLabel("Anexar comprovativo").setInputFiles({
    name: "recibo.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\nReceipt E2E\n%%EOF"),
  });
  await expect(
    page.getByRole("link", { name: "recibo.pdf", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Submeter despesa", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: `E2E-${suffix} · Submetido`,
      exact: true,
    }),
  ).toBeVisible();
  await login(page, "admin@example.com");
  await page.goto(url);
  const before = await (
    await page.request.get(`/api/v1/projects/${project}/costs/summary`)
  ).json();
  await page
    .getByRole("button", { name: "Aprovar despesa", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Estornar despesa", exact: true }),
  ).toBeVisible();
  const approved = await (
    await page.request.get(`/api/v1/projects/${project}/costs/summary`)
  ).json();
  expect(
    Number(approved.approvedExpenses) - Number(before.approvedExpenses),
  ).toBe(116000);
  await page.screenshot({ path: "work/m4-expense-mobile.png", fullPage: true });
  await page
    .getByRole("button", { name: "Estornar despesa", exact: true })
    .click();
  await page
    .getByLabel("Motivo", { exact: true })
    .fill("Comprovativo duplicado");
  await page.getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: `E2E-${suffix} · Estornado`,
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText(/EXPENSE_REVERSED/)).toBeVisible();
  const reversed = await (
    await page.request.get(`/api/v1/projects/${project}/costs/summary`)
  ).json();
  expect(reversed.approvedExpenses).toBe(before.approvedExpenses);
  await page.getByRole("link", { name: "Custos", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Custos da obra", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Saldo orçamental", { exact: true }),
  ).toBeVisible();
  await context.close();
});
