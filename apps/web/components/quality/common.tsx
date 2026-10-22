"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, send } from "../../lib/api";
import { EntryForm, type Field, today } from "../execution/common";
import { Notice } from "@obras/ui";
export { EntryForm, today };
export type { Field };
export type Row = { id: string; version: number; [key: string]: unknown };
export type Options = {
  role?: string;
  users: Row[];
  organizations: Row[];
  templates: Row[];
  tasks: Row[];
  budgetItems: Row[];
  contracts: Row[];
  measurements: Row[];
  dailyLogs: Row[];
};
export const text = (x: unknown) => (x == null ? "" : String(x));
export const names: Record<string, string> = {
  DRAFT: "Rascunho",
  SUBMITTED: "Submetido",
  SCHEDULED: "Agendado",
  INSPECTION_IN_PROGRESS: "Inspeção em curso",
  IN_PROGRESS: "Em curso",
  COMPLETED: "Concluído",
  CLOSED: "Encerrado",
  CANCELLED: "Cancelado",
  OPEN: "Aberto",
  ASSIGNED: "Atribuído",
  CORRECTION_IN_PROGRESS: "Correção em curso",
  READY_FOR_VERIFICATION: "Pronto para verificação",
  REOPENED: "Reaberto",
  VERIFIED: "Verificado",
  REJECTED: "Rejeitado",
  PASS: "Conforme",
  FAIL: "Não conforme",
  NA: "N/A",
  PASS_WITH_OBSERVATIONS: "Conforme com observações",
  LOW: "Baixa",
  MEDIUM: "Média",
  HIGH: "Alta",
  CRITICAL: "Crítica",
  WORKMANSHIP: "Execução",
  MATERIAL: "Material",
  DESIGN: "Projeto",
  DIMENSION: "Dimensão",
  SAFETY: "Segurança",
  DOCUMENTATION: "Documentação",
  EQUIPMENT: "Equipamento",
  PROCESS: "Processo",
  OTHER: "Outro",
  PUBLISHED: "Publicado",
  SUPERSEDED: "Substituído",
  ACTIVE: "Ativo",
  ARCHIVED: "Arquivado",
  CREATED: "Registo criado",
  UPDATED: "Registo atualizado",
  STATUS_CHANGED: "Estado atualizado",
  VERIFICATION_APPROVED: "Verificação aprovada",
  VERIFICATION_REJECTED: "Verificação rejeitada",
  COMMENT_ADDED: "Comentário registado",
  CORRECTIVE_ACTION_CREATED: "Ação corretiva criada",
  CORRECTIVE_ACTION_UPDATED: "Ação corretiva atualizada",
  INSPECTION_ASSIGNED: "Inspeção atribuída",
  NCR_CRITICAL_CREATED: "NCR crítica registada",
  NCR_OVERDUE: "Prazo da NCR vencido",
  NCR_DUE_SOON: "Prazo da NCR próximo",
};
export const label = (x: unknown) => {
  const key = text(x);
  if (names[key]) return names[key];
  for (const [prefix, title] of [
    ["INSPECTION_REQUEST_", "Pedido de inspeção"],
    ["CORRECTIVE_ACTION_", "Ação corretiva"],
    ["NCR_", "NCR"],
  ]) {
    const state = key.startsWith(prefix) && names[key.slice(prefix.length)];
    if (state) return `${title}: ${state.toLocaleLowerCase("pt")}`;
  }
  return key;
};
export const choices = (values: string[]) =>
  values.map((value) => ({ value, label: label(value) }));
export const rowOptions = (rows: Row[]) =>
  rows.map((r) => ({
    value: r.id,
    label: text(
      r.name ??
        r.title ??
        r.contractNumber ??
        r.code ??
        r.description ??
        r.logDate,
    ),
  }));
export const clean = (values: Record<string, string>) =>
  Object.fromEntries(Object.entries(values).filter(([, x]) => x !== ""));
export function Nav({ id }: { id: string }) {
  return (
    <nav className="budget-nav" aria-label="Fiscalização">
      <Link href={`/projects/${id}`}>← Obra</Link>
      <Link href={`/projects/${id}/inspection-requests`}>Pedidos</Link>
      <Link href={`/projects/${id}/inspections`}>Inspeções</Link>
      <Link href={`/projects/${id}/non-conformities`}>Não conformidades</Link>
      <Link href={`/projects/${id}/quality`}>Qualidade</Link>
      <Link href="/checklist-templates">Checklists</Link>
    </nav>
  );
}
export function useQuality(id: string) {
  const [options, setOptions] = useState<Options>({
    users: [],
    organizations: [],
    templates: [],
    tasks: [],
    budgetItems: [],
    contracts: [],
    measurements: [],
    dailyLogs: [],
  });
  useEffect(() => {
    api<Options>(`/projects/${id}/quality/options`)
      .then(setOptions)
      .catch(() => {});
  }, [id]);
  return options;
}
export function links(o: Options): Field[] {
  return [
    {
      name: "scheduleTaskId",
      label: "Atividade do cronograma",
      options: rowOptions(o.tasks),
    },
    {
      name: "budgetItemId",
      label: "Item orçamental",
      options: rowOptions(o.budgetItems),
    },
    { name: "contractId", label: "Contrato", options: rowOptions(o.contracts) },
    {
      name: "measurementId",
      label: "Medição",
      options: rowOptions(o.measurements),
    },
    {
      name: "dailyLogId",
      label: "Diário de obra",
      options: rowOptions(o.dailyLogs),
    },
  ];
}
export function responsible(o: Options): Field[] {
  return [
    {
      name: "responsibleUserId",
      label: "Responsável",
      options: rowOptions(o.users),
    },
    {
      name: "responsibleOrganizationId",
      label: "Organização responsável",
      options: rowOptions(o.organizations),
    },
    { name: "dueDate", label: "Prazo", type: "date" },
  ];
}
export function useResource(path: string) {
  const [data, setData] = useState<Row>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    setData(await api<Row>(path));
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [path]);
  async function mutate(action: string, body: object = {}, method = "POST") {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api(
        path + action,
        send(method, { version: data?.version, ...body }),
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  }
  return { data, error, busy, load, mutate };
}
export function Evidence({
  projectId,
  kind,
  id,
  version,
  editable,
  itemId,
  onChange,
  onBusyChange,
}: {
  projectId: string;
  kind: string;
  id: string;
  version: number;
  editable: boolean;
  itemId?: string;
  onChange: () => Promise<void>;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [visibility, setVisibility] = useState("PROJECT_MEMBERS");
  const [rows, setRows] = useState<Row[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const base = `/projects/${projectId}/${kind}/${id}`;
  async function load() {
    setRows((await api<{ items: Row[] }>(base + "/evidence")).items);
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [base, version]);
  async function upload(file: File) {
    setBusy(true);
    onBusyChange?.(true);
    setError("");
    try {
      const digest = await crypto.subtle.digest(
        "SHA-256",
        await file.arrayBuffer(),
      );
      const checksum = Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const ticket = await api<{
        id: string;
        version: number;
        uploadUrl: string;
      }>(
        base + "/evidence",
        send("POST", {
          version,
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          checksum,
          isPhoto: file.type.startsWith("image/"),
          evidenceType: file.type.startsWith("image/") ? "PHOTO" : "DOCUMENT",
          visibility,
          ...(itemId ? { inspectionItemId: itemId } : {}),
        }),
      );
      const form = new FormData();
      form.append("file", file);
      const result = await fetch(ticket.uploadUrl, {
        method: "PUT",
        body: form,
        credentials: "include",
      });
      if (!result.ok) throw Error("Falha no envio da evidência");
      await api(
        base + `/documents/${ticket.id}/confirm`,
        send("POST", { version: ticket.version }),
      );
      await onChange();
      await load();
    } catch (e) {
      setError((e as Error).message);
      await onChange();
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }
  return (
    <div className="quality-evidence">
      {error && <Notice error>{error}</Notice>}
      {editable && (
        <label>
          Visibilidade da evidência
          <select
            value={visibility}
            disabled={busy}
            onChange={(e) => setVisibility(e.target.value)}
          >
            {[
              { value: "PROJECT_MEMBERS", label: "Equipa e fiscalização" },
              { value: "CLIENT_VISIBLE", label: "Também cliente" },
              { value: "FINANCIER_VISIBLE", label: "Também financiador" },
              { value: "PUBLIC_PROJECT", label: "Todos os participantes" },
            ].map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {editable && (
        <label>
          Fotografia ou evidência
          <input
            aria-label={itemId ? "Fotografia do item" : "Evidência da correção"}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            capture="environment"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
              e.target.value = "";
            }}
          />
        </label>
      )}
      {busy && <p role="status">A enviar e validar evidência…</p>}
      <div className="quality-photos">
        {rows
          .filter((r) => !itemId || r.inspectionItemId === itemId)
          .map((r) => {
            const doc = r.document as Row;
            const url = `/api/v1${base}/documents/${doc.id}/content`;
            return (
              <figure key={r.id}>
                {!!doc.isPhoto && (
                  <img
                    src={url}
                    alt={text(r.caption) || "Evidência fotográfica"}
                    width={180}
                    height={120}
                  />
                )}
                <figcaption>
                  <a href={url} target="_blank" rel="noreferrer">
                    {text(doc.fileName)}
                  </a>
                </figcaption>
              </figure>
            );
          })}
      </div>
    </div>
  );
}
export function QualityIndicator({
  projectId,
  kind,
  id,
}: {
  projectId: string;
  kind: string;
  id: string;
}) {
  const [row, setRow] = useState<Row>();
  useEffect(() => {
    api<Row>(`/projects/${projectId}/quality/indicators/${kind}/${id}`)
      .then(setRow)
      .catch(() => {});
  }, [projectId, kind, id]);
  return row ? (
    <aside className="card">
      <h3>Qualidade · {text(row.qualityStatus)}</h3>
      <p>
        Inspeções: {text(row.inspectionCount)} · NCR abertas:{" "}
        {text(row.openNcrCount)} · Críticas: {text(row.criticalNcrCount)} ·
        Vencidas: {text(row.overdueNcrCount)} · Hold points:{" "}
        {text(row.unreleasedHoldPoints)}
      </p>
      <Link href={`/projects/${projectId}/quality`}>
        Consultar fiscalização
      </Link>
    </aside>
  ) : null;
}

export function Paging({
  page,
  total,
  onPage,
}: {
  page: number;
  total: number;
  onPage: (n: number) => void;
}) {
  return (
    <nav aria-label="Paginação" className="actions">
      <button disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Anterior
      </button>
      <span>
        Página {page} · {total} registos
      </span>
      <button disabled={page * 30 >= total} onClick={() => onPage(page + 1)}>
        Seguinte
      </button>
    </nav>
  );
}
