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
test("M3 admin creates hierarchy, dependency, baseline and physical progress", async ({
  page,
}) => {
  test.setTimeout(90000);
  await login(page, "admin@example.com");
  const response = await page.request.post("/api/v1/projects", {
    headers: { Origin: "http://localhost:3000" },
    data: { code: `M3-${Date.now()}`, name: "M3 Cronograma E2E" },
  });
  expect(response.ok()).toBe(true);
  const { id } = await response.json();
  await page.goto(`/projects/${id}/schedule`);
  await page.getByLabel("Nome", { exact: true }).fill("Plano de execução");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Plano de execução" }),
  ).toBeVisible();
  for (const [code, name, type, parent] of [
    ["2", "Fundações", "SUMMARY", false],
    ["2.1", "Escavação", "TASK", true],
    ["2.2", "Betão", "TASK", true],
  ] as const) {
    await page
      .getByRole("button", { name: "Nova tarefa", exact: true })
      .click();
    await page.getByLabel("Código", { exact: true }).fill(code);
    await page.getByLabel("Nome da tarefa").fill(name);
    await page
      .getByRole("combobox", { name: "Tipo", exact: true })
      .first()
      .selectOption(type);
    if (parent)
      await page
        .getByRole("combobox", { name: "Resumo pai", exact: true })
        .selectOption({ label: "2 Fundações" });
    await page
      .getByRole("button", { name: "Guardar", exact: true })
      .first()
      .click();
    await expect(
      page.locator("tr").filter({ hasText: name }).first(),
    ).toBeVisible();
  }
  await page
    .getByRole("combobox", { name: "Predecessora", exact: true })
    .selectOption({ label: "Escavação" });
  await page
    .getByRole("combobox", { name: "Sucessora", exact: true })
    .selectOption({ label: "Betão" });
  await page
    .getByRole("heading", { name: "Adicionar dependência" })
    .locator("..")
    .getByRole("button", { name: "Guardar", exact: true })
    .click();
  await expect(
    page.getByText("Escavação → Betão", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Baseline", exact: true }).click();
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Baseline 0", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cronograma", exact: true }).click();
  await page
    .locator("tr")
    .filter({ hasText: "Escavação" })
    .getByRole("button", { name: "Progresso", exact: true })
    .click();
  await page.getByLabel("Novo progresso (%)", { exact: true }).fill("50");
  await page
    .getByRole("heading", { name: "Atualizar progresso · Escavação" })
    .locator("..")
    .getByRole("button", { name: "Guardar", exact: true })
    .click();
  await expect(page.getByText("25.00%", { exact: true }).first()).toBeVisible();
  await page.screenshot({
    path: "work/m3-schedule-desktop.png",
    fullPage: true,
  });
});
test("M3 manager records mobile diary, admin approves, client sees authorized photos", async ({
  browser,
}) => {
  test.setTimeout(120000);
  const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    }),
    page = await context.newPage();
  await login(page, "admin@example.com");
  const headers = { Origin: "http://localhost:3000" };
  const created = await page.request.post("/api/v1/projects", {
    headers,
    data: { code: `M3-DIARY-${Date.now()}`, name: "M3 Diário E2E" },
  });
  expect(created.ok()).toBe(true);
  const { id: project } = await created.json();
  const users = (await (await page.request.get("/api/v1/users")).json()) as {
    role: string;
    user: { id: string };
  }[];
  for (const role of ["MANAGER", "CLIENT"]) {
    const member = users.find((u) => u.role === role)!;
    const assigned = await page.request.post(
      `/api/v1/projects/${project}/users`,
      { headers, data: { userId: member.user.id, role } },
    );
    expect(assigned.ok()).toBe(true);
  }
  const date = new Date().toISOString().slice(0, 10);
  expect(
    (
      await page.request.post(`/api/v1/projects/${project}/schedule`, {
        headers,
        data: { name: "Plano diário", plannedStart: date, plannedEnd: date },
      })
    ).ok(),
  ).toBe(true);
  const task = await (
    await page.request.post(`/api/v1/projects/${project}/schedule/tasks`, {
      headers,
      data: {
        code: "2.1",
        name: "Escavação",
        taskType: "TASK",
        plannedStart: date,
        plannedEnd: date,
      },
    })
  ).json();
  expect(
    (
      await page.request.post(
        `/api/v1/projects/${project}/schedule/tasks/${task.id}/progress`,
        { headers, data: { version: 0, progress: "75", progressDate: date } },
      )
    ).ok(),
  ).toBe(true);
  await login(page, "gestor@example.com");
  await page.goto(`/projects/${project}/daily-logs`);
  await page.getByRole("button", { name: "Novo diário", exact: true }).click();
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Submeter diário" }),
  ).toBeVisible();
  const logUrl = page.url();
  await page.getByRole("button", { name: "Atividades", exact: true }).click();
  await page
    .getByLabel("Descrição da atividade")
    .fill("Escavação registada no terreno");
  await page
    .getByRole("combobox", { name: "Tarefa do cronograma", exact: true })
    .selectOption({ label: "2.1 Escavação · 75%" });
  await page.getByLabel("Novo progresso (%)", { exact: false }).fill("80");
  await page
    .getByRole("combobox", {
      name: "Atualizar tarefa com este progresso",
      exact: true,
    })
    .selectOption("true");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(
    page.getByText("Escavação registada no terreno", { exact: false }),
  ).toBeVisible();
  for (const [tab, fields] of [
    [
      "Mão de obra",
      {
        Empresa: "Demo",
        Especialidade: "Pedreiro",
        Trabalhadores: "6",
        "Horas por trabalhador": "8",
      },
    ],
    ["Equipamentos", { Equipamento: "Escavadora", "Horas trabalhadas": "6" }],
    ["Materiais", { Material: "Areia", Quantidade: "10", Unidade: "m3" }],
    [
      "Ocorrências",
      { Título: "Chuva ligeira", Descrição: "Interrupção breve" },
    ],
  ] as const) {
    await page.getByRole("button", { name: tab, exact: true }).click();
    for (const [label, value] of Object.entries(fields))
      await page.getByLabel(label, { exact: true }).fill(value);
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(
      page.getByText("Registo guardado", { exact: true }),
    ).toBeVisible();
  }
  await page.getByRole("button", { name: "Fotografias", exact: true }).click();
  const buffer = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
    "base64",
  );
  for (const [visibility, caption] of [
    ["CLIENT_VISIBLE", "Vista autorizada"],
    ["INTERNAL", "Fotografia interna"],
  ]) {
    await page
      .getByRole("combobox", { name: "Visibilidade", exact: true })
      .selectOption(visibility);
    await page.getByLabel("Legenda", { exact: true }).fill(caption);
    await page
      .locator('input[type="file"]')
      .setInputFiles({ name: "obra.png", mimeType: "image/png", buffer });
    await expect(
      page.getByRole("heading", { name: caption, exact: true }),
    ).toBeVisible();
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "work/m3-diary-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Submeter diário" }).click();
  await expect(page.getByText("Submetido", { exact: true })).toBeVisible();
  await context.close();
  const adminContext = await browser.newContext(),
    admin = await adminContext.newPage();
  await login(admin, "admin@example.com");
  await admin.goto(logUrl);
  await admin.getByRole("button", { name: "Aprovar diário" }).click();
  await expect(admin.getByText("Aprovado", { exact: true })).toBeVisible();
  await adminContext.close();
  const clientContext = await browser.newContext(),
    client = await clientContext.newPage();
  await login(client, "cliente@example.com");
  await client.goto(`/projects/${project}/schedule`);
  await expect(
    client.getByRole("button", { name: "Nova tarefa", exact: true }),
  ).toHaveCount(0);
  await client.goto(logUrl);
  await client
    .getByRole("button", { name: "Fotografias", exact: true })
    .click();
  await expect(
    client.getByRole("heading", { name: "Vista autorizada", exact: true }),
  ).toBeVisible();
  await expect(
    client.getByRole("heading", { name: "Fotografia interna", exact: true }),
  ).toHaveCount(0);
  await expect(
    client.getByRole("button", { name: "Submeter diário" }),
  ).toHaveCount(0);
  await expect(client.locator('input[type="file"]')).toHaveCount(0);
  await clientContext.close();
});
