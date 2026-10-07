import type { OpenAPIObject, SchemaObject } from "@nestjs/swagger";
const text: SchemaObject = { type: "string" },
  uuid: SchemaObject = { type: "string", format: "uuid" },
  decimal: SchemaObject = {
    type: "string",
    example: "116000.00",
    description: "Decimal exato MZN, nunca float",
  },
  integer: SchemaObject = { type: "integer" };
const object = (properties: Record<string, SchemaObject>): SchemaObject => ({
  type: "object",
  properties,
});
export function completeCommercialDocs(doc: OpenAPIObject) {
  for (const [path, item] of Object.entries(doc.paths)) {
    if (
      !/\/(suppliers|contracts|expenses|cost-centers|costs)(\/|$)/.test(path) &&
      !path.includes("{kind}")
    )
      continue;
    for (const method of ["get", "post", "patch", "put", "delete"] as const) {
      const op = item[method];
      if (!op) continue;
      const common = {
        id: uuid,
        tenantId: uuid,
        projectId: uuid,
        version: integer,
        status: text,
        createdAt: { type: "string", format: "date-time" } as SchemaObject,
      };
      let properties: Record<string, SchemaObject> = path.includes("/suppliers")
        ? {
            ...common,
            organizationId: uuid,
            legalName: text,
            taxNumber: text,
            supplierType: text,
          }
        : path.includes("/cost-centers")
          ? { ...common, code: text, name: text, parentId: uuid }
          : path.includes("/amendments")
            ? {
                ...common,
                contractId: uuid,
                code: text,
                amendmentType: text,
                amount: decimal,
                description: text,
                approvedBy: uuid,
              }
            : path.includes("/expenses")
              ? {
                  ...common,
                  expenseNumber: text,
                  costCenterId: uuid,
                  contractId: uuid,
                  subtotal: decimal,
                  taxAmount: decimal,
                  totalAmount: decimal,
                }
              : path.includes("/items")
                ? {
                    ...common,
                    budgetItemId: uuid,
                    description: text,
                    quantity: decimal,
                    unitPrice: decimal,
                    totalValue: decimal,
                  }
                : {
                    ...common,
                    contractNumber: text,
                    supplierId: uuid,
                    originalValue: decimal,
                    currentValue: decimal,
                    retentionPercentage: decimal,
                    advancePercentage: decimal,
                    advanceAmount: decimal,
                    advanceOutstandingAmount: decimal,
                    approvedAdditions: decimal,
                    approvedOmissions: decimal,
                  };
      if (path.endsWith("/summary"))
        properties = Object.fromEntries(
          [
            "approvedBudget",
            "contractedOriginal",
            "approvedAdditions",
            "approvedOmissions",
            "currentContracted",
            "approvedExpenses",
            "approvedDirectExpenses",
            "committedCost",
            "remainingBudget",
          ].map((k) => [k, decimal]),
        );
      if (path.includes("/costs/items"))
        properties = {
          budgetItemId: uuid,
          code: text,
          description: text,
          budgetValue: decimal,
          contractedValue: decimal,
          approvedExpenseValue: decimal,
          approvedDirectExpenses: decimal,
          remainingValue: decimal,
          variance: decimal,
          warnings: { type: "array", items: text },
        };
      let schema = object(properties);
      const list =
        method === "get" &&
        !path.endsWith("/summary") &&
        /\/(suppliers|contracts|expenses|cost-centers|amendments|items|history|documents)$/.test(
          path,
        );
      if (list) {
        schema = object({
          items: { type: "array", items: schema },
          total: integer,
          page: integer,
          limit: integer,
        });
        op.parameters = [
          ...(op.parameters ?? []),
          {
            name: "page",
            in: "query",
            schema: { type: "integer", default: 1, minimum: 1 },
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", default: 50, maximum: 200, minimum: 1 },
          },
        ];
      }
      if (path.includes("/documents"))
        schema =
          method === "post" && path.endsWith("/documents")
            ? object({
                id: uuid,
                uploadUrl: text,
                method: { type: "string", example: "PUT" },
                version: integer,
                expiresAt: text,
              })
            : path.endsWith("/confirm")
              ? object({ id: uuid, version: integer })
              : path.endsWith("/upload")
                ? object({ ok: { type: "boolean" } })
                : object({
                    items: {
                      type: "array",
                      items: object({
                        id: uuid,
                        fileName: text,
                        sizeBytes: text,
                        mimeType: text,
                      }),
                    },
                  });
      op.responses = {
        [method === "post" ? "201" : "200"]: {
          description: "Sucesso; valores financeiros como strings decimais.",
          content: { "application/json": { schema } },
        },
      };
      if (path.endsWith("/content"))
        op.responses["200"] = {
          description: "Documento privado após autorização",
          content: {
            "application/octet-stream": {
              schema: { type: "string", format: "binary" },
            },
          },
        };
      if (path.endsWith("/upload"))
        op.requestBody = {
          required: true,
          content: {
            "multipart/form-data": {
              schema: object({ file: { type: "string", format: "binary" } }),
            },
          },
        };
      for (const [status, description] of Object.entries({
        400: "VALIDATION_ERROR / INVALID_RETENTION_PERCENTAGE / INVALID_ADVANCE_PERCENTAGE",
        401: "UNAUTHORIZED",
        403: "ACCESS_DENIED / SELF_APPROVAL_NOT_ALLOWED",
        404: "SUPPLIER_NOT_FOUND / CONTRACT_NOT_FOUND / CONTRACT_ITEM_NOT_FOUND / CONTRACT_AMENDMENT_NOT_FOUND / COST_CENTER_NOT_FOUND / EXPENSE_NOT_FOUND",
        409: "RESOURCE_VERSION_CONFLICT / CONTRACT_IMMUTABLE / CONTRACT_AMENDMENT_IMMUTABLE / EXPENSE_IMMUTABLE / INVALID_CONTRACT_TRANSITION / INVALID_AMENDMENT_TRANSITION / INVALID_EXPENSE_TRANSITION",
      }))
        op.responses[status] = {
          description,
          content: {
            "application/json": {
              schema: object({
                statusCode: integer,
                code: text,
                message: text,
                details: { type: "array", items: {} },
              }),
            },
          },
        };
      if (op.requestBody && "content" in op.requestBody) {
        const json = op.requestBody.content["application/json"];
        if (json?.schema && "properties" in json.schema) {
          const example: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(
            json.schema.properties ?? {},
          )) {
            if ("$ref" in value) continue;
            example[key] =
              key === "version"
                ? 0
                : key === "originalValue"
                  ? "10000000.00"
                  : key === "amount"
                    ? "1500000.00"
                    : key === "subtotal"
                      ? "100000.00"
                      : key === "taxAmount"
                        ? "16000.00"
                        : key === "retentionPercentage"
                          ? "5"
                          : key === "advancePercentage"
                            ? "10"
                            : (value.example ??
                              value.default ??
                              value.enum?.[0] ??
                              (value.format === "uuid"
                                ? "11111111-1111-4111-8111-111111111111"
                                : value.format === "date"
                                  ? "2026-10-07"
                                  : value.type === "integer"
                                    ? 1
                                    : value.type === "number"
                                      ? 1
                                      : "Exemplo"));
          }
          json.example = example;
        }
      }
    }
  }
}
