import { test, expect, type Page } from "@playwright/test";
import { budgetFixture } from "../helpers/budget-fixtures.js";
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
test("M2: upload → preview → R0 → approval → R1 → compare → export", async ({
  page,
}) => {
  test.setTimeout(90000);
  await login(page, "admin@example.com");
  const created = await page.request.post("/api/v1/projects", {
    headers: { Origin: "http://localhost:3000" },
    data: { code: `M2-${Date.now()}`, name: "Obra M2 E2E" },
  });
  expect(created.ok()).toBe(true);
  const { id } = await created.json();
  await page.goto(`/projects/${id}`);
  await page
    .getByRole("link", { name: "Abrir Orçamento", exact: true })
    .click();
  await page.getByRole("link", { name: "Importar Excel", exact: true }).click();
  await page.getByLabel("Ficheiro Excel").setInputFiles({
    name: "valid-budget.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: await budgetFixture(),
  });
  await page
    .getByRole("button", { name: "Carregar Excel", exact: true })
    .click();
  await expect(
    page.getByText("Pronto para confirmar", { exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await page.getByRole("button", { name: "Confirmar importação" }).click();
  await expect(page.getByRole("heading", { name: /Revisão R0/ })).toBeVisible();
  await page.getByRole("button", { name: "Submeter revisão" }).click();
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Aprovar revisão" }).click();
  await expect(
    page.getByRole("heading", { name: /Revisão R0 Aprovado/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Criar nova revisão" }).click();
  await expect(page.getByRole("heading", { name: /Revisão R1/ })).toBeVisible();
  await page
    .getByRole("button", { name: "Editar 01.00001", exact: true })
    .click();
  await page.getByLabel("Quantidade", { exact: true }).fill("120");
  await page.getByLabel("Preço unitário", { exact: true }).fill("1100");
  await page.getByRole("button", { name: "Guardar item" }).click();
  await page.getByRole("button", { name: "Submeter revisão" }).click();
  await page.getByRole("button", { name: "Aprovar revisão" }).click();
  await expect(
    page.getByRole("heading", { name: /Revisão R1 Aprovado/ }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Exportar Excel" }).click();
  expect((await download).suggestedFilename()).toMatch(/_R1.xlsx$/);
  await page
    .getByRole("link", { name: "Comparar revisões", exact: true })
    .click();
  await page.getByRole("button", { name: "Comparar", exact: true }).click();
  await expect(page.getByText("32.00%", { exact: true }).first()).toBeVisible();
  await expect(
    page.getByText("32.000,00 MZN", { exact: true }).first(),
  ).toBeVisible();
});
test("M2 client can read approved demo budget without editing", async ({
  page,
}) => {
  await login(page, "cliente@example.com");
  await page.getByRole("link", { name: "Edifício Demo", exact: true }).click();
  await page
    .getByRole("link", { name: "Abrir Orçamento", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: /Revisão R0 Aprovado/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Adicionar item", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Importar Excel", exact: true }),
  ).toHaveCount(0);
});
