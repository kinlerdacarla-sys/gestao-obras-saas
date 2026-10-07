import type { PrismaClient } from "../apps/api/src/generated/prisma/client.js";
export async function seedCommercial(
  db: PrismaClient,
  tenantId: string,
  projectId: string,
  admin: string,
  manager: string,
) {
  if (
    await db.contract.findFirst({
      where: { tenantId, projectId, contractNumber: "SUB-001" },
    })
  )
    return;
  await db.$transaction(async (tx) => {
    const scope = { tenantId, projectId },
      created = { createdBy: manager, updatedBy: manager };
    const suppliers = [];
    for (const [legalName, taxNumber, supplierType] of [
      ["Construções ABC", "400000001", "SUBCONTRACTOR"],
      ["Betões Maputo", "400000002", "SUPPLIER"],
      ["Electricidade XYZ", "400000003", "SERVICE_PROVIDER"],
    ] as const) {
      let org = await tx.organization.findFirst({
        where: { tenantId, taxNumber },
      });
      org ??= await tx.organization.create({
        data: {
          tenantId,
          legalName,
          taxNumber,
          organizationType:
            supplierType === "SUBCONTRACTOR" ? "SUBCONTRACTOR" : "SUPPLIER",
        },
      });
      const supplier = await tx.supplier.upsert({
        where: {
          tenantId_organizationId: { tenantId, organizationId: org.id },
        },
        update: {},
        create: {
          tenantId,
          organizationId: org.id,
          legalName: org.legalName,
          taxNumber,
          supplierType,
          createdBy: admin,
          updatedBy: admin,
        },
      });
      suppliers.push(supplier);
    }
    const c = await tx.contract.create({
      data: {
        ...scope,
        ...created,
        supplierId: suppliers[0].id,
        contractNumber: "SUB-001",
        title: "Execução de Fundações",
        contractType: "SUBCONTRACT",
        originalValue: "5000000",
        currentValue: "5000000",
        retentionPercentage: "5",
        advancePercentage: "10",
        advanceAmount: "500000",
        amendmentSequence: 1,
      },
    });
    const budgetItem = await tx.budgetItem.findFirst({
      where: { ...scope, itemType: "ITEM", isActive: true, code: "02.01.001" },
    });
    await tx.contractItem.create({
      data: {
        ...scope,
        ...created,
        contractId: c.id,
        budgetItemId: budgetItem?.id,
        description: "Execução de Fundações",
        quantity: "1",
        unitPrice: "5000000",
        totalValue: "5000000",
      },
    });
    await tx.contract.update({
      where: { id: c.id },
      data: { status: "ACTIVE", version: 1, updatedBy: admin },
    });
    const amendment = await tx.contractAmendment.create({
      data: {
        ...scope,
        ...created,
        contractId: c.id,
        amendmentNumber: 1,
        code: "AD-001",
        amendmentType: "ADDITION",
        description: "Trabalhos adicionais de fundações",
        amount: "500000",
        status: "APPROVED",
        submittedBy: manager,
        submittedAt: new Date(),
        approvedBy: admin,
        approvedAt: new Date(),
      },
    });
    await tx.contract.update({
      where: { id: c.id },
      data: { currentValue: "5500000", version: 2, updatedBy: admin },
    });
    const centers = new Map<string, string>();
    for (const [code, name, parent] of [
      ["01", "Administração", null],
      ["01.01", "Segurança", "01"],
      ["01.02", "Água", "01"],
      ["01.03", "Energia", "01"],
      ["02", "Equipamentos", null],
      ["03", "Logística", null],
    ]) {
      const center = await tx.costCenter.create({
        data: {
          ...scope,
          ...created,
          code: code!,
          name: name!,
          parentId: parent ? centers.get(parent) : null,
        },
      });
      centers.set(code!, center.id);
    }
    for (const [i, description, subtotal] of [
      ["001", "Segurança da obra", "45000"],
      ["002", "Água", "8000"],
    ]) {
      const e = await tx.expense.create({
        data: {
          ...scope,
          ...created,
          expenseNumber: "DESP-" + i,
          costCenterId: centers.get(i === "001" ? "01.01" : "01.02")!,
          expenseDate: new Date(new Date().toISOString().slice(0, 10)),
          description,
          subtotal,
          totalAmount: subtotal,
          status: "APPROVED",
          submittedBy: manager,
          submittedAt: new Date(),
          approvedBy: admin,
          approvedAt: new Date(),
        },
      });
      await tx.auditLog.create({
        data: {
          ...scope,
          userId: admin,
          entityType: "Expense",
          entityId: e.id,
          action: "EXPENSE_APPROVED",
          newValues: { source: "development-seed", amount: subtotal },
        },
      });
    }
    await tx.auditLog.createMany({
      data: [
        {
          ...scope,
          userId: manager,
          entityType: "Contract",
          entityId: c.id,
          action: "CONTRACT_CREATED",
          newValues: {
            originalValue: "5000000.00",
            source: "development-seed",
          },
        },
        {
          ...scope,
          userId: admin,
          entityType: "ContractAmendment",
          entityId: amendment.id,
          action: "CONTRACT_AMENDMENT_APPROVED",
          newValues: { amount: "500000.00", source: "development-seed" },
        },
      ],
    });
  });
}
