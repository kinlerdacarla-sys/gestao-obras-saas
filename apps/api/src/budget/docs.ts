import type {
  OpenAPIObject,
  SchemaObject,
  ReferenceObject,
  ParameterObject,
} from "@nestjs/swagger";
const text: SchemaObject = { type: "string" },
  id: SchemaObject = { type: "string", format: "uuid" },
  integer: SchemaObject = { type: "integer" },
  decimal: SchemaObject = {
    type: "string",
    description:
      "Decimal exato; MZN (18,2), quantidade (18,4). Nunca IEEE-754.",
  };
const object = (properties: Record<string, SchemaObject>): SchemaObject => ({
  type: "object",
  properties,
});
const array = (items: SchemaObject | ReferenceObject): SchemaObject => ({
  type: "array",
  items,
});
const nullable = (schema: SchemaObject): SchemaObject => ({
  ...schema,
  nullable: true,
});
const meta = object({
  page: integer,
  limit: integer,
  total: integer,
  totalPages: integer,
});
const paged = (schema: SchemaObject) => object({ data: array(schema), meta });
const value = object({
  budgetItemId: id,
  parentId: nullable(id),
  code: text,
  description: text,
  itemType: { type: "string", enum: ["GROUP", "ITEM"] },
  unit: nullable(text),
  quantity: nullable(decimal),
  unitPrice: nullable(decimal),
  totalValue: decimal,
  isActive: { type: "boolean" },
  sortOrder: integer,
  version: integer,
});
const revision = object({
  id,
  tenantId: id,
  projectId: id,
  budgetId: id,
  revisionNumber: integer,
  code: text,
  description: nullable(text),
  status: {
    type: "string",
    enum: [
      "DRAFT",
      "SUBMITTED",
      "APPROVED",
      "REJECTED",
      "SUPERSEDED",
      "CANCELLED",
    ],
  },
  version: integer,
  createdBy: id,
  createdAt: text,
  submittedBy: nullable(id),
  submittedAt: nullable(text),
  approvedBy: nullable(id),
  approvedAt: nullable(text),
  rejectedBy: nullable(id),
  rejectedAt: nullable(text),
  rejectionReason: nullable(text),
});
const node: SchemaObject = {
  ...value,
  properties: {
    ...value.properties,
    total: decimal,
    children: array({ $ref: "#/components/schemas/BudgetNode" }),
  },
};
const tree: SchemaObject = {
  ...revision,
  properties: {
    ...revision.properties,
    total: decimal,
    currency: { type: "string", enum: ["MZN"] },
    items: array(node),
    canEdit: { type: "boolean" },
  },
};
const comparison = object({
  fromRevisionId: id,
  toRevisionId: id,
  previousTotal: decimal,
  newTotal: decimal,
  difference: decimal,
  differencePercentage: nullable(decimal),
  data: array(
    object({
      id,
      code: text,
      description: text,
      classification: {
        type: "string",
        enum: [
          "ADDED",
          "REMOVED",
          "UNCHANGED",
          "QUANTITY_CHANGED",
          "PRICE_CHANGED",
          "QUANTITY_AND_PRICE_CHANGED",
        ],
      },
      metadataChanged: { type: "boolean" },
      previousQuantity: nullable(decimal),
      newQuantity: nullable(decimal),
      previousUnitPrice: nullable(decimal),
      newUnitPrice: nullable(decimal),
      previousValue: decimal,
      newValue: decimal,
      difference: decimal,
      differencePercentage: nullable(decimal),
    }),
  ),
  meta,
});
const job = object({
  id,
  tenantId: id,
  projectId: id,
  budgetId: nullable(id),
  version: integer,
  fileName: text,
  fileChecksum: text,
  status: {
    type: "string",
    enum: [
      "UPLOADED",
      "PROCESSING",
      "READY",
      "FAILED",
      "CONFIRMED",
      "CANCELLED",
    ],
  },
  totalRows: integer,
  validRows: integer,
  invalidRows: integer,
  previewTotal: decimal,
  errorMessage: nullable(text),
  headers: array(text),
  mapping: { type: "object", additionalProperties: text },
  confirmedRevisionId: nullable(id),
  rows: paged(
    object({
      rowNumber: integer,
      code: text,
      description: text,
      unit: nullable(text),
      quantity: nullable(decimal),
      unitPrice: nullable(decimal),
      totalValue: nullable(decimal),
      parentCode: nullable(text),
      itemType: text,
      status: text,
      errors: array(text),
      rawData: { type: "object" },
    }),
  ),
});
export function completeBudgetDocs(doc: OpenAPIObject) {
  doc.components ??= {};
  doc.components.schemas ??= {};
  doc.components.schemas.BudgetNode = node;
  for (const [path, item] of Object.entries(doc.paths)) {
    if (!path.includes("/budget")) continue;
    for (const [method, op] of Object.entries(item)) {
      if (!op || typeof op !== "object" || !("responses" in op)) continue;
      let schema: SchemaObject = revision;
      const binary =
        path.endsWith("/export") ||
        path.endsWith("/original") ||
        path.endsWith("/template");
      if (path.endsWith("/budget"))
        schema = object({
          id,
          tenantId: id,
          projectId: id,
          name: text,
          description: nullable(text),
          status: text,
          revision: revision,
          currentRevision: nullable(revision),
          workingRevision: nullable(revision),
          canEdit: { type: "boolean" },
          originalTotal: decimal,
          currentTotal: decimal,
          difference: decimal,
          differencePercentage: nullable(decimal),
          revisionCount: integer,
        });
      else if (
        path.endsWith("/tree") ||
        (/\/revisions\/\{revisionId\}$/.test(path) && method === "get")
      )
        schema = tree;
      else if (path.endsWith("/compare")) schema = comparison;
      else if (path.endsWith("/revisions") && method === "get")
        schema = paged({
          ...revision,
          properties: {
            ...revision.properties,
            total: decimal,
            createdByName: text,
            approvedByName: nullable(text),
          },
        });
      else if (path.includes("/items"))
        schema =
          method === "get"
            ? paged(value)
            : method === "delete"
              ? object({ version: integer })
              : value;
      else if (path.includes("/imports") && !path.endsWith("/confirm"))
        schema =
          method === "get" || path.endsWith("/imports")
            ? job
            : object({ id, version: integer });
      op.responses[method === "post" ? "201" : "200"] = {
        description: "Sucesso",
        content: {
          [binary
            ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            : "application/json"]: {
            schema: binary ? { type: "string", format: "binary" } : schema,
          },
        },
      };
      for (const status of ["400", "401", "403", "404", "409", "413", "429"])
        op.responses[status] = {
          description:
            status === "409"
              ? "RESOURCE_VERSION_CONFLICT / BUDGET_REVISION_IMMUTABLE / BUDGET_IMPORT_NOT_READY"
              : "Erro padronizado M1",
          content: {
            "application/json": {
              schema: object({
                statusCode: integer,
                code: text,
                message: text,
                details: array({}),
              }),
            },
          },
        };
      op.parameters ??= [];
      if (
        method === "get" &&
        (path.endsWith("/items") ||
          path.endsWith("/revisions") ||
          path.endsWith("/compare") ||
          path.endsWith("/imports/{importJobId}"))
      ) {
        for (const name of ["page", "limit"])
          if (
            !op.parameters.some(
              (p: ParameterObject | ReferenceObject) =>
                "name" in p && p.name === name,
            )
          )
            op.parameters.push({
              name,
              in: "query",
              required: false,
              schema: {
                type: "integer",
                minimum: 1,
                ...(name === "limit"
                  ? { maximum: 200, default: 50 }
                  : { default: 1 }),
              },
            });
      }
    }
  }
}
