import type { PrismaClient } from "../apps/api/src/generated/prisma/client.js";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
export async function seedQuality(
  db: PrismaClient,
  tenantId: string,
  projectId: string,
  adminId: string,
  managerId: string,
  inspectorId: string,
) {
  const templates = [
    {
      code: "CHK-FUND",
      name: "Fundações",
      items: [
        "Escavação conforme dimensões",
        "Cota",
        "Compactação",
        "Limpeza",
        "Armadura",
        "Cofragem",
        "Recobrimento",
        "Aprovação antes da betonagem",
      ],
    },
    {
      code: "CHK-STRUCT",
      name: "Estrutura",
      items: [
        "Armadura conforme desenho",
        "Diâmetros",
        "Espaçamentos",
        "Recobrimento",
        "Inserts",
        "Cofragem",
        "Alinhamento",
        "Limpeza",
        "Hold point antes da betonagem",
      ],
    },
    {
      code: "CHK-MASON",
      name: "Alvenaria",
      items: [
        "Alinhamento",
        "Prumo",
        "Juntas",
        "Dimensão",
        "Ligação estrutural",
      ],
    },
  ];
  for (const t of templates) {
    if (
      await db.checklistTemplate.findFirst({
        where: { tenantId, code: t.code },
      })
    )
      continue;
    await db.$transaction(async (tx) => {
      const template = await tx.checklistTemplate.create({
        data: {
          tenantId,
          code: t.code,
          name: t.name,
          description:
            "Exemplo demo configurável; não constitui requisito legal universal",
          createdBy: adminId,
        },
      });
      const v = await tx.checklistTemplateVersion.create({
        data: {
          tenantId,
          checklistTemplateId: template.id,
          versionNumber: 1,
          createdBy: adminId,
        },
      });
      await tx.checklistTemplateItem.createMany({
        data: t.items.map((description, i) => ({
          tenantId,
          createdBy: adminId,
          checklistTemplateVersionId: v.id,
          code: String(i + 1).padStart(2, "0"),
          description,
          sortOrder: i,
          isHoldPoint: description.toLowerCase().includes("betonagem"),
        })),
      });
      await tx.checklistTemplateVersion.update({
        where: { id: v.id },
        data: {
          status: "PUBLISHED",
          publishedBy: adminId,
          publishedAt: new Date(),
        },
      });
      await tx.checklistTemplate.update({
        where: { id: template.id },
        data: { status: "ACTIVE", currentVersion: 1 },
      });
    });
  }
  if (await db.inspection.count({ where: { tenantId, projectId } })) return;
  const s = { tenantId, projectId },
    date = new Date(new Date().toISOString().slice(0, 10));
  const t = await db.checklistTemplate.findFirstOrThrow({
      where: { tenantId, code: "CHK-FUND" },
    }),
    v = await db.checklistTemplateVersion.findFirstOrThrow({
      where: { tenantId, checklistTemplateId: t.id, status: "PUBLISHED" },
    }),
    items = await db.checklistTemplateItem.findMany({
      where: { tenantId, checklistTemplateVersionId: v.id },
      orderBy: { sortOrder: "asc" },
    }),
    budget = await db.budgetItem.findFirst({
      where: { ...s, itemType: "ITEM" },
    }),
    task = await db.scheduleTask.findFirst({
      where: { ...s, taskType: "TASK" },
    }),
    contract = await db.contract.findFirst({ where: s });
  const bytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
    "base64",
  );
  const docId = randomUUID(),
    objectKey = `tenant/${tenantId}/projects/${projectId}/quality-demo/${docId}.png`,
    file = path.resolve(
      process.env.DOCUMENT_STORAGE_PATH ?? "work/document-storage",
      objectKey,
    );
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes);
  const correctionDocId = randomUUID(),
    correctionKey = `tenant/${tenantId}/projects/${projectId}/quality-demo/${correctionDocId}.png`;
  await writeFile(
    path.resolve(
      process.env.DOCUMENT_STORAGE_PATH ?? "work/document-storage",
      correctionKey,
    ),
    bytes,
  );
  await db.$transaction(async (tx) => {
    const request = await tx.inspectionRequest.create({
      data: {
        ...s,
        createdBy: managerId,
        requestedBy: managerId,
        assignedInspectorId: inspectorId,
        requestNumber: 1,
        code: "IR-001",
        title: "Inspeção de armadura de sapatas",
        requestedInspectionDate: date,
        status: "INSPECTION_IN_PROGRESS",
      },
    });
    const inspection = await tx.inspection.create({
      data: {
        ...s,
        createdBy: inspectorId,
        inspectorId,
        inspectionRequestId: request.id,
        inspectionNumber: 1,
        code: "INS-001",
        title: "Inspeção de armadura de sapatas",
        inspectionDate: date,
        checklistTemplateVersionId: v.id,
        status: "IN_PROGRESS",
        overallResult: "FAIL",
        budgetItemId: budget?.id,
        scheduleTaskId: task?.id,
        contractId: contract?.id,
      },
    });
    let failed = "";
    for (let i = 0; i < items.length; i++) {
      const row = await tx.inspectionItem.create({
        data: {
          ...s,
          createdBy: inspectorId,
          inspectionId: inspection.id,
          templateItemId: items[i].id,
          result: i === 6 ? "FAIL" : "PASS",
          comment: i === 6 ? "Recobrimento insuficiente na sapata S03" : null,
          isNonConformity: i === 6,
        },
      });
      if (i === 6) failed = row.id;
    }
    await tx.document.create({
      data: {
        ...s,
        id: docId,
        createdBy: inspectorId,
        inspectionId: inspection.id,
        objectKey,
        fileName: "evidencia-demo.png",
        mimeType: "image/png",
        sizeBytes: BigInt(bytes.length),
        checksum: createHash("sha256").update(bytes).digest("hex"),
        visibility: "PUBLIC_PROJECT",
        isPhoto: true,
        expiresAt: new Date(Date.now() + 600000),
        confirmedAt: new Date(),
      },
    });
    await tx.inspectionEvidence.create({
      data: {
        ...s,
        createdBy: inspectorId,
        inspectionId: inspection.id,
        inspectionItemId: failed,
        documentId: docId,
        caption: "Evidência demo ilustrativa",
        evidenceType: "PHOTO",
      },
    });
    const ncr = await tx.nonConformity.create({
      data: {
        ...s,
        createdBy: inspectorId,
        detectedBy: inspectorId,
        ncrNumber: 1,
        code: "NCR-001",
        inspectionId: inspection.id,
        inspectionItemId: failed,
        title: "Recobrimento insuficiente na sapata S03",
        description: "Ajustar espaçadores antes da liberação",
        severity: "HIGH",
        category: "WORKMANSHIP",
        responsibleUserId: managerId,
        dueDate: new Date(Date.now() + 3 * 86400000),
        budgetItemId: budget?.id,
        scheduleTaskId: task?.id,
        contractId: contract?.id,
      },
    });
    await tx.correctiveAction.create({
      data: {
        ...s,
        createdBy: managerId,
        nonConformityId: ncr.id,
        actionNumber: 1,
        description: "Reposicionar espaçadores e anexar evidência",
        responsibleUserId: managerId,
        status: "OPEN",
      },
    });
    await tx.nonConformityEvent.create({
      data: {
        ...s,
        createdBy: inspectorId,
        userId: inspectorId,
        nonConformityId: ncr.id,
        eventType: "CREATED",
        toStatus: "OPEN",
      },
    });
    const closed = await tx.nonConformity.create({
      data: {
        ...s,
        createdBy: inspectorId,
        detectedBy: inspectorId,
        ncrNumber: 2,
        code: "NCR-002",
        title: "Limpeza da frente concluída",
        description: "Material residual removido",
        severity: "LOW",
        category: "PROCESS",
        status: "CLOSED",
        responsibleUserId: managerId,
        detectedAt: new Date(Date.now() - 5 * 86400000),
        verifiedBy: inspectorId,
        verifiedAt: new Date(),
        closedBy: inspectorId,
        closedAt: new Date(),
      },
    });
    const corrected = await tx.correctiveAction.create({
      data: {
        ...s,
        createdBy: managerId,
        nonConformityId: closed.id,
        actionNumber: 1,
        description: "Remover resíduos",
        status: "COMPLETED",
        completionNotes: "Frente limpa",
        completedBy: managerId,
        completedAt: new Date(),
        verifiedBy: inspectorId,
        verifiedAt: new Date(),
      },
    });
    await tx.document.create({
      data: {
        ...s,
        id: correctionDocId,
        createdBy: managerId,
        correctiveActionId: corrected.id,
        objectKey: correctionKey,
        fileName: "correcao-demo.png",
        mimeType: "image/png",
        sizeBytes: BigInt(bytes.length),
        checksum: createHash("sha256").update(bytes).digest("hex"),
        visibility: "PUBLIC_PROJECT",
        isPhoto: true,
        expiresAt: new Date(Date.now() + 600000),
        confirmedAt: new Date(),
      },
    });
    await tx.correctiveActionEvidence.create({
      data: {
        ...s,
        createdBy: managerId,
        correctiveActionId: corrected.id,
        documentId: correctionDocId,
        caption: "Correção demo ilustrativa",
      },
    });
    await tx.correctiveAction.update({
      where: { id: corrected.id },
      data: { status: "VERIFIED" },
    });
    await tx.nonConformityEvent.create({
      data: {
        ...s,
        createdBy: inspectorId,
        userId: inspectorId,
        nonConformityId: closed.id,
        eventType: "CLOSED",
        fromStatus: "READY_FOR_VERIFICATION",
        toStatus: "CLOSED",
        comment: "Correção demo verificada",
      },
    });
  });
}
