import type { OpenAPIObject, SchemaObject } from "@nestjs/swagger";
export function completeQualityDocs(doc: OpenAPIObject) {
  const uuid: SchemaObject = { type: "string", format: "uuid" },
    str: SchemaObject = { type: "string" },
    date: SchemaObject = { type: "string", format: "date" },
    common = {
      id: uuid,
      tenantId: uuid,
      projectId: uuid,
      version: { type: "integer" } as SchemaObject,
      status: str,
    };
  const schemas: Record<string, SchemaObject> = {
    Inspection: {
      type: "object",
      properties: {
        ...common,
        code: { type: "string", example: "INS-001" },
        inspectionDate: date,
        inspectorId: uuid,
        checklistTemplateVersionId: uuid,
        overallResult: {
          type: "string",
          enum: ["PASS", "PASS_WITH_OBSERVATIONS", "FAIL"],
        },
        items: {
          type: "array",
          items: { $ref: "#/components/schemas/InspectionItem" },
        },
      },
    },
    InspectionItem: {
      type: "object",
      properties: {
        ...common,
        templateItemId: uuid,
        result: { type: "string", enum: ["PASS", "FAIL", "NA"] },
        comment: str,
        numericValue: { type: "string", example: "12.500000" },
        holdPointReleasedBy: uuid,
      },
    },
    NCR: {
      type: "object",
      properties: {
        ...common,
        code: { type: "string", example: "NCR-001" },
        title: str,
        severity: {
          type: "string",
          enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
        },
        dueDate: date,
        responsibleUserId: uuid,
      },
    },
    CorrectiveAction: {
      type: "object",
      properties: {
        ...common,
        nonConformityId: uuid,
        description: str,
        completedBy: uuid,
        verifiedBy: uuid,
      },
    },
    ChecklistTemplate: {
      type: "object",
      properties: {
        ...common,
        code: { type: "string", example: "CHK-FUND" },
        currentVersion: { type: "integer", example: 1 },
      },
    },
    InspectionRequest: {
      type: "object",
      properties: {
        ...common,
        code: { type: "string", example: "IR-001" },
        requestedInspectionDate: date,
        assignedInspectorId: uuid,
      },
    },
  };
  doc.components ??= {};
  doc.components.schemas = { ...doc.components.schemas, ...schemas };
  for (const [path, item] of Object.entries(doc.paths)) {
    if (
      !/\/(inspections|inspection-requests|checklist-templates|checklist-template-versions|non-conformities|corrective-actions|quality|notifications)(\/|$)/.test(
        path,
      ) &&
      !path.endsWith("create-non-conformity")
    )
      continue;
    for (const method of ["get", "post", "patch", "delete"] as const) {
      const op = item[method];
      if (!op) continue;
      op.description =
        "M6: tenant da sessão, participação ativa na obra, RBAC e version obrigatório nas alterações. Evidências usam DocumentModule. Inspeções CLOSED e versões publicadas são imutáveis. Verificação independente do executor.";
      for (const [code, description] of [
        [
          400,
          "VALIDATION_ERROR / INSPECTION_REQUIRED_ITEM_MISSING / INSPECTION_FAIL_REQUIRES_EVIDENCE",
        ],
        [
          403,
          "ACCESS_DENIED / SELF_VERIFICATION_NOT_ALLOWED / NCR_VERIFICATION_NOT_ALLOWED",
        ],
        [
          404,
          "INSPECTION_NOT_FOUND / NON_CONFORMITY_NOT_FOUND / CHECKLIST_TEMPLATE_NOT_FOUND / CORRECTIVE_ACTION_NOT_FOUND",
        ],
        [
          409,
          "RESOURCE_VERSION_CONFLICT / INSPECTION_IMMUTABLE / CHECKLIST_VERSION_IMMUTABLE / HOLD_POINT_NOT_RELEASED / NCR_CLOSE_REQUIRES_VERIFIED_ACTIONS / INVALID_NCR_TRANSITION",
        ],
      ] as const)
        op.responses[code] = { description };
      const name = path.includes("corrective-actions")
        ? "CorrectiveAction"
        : path.includes("non-conformities")
          ? "NCR"
          : path.includes("inspection-requests")
            ? "InspectionRequest"
            : path.includes("checklist")
              ? "ChecklistTemplate"
              : path.includes("/items")
                ? "InspectionItem"
                : "Inspection";
      if (
        !path.includes("quality") &&
        !path.includes("notifications") &&
        !path.includes("evidence") &&
        !path.includes("report")
      )
        op.responses[method === "post" ? 201 : 200] = {
          description: "Resultado autorizado no contexto da obra",
          content: {
            "application/json": {
              schema: { $ref: `#/components/schemas/${name}` },
            },
          },
        };
      if (
        method === "get" &&
        /\/(inspections|non-conformities|inspection-requests|checklist-templates)$/.test(
          path,
        )
      ) {
        op.responses[200] = {
          description: "Página de resultados autorizados",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  items: {
                    type: "array",
                    items: { $ref: `#/components/schemas/${name}` },
                  },
                  total: { type: "integer" },
                  page: { type: "integer" },
                  limit: { type: "integer" },
                },
              },
            },
          },
        };
        op.parameters ??= [];
        for (const name of [
          "page",
          "limit",
          "status",
          "severity",
          "category",
          "result",
          "inspector",
          "responsible_user",
          "responsible_organization",
          "overdue",
          "contract",
          "schedule_task",
          "budget_item",
          "date_from",
          "date_to",
          "search",
        ])
          op.parameters.push({
            in: "query",
            name,
            required: false,
            schema: { type: "string" },
          });
      }
      if (method === "get" && /\/inspections\/\{id\}\/items$/.test(path)) {
        op.responses[200] = {
          description: "Respostas dos itens da inspeção",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  items: {
                    type: "array",
                    items: { $ref: "#/components/schemas/InspectionItem" },
                  },
                },
              },
            },
          },
        };
      }
    }
  }
}
