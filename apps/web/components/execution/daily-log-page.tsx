"use client";
import { useMe } from "../shell";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Notice } from "@obras/ui";
import { api, send } from "../../lib/api";
import {
  Navigation,
  EntryForm,
  options,
  stateNames,
  dateText,
  today,
  type Field,
} from "./common";
import type { Task } from "./schedule-page";
import type { BudgetNode } from "../budget/common";
interface LogRow {
  id: string;
  logDate: string;
  status: string;
  workers: number;
  activities: number;
  occurrences: number;
  photos: number;
  responsible: string;
}
export function DailyLogList({ id }: { id: string }) {
  const [data, setData] = useState<{
      items: LogRow[];
      permissions: { edit: boolean };
      total: number;
    }>(),
    [error, setError] = useState(""),
    [create, setCreate] = useState(false),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [status, setStatus] = useState(""),
    [occurrences, setOccurrences] = useState(false),
    [page, setPage] = useState(1);
  async function load() {
    const q = new URLSearchParams({ page: String(page), limit: "30" });
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    if (status) q.set("status", status);
    if (occurrences) q.set("hasOccurrences", "true");
    setData(await api(`/projects/${id}/daily-logs?${q}`));
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [id, from, to, status, occurrences, page]);
  return (
    <>
      <Navigation id={id} />
      <div className="heading">
        <div>
          <span className="eyebrow">Registo de campo</span>
          <h1>Diário de obra</h1>
        </div>
        {data?.permissions.edit && (
          <button onClick={() => setCreate(!create)}>Novo diário</button>
        )}
      </div>
      {error && <Notice error>{error}</Notice>}
      {create && (
        <EntryForm
          title="Abrir diário"
          fields={[
            {
              name: "logDate",
              label: "Data do diário",
              type: "date",
              required: true,
              value: today(),
            },
          ]}
          onCancel={() => setCreate(false)}
          onSave={async (v) => {
            const log = await api<{ id: string }>(
              `/projects/${id}/daily-logs`,
              send("POST", v),
            );
            window.location.assign(`/projects/${id}/daily-logs/${log.id}`);
          }}
        />
      )}
      <div className="execution-fields">
        <label>
          De
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          Até
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          Estado
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {options(["DRAFT", "SUBMITTED", "APPROVED", "REOPENED"]).map(
              (o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ),
            )}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={occurrences}
            onChange={(e) => {
              setOccurrences(e.target.checked);
              setPage(1);
            }}
          />{" "}
          Com ocorrências
        </label>
      </div>
      <div className="execution-cards">
        {data?.items.map((log) => (
          <Link
            href={`/projects/${id}/daily-logs/${log.id}`}
            key={log.id}
            className="card"
          >
            <span className="badge">{stateNames[log.status]}</span>
            <h2>{dateText(log.logDate)}</h2>
            <p>
              {log.workers} trabalhadores · {log.activities} atividades
            </p>
            <p>
              {log.occurrences} ocorrências · {log.photos} fotografias
            </p>
            <small>{log.responsible}</small>
          </Link>
        ))}
      </div>
      {data?.items.length === 0 && <p>Nenhum diário neste período.</p>}
      <div className="actions">
        <button disabled={page === 1} onClick={() => setPage(page - 1)}>
          Anterior
        </button>
        <span>Página {page}</span>
        <button
          disabled={!data || page * 30 >= data.total}
          onClick={() => setPage(page + 1)}
        >
          Seguinte
        </button>
      </div>
    </>
  );
}
type RecordRow = { id: string; [key: string]: string | number | null };
interface FileRow {
  id: string;
  fileName: string;
  caption: string | null;
  visibility: string;
  mimeType: string;
}
interface LogDetail {
  id: string;
  logDate: string;
  status: string;
  version: number;
  weatherCondition: string | null;
  weatherNotes: string | null;
  generalNotes: string | null;
  temperatureMin: string | null;
  temperatureMax: string | null;
  summary: {
    workers: number;
    manHours: string;
    equipment: number;
    activities: number;
    deliveries: number;
    occurrences: number;
    photos: number;
  };
  permissions: {
    edit: boolean;
    observe: boolean;
    approve: boolean;
    reopen: boolean;
  };
  activities: RecordRow[];
  workforce: RecordRow[];
  equipment: RecordRow[];
  materials: RecordRow[];
  deliveries: RecordRow[];
  occurrences: RecordRow[];
  observations: RecordRow[];
  photos: FileRow[];
  documents: FileRow[];
}
const tabs = [
  ["Resumo", "summary"],
  ["Atividades", "activities"],
  ["Mão de obra", "workforce"],
  ["Equipamentos", "equipment"],
  ["Materiais", "materials"],
  ["Entregas", "deliveries"],
  ["Ocorrências", "occurrences"],
  ["Fotografias", "photos"],
  ["Documentos", "documents"],
  ["Observações", "observations"],
] as const;
const fieldsByKind: Record<string, Field[]> = {
  workforce: [
    { name: "companyName", label: "Empresa", required: true },
    { name: "trade", label: "Especialidade", required: true },
    {
      name: "workerCount",
      label: "Trabalhadores",
      type: "number",
      min: "0",
      required: true,
    },
    {
      name: "hoursPerWorker",
      label: "Horas por trabalhador",
      type: "number",
      step: "0.01",
      min: "0",
      max: "24",
    },
    { name: "notes", label: "Notas", type: "textarea" },
  ],
  equipment: [
    { name: "equipmentName", label: "Equipamento", required: true },
    { name: "identifier", label: "Identificador" },
    {
      name: "quantity",
      label: "Quantidade",
      type: "number",
      value: 1,
      min: "1",
      required: true,
    },
    {
      name: "hoursWorked",
      label: "Horas trabalhadas",
      type: "number",
      step: "0.01",
      min: "0",
      max: "24",
    },
    {
      name: "hoursIdle",
      label: "Horas parado",
      type: "number",
      step: "0.01",
      min: "0",
      max: "24",
    },
    {
      name: "status",
      label: "Estado",
      options: options(["OPERATING", "IDLE", "BROKEN", "MAINTENANCE"]),
      required: true,
    },
    { name: "notes", label: "Notas", type: "textarea" },
  ],
  materials: [
    { name: "materialName", label: "Material", required: true },
    {
      name: "quantity",
      label: "Quantidade",
      type: "number",
      step: "0.0001",
      min: "0",
      required: true,
    },
    { name: "unit", label: "Unidade", required: true },
    { name: "notes", label: "Notas", type: "textarea" },
  ],
  deliveries: [
    { name: "supplierName", label: "Fornecedor", required: true },
    { name: "description", label: "Descrição", required: true },
    {
      name: "quantity",
      label: "Quantidade",
      type: "number",
      step: "0.0001",
      min: "0",
    },
    { name: "unit", label: "Unidade" },
    { name: "document", label: "Referência documental" },
    { name: "receivedBy", label: "Recebido por" },
    { name: "deliveryTime", label: "Hora", type: "time" },
    { name: "notes", label: "Notas", type: "textarea" },
  ],
  occurrences: [
    {
      name: "occurrenceType",
      label: "Tipo",
      required: true,
      options: [
        ["GENERAL", "Geral"],
        ["DELAY", "Atraso"],
        ["SAFETY", "Segurança"],
        ["QUALITY", "Qualidade"],
        ["WEATHER", "Clima"],
        ["ACCESS", "Acesso"],
        ["MATERIAL", "Material"],
        ["EQUIPMENT", "Equipamento"],
        ["CLIENT", "Cliente"],
        ["OTHER", "Outro"],
      ].map(([value, label]) => ({ value, label })),
    },
    { name: "title", label: "Título", required: true },
    {
      name: "description",
      label: "Descrição",
      type: "textarea",
      required: true,
    },
    {
      name: "severity",
      label: "Gravidade",
      required: true,
      options: options(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
    },
  ],
  observations: [
    { name: "text", label: "Observação", type: "textarea", required: true },
  ],
};
const fieldNames: Record<string, string> = {
  description: "Descrição",
  progressBefore: "Progresso anterior",
  progressAfter: "Progresso registado",
  quantityCompleted: "Quantidade executada",
  unit: "Unidade",
  notes: "Notas",
  companyName: "Empresa",
  trade: "Especialidade",
  workerCount: "Trabalhadores",
  hoursPerWorker: "Horas por trabalhador",
  equipmentName: "Equipamento",
  identifier: "Identificador",
  quantity: "Quantidade",
  hoursWorked: "Horas trabalhadas",
  hoursIdle: "Horas parado",
  status: "Estado",
  materialName: "Material",
  supplierName: "Fornecedor",
  document: "Documento",
  receivedBy: "Recebido por",
  deliveryTime: "Hora",
  occurrenceType: "Tipo",
  title: "Título",
  severity: "Gravidade",
  text: "Observação",
};
export function DailyLogPage({ id, logId }: { id: string; logId: string }) {
  const qualityMe = useMe();
  const [budgetItems, setBudgetItems] = useState<
    { value: string; label: string }[]
  >([]);
  const base = `/projects/${id}/daily-logs/${logId}`;
  const [data, setData] = useState<LogDetail>(),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [tab, setTab] = useState("summary"),
    [tasks, setTasks] = useState<Task[]>([]),
    [busy, setBusy] = useState(false),
    [visibility, setVisibility] = useState("INTERNAL"),
    [caption, setCaption] = useState(""),
    [notes, setNotes] = useState(""),
    [dirty, setDirty] = useState(false),
    [editActivity, setEditActivity] = useState<RecordRow>();
  async function load() {
    const result = await api<LogDetail>(base);
    setData(result);
    setNotes(result.generalNotes ?? "");
    setDirty(false);
    const schedule = await api<{ items: Task[] }>(
      `/projects/${id}/schedule`,
    ).catch(() => ({ items: [] }));
    setTasks(schedule.items);
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
    api<{ items: BudgetNode[] }>(`/projects/${id}/budget/tree`)
      .then((result) => {
        const stack = [...result.items],
          options: { value: string; label: string }[] = [];
        while (stack.length) {
          const item = stack.pop()!;
          if (item.itemType === "ITEM")
            options.push({
              value: item.budgetItemId,
              label: `${item.code} ${item.description}`,
            });
          stack.push(...item.children);
        }
        setBudgetItems(options);
      })
      .catch(() => {});
  }, [id, logId]);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [dirty]);
  async function mutate(
    path: string,
    method: string,
    body: Record<string, unknown>,
  ) {
    if (!data) return;
    setError("");
    setMessage("");
    await api(
      `${base}${path}`,
      send(method, { ...body, version: data.version }),
    );
    await load();
    setMessage("Registo guardado");
  }
  async function transition(action: string) {
    setBusy(true);
    try {
      await mutate(`/${action}`, "POST", {});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function upload(file: File) {
    if (!data) return;
    setBusy(true);
    setError("");
    setMessage("A enviar ficheiro…");
    try {
      const digest = await crypto.subtle.digest(
          "SHA-256",
          await file.arrayBuffer(),
        ),
        checksum = Array.from(new Uint8Array(digest))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
      const ticket = await api<{
        id: string;
        uploadUrl: string;
        version: number;
      }>(
        `${base}/${tab === "photos" ? "photos" : "documents"}`,
        send("POST", {
          version: data.version,
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          checksum,
          visibility,
          isPhoto: tab === "photos",
          caption,
        }),
      );
      const form = new FormData();
      form.append("file", file);
      const sent = await fetch(ticket.uploadUrl, {
        method: "PUT",
        body: form,
        credentials: "include",
      });
      if (!sent.ok)
        throw new Error((await sent.json()).message ?? "Falha no upload");
      await api(
        `${base}/documents/${ticket.id}/confirm`,
        send("POST", { version: ticket.version }),
      );
      setMessage("Ficheiro guardado e validado");
      await load();
    } catch (e) {
      setError((e as Error).message);
      await load().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  const activityFields: Field[] = [
    { name: "budgetItemId", label: "Rubrica orçamental", options: budgetItems },
    { name: "description", label: "Descrição da atividade", required: true },
    {
      name: "scheduleTaskId",
      label: "Tarefa do cronograma",
      options: tasks
        .filter((t) => t.taskType !== "SUMMARY")
        .map((t) => ({
          value: t.id,
          label: `${t.code} ${t.name} · ${t.actualProgress}%`,
        })),
    },
    {
      name: "progressAfter",
      label: "Novo progresso (%) · deixar vazio para não atualizar",
      type: "number",
      min: "0",
      max: "100",
      step: "0.01",
    },
    {
      name: "updateTaskProgress",
      label: "Atualizar tarefa com este progresso",
      required: true,
      options: [
        { value: "false", label: "Não" },
        { value: "true", label: "Sim, atualizar e registar no histórico" },
      ],
    },
    {
      name: "quantityCompleted",
      label: "Quantidade executada",
      type: "number",
      step: "0.0001",
      min: "0",
    },
    { name: "unit", label: "Unidade" },
    { name: "notes", label: "Notas", type: "textarea" },
  ];
  const activeRows =
    data &&
    [
      "activities",
      "workforce",
      "equipment",
      "materials",
      "deliveries",
      "occurrences",
      "observations",
    ].includes(tab)
      ? data[tab as "activities"]
      : [];
  if (!data)
    return (
      <>
        <Navigation id={id} />
        {error ? (
          <Notice error>{error}</Notice>
        ) : (
          <p role="status">A carregar diário…</p>
        )}
      </>
    );
  return (
    <>
      <Navigation id={id} />
      <div className="heading">
        <div>
          <span className="eyebrow">Diário de obra</span>
          <h1>{dateText(data.logDate)}</h1>
          <span className="badge">{stateNames[data.status]}</span>
        </div>
        <div className="actions">
          {data.permissions.edit && (
            <button
              disabled={busy || dirty}
              onClick={() => transition("submit")}
            >
              Submeter diário
            </button>
          )}
          {data.permissions.approve && (
            <button disabled={busy} onClick={() => transition("approve")}>
              Aprovar diário
            </button>
          )}
          {data.permissions.reopen && (
            <button disabled={busy} onClick={() => transition("reopen")}>
              Reabrir diário
            </button>
          )}
        </div>
      </div>
      {error && <Notice error>{error}</Notice>}
      {message && <Notice>{message}</Notice>}
      <div className="tabs execution-tabs">
        {tabs.map(([label, key]) => (
          <button
            key={key}
            className={tab === key ? "" : "secondary"}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "summary" && (
        <>
          <div className="stats budget-stats">
            {[
              ["Trabalhadores", data.summary.workers],
              ["Homem-hora", data.summary.manHours],
              ["Equipamentos", data.summary.equipment],
              ["Atividades", data.summary.activities],
              ["Entregas", data.summary.deliveries],
              ["Ocorrências", data.summary.occurrences],
              ["Fotografias", data.summary.photos],
            ].map(([label, value]) => (
              <div className="stat" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <section className="card">
            <h2>Notas gerais</h2>
            {data.permissions.edit ? (
              <>
                <label>
                  Notas gerais
                  <textarea
                    value={notes}
                    rows={5}
                    onChange={(e) => {
                      setNotes(e.target.value);
                      setDirty(true);
                    }}
                    onBlur={() => {
                      if (dirty && !busy) {
                        setBusy(true);
                        mutate("", "PATCH", { generalNotes: notes })
                          .catch((e) => setError(e.message))
                          .finally(() => setBusy(false));
                      }
                    }}
                  />
                </label>
                <p role="status">
                  {busy
                    ? "A guardar…"
                    : dirty
                      ? "Alterações por guardar; serão guardadas ao sair do campo."
                      : "Notas guardadas"}
                </p>
              </>
            ) : (
              <p>{data.generalNotes ?? "Sem notas."}</p>
            )}
            <p>
              Tempo: {data.weatherCondition ?? "—"} ·{" "}
              {data.temperatureMin ?? "—"} a {data.temperatureMax ?? "—"} °C
            </p>
            <p>{data.weatherNotes}</p>
          </section>
          {data.permissions.edit && (
            <EntryForm
              title="Condições meteorológicas"
              fields={[
                {
                  name: "weatherCondition",
                  label: "Condição",
                  value: data.weatherCondition ?? "",
                },
                {
                  name: "weatherNotes",
                  label: "Notas meteorológicas",
                  type: "textarea",
                  value: data.weatherNotes ?? "",
                },
                {
                  name: "temperatureMin",
                  label: "Temperatura mínima",
                  type: "number",
                  step: "0.01",
                  value: data.temperatureMin ?? "",
                },
                {
                  name: "temperatureMax",
                  label: "Temperatura máxima",
                  type: "number",
                  step: "0.01",
                  value: data.temperatureMax ?? "",
                },
              ]}
              onSave={(v) =>
                mutate(
                  "",
                  "PATCH",
                  Object.fromEntries(
                    Object.entries(v).map(([k, value]) => [k, value || null]),
                  ),
                )
              }
            />
          )}
        </>
      )}
      {activeRows && (
        <div className="execution-cards">
          {activeRows.map((row) => (
            <article className="card" key={row.id}>
              {Object.entries(row)
                .filter(
                  ([key, value]) =>
                    fieldNames[key] && value !== null && value !== "",
                )
                .map(([key, value]) => (
                  <p key={key}>
                    <strong>{fieldNames[key]}:</strong>{" "}
                    {stateNames[String(value)] ?? String(value)}
                  </p>
                ))}
              {tab === "occurrences" &&
                ["ADMIN", "INSPECTOR"].includes(qualityMe.role) && (
                  <Link
                    href={`/projects/${id}/non-conformities?occurrence=${row.id}&dailyLog=${logId}&title=${encodeURIComponent(String(row.title))}`}
                  >
                    Criar NCR desta ocorrência
                  </Link>
                )}
              {tab === "activities" && data.permissions.edit && (
                <button
                  className="secondary"
                  onClick={() => setEditActivity(row)}
                >
                  Editar atividade
                </button>
              )}
            </article>
          ))}
        </div>
      )}
      {editActivity && tab === "activities" && (
        <EntryForm
          key={editActivity.id}
          title="Editar atividade"
          fields={[
            {
              name: "description",
              label: "Descrição",
              required: true,
              value: String(editActivity.description),
            },
            {
              name: "notes",
              label: "Notas",
              type: "textarea",
              value: String(editActivity.notes ?? ""),
            },
          ]}
          onCancel={() => setEditActivity(undefined)}
          onSave={async (v) => {
            await mutate(`/activities/${editActivity.id}`, "PATCH", v);
            setEditActivity(undefined);
          }}
        />
      )}
      {(data.permissions.edit ||
        (tab === "observations" && data.permissions.observe)) &&
        (tab === "activities" || fieldsByKind[tab]) && (
          <EntryForm
            key={tab}
            title={`Adicionar · ${tabs.find((t) => t[1] === tab)?.[0]}`}
            fields={
              tab === "activities"
                ? activityFields
                : tab === "materials"
                  ? [
                      ...fieldsByKind[tab],
                      {
                        name: "budgetItemId",
                        label: "Rubrica orçamental",
                        options: budgetItems,
                      },
                    ]
                  : fieldsByKind[tab]
            }
            onSave={async (v) => {
              const body: Record<string, unknown> = Object.fromEntries(
                Object.entries(v).filter(([, value]) => value !== ""),
              );
              if (tab === "activities") {
                body.updateTaskProgress = v.updateTaskProgress === "true";
                if (body.updateTaskProgress) {
                  body.taskVersion = tasks.find(
                    (t) => t.id === v.scheduleTaskId,
                  )?.version;
                } else delete body.progressAfter;
              }
              if (tab === "workforce") body.workerCount = Number(v.workerCount);
              if (tab === "equipment") body.quantity = Number(v.quantity);
              await mutate(`/${tab}`, "POST", body);
            }}
          />
        )}
      {(tab === "photos" || tab === "documents") && (
        <>
          {data.permissions.edit && (
            <section className="card">
              <h2>
                {tab === "photos" ? "Adicionar fotografia" : "Anexar documento"}
              </h2>
              <label>
                Visibilidade
                <select
                  disabled={busy}
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value)}
                >
                  {options([
                    "INTERNAL",
                    "PROJECT_MEMBERS",
                    "CLIENT_VISIBLE",
                    "FINANCIER_VISIBLE",
                    "PUBLIC_PROJECT",
                  ]).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Legenda
                <input
                  disabled={busy}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                />
              </label>
              <label>
                {busy ? "A enviar…" : "Escolher ficheiro"}
                <input
                  disabled={busy}
                  type="file"
                  accept={
                    tab === "photos"
                      ? "image/jpeg,image/png,image/webp"
                      : "image/jpeg,image/png,image/webp,application/pdf"
                  }
                  capture={tab === "photos" ? "environment" : undefined}
                  onChange={(e) => {
                    if (e.target.files?.[0]) upload(e.target.files[0]);
                    e.target.value = "";
                  }}
                />
              </label>
              <p>
                JPEG, PNG, WebP{tab === "documents" ? " ou PDF" : ""} · até 20
                MB. O acesso exige participação autorizada na obra.
              </p>
            </section>
          )}
          <div className="execution-cards">
            {data[tab as "photos" | "documents"].map((file) => (
              <article className="card" key={file.id}>
                <h3>{file.caption || file.fileName}</h3>
                {tab === "photos" && (
                  <img
                    className="execution-photo"
                    src={`/api/v1${base}/documents/${file.id}/content`}
                    alt={file.caption ?? file.fileName}
                    loading="lazy"
                  />
                )}
                <p>{stateNames[file.visibility]}</p>
                <a
                  className="button"
                  href={`/api/v1${base}/documents/${file.id}/content`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir {tab === "photos" ? "fotografia" : "documento"}
                </a>
                {data.permissions.edit && (
                  <button
                    className="secondary"
                    onClick={() =>
                      mutate(`/documents/${file.id}`, "DELETE", {}).catch((e) =>
                        setError(e.message),
                      )
                    }
                  >
                    Remover
                  </button>
                )}
              </article>
            ))}
          </div>
        </>
      )}
    </>
  );
}
