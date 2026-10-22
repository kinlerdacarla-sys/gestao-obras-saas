import type { OpenAPIObject, SchemaObject } from "@nestjs/swagger";
export function completeIntelligenceDocs(doc: OpenAPIObject) {
  const decimal: SchemaObject = {
    type: "string",
    example: "25000000.00",
    description: "Valor decimal calculado no backend; moeda MZN",
  };
  doc.components ??= {};
  doc.components.schemas = {
    ...doc.components.schemas,
    ExecutiveKpis: {
      type: "object",
      properties: {
        approvedBudget: decimal,
        currentContracts: decimal,
        certified: decimal,
        paid: decimal,
        financialProgressPercentage: { ...decimal, nullable: true },
        paymentProgressPercentage: { ...decimal, nullable: true },
        forecastFinalCost: decimal,
        costVarianceAtCompletion: decimal,
      },
    },
    ReportJob: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        projectId: { type: "string", format: "uuid", nullable: true },
        reportType: { type: "string" },
        format: { type: "string", enum: ["PDF", "XLSX"] },
        status: {
          type: "string",
          enum: ["QUEUED", "PROCESSING", "COMPLETED", "FAILED", "EXPIRED"],
        },
        expiresAt: { type: "string", format: "date-time" },
      },
    },
    ExecutiveAlert: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        title: { type: "string" },
        message: { type: "string" },
        severity: {
          type: "string",
          enum: ["INFO", "WARNING", "HIGH", "CRITICAL"],
        },
        status: {
          type: "string",
          enum: ["ACTIVE", "ACKNOWLEDGED", "RESOLVED", "DISMISSED"],
        },
        version: { type: "integer" },
      },
    },
  };
  for (const [path, item] of Object.entries(doc.paths)) {
    if (
      !/\/(analytics|alerts|alert-settings|reports|gallery|notifications)(\/|$)/.test(
        path,
      ) &&
      !path.startsWith("/api/v1/dashboard/") &&
      !/^\/api\/v1\/projects\/\{projectId\}\/documents/.test(path)
    )
      continue;
    for (const method of ["get", "post", "patch"] as const) {
      const op = item[method];
      if (!op) continue;
      op.description =
        "M7. Tenant da sessão e participação atual na obra. Cache privado por utilizador/perfil, 30–60 s. Relatórios são assíncronos e reautorizados no worker e no download. Alterações de alerta exigem version. Valores monetários MZN em strings decimais; percentagens sem denominador são null.";
      for (const [status, description] of [
        [400, "VALIDATION_ERROR"],
        [401, "UNAUTHORIZED"],
        [403, "ACCESS_DENIED / INVALID_SIGNATURE"],
        [404, "RESOURCE_NOT_FOUND"],
        [409, "VERSION_CONFLICT / REPORT_NOT_READY / REPORT_SCOPE_CHANGED"],
        [503, "REPORT_QUEUE_UNAVAILABLE"],
      ] as const)
        op.responses[status] = { description };
      const fields = path.endsWith("/portfolio")
        ? [
            "project",
            "status",
            "manager",
            "client",
            "portfolio",
            "date_from",
            "date_to",
          ]
        : path.endsWith("/s-curve")
          ? ["from", "to", "granularity"]
          : path.endsWith("/compare")
            ? ["projects"]
            : path.endsWith("/gallery") || path.endsWith("/documents")
              ? [
                  "date_from",
                  "date_to",
                  "daily_log",
                  "inspection",
                  "activity",
                  "page",
                  "limit",
                ]
              : path.endsWith("/alerts")
                ? ["project", "status", "page", "limit"]
                : [];
      if (method === "get")
        for (const name of fields)
          op.parameters = [
            ...(op.parameters ?? []).filter(
              (x) => !("name" in x && x.name === name),
            ),
            {
              name,
              in: "query",
              required: name === "projects",
              schema: { type: "string" },
              description:
                name === "projects"
                  ? "2–10 UUIDs separados por vírgula"
                  : name === "granularity"
                    ? "DAY | WEEK | MONTH"
                    : name === "portfolio"
                      ? "all | active | completed | at-risk"
                      : "Filtro opcional",
            },
          ];
      if (
        path.includes("/reports") &&
        !path.endsWith("/file") &&
        !path.endsWith("/download")
      )
        op.responses[method === "post" ? 201 : 200] = {
          description: "Pedido de relatório autorizado; sem objectKey público",
          content: {
            "application/json": {
              schema:
                method === "get" && path.endsWith("/reports")
                  ? {
                      type: "object",
                      properties: {
                        items: {
                          type: "array",
                          items: { $ref: "#/components/schemas/ReportJob" },
                        },
                      },
                    }
                  : { $ref: "#/components/schemas/ReportJob" },
            },
          },
        };
      if (path.endsWith("/file"))
        op.responses[200] = {
          description:
            "Ficheiro privado; sessão e assinatura de curta duração quando relatório",
          content: {
            "application/octet-stream": {
              schema: { type: "string", format: "binary" },
            },
          },
        };
    }
  }
}
