import { seedIntelligence } from "./seed-intelligence.js";
import { seedQuality } from "./seed-quality.js";
import { seedFinancial } from "./seed-financial.js";
import { seedCommercial } from "./seed-commercial.js";
import { seedExecution } from "./seed-execution.js";
import { seedBudget } from "./seed-budget.js";
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../apps/api/src/generated/prisma/client.js";
import { hashPassword } from "../apps/api/src/auth/crypto.js";
import { password } from "../packages/validation/src/index.js";
import type { Role } from "../packages/domain/src/index.js";
if (process.env.NODE_ENV === "production")
  throw new Error("Seed de demonstração bloqueado em produção");
const demoPassword = password.parse(process.env.DEMO_PASSWORD);
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
try {
  const tenant = await db.tenant.upsert({
    where: { slug: "construtora-demo" },
    update: {},
    create: { name: "Construtora Demo", slug: "construtora-demo" },
  });
  const people: [string, string, Role][] = [
    ["admin", "Administrador Demo", "ADMIN"],
    ["gestor", "Gestor Demo", "MANAGER"],
    ["fiscal", "Fiscal Demo", "INSPECTOR"],
    ["financiador", "Financiador Demo", "FINANCIER"],
    ["cliente", "Cliente Demo", "CLIENT"],
    ["diretor", "Diretor Demo", "ADMIN"],
  ];
  const users = [];
  for (const [email, name, role] of people) {
    const user = await db.user.upsert({
      where: { email: `${email}@example.com` },
      update: {},
      create: {
        name,
        email: `${email}@example.com`,
        passwordHash: await hashPassword(demoPassword),
        status: "ACTIVE",
        emailVerifiedAt: new Date(),
      },
    });
    await db.tenantUser.upsert({
      where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
      update: {},
      create: { tenantId: tenant.id, userId: user.id, role, status: "ACTIVE" },
    });
    users.push({ user, role });
  }
  const admin = users[0].user;
  const project = await db.project.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: "OBR-001" } },
    update: {},
    create: {
      tenantId: tenant.id,
      code: "OBR-001",
      name: "Edifício Demo",
      location: "Maputo",
      status: "ACTIVE",
      currency: "MZN",
      createdBy: admin.id,
      updatedBy: admin.id,
    },
  });
  for (const { user, role } of users)
    await db.projectUser.upsert({
      where: { projectId_userId: { projectId: project.id, userId: user.id } },
      update: {},
      create: {
        tenantId: tenant.id,
        projectId: project.id,
        userId: user.id,
        role,
        status: "ACTIVE",
      },
    });
  let organization = await db.organization.findFirst({
    where: { tenantId: tenant.id, legalName: "Construtora Demo" },
  });
  organization ??= await db.organization.create({
    data: {
      tenantId: tenant.id,
      legalName: "Construtora Demo",
      organizationType: "CONTRACTOR",
    },
  });
  await db.projectOrganization.upsert({
    where: {
      projectId_organizationId: {
        projectId: project.id,
        organizationId: organization.id,
      },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      projectId: project.id,
      organizationId: organization.id,
      relationshipType: "CONTRACTOR",
    },
  });
  await seedBudget(db, tenant.id, project.id, admin.id);
  await seedExecution(db, tenant.id, project.id, admin.id);
  await seedCommercial(
    db,
    tenant.id,
    project.id,
    admin.id,
    users.find((x) => x.role === "MANAGER")!.user.id,
  );
  await seedFinancial(
    db,
    tenant.id,
    project.id,
    admin.id,
    users.find((x) => x.role === "MANAGER")!.user.id,
    users.find((x) => x.role === "INSPECTOR")!.user.id,
    users.find((x) => x.role === "FINANCIER")!.user.id,
  );
  await seedQuality(
    db,
    tenant.id,
    project.id,
    admin.id,
    users.find((x) => x.role === "MANAGER")!.user.id,
    users.find((x) => x.role === "INSPECTOR")!.user.id,
  );
  await seedIntelligence(db, tenant.id, users);
  console.info("Seed concluído: construtora-demo / admin@example.com");
} finally {
  await db.$disconnect();
}
