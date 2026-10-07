import type { OpenAPIObject, SchemaObject } from "@nestjs/swagger";
const text: SchemaObject = { type: "string" },
  id: SchemaObject = { type: "string", format: "uuid" },
  integer: SchemaObject = { type: "integer" },
  decimal: SchemaObject = {
    type: "string",
    description: "Valor decimal exato",
  },
  date: SchemaObject = {
    type: "string",
    format: "date-time",
    description:
      "Datas lógicas são devolvidas à meia-noite UTC; usar YYYY-MM-DD sem conversão de fuso.",
  };
const object = (properties: Record<string, SchemaObject>): SchemaObject => ({
  type: "object",
  properties,
});
const array = (items: SchemaObject): SchemaObject => ({ type: "array", items });
const common = {
  id,
  tenantId: id,
  projectId: id,
  createdBy: id,
  createdAt: date,
};
const task = object({
  ...common,
  scheduleId: id,
  parentId: { ...id, nullable: true },
  code: text,
  name: text,
  description: text,
  taskType: { type: "string", enum: ["SUMMARY", "TASK", "MILESTONE"] },
  plannedStart: date,
  plannedEnd: date,
  actualStart: { ...date, nullable: true },
  actualEnd: { ...date, nullable: true },
  durationDays: integer,
  actualProgress: decimal,
  plannedProgress: decimal,
  weight: decimal,
  normalizedWeight: decimal,
  status: text,
  temporalStatus: text,
  version: integer,
  budgetItemId: { ...id, nullable: true },
});
const schedule = object({
  ...common,
  name: text,
  status: text,
  plannedStart: date,
  plannedEnd: date,
  weightingMethod: text,
  budgetRevisionId: { ...id, nullable: true },
  baselineRevision: integer,
  version: integer,
});
const dependency = object({
  ...common,
  scheduleId: id,
  predecessorId: id,
  successorId: id,
  dependencyType: { type: "string", enum: ["FS", "SS", "FF", "SF"] },
  lagDays: integer,
});
const baseline = object({
  ...common,
  scheduleId: id,
  revisionNumber: integer,
  description: text,
});
const metrics = object({
  plannedProgress: decimal,
  actualProgress: decimal,
  deviation: decimal,
  temporalStatus: text,
  delayed: integer,
  inProgress: integer,
  completed: integer,
});
const file = object({
  ...common,
  fileName: text,
  mimeType: text,
  sizeBytes: { type: "string", description: "BIGINT serializado como string" },
  checksum: text,
  visibility: text,
  caption: text,
});
const resource = object({
  ...common,
  dailyLogId: id,
  description: text,
  notes: text,
});
const summary = object({
  date,
  workers: integer,
  manHours: decimal,
  equipment: integer,
  activities: integer,
  deliveries: integer,
  occurrences: integer,
  photos: integer,
});
const log = object({
  ...common,
  logDate: date,
  status: text,
  version: integer,
  weatherCondition: text,
  weatherNotes: text,
  temperatureMin: decimal,
  temperatureMax: decimal,
  generalNotes: text,
  submittedAt: date,
  approvedAt: date,
  activities: array(resource),
  workforce: array(
    object({
      ...common,
      companyName: text,
      trade: text,
      workerCount: integer,
      hoursPerWorker: decimal,
    }),
  ),
  equipment: array(
    object({
      ...common,
      equipmentName: text,
      quantity: integer,
      hoursWorked: decimal,
      hoursIdle: decimal,
      status: text,
    }),
  ),
  materials: array(resource),
  deliveries: array(resource),
  occurrences: array(resource),
  observations: array(resource),
  photos: array(file),
  documents: array(file),
  summary,
  permissions: object({
    edit: { type: "boolean" },
    observe: { type: "boolean" },
    approve: { type: "boolean" },
    reopen: { type: "boolean" },
  }),
});
const paged = (item: SchemaObject) =>
  object({ items: array(item), total: integer, page: integer, limit: integer });
export function completeExecutionDocs(doc: OpenAPIObject) {
  doc.components ??= {};
  doc.components.schemas = {
    ...doc.components.schemas,
    Schedule: schedule,
    ScheduleTask: task,
    DailyLog: log,
    ExecutionDocument: file,
  };
  for (const [path, item] of Object.entries(doc.paths)) {
    if (!/\/(schedule|progress|daily-logs)(\/|$)/.test(path)) continue;
    for (const method of ["get", "post", "patch", "delete", "put"] as const) {
      const op = item[method];
      if (!op) continue;
      op.summary ??= `${method.toUpperCase()} ${path}`;
      op.description =
        "Exige sessão, tenant ativo e participação na obra. Escrita reservada a ADMIN ou MANAGER atribuído; observações também a INSPECTOR. Aprovação, reabertura e baseline: ADMIN. Clientes/financiadores veem apenas diários aprovados e anexos autorizados. Mutações exigem Origin; alterações exigem version quando indicado.";
      let response: SchemaObject = object({ ok: { type: "boolean" } });
      if (path.includes("/daily-logs")) {
        response = log;
        if (/\/(photos|documents)$/.test(path) && method === "get")
          response = array(file);
        if (path.endsWith("/daily-logs") && method === "get")
          response = paged(log);
        if (path.endsWith("/summary")) response = summary;
        if (
          /\/(activities|workforce|equipment|materials|deliveries|occurrences|observations)$/.test(
            path,
          )
        )
          response = object({ item: resource, version: integer });
        if (/\/(photos|documents)$/.test(path) && method === "post")
          response = object({
            id,
            uploadUrl: {
              type: "string",
              description:
                "URL assinada, de uso pelo criador autenticado; enviar multipart campo file por PUT",
            },
            method: text,
            expiresAt: date,
            version: integer,
          });
        if (path.endsWith("/confirm"))
          response = object({ id, version: integer });
      } else if (path.endsWith("/progress")) response = metrics;
      else if (path.endsWith("/history"))
        response = {
          ...paged(
            object({
              ...common,
              taskId: id,
              progressDate: date,
              previousProgress: decimal,
              newProgress: decimal,
              notes: text,
              dailyLogId: id,
            }),
          ),
          properties: {
            ...paged(resource).properties,
            items: array(
              object({
                ...common,
                taskId: id,
                progressDate: date,
                previousProgress: decimal,
                newProgress: decimal,
                notes: text,
              }),
            ),
            snapshots: array(
              object({
                ...common,
                snapshotDate: date,
                plannedProgress: decimal,
                actualProgress: decimal,
              }),
            ),
          },
        };
      else if (path.endsWith("/baselines"))
        response = method === "get" ? array(baseline) : baseline;
      else if (path.endsWith("/variance"))
        response = object({
          baseline,
          items: array(
            object({
              taskId: id,
              name: text,
              plannedStart: date,
              plannedEnd: date,
              currentStart: date,
              currentEnd: date,
              startDeltaDays: integer,
              endDeltaDays: integer,
            }),
          ),
        });
      else if (path.includes("/dependencies")) response = dependency;
      else if (path.includes("/tasks"))
        response =
          path.endsWith("/tasks") && method === "get" ? paged(task) : task;
      else
        response =
          method === "get"
            ? object({
                schedule,
                items: array(task),
                dependencies: array(dependency),
                plannedProgress: decimal,
                actualProgress: decimal,
                deviation: decimal,
                permissions: object({
                  edit: { type: "boolean" },
                  baseline: { type: "boolean" },
                }),
              })
            : schedule;
      const status = method === "post" ? "201" : "200";
      op.responses = {
        [status]: {
          description: "Sucesso",
          content: { "application/json": { schema: response } },
        },
      };
      if (path.endsWith("/content"))
        op.responses[status] = {
          description:
            "Ficheiro privado; autorização revalidada em cada acesso",
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
      for (const [code, description] of Object.entries({
        400: "VALIDATION_ERROR / INVALID_TASK_DATES / INVALID_TASK_PROGRESS / SCHEDULE_DEPENDENCY_CYCLE / INVALID_DEPENDENCY",
        401: "UNAUTHORIZED",
        403: "ACCESS_DENIED",
        404: "SCHEDULE_NOT_FOUND / TASK_NOT_FOUND / BASELINE_NOT_FOUND / DAILY_LOG_NOT_FOUND / PHOTO_NOT_FOUND",
        409: "RESOURCE_VERSION_CONFLICT / DAILY_LOG_ALREADY_EXISTS / DAILY_LOG_IMMUTABLE / INVALID_DAILY_LOG_TRANSITION",
      }))
        op.responses[code] = {
          description,
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
    }
  }
}
