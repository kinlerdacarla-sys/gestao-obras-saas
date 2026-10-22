import { test, expect, type Page } from "@playwright/test";
import { Redis } from "ioredis";
import { randomUUID, createHash } from "node:crypto";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
  "base64",
);
test.beforeEach(async () => {
  if (
    process.env.NODE_ENV !== "test" ||
    !process.env.DATABASE_URL?.includes("test")
  )
    throw Error("Test environment required");
  const redis = new Redis(process.env.REDIS_URL!);
  await redis.del("auth:ip:127.0.0.1", "auth:ip:::ffff:127.0.0.1");
  await redis.quit();
});
async function login(page: Page, email: string) {
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
async function project(page: Page) {
  await page.goto("/projects");
  await page.getByText("Edifício Demo", { exact: true }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]+$/);
  return page.url().split("/projects/")[1];
}
test("M6 manager request, mobile fiscal inspection, critical NCR, correction and independent closure", async ({
  page,
}) => {
  test.setTimeout(180000);
  const unique = Date.now();
  await login(page, "gestor@example.com");
  const id = await project(page);
  await page.goto(`/projects/${id}/inspection-requests`);
  await page
    .getByLabel("Título", { exact: true })
    .fill(`Pedido qualidade ${unique}`);
  await page.getByRole("button", { name: "Criar pedido", exact: true }).click();
  const card = page.locator("section.card").filter({
    has: page.getByRole("heading", {
      name: new RegExp(`Pedido qualidade ${unique}`),
    }),
  });
  await expect(card).toBeVisible();
  await card
    .getByRole("button", { name: "Submeter pedido", exact: true })
    .click();
  await expect(card).toContainText("Submetido");
  await login(page, "fiscal@example.com");
  await page.goto(`/projects/${id}/inspection-requests`);
  const scheduled = page.locator("section.card").filter({
    has: page.getByRole("heading", {
      name: new RegExp(`Pedido qualidade ${unique}`),
    }),
  });
  await scheduled
    .getByRole("combobox", { name: "Fiscal", exact: true })
    .selectOption({ label: "Fiscal Demo" });
  await scheduled.getByRole("button", { name: "Agendar", exact: true }).click();
  await scheduled
    .getByRole("link", { name: "Criar inspeção deste pedido" })
    .click();
  await page
    .getByLabel("Título", { exact: true })
    .fill(`Inspeção qualidade ${unique}`);
  await page
    .locator("section")
    .filter({
      has: page.getByRole("heading", { name: "Nova inspeção", exact: true }),
    })
    .getByRole("combobox", { name: "Fiscal", exact: true })
    .selectOption({ label: "Fiscal Demo" });
  await page
    .getByRole("combobox", { name: "Checklist publicado", exact: true })
    .selectOption({ label: "Fundações · v1" });
  await page
    .getByRole("button", { name: "Criar inspeção", exact: true })
    .click();
  await page.waitForURL(/inspections\/[0-9a-f-]+$/);
  const inspectionUrl = page.url();
  await page
    .getByRole("button", { name: "Iniciar inspeção", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Em curso");
  await page.setViewportSize({ width: 390, height: 844 });
  const cards = page.locator("article.quality-item");
  await expect(cards).toHaveCount(8);
  for (let i = 0; i < 8; i++) {
    const button = cards.nth(i).getByRole("button", {
      name: i === 6 ? "Não conforme" : "Conforme",
      exact: true,
    });
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
  }
  await cards
    .nth(6)
    .getByLabel("Fotografia do item")
    .setInputFiles({ name: "defeito.png", mimeType: "image/png", buffer: png });
  await expect(
    cards.nth(6).getByRole("link", { name: "defeito.png" }),
  ).toBeVisible();
  await page.screenshot({
    path: "work/m6-inspection-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const form = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Criar NCR", exact: true }),
  });
  await form.getByLabel("Título da NCR").fill(`NCR qualidade ${unique}`);
  await form.getByLabel("Descrição da NCR").fill("Recobrimento insuficiente");
  await form
    .getByRole("combobox", { name: "Severidade", exact: true })
    .selectOption("CRITICAL");
  await form
    .getByRole("combobox", { name: "Item do checklist", exact: true })
    .selectOption({ label: "Recobrimento" });
  await form.getByRole("button", { name: "Registar NCR", exact: true }).click();
  const link = page.getByRole("link", {
    name: new RegExp(`NCR qualidade ${unique}`),
  });
  await expect(link).toBeVisible();
  const ncrUrl = await link.getAttribute("href");
  await page
    .getByRole("button", { name: "Submeter inspeção", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Submetido");
  await page
    .getByRole("button", { name: "Encerrar inspeção", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Encerrado");
  await login(page, "gestor@example.com");
  await page.goto(ncrUrl!);
  await page
    .getByRole("combobox", { name: "Responsável", exact: true })
    .selectOption({ label: "Gestor Demo" });
  await page.getByRole("button", { name: "Atribuir", exact: true }).click();
  await page
    .getByRole("button", { name: "Iniciar correção", exact: true })
    .click();
  await page
    .getByLabel("Descrição da ação", { exact: true })
    .fill("Ajustar espaçadores");
  await page
    .getByRole("button", { name: "Adicionar ação corretiva", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Iniciar ação corretiva", exact: true })
    .click();
  await expect(
    page.getByLabel("Evidência da correção", { exact: true }),
  ).toBeEnabled();
  await page
    .getByLabel("Evidência da correção", { exact: true })
    .setInputFiles({
      name: "corrigido.png",
      mimeType: "image/png",
      buffer: png,
    });
  await expect(page.getByRole("link", { name: "corrigido.png" })).toBeVisible();
  await page
    .getByLabel("Descrição da correção executada")
    .fill("Espaçadores corrigidos");
  await page
    .getByRole("button", { name: "Marcar ação concluída", exact: true })
    .click();
  await expect(
    page.getByText("Concluído · Prazo:", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Pronta para verificação", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Pronto para verificação",
  );
  await login(page, "fiscal@example.com");
  await page.goto(ncrUrl!);
  await expect(page.getByRole("link", { name: "corrigido.png" })).toBeVisible();
  await page
    .getByRole("button", { name: "Aprovar verificação da NCR", exact: true })
    .click();
  await expect(
    page.getByText("Verificado · Prazo:", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Encerrar NCR", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Encerrado");
  await page.screenshot({ path: "work/m6-ncr-mobile.png", fullPage: true });
  await page.goto(inspectionUrl);
  await expect(page.getByRole("status")).toContainText("Não conforme");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/projects/${id}/quality`);
  await expect(
    page.getByRole("heading", { name: "Dashboard de fiscalização" }),
  ).toBeVisible();
  await expect(
    page
      .locator("article.card")
      .filter({ has: page.getByText("Inspeções", { exact: true }) })
      .locator("strong"),
  ).toHaveText(/^[1-9]\d*$/);
  await page.screenshot({
    path: "work/m6-quality-dashboard.png",
    fullPage: true,
  });
  await page.goto(
    `/projects/${id}/quality/report?kind=inspection&id=${inspectionUrl.split("/").pop()}`,
  );
  const report = page.locator(".quality-report");
  await expect(report).toContainText("Fiscal Demo");
  await expect(report).toContainText("CHK-FUND");
  await expect(report.getByRole("link", { name: "defeito.png" })).toBeVisible();
  await page.screenshot({
    path: "work/m6-inspection-report.png",
    fullPage: true,
  });
});
test("M6 critical NCR blocks measurement certification and closing permits certification", async ({
  page,
}) => {
  test.setTimeout(180000);
  await login(page, "gestor@example.com");
  const id = await project(page),
    base = `/api/v1/projects/${id}`;
  const call = async (path: string, data: object) => {
    const res = await page.request.post(base + path, {
      headers: {
        Origin: "http://localhost:3000",
        "Idempotency-Key": randomUUID(),
      },
      data,
    });
    expect(res.ok(), await res.text()).toBe(true);
    return res.json();
  };
  const get = async (path: string) =>
    (await page.request.get(base + path)).json();
  const act = async (path: string, a: string, extra: object = {}) =>
    call(path + "/" + a, { version: (await get(path)).version, ...extra });
  const contracts = await get("/contracts");
  const contract = contracts.items.find(
    (c: { contractNumber: string }) => c.contractNumber === "SUB-001",
  );
  const detail = await get(`/contracts/${contract.id}/items`);
  const m = await call("/measurements", {
    contractId: contract.id,
    periodStart: new Date().toISOString().slice(0, 10),
    periodEnd: new Date().toISOString().slice(0, 10),
  });
  await call(`/measurements/${m.id}/items`, {
    version: 0,
    contractItemId: detail.items[0].id,
    currentQuantity: "0.01",
  });
  await act(`/measurements/${m.id}`, "submit");
  await login(page, "fiscal@example.com");
  await act(`/measurements/${m.id}`, "fiscal-approve");
  const n = await call("/non-conformities", {
    title: `Bloqueio E2E ${Date.now()}`,
    description: "Defeito crítico na medição",
    severity: "CRITICAL",
    category: "WORKMANSHIP",
    measurementId: m.id,
  });
  await login(page, "financiador@example.com");
  await act(`/measurements/${m.id}`, "approve");
  await login(page, "admin@example.com");
  await page.goto(`/projects/${id}/measurements/${m.id}`);
  await page
    .getByRole("button", { name: "Certificar medição", exact: true })
    .click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Certificação bloqueada por NCR crítica" }),
  ).toBeVisible();
  await login(page, "gestor@example.com");
  const opts = await get("/quality/options");
  const manager = opts.users.find(
    (u: { role: string }) => u.role === "MANAGER",
  );
  await act(`/non-conformities/${n.id}`, "assign", {
    responsibleUserId: manager.id,
  });
  await act(`/non-conformities/${n.id}`, "start-correction");
  const a = await call(`/non-conformities/${n.id}/corrective-actions`, {
    version: (await get(`/non-conformities/${n.id}`)).version,
    description: "Corrigir trabalho",
  });
  await act(`/corrective-actions/${a.id}`, "start");
  const ticket = await call(`/corrective-actions/${a.id}/evidence`, {
    version: (await get(`/corrective-actions/${a.id}`)).version,
    fileName: "correcao.png",
    mimeType: "image/png",
    sizeBytes: png.length,
    checksum: createHash("sha256").update(png).digest("hex"),
    isPhoto: true,
    visibility: "PUBLIC_PROJECT",
  });
  const uploaded = await page.request.put(ticket.uploadUrl, {
    headers: { Origin: "http://localhost:3000" },
    multipart: {
      file: { name: "correcao.png", mimeType: "image/png", buffer: png },
    },
  });
  expect(uploaded.ok()).toBe(true);
  await call(`/corrective-actions/${a.id}/documents/${ticket.id}/confirm`, {
    version: ticket.version,
  });
  await act(`/corrective-actions/${a.id}`, "complete", {
    completionNotes: "Conforme após reparação",
  });
  await act(`/non-conformities/${n.id}`, "ready-for-verification");
  await login(page, "fiscal@example.com");
  await page.goto(`/projects/${id}/non-conformities/${n.id}`);
  await page
    .getByRole("button", { name: "Aprovar verificação da NCR", exact: true })
    .click();
  await expect(
    page.getByText("Verificado · Prazo:", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Encerrar NCR", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Encerrado");
  await login(page, "admin@example.com");
  await page.goto(`/projects/${id}/measurements/${m.id}`);
  await page
    .getByRole("button", { name: "Certificar medição", exact: true })
    .click();
  await expect(
    page.getByText("Certificado", { exact: true }).first(),
  ).toBeVisible();
});
