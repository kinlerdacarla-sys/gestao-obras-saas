import type { OpenAPIObject, SchemaObject } from "@nestjs/swagger";
export function completeFinancialDocs(doc: OpenAPIObject) {
  for (const [path, item] of Object.entries(doc.paths)) {
    if (
      !/\/(measurements|funding-agreements|disbursement-requests|disbursements|payments|retention-releases|financial)(\/|$)/.test(
        path,
      ) &&
      !path.endsWith("/retention") &&
      !path.endsWith("/financial-settings")
    )
      continue;
    for (const method of ["get", "post", "patch", "delete"] as const) {
      const op = item[method];
      if (!op) continue;
      op.description =
        "M5: contexto de empresa e obra obrigatório; montantes em strings decimais MZN. Mutações exigem Origin. Aprovações independentes do autor e controlo de versão.";
      op.parameters ??= [];
      if (
        method === "post" &&
        (/\/(certify|reverse|disbursements)$/.test(path) ||
          path.endsWith("/payments"))
      )
        op.parameters.push({
          in: "header",
          name: "Idempotency-Key",
          required: true,
          schema: { type: "string", minLength: 8, maxLength: 128 },
          description:
            "Reutilize a mesma chave e corpo em repetição de um pedido. Outro corpo devolve 409 IDEMPOTENCY_CONFLICT.",
        });
      for (const [status, description] of [
        [
          400,
          "VALIDATION_ERROR / INVALID_PAYMENT_SOURCE / IDEMPOTENCY_KEY_REQUIRED",
        ],
        [403, "ACCESS_DENIED / SELF_APPROVAL_NOT_ALLOWED"],
        [
          404,
          "MEASUREMENT_NOT_FOUND / FUNDING_AGREEMENT_NOT_FOUND / PAYMENT_NOT_FOUND",
        ],
        [
          409,
          "RESOURCE_VERSION_CONFLICT / IDEMPOTENCY_CONFLICT / PAYMENT_EXCEEDS_OUTSTANDING / FUNDING_LIMIT_EXCEEDED / MEASUREMENT_IMMUTABLE",
        ],
      ] as const)
        op.responses[status] = { description };
      const decimal: SchemaObject = { type: "string", example: "850000.00" };
      const text: SchemaObject = { type: "string" },
        integer: SchemaObject = { type: "integer" },
        uuid: SchemaObject = { type: "string", format: "uuid" };
      const common = {
        id: uuid,
        tenantId: uuid,
        projectId: uuid,
        version: integer,
        status: text,
        createdAt: { type: "string", format: "date-time" } as SchemaObject,
      };
      let properties: Record<string, SchemaObject> = path.includes("/payments")
        ? {
            ...common,
            supplierId: uuid,
            contractId: uuid,
            measurementId: uuid,
            expenseId: uuid,
            retentionReleaseId: uuid,
            paymentNumber: integer,
            amount: decimal,
            paymentDate: text,
            method: text,
            reference: text,
          }
        : path.endsWith("/disbursements") || path.includes("/disbursements/")
          ? {
              ...common,
              fundingAgreementId: uuid,
              disbursementRequestId: uuid,
              amount: decimal,
              disbursementDate: text,
              reference: text,
            }
          : path.includes("/disbursement-requests")
            ? {
                ...common,
                fundingAgreementId: uuid,
                measurementId: uuid,
                requestNumber: integer,
                requestedAmount: decimal,
                approvedAmount: decimal,
                disbursedAmount: decimal,
              }
            : path.includes("/funding-agreements")
              ? {
                  ...common,
                  financierOrganizationId: uuid,
                  agreementNumber: text,
                  title: text,
                  approvedAmount: decimal,
                  startDate: text,
                  endDate: text,
                  disbursed: decimal,
                  fundingBalance: decimal,
                }
              : path.includes("/retention-releases")
                ? {
                    ...common,
                    contractId: uuid,
                    amount: decimal,
                    reason: text,
                    approvedBy: uuid,
                    approvedAt: text,
                  }
                : path.endsWith("/items") && method === "get"
                  ? {
                      ...common,
                      measurementId: uuid,
                      contractItemId: uuid,
                      budgetItemId: uuid,
                      description: text,
                      unit: text,
                      contractQuantity: decimal,
                      previousQuantity: decimal,
                      currentQuantity: decimal,
                      cumulativeQuantity: decimal,
                      unitPrice: decimal,
                      previousAmount: decimal,
                      currentAmount: decimal,
                      cumulativeAmount: decimal,
                    }
                  : {
                      ...common,
                      contractId: uuid,
                      measurementNumber: integer,
                      code: text,
                      periodStart: text,
                      periodEnd: text,
                      grossAmount: decimal,
                      retentionAmount: decimal,
                      advanceRecoveryAmount: decimal,
                      otherDeductionsAmount: decimal,
                      netCertifiedAmount: decimal,
                      paid: decimal,
                      outstandingPayable: decimal,
                    };
      if (path.endsWith("/financial/summary"))
        properties = Object.fromEntries(
          [
            "currency",
            "approvedBudget",
            "currentContractValue",
            "grossMeasured",
            "certified",
            "retentionWithheld",
            "retentionAvailable",
            "advanceOutstanding",
            "netCertified",
            "paid",
            "outstandingPayable",
            "approvedFunding",
            "disbursed",
            "fundingBalance",
            "financialProgress",
            "measurementProgress",
            "physicalProgress",
            "physicalFinancialVariance",
          ].map((key) => [
            key,
            key === "currency" ? { type: "string", enum: ["MZN"] } : decimal,
          ]),
        );
      if (path.endsWith("/financial/curve"))
        properties = {
          baselineAmount: decimal,
          baselineSource: text,
          plannedFinancialAssumption: text,
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                date: text,
                planned_physical: decimal,
                actual_physical: decimal,
                planned_financial: decimal,
                actual_financial: decimal,
                certifiedCumulative: decimal,
              },
            },
          },
        };
      if (path.endsWith("/retention"))
        properties = {
          retentionAvailable: decimal,
          advanceOutstanding: decimal,
          transactions: {
            type: "array",
            items: {
              type: "object",
              properties: { ...common, type: text, amount: decimal },
            },
          },
          advances: {
            type: "array",
            items: {
              type: "object",
              properties: { ...common, type: text, amount: decimal },
            },
          },
          releases: {
            type: "array",
            items: {
              type: "object",
              properties: { ...common, amount: decimal, reason: text },
            },
          },
        };
      if (path.endsWith("/financial-settings"))
        properties = {
          ...common,
          advanceRecoveryMethod: text,
          advanceRecoveryPercentage: decimal,
          advanceRecoveryFixedAmount: decimal,
          finalApprovalRole: text,
        };
      const row: SchemaObject = { type: "object", properties };
      const paged =
        method === "get" &&
        /\/(measurements|payments|funding-agreements|disbursement-requests|items)$/.test(
          path,
        );
      if (paged) {
        op.parameters.push(
          {
            name: "page",
            in: "query",
            schema: { type: "integer", minimum: 1, default: 1 },
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 200, default: 50 },
          },
        );
      }
      op.responses[method === "post" ? 201 : 200] = {
        description: "Operação concluída",
        content: {
          "application/json": {
            schema: paged
              ? {
                  type: "object",
                  properties: {
                    items: { type: "array", items: row },
                    total: { type: "integer" },
                    page: { type: "integer" },
                    limit: { type: "integer" },
                  },
                }
              : row,
          },
        },
      };
    }
  }
}
