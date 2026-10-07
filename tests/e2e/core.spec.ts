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
test("Admin: login → dashboard → create → open → add participant → logout", async ({
  page,
}) => {
  await login(page, "admin@example.com");
  await page.getByRole("link", { name: "Obras", exact: true }).click();
  await page.getByRole("button", { name: "Criar obra", exact: true }).click();
  const name = `Obra E2E ${Date.now()}`;
  await page.getByLabel("Nome", { exact: true }).fill(name);
  await page.getByLabel("Código", { exact: true }).fill(`E2E-${Date.now()}`);
  await page.getByLabel("Localização").fill("Maputo");
  await page.getByRole("button", { name: "Guardar obra" }).click();
  await page.getByRole("link", { name, exact: true }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await page
    .getByRole("combobox", { name: "Utilizador", exact: true })
    .selectOption({ label: "Gestor Demo" });
  await page.getByRole("button", { name: "Adicionar participante" }).click();
  await expect(
    page.getByRole("cell").filter({ hasText: "Gestor Demo" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
});
test("Client sees assigned work and no administrative settings", async ({
  page,
}) => {
  await login(page, "cliente@example.com");
  await page.getByRole("link", { name: "Obras", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Edifício Demo", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Utilizadores", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Criar obra", exact: true }),
  ).toHaveCount(0);
  await page.goto("/settings/users");
  await expect(
    page.getByRole("alert").filter({ hasText: "Sem acesso" }),
  ).toBeVisible();
});
test("Mobile navigation fits viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "cliente@example.com");
  await page.getByRole("button", { name: "Abrir menu" }).click();
  await page.getByRole("link", { name: "Obras", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Obras", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
