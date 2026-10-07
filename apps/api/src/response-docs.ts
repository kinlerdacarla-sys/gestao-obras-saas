import type { OpenAPIObject, SchemaObject } from "@nestjs/swagger";
const str = (nullable = false): SchemaObject => ({
  type: "string",
  ...(nullable ? { nullable: true } : {}),
});
const id: SchemaObject = { type: "string", format: "uuid" };
const date: SchemaObject = { type: "string", format: "date-time" };
const object = (
  properties: Record<string, SchemaObject>,
  required = Object.keys(properties),
): SchemaObject => ({ type: "object", properties, required });
const array = (items: SchemaObject): SchemaObject => ({ type: "array", items });
const user = object({
  id,
  name: str(),
  email: { type: "string", format: "email" },
  status: str(),
});
const member = object({ id, role: str(), status: str(), user });
const organization = object({
  id,
  tenantId: id,
  legalName: str(),
  tradeName: str(true),
  taxNumber: str(true),
  organizationType: str(),
  phone: str(true),
  email: str(true),
  address: str(true),
  createdAt: date,
  updatedAt: date,
});
const project = object({
  id,
  tenantId: id,
  code: str(),
  name: str(),
  description: str(true),
  location: str(true),
  startDate: { ...date, nullable: true },
  plannedEndDate: { ...date, nullable: true },
  contractValue: {
    type: "string",
    nullable: true,
    description:
      "DECIMAL(18,2) serializado como string; sem arredondamento IEEE-754",
  },
  currency: { type: "string", enum: ["MZN"] },
  status: str(),
  createdAt: date,
  updatedAt: date,
  createdBy: id,
  updatedBy: id,
});
const projectUser = object({
  id,
  tenantId: id,
  projectId: id,
  userId: id,
  role: str(),
  status: str(),
  createdAt: date,
  updatedAt: date,
});
const projectOrganization = object({
  id,
  tenantId: id,
  projectId: id,
  organizationId: id,
  relationshipType: str(),
  createdAt: date,
});
const message = object({ message: str() });
const error = object({
  statusCode: { type: "integer" },
  code: str(),
  message: str(),
  details: array({}),
});
export function completeResponseDocs(document: OpenAPIObject) {
  for (const [path, item] of Object.entries(document.paths))
    for (const [method, op] of Object.entries(item)) {
      if (!op || typeof op !== "object" || !("responses" in op)) continue;
      if (path.includes("/budget")) continue;
      let schema: SchemaObject = message;
      if (path === "/health")
        schema = object({ api: str(), postgresql: str(), redis: str() });
      else if (path.endsWith("/auth/me"))
        schema = object({
          role: str(),
          tenant: object({ name: str(), slug: str() }),
          user: object({ id, name: str(), email: str() }),
        });
      else if (path.endsWith("/dashboard"))
        schema = object({
          total: { type: "integer" },
          active: { type: "integer" },
          completed: { type: "integer" },
          users: { type: "integer", nullable: true },
          recent: array(project),
        });
      else if (path.endsWith("/audit-logs"))
        schema = array(
          object({
            id,
            tenantId: id,
            userId: { ...id, nullable: true },
            projectId: { ...id, nullable: true },
            entityType: str(),
            entityId: { ...id, nullable: true },
            action: str(),
            oldValues: { type: "object", nullable: true },
            newValues: { type: "object", nullable: true },
            ipAddress: str(true),
            userAgent: str(true),
            createdAt: date,
          }),
        );
      else if (path.startsWith("/api/v1/projects")) {
        if (path.includes("/users"))
          schema =
            method === "get"
              ? array(
                  object({
                    id,
                    userId: id,
                    role: str(),
                    status: str(),
                    membership: object({
                      user: object({ id, name: str(), email: str() }),
                    }),
                  }),
                )
              : projectUser;
        else if (path.includes("/organizations"))
          schema =
            method === "get"
              ? array({
                  ...projectOrganization,
                  properties: {
                    ...projectOrganization.properties,
                    organization,
                  },
                })
              : projectOrganization;
        else
          schema =
            method === "get" && path.endsWith("/projects")
              ? array(project)
              : project;
      } else if (path.startsWith("/api/v1/organizations"))
        schema =
          method === "get" && path.endsWith("/organizations")
            ? array(organization)
            : organization;
      else if (path.startsWith("/api/v1/users"))
        schema = path.endsWith("/invite")
          ? user
          : method === "get" && path.endsWith("/users")
            ? array(member)
            : member;
      if (method === "delete" || path.endsWith("/disable")) schema = message;
      const status =
        method === "post" && !path.includes("/auth/") ? "201" : "200";
      op.responses[status] = {
        description: "Sucesso",
        content: { "application/json": { schema } },
      };
      for (const [code, description] of Object.entries({
        "400": "VALIDATION_ERROR",
        "401": "UNAUTHORIZED",
        "403": "FORBIDDEN / TENANT_ACCESS_DENIED / PROJECT_ACCESS_DENIED",
        "404": "RESOURCE_NOT_FOUND",
        "409": "CONFLICT / EMAIL_ALREADY_EXISTS",
        "429": "RATE_LIMITED",
        "503": "DEPENDENCY_UNAVAILABLE / DELIVERY_UNAVAILABLE",
      }))
        op.responses[code] = {
          description,
          content: { "application/json": { schema: error } },
        };
      if (
        path === "/health" ||
        ["login", "refresh", "forgot-password", "reset-password"].some((s) =>
          path.endsWith(`/auth/${s}`),
        )
      )
        op.security = [];
    }
}
