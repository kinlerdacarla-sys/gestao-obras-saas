"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Notice } from "@obras/ui";
import { api, send } from "../../lib/api";
import { useMe } from "../shell";
import {
  Nav,
  Paging,
  EntryForm,
  useQuality,
  rowOptions,
  links,
  responsible,
  clean,
  text,
  label,
  choices,
  useResource,
  Evidence,
  type Row,
} from "./common";
const categories = [
  "WORKMANSHIP",
  "MATERIAL",
  "DESIGN",
  "DIMENSION",
  "SAFETY",
  "DOCUMENTATION",
  "EQUIPMENT",
  "PROCESS",
  "OTHER",
];
export function NonConformities({ id }: { id: string }) {
  const me = useMe(),
    o = useQuality(id),
    [rows, setRows] = useState<Row[]>([]),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [error, setError] = useState("");
  const base = `/projects/${id}/non-conformities`;
  async function load() {
    const q = new URLSearchParams(query);
    q.set("page", String(page));
    const result = await api<{ items: Row[]; total: number }>(base + "?" + q);
    setRows(result.items);
    setTotal(result.total);
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [base, query, page]);
  return (
    <>
      <Nav id={id} />
      <h1>Não conformidades</h1>
      <Paging page={page} total={total} onPage={setPage} />
      {error && <Notice error>{error}</Notice>}
      <EntryForm
        title="Filtrar NCR"
        fields={[
          { name: "search", label: "Pesquisar" },
          {
            name: "severity",
            label: "Severidade",
            options: choices(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
          },
          {
            name: "status",
            label: "Estado",
            options: choices([
              "OPEN",
              "ASSIGNED",
              "CORRECTION_IN_PROGRESS",
              "READY_FOR_VERIFICATION",
              "CLOSED",
              "REOPENED",
              "CANCELLED",
            ]),
          },
          {
            name: "category",
            label: "Categoria",
            options: choices(categories),
          },
          {
            name: "overdue",
            label: "Prazo vencido",
            options: [
              { value: "true", label: "Sim" },
              { value: "false", label: "Não" },
            ],
          },
          {
            name: "responsible_user",
            label: "Responsável",
            options: rowOptions(o.users),
          },
          {
            name: "responsible_organization",
            label: "Organização responsável",
            options: rowOptions(o.organizations),
          },
          {
            name: "contract",
            label: "Contrato",
            options: rowOptions(o.contracts),
          },
          {
            name: "schedule_task",
            label: "Atividade",
            options: rowOptions(o.tasks),
          },
          {
            name: "budget_item",
            label: "Rubrica",
            options: rowOptions(o.budgetItems),
          },
          { name: "date_from", label: "Data inicial", type: "date" },
          { name: "date_to", label: "Data final", type: "date" },
        ]}
        submit="Filtrar"
        onSave={async (v) => {
          setPage(1);
          setQuery("?" + new URLSearchParams(clean(v)));
        }}
      />
      {["ADMIN", "INSPECTOR"].includes(o.role ?? me.role) && (
        <EntryForm
          title="Nova não conformidade"
          fields={[
            { name: "title", label: "Título", required: true },
            { name: "description", label: "Descrição", required: true },
            {
              name: "severity",
              label: "Severidade",
              required: true,
              options: choices(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
            },
            {
              name: "category",
              label: "Categoria",
              required: true,
              options: choices(categories),
            },
            ...responsible(o),
            ...links(o),
          ]}
          submit="Criar NCR"
          onSave={async (v) => {
            const occurrence = new URLSearchParams(window.location.search).get(
              "occurrence",
            );
            const row = await api<Row>(
              occurrence
                ? `/projects/${id}/daily-log-occurrences/${occurrence}/create-non-conformity`
                : base,
              send("POST", clean(v)),
            );
            window.location.assign(`${base}/${row.id}`);
          }}
        />
      )}
      {rows.map((r) => (
        <article className="card" key={r.id}>
          <h2>
            <Link href={`${base}/${r.id}`}>
              {text(r.code)} · {text(r.title)}
            </Link>
          </h2>
          <p>
            {r.severity === "CRITICAL" ? "⚠ CRÍTICA · " : ""}
            {r.isOverdue ? "⏱ VENCIDA · " : ""}
            {label(r.severity)} · {label(r.category)} · {label(r.status)}
          </p>
          <p>
            Responsável:{" "}
            {text(o.users.find((u) => u.id === r.responsibleUserId)?.name) ||
              text(
                o.organizations.find(
                  (x) => x.id === r.responsibleOrganizationId,
                )?.name,
              ) ||
              "Por atribuir"}{" "}
            · Prazo: {text(r.dueDate).slice(0, 10) || "—"} · {text(r.daysOpen)}{" "}
            dias em aberto
          </p>
        </article>
      ))}
    </>
  );
}
function Corrective({
  row,
  projectId,
  onChange,
  parentStatus,
  role,
  onBusyChange,
}: {
  row: Row;
  projectId: string;
  onChange: () => Promise<void>;
  parentStatus: string;
  role: string;
  onBusyChange: (busy: boolean) => void;
}) {
  const fiscal = ["ADMIN", "INSPECTOR"].includes(role),
    manager = ["ADMIN", "MANAGER"].includes(role),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function action(a: string, body: object = {}) {
    if (busy) return;
    setBusy(true);
    onBusyChange(true);
    setError("");
    try {
      await api(
        `/projects/${projectId}/corrective-actions/${row.id}/${a}`,
        send("POST", { version: row.version, ...body }),
      );
      await onChange();
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }
  return (
    <section className="card">
      <h3>
        Ação {text(row.actionNumber)} · {text(row.description)}
      </h3>
      <p>
        {label(row.status)} · Prazo: {text(row.dueDate).slice(0, 10) || "—"}
      </p>
      {error && <Notice error>{error}</Notice>}
      <p>{text(row.completionNotes)}</p>
      <fieldset disabled={busy} className="quality-action-controls">
        <Evidence
          projectId={projectId}
          kind="corrective-actions"
          id={row.id}
          version={row.version}
          editable={
            manager &&
            parentStatus === "CORRECTION_IN_PROGRESS" &&
            ["OPEN", "IN_PROGRESS", "REJECTED"].includes(text(row.status))
          }
          onChange={onChange}
          onBusyChange={(value) => {
            setBusy(value);
            onBusyChange(value);
          }}
        />
        {manager &&
          ["OPEN", "REJECTED"].includes(text(row.status)) &&
          parentStatus === "CORRECTION_IN_PROGRESS" && (
            <button onClick={() => action("start").catch(() => {})}>
              Iniciar ação corretiva
            </button>
          )}
        {manager && row.status === "IN_PROGRESS" && (
          <EntryForm
            title="Concluir ação corretiva"
            fields={[
              {
                name: "completionNotes",
                label: "Descrição da correção executada",
                required: true,
              },
            ]}
            onSave={(v) => action("complete", v)}
            submit="Marcar ação concluída"
          />
        )}
        {fiscal &&
          row.status === "COMPLETED" &&
          parentStatus === "READY_FOR_VERIFICATION" && (
            <>
              <button onClick={() => action("verify").catch(() => {})}>
                Verificar ação
              </button>
              <EntryForm
                title="Rejeitar ação"
                fields={[
                  {
                    name: "comment",
                    label: "Motivo da rejeição",
                    required: true,
                  },
                ]}
                onSave={(v) => action("reject", v)}
                submit="Rejeitar ação"
              />
            </>
          )}
      </fieldset>
    </section>
  );
}
export function NcrDetail({ id, ncrId }: { id: string; ncrId: string }) {
  const me = useMe(),
    o = useQuality(id),
    [childBusy, setChildBusy] = useState(false),
    {
      data: r,
      error,
      busy: resourceBusy,
      load,
      mutate,
    } = useResource(`/projects/${id}/non-conformities/${ncrId}`),
    fiscal = ["ADMIN", "INSPECTOR"].includes(o.role ?? me.role),
    manager = ["ADMIN", "MANAGER"].includes(o.role ?? me.role);
  const busy = resourceBusy || childBusy;
  if (!r)
    return (
      <>
        <Nav id={id} />
        <Notice error={!!error}>{error || "A carregar NCR…"}</Notice>
      </>
    );
  const status = text(r.status);
  return (
    <>
      <Nav id={id} />
      <h1>
        {text(r.code)} · {text(r.title)}
      </h1>
      {error && <Notice error>{error}</Notice>}
      <p role="status">
        {label(status)} ·{" "}
        {r.severity === "CRITICAL" ? "⚠ CRÍTICA" : label(r.severity)}
        {r.isOverdue ? " · ⏱ VENCIDA" : ""}
      </p>
      <p>{text(r.description)}</p>
      <p>
        Prazo: {text(r.dueDate).slice(0, 10) || "—"} · Responsável:{" "}
        {text(o.users.find((u) => u.id === r.responsibleUserId)?.name) ||
          "Por atribuir"}
      </p>
      <Link href={`/projects/${id}/quality/report?kind=ncr&id=${ncrId}`}>
        Relatório de NCR
      </Link>
      <section className="card">
        <h2>Origem</h2>
        {!!r.inspectionId && (
          <p>
            <Link href={`/projects/${id}/inspections/${text(r.inspectionId)}`}>
              Inspeção e evidência inicial
            </Link>
          </p>
        )}
        {!!r.dailyLogId && (
          <p>
            <Link href={`/projects/${id}/daily-logs/${text(r.dailyLogId)}`}>
              Diário de obra e evidências
            </Link>
          </p>
        )}
        {!!r.scheduleTaskId && (
          <p>
            Atividade:{" "}
            {text(o.tasks.find((x) => x.id === r.scheduleTaskId)?.name)}
          </p>
        )}
        {!!r.budgetItemId && (
          <p>
            Item orçamental:{" "}
            {text(
              o.budgetItems.find((x) => x.id === r.budgetItemId)?.description,
            )}
          </p>
        )}
        {!!r.contractId && (
          <p>
            Contrato:{" "}
            {text(
              o.contracts.find((x) => x.id === r.contractId)?.contractNumber,
            )}
          </p>
        )}
        {!!r.measurementId && (
          <p>
            <Link
              href={`/projects/${id}/measurements/${text(r.measurementId)}`}
            >
              Medição associada
            </Link>
          </p>
        )}
      </section>
      {(fiscal || manager) && ["OPEN", "REOPENED"].includes(status) && (
        <EntryForm
          title="Atribuir NCR"
          fields={responsible(o)}
          onSave={(v) => mutate("/assign", clean(v))}
          submit="Atribuir"
        />
      )}
      {(fiscal || manager) && ["ASSIGNED", "REOPENED"].includes(status) && (
        <button
          disabled={busy}
          onClick={() => mutate("/start-correction").catch(() => {})}
        >
          Iniciar correção
        </button>
      )}
      <h2>Ações corretivas</h2>
      {((r.actions ?? []) as Row[]).map((a) => (
        <Corrective
          key={a.id}
          row={a}
          projectId={id}
          parentStatus={status}
          role={o.role ?? me.role}
          onChange={load}
          onBusyChange={setChildBusy}
        />
      ))}
      {manager && status === "CORRECTION_IN_PROGRESS" && (
        <>
          <EntryForm
            title="Nova ação corretiva"
            fields={[
              {
                name: "description",
                label: "Descrição da ação",
                required: true,
              },
              ...responsible(o),
            ]}
            onSave={(v) => mutate("/corrective-actions", clean(v))}
            submit="Adicionar ação corretiva"
          />
          <button
            disabled={busy}
            onClick={() => mutate("/ready-for-verification").catch(() => {})}
          >
            Pronta para verificação
          </button>
        </>
      )}
      {fiscal && status === "READY_FOR_VERIFICATION" && (
        <>
          <button
            disabled={busy}
            onClick={() => mutate("/verify").catch(() => {})}
          >
            Aprovar verificação da NCR
          </button>
          <button
            disabled={busy}
            onClick={() => mutate("/close").catch(() => {})}
          >
            Encerrar NCR
          </button>
          <EntryForm
            title="Rejeitar correção"
            fields={[{ name: "comment", label: "Motivo", required: true }]}
            onSave={(v) => mutate("/reject-correction", v)}
            submit="Rejeitar correção"
          />
        </>
      )}
      {fiscal && status === "CLOSED" && (
        <EntryForm
          title="Reabrir NCR"
          fields={[
            { name: "comment", label: "Motivo de reabertura", required: true },
          ]}
          onSave={(v) => mutate("/reopen", v)}
          submit="Reabrir NCR"
        />
      )}
      {(fiscal || manager) && !["CLOSED", "CANCELLED"].includes(status) && (
        <EntryForm
          title="Comentário"
          fields={[
            { name: "comment", label: "Novo comentário", required: true },
          ]}
          onSave={(v) => mutate("/comments", v)}
          submit="Registar comentário"
        />
      )}
      <section className="card">
        <h2>Histórico</h2>
        <ol>
          {((r.events ?? []) as Row[]).map((e) => (
            <li key={e.id}>
              {text(e.createdAt).slice(0, 16).replace("T", " ")} ·{" "}
              {label(e.eventType)} · {label(e.toStatus)}
              <p>{text(e.comment)}</p>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
