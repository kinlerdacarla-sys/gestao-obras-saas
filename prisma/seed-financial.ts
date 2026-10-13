import type { PrismaClient } from "../apps/api/src/generated/prisma/client.js";
export async function seedFinancial(
  db: PrismaClient,
  tenantId: string,
  projectId: string,
  admin: string,
  manager: string,
  inspector: string,
  financier: string,
) {
  const scope = { tenantId, projectId },
    created = { createdBy: manager, updatedBy: manager };
  const c = await db.contract.findFirst({
    where: { ...scope, contractNumber: "SUB-001" },
  });
  if (
    !c ||
    (await db.measurement.count({ where: { ...scope, contractId: c.id } }))
  )
    return;
  await db.$transaction(async (tx) => {
    const item = await tx.contractItem.findFirstOrThrow({
        where: { ...scope, contractId: c.id, deletedAt: null },
      }),
      now = new Date();
    await tx.contract.update({
      where: { id: c.id },
      data: {
        advanceRecoveryMethod: "PERCENTAGE",
        advanceRecoveryPercentage: "10",
        measurementSequence: 1,
      },
    });
    const m = await tx.measurement.create({
      data: {
        ...scope,
        ...created,
        contractId: c.id,
        measurementNumber: 1,
        code: "MED-001",
        periodStart: now,
        periodEnd: now,
        description: "Medição demonstrativa de fundações",
        grossAmount: "1000000",
        retentionAmount: "50000",
        advanceRecoveryAmount: "100000",
        otherDeductionsAmount: "0",
        netCertifiedAmount: "850000",
      },
    });
    await tx.measurementItem.create({
      data: {
        ...scope,
        ...created,
        measurementId: m.id,
        contractItemId: item.id,
        budgetItemId: item.budgetItemId,
        description: item.description,
        unit: item.unit,
        contractQuantity: "1",
        previousQuantity: "0",
        currentQuantity: "0.2",
        cumulativeQuantity: "0.2",
        unitPrice: "5000000",
        previousAmount: "0",
        currentAmount: "1000000",
        cumulativeAmount: "1000000",
      },
    });
    for (const [fromStatus, toStatus, actor] of [
      ["DRAFT", "SUBMITTED", manager],
      ["SUBMITTED", "FISCAL_REVIEW", inspector],
      ["FISCAL_REVIEW", "APPROVAL_REVIEW", inspector],
      ["APPROVAL_REVIEW", "APPROVED", financier],
      ["APPROVED", "CERTIFIED", admin],
      ["CERTIFIED", "PARTIALLY_PAID", admin],
    ] as const)
      await tx.measurementTransition.create({
        data: {
          ...scope,
          createdBy: actor,
          updatedBy: actor,
          measurementId: m.id,
          fromStatus,
          toStatus,
          comments: "Demonstração M5",
        },
      });
    for (const [reviewType, actor] of [
      ["FISCAL", inspector],
      ["FINANCIER", financier],
    ] as const)
      await tx.measurementReview.create({
        data: {
          ...scope,
          createdBy: actor,
          updatedBy: actor,
          measurementId: m.id,
          reviewType,
          decision: "APPROVED",
          reviewedBy: actor,
          reviewedAt: now,
          comments: "Aprovado para demonstração",
        },
      });
    if (
      !(await tx.advanceTransaction.findFirst({
        where: { ...scope, contractId: c.id, type: "ADVANCE_GRANTED" },
      }))
    )
      await tx.advanceTransaction.create({
        data: {
          ...scope,
          ...created,
          contractId: c.id,
          type: "ADVANCE_GRANTED",
          amount: c.advanceAmount,
        },
      });
    await tx.advanceTransaction.create({
      data: {
        ...scope,
        ...created,
        contractId: c.id,
        measurementId: m.id,
        type: "ADVANCE_RECOVERED",
        amount: "100000",
      },
    });
    await tx.retentionTransaction.create({
      data: {
        ...scope,
        ...created,
        contractId: c.id,
        measurementId: m.id,
        type: "WITHHELD",
        amount: "50000",
      },
    });
    await tx.contract.update({
      where: { id: c.id },
      data: { advanceRecoveredAmount: { increment: "100000" } },
    });
    await tx.measurement.update({
      where: { id: m.id },
      data: {
        status: "PARTIALLY_PAID",
        submittedBy: manager,
        submittedAt: now,
        fiscalReviewedBy: inspector,
        fiscalReviewedAt: now,
        approvedBy: financier,
        approvedAt: now,
        certifiedBy: admin,
        certifiedAt: now,
      },
    });
    const max = await tx.payment.aggregate({
      where: scope,
      _max: { paymentNumber: true },
    });
    await tx.payment.create({
      data: {
        ...scope,
        createdBy: admin,
        updatedBy: admin,
        supplierId: c.supplierId,
        contractId: c.id,
        measurementId: m.id,
        paymentNumber: (max._max.paymentNumber ?? 0) + 1,
        amount: "500000",
        paymentDate: now,
        method: "BANK_TRANSFER",
        reference: "DEMO-PAG-001",
      },
    });
    let org = await tx.organization.findFirst({
      where: { tenantId, legalName: "Fundo de Desenvolvimento Demo" },
    });
    org ??= await tx.organization.create({
      data: {
        tenantId,
        legalName: "Fundo de Desenvolvimento Demo",
        organizationType: "FINANCIER",
      },
    });
    const f = await tx.fundingAgreement.create({
      data: {
        ...scope,
        createdBy: admin,
        updatedBy: admin,
        financierOrganizationId: org.id,
        agreementNumber: "FIN-DEMO-001",
        title: "Financiamento Edifício Demo",
        approvedAmount: "15000000",
        startDate: now,
        status: "ACTIVE",
        requestSequence: 1,
      },
    });
    const req = await tx.disbursementRequest.create({
      data: {
        ...scope,
        ...created,
        fundingAgreementId: f.id,
        measurementId: m.id,
        requestNumber: 1,
        requestedAmount: "2000000",
        approvedAmount: "2000000",
        disbursedAmount: "2000000",
        status: "DISBURSED",
        requestedBy: manager,
        requestedAt: now,
        approvedBy: financier,
        approvedAt: now,
      },
    });
    await tx.disbursement.create({
      data: {
        ...scope,
        createdBy: financier,
        updatedBy: financier,
        fundingAgreementId: f.id,
        disbursementRequestId: req.id,
        amount: "2000000",
        disbursementDate: now,
        reference: "DEMO-DES-001",
      },
    });
    const total = await tx.contract.aggregate({
      where: {
        ...scope,
        status: { in: ["ACTIVE", "SUSPENDED", "COMPLETED", "TERMINATED"] },
      },
      _sum: { currentValue: true },
    });
    await tx.financialBaseline.upsert({
      where: { tenantId_projectId: scope },
      create: {
        ...scope,
        ...created,
        amount: total._sum.currentValue ?? 0,
        source: "CONTRACT_VALUE_AT_FIRST_CERTIFICATION",
      },
      update: {},
    });
    await tx.auditLog.create({
      data: {
        tenantId,
        projectId,
        userId: admin,
        action: "M5_DEMO_SEEDED",
        entityType: "Measurement",
        entityId: m.id,
        newValues: {
          measurement: "MED-001",
          gross: "1000000",
          net: "850000",
          paid: "500000",
          funding: "15000000",
          disbursed: "2000000",
        },
      },
    });
  });
}
