"use client";
import { QualityIndicator } from "../quality/common";
import { useEffect, useState } from "react";
import { Notice } from "@obras/ui";
import { api, send } from "../../lib/api";
import { useMe } from "../shell";
import {
  Navigation,
  EntryForm,
  ProgressCards,
  options,
  stateNames,
  dateText,
  today,
  type Field,
  type Metrics,
} from "./common";
export interface Task {
  id: string;
  parentId: string | null;
  code: string;
  name: string;
  taskType: string;
  plannedStart: string;
  plannedEnd: string;
  actualStart: string | null;
  actualEnd: string | null;
  durationDays: number;
  actualProgress: string;
  plannedProgress: string;
  weight: string;
  normalizedWeight: string;
  status: string;
  temporalStatus: string;
  version: number;
  budgetItemId: string | null;
  description?: string;
  sortOrder: number;
}
interface ScheduleData {
  schedule: {
    id: string;
    name: string;
    version: number;
    weightingMethod: string;
    plannedStart: string;
    plannedEnd: string;
    status: string;
  };
  items: Task[];
  dependencies: {
    id: string;
    predecessorId: string;
    successorId: string;
    dependencyType: string;
    lagDays: number;
  }[];
  permissions: { edit: boolean; baseline: boolean };
  actualProgress: string;
  plannedProgress: string;
  deviation: string;
}
export function SchedulePage({ id }: { id: string }) {
  const me = useMe(),
    base = `/projects/${id}`;
  const [data, setData] = useState<ScheduleData>(),
    [missing, setMissing] = useState(false),
    [canCreate, setCanCreate] = useState(me.role === "ADMIN"),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [tab, setTab] = useState("Cronograma"),
    [form, setForm] = useState<string>(),
    [selected, setSelected] = useState<Task>(),
    [collapsed, setCollapsed] = useState<Set<string>>(new Set()),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [type, setType] = useState(""),
    [delayed, setDelayed] = useState(false),
    [page, setPage] = useState(1),
    [history, setHistory] = useState<{
      items: {
        id: string;
        taskId: string;
        progressDate: string;
        previousProgress: string;
        newProgress: string;
        notes: string;
      }[];
      snapshots: {
        id: string;
        snapshotDate: string;
        plannedProgress: string;
        actualProgress: string;
      }[];
    }>(),
    [variance, setVariance] = useState<{
      baseline: { description: string; revisionNumber: number };
      items: {
        taskId: string;
        name: string;
        plannedEnd: string;
        currentEnd: string;
        endDeltaDays: number | null;
      }[];
    }>(),
    [budgetItems, setBudgetItems] = useState<
      { value: string; label: string }[]
    >([]),
    [revisions, setRevisions] = useState<{ value: string; label: string }[]>(
      [],
    );
  async function load() {
    try {
      setData(await api<ScheduleData>(`${base}/schedule`));
      setMissing(false);
    } catch (e) {
      if ((e as Error).message.includes("Cronograma não encontrado"))
        setMissing(true);
      else throw e;
    }
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
    api<{ userId: string; role: string; status: string }[]>(`${base}/users`)
      .then((rows) =>
        setCanCreate(
          me.role === "ADMIN" ||
            (me.role === "MANAGER" &&
              rows.some(
                (r) =>
                  r.userId === me.user.id &&
                  r.role === "MANAGER" &&
                  r.status === "ACTIVE",
              )),
        ),
      )
      .catch(() => {});
    api<{ currentRevision: { id: string; code: string } | null }>(
      `${base}/budget`,
    )
      .then((r) => {
        if (r.currentRevision)
          setRevisions([
            { value: r.currentRevision.id, label: r.currentRevision.code },
          ]);
      })
      .catch(() => {});
    api<{
      items: {
        budgetItemId: string;
        code: string;
        description: string;
        itemType: string;
        children: unknown[];
      }[];
    }>(`${base}/budget/tree`)
      .then((r) => {
        const items: { value: string; label: string }[] = [];
        const walk = (nodes: typeof r.items) => {
          for (const n of nodes) {
            if (n.itemType === "ITEM")
              items.push({
                value: n.budgetItemId,
                label: `${n.code} ${n.description}`,
              });
            walk(n.children as typeof r.items);
          }
        };
        walk(r.items);
        setBudgetItems(items);
      })
      .catch(() => {});
  }, [id]);
  useEffect(() => {
    if (tab === "Histórico")
      api<NonNullable<typeof history>>(`${base}/progress/history`)
        .then(setHistory)
        .catch((e) => setError(e.message));
    if (tab === "Baseline")
      api<NonNullable<typeof variance>>(`${base}/schedule/variance`)
        .then(setVariance)
        .catch((e) => {
          if (!e.message.includes("Baseline não encontrada"))
            setError(e.message);
        });
  }, [tab, data]);
  async function mutate(path: string, method: string, body?: unknown) {
    setError("");
    await api(`${base}${path}`, send(method, body));
    setMessage("Alteração guardada");
    await load();
    setForm(undefined);
    setSelected(undefined);
  }
  const basic: Field[] = [
    { name: "name", label: "Nome", required: true },
    {
      name: "plannedStart",
      label: "Início planeado",
      type: "date",
      required: true,
      value: today(),
    },
    {
      name: "plannedEnd",
      label: "Fim planeado",
      type: "date",
      required: true,
      value: today(),
    },
  ];
  const taskFields: Field[] = [
    { name: "code", label: "Código", required: true },
    { name: "name", label: "Nome da tarefa", required: true },
    {
      name: "taskType",
      label: "Tipo",
      required: true,
      options: options(["TASK", "SUMMARY", "MILESTONE"]),
    },
    {
      name: "parentId",
      label: "Resumo pai",
      options: (data?.items ?? [])
        .filter((t) => t.taskType === "SUMMARY" && t.id !== selected?.id)
        .map((t) => ({ value: t.id, label: `${t.code} ${t.name}` })),
    },
    ...basic.slice(1),
    {
      name: "weight",
      label: "Peso manual (normalizado no cálculo)",
      type: "number",
      step: "0.000001",
      min: "0",
      value: "1",
      required: true,
    },
    { name: "budgetItemId", label: "Rubrica orçamental", options: budgetItems },
    { name: "description", label: "Descrição", type: "textarea" },
  ].map((f) => ({
    ...f,
    value: selected
      ? f.type === "date"
        ? dateText(selected[f.name as keyof Task] as string)
        : String(selected[f.name as keyof Task] ?? "")
      : f.value,
  }));
  const rows = data?.items ?? [],
    lookup = new Map(rows.map((t) => [t.id, t]));
  const ganttStart = rows.reduce(
    (n, t) => Math.min(n, Date.parse(t.plannedStart)),
    Infinity,
  );
  const ganttEnd =
    rows.reduce((n, t) => Math.max(n, Date.parse(t.plannedEnd)), -Infinity) +
    86400000;
  const visible = rows.filter((t) => {
    let parent = t.parentId;
    while (parent) {
      if (collapsed.has(parent)) return false;
      parent = lookup.get(parent)?.parentId ?? null;
    }
    return (
      (!search ||
        `${t.code} ${t.name}`.toLowerCase().includes(search.toLowerCase())) &&
      (!status || t.status === status) &&
      (!type || t.taskType === type) &&
      (!delayed || t.temporalStatus === "DELAYED")
    );
  });
  const metrics: Metrics = {
    plannedProgress: data?.plannedProgress ?? "0",
    actualProgress: data?.actualProgress ?? "0",
    deviation: data?.deviation ?? "0",
    delayed: rows.filter(
      (t) => t.taskType !== "SUMMARY" && t.temporalStatus === "DELAYED",
    ).length,
    inProgress: rows.filter(
      (t) => t.taskType !== "SUMMARY" && t.status === "IN_PROGRESS",
    ).length,
    completed: rows.filter(
      (t) => t.taskType !== "SUMMARY" && t.status === "COMPLETED",
    ).length,
  };
  return (
    <>
      <Navigation id={id} />
      <div className="heading">
        <div>
          <span className="eyebrow">Planeamento da execução</span>
          <h1>{data?.schedule.name ?? "Cronograma"}</h1>
        </div>
        {data?.permissions.edit && (
          <div className="actions">
            <button className="secondary" onClick={() => setForm("settings")}>
              Editar cronograma
            </button>
            <button
              onClick={() => {
                setSelected(undefined);
                setForm("task");
              }}
            >
              Nova tarefa
            </button>
          </div>
        )}
      </div>
      {error && <Notice error>{error}</Notice>}
      {message && <Notice>{message}</Notice>}
      {form === "settings" && data && (
        <EntryForm
          title="Editar cronograma"
          fields={[
            ...basic.map((f) => ({
              ...f,
              value:
                f.type === "date"
                  ? dateText(
                      data.schedule[f.name as "plannedStart" | "plannedEnd"],
                    )
                  : data.schedule.name,
            })),
            {
              name: "weightingMethod",
              label: "Ponderação",
              required: true,
              value: data.schedule.weightingMethod,
              options: options(["MANUAL", "BUDGET_VALUE"]),
            },
            {
              name: "budgetRevisionId",
              label: "Revisão aprovada",
              options: revisions,
            },
            {
              name: "status",
              label: "Estado do cronograma",
              required: true,
              value: data.schedule.status,
              options: options(["DRAFT", "ACTIVE", "COMPLETED"]),
            },
          ]}
          onCancel={() => setForm(undefined)}
          onSave={(v) =>
            mutate("/schedule", "PATCH", {
              ...v,
              budgetRevisionId: v.budgetRevisionId || null,
              version: data.schedule.version,
            })
          }
        />
      )}
      {missing && canCreate && (
        <EntryForm
          title="Criar cronograma"
          fields={[
            ...basic,
            {
              name: "weightingMethod",
              label: "Ponderação",
              required: true,
              options: options(["MANUAL", "BUDGET_VALUE"]),
            },
            {
              name: "budgetRevisionId",
              label: "Revisão aprovada",
              options: revisions,
            },
          ]}
          onSave={(v) =>
            mutate("/schedule", "POST", {
              ...v,
              budgetRevisionId: v.budgetRevisionId || null,
            })
          }
        />
      )}
      {missing && !canCreate && <p>A obra ainda não possui cronograma.</p>}
      {data && (
        <>
          <ProgressCards data={metrics} />
          <div className="tabs">
            {["Cronograma", "Progresso", "Baseline", "Histórico"].map((t) => (
              <button
                key={t}
                className={tab === t ? "" : "secondary"}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </div>
          {form === "task" && (
            <EntryForm
              key={selected?.id ?? "new"}
              title={selected ? "Editar tarefa" : "Nova tarefa"}
              fields={taskFields}
              onCancel={() => {
                setForm(undefined);
                setSelected(undefined);
              }}
              onSave={(v) =>
                mutate(
                  `/schedule/tasks${selected ? `/${selected.id}` : ""}`,
                  selected ? "PATCH" : "POST",
                  {
                    ...v,
                    parentId: v.parentId || null,
                    budgetItemId: v.budgetItemId || null,
                    ...(selected ? { version: selected.version } : {}),
                  },
                )
              }
            />
          )}
          {selected && (
            <QualityIndicator projectId={id} kind="schedule" id={selected.id} />
          )}
          {form === "progress" && selected && (
            <section>
              <p>
                Anterior: {selected.actualProgress}% · Planeado hoje:{" "}
                {selected.plannedProgress}% · Diferença:{" "}
                {(
                  Number(selected.actualProgress) -
                  Number(selected.plannedProgress)
                ).toFixed(2)}{" "}
                pp
              </p>
              <EntryForm
                title={`Atualizar progresso · ${selected.name}`}
                fields={[
                  {
                    name: "progress",
                    label: "Novo progresso (%)",
                    type: "number",
                    min: "0",
                    max: "100",
                    step: "0.01",
                    value: selected.actualProgress,
                    required: true,
                  },
                  {
                    name: "progressDate",
                    label: "Data do progresso",
                    type: "date",
                    value: today(),
                    required: true,
                    max: today(),
                  },
                  { name: "notes", label: "Notas", type: "textarea" },
                ]}
                onCancel={() => setForm(undefined)}
                onSave={(v) =>
                  mutate(`/schedule/tasks/${selected.id}/progress`, "POST", {
                    ...v,
                    version: selected.version,
                  })
                }
              />
            </section>
          )}
          {(tab === "Cronograma" || tab === "Progresso") && (
            <>
              <div className="execution-fields">
                <label>
                  Pesquisar
                  <input
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
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
                    {options([
                      "NOT_STARTED",
                      "IN_PROGRESS",
                      "ON_HOLD",
                      "COMPLETED",
                    ]).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Tipo
                  <select
                    value={type}
                    onChange={(e) => {
                      setType(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">Todos</option>
                    {options(["SUMMARY", "TASK", "MILESTONE"]).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={delayed}
                    onChange={(e) => {
                      setDelayed(e.target.checked);
                      setPage(1);
                    }}
                  />{" "}
                  Apenas atrasadas
                </label>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      {[
                        "Código / Atividade",
                        "Planeado",
                        "Dias",
                        "Real",
                        "Progresso",
                        "Peso",
                        "Estado",
                        "Ações",
                      ].map((x) => (
                        <th key={x}>{x}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visible.slice((page - 1) * 50, page * 50).map((t) => (
                      <tr
                        key={t.id}
                        className={
                          t.taskType === "SUMMARY" ? "budget-group" : ""
                        }
                      >
                        <td>
                          {t.taskType === "SUMMARY" && (
                            <button
                              className="tree-toggle"
                              aria-label={`Expandir ${t.name}`}
                              onClick={() =>
                                setCollapsed((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(t.id)) next.delete(t.id);
                                  else next.add(t.id);
                                  return next;
                                })
                              }
                            >
                              {collapsed.has(t.id) ? "+" : "−"}
                            </button>
                          )}
                          <strong>{t.code}</strong> {t.name}
                        </td>
                        <td>
                          {dateText(t.plannedStart)} → {dateText(t.plannedEnd)}
                        </td>
                        <td>{t.durationDays}</td>
                        <td>
                          {dateText(t.actualStart)} → {dateText(t.actualEnd)}
                        </td>
                        <td>
                          {t.actualProgress}%
                          <div className="execution-bar">
                            <span style={{ width: `${t.actualProgress}%` }} />
                          </div>
                        </td>
                        <td>
                          {(Number(t.normalizedWeight) * 100).toFixed(2)}%
                        </td>
                        <td>
                          {stateNames[t.temporalStatus]}
                          <small>{stateNames[t.status]}</small>
                        </td>
                        <td>
                          {data.permissions.edit && (
                            <div className="actions">
                              <button
                                className="secondary"
                                onClick={() => {
                                  setSelected(t);
                                  setForm("task");
                                }}
                              >
                                Editar
                              </button>
                              {t.taskType !== "SUMMARY" && (
                                <button
                                  onClick={() => {
                                    setSelected(t);
                                    setForm("progress");
                                  }}
                                >
                                  Progresso
                                </button>
                              )}
                              <button
                                className="secondary"
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      `Cancelar ${t.name}? O histórico será preservado.`,
                                    )
                                  )
                                    mutate(
                                      `/schedule/tasks/${t.id}`,
                                      "DELETE",
                                      { version: t.version },
                                    ).catch((e) => setError(e.message));
                                }}
                              >
                                Cancelar tarefa
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="actions">
                <button disabled={page === 1} onClick={() => setPage(page - 1)}>
                  Anterior
                </button>
                <span>
                  {page} / {Math.max(1, Math.ceil(visible.length / 50))}
                </span>
                <button
                  disabled={page * 50 >= visible.length}
                  onClick={() => setPage(page + 1)}
                >
                  Seguinte
                </button>
              </div>
              <details className="card">
                <summary>Gantt · datas planeadas</summary>
                {visible.slice((page - 1) * 50, page * 50).map((t) => {
                  const start = ganttStart,
                    range = ganttEnd - ganttStart;
                  return (
                    <div className="gantt-row" key={t.id}>
                      <span>
                        {t.code} {t.name}
                      </span>
                      <div>
                        <i
                          title={`${dateText(t.plannedStart)} → ${dateText(t.plannedEnd)}`}
                          style={{
                            marginLeft: `${((Date.parse(t.plannedStart) - start) / range) * 100}%`,
                            width: `${Math.max(0.5, ((Date.parse(t.plannedEnd) - Date.parse(t.plannedStart) + 86400000) / range) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </details>
              {tab === "Cronograma" && (
                <section className="card">
                  <h2>Dependências</h2>
                  {data.dependencies.map((d) => (
                    <div className="actions" key={d.id}>
                      <span>
                        {lookup.get(d.predecessorId)?.name} →{" "}
                        {lookup.get(d.successorId)?.name} · {d.dependencyType} ·{" "}
                        {d.lagDays} dias
                      </span>
                      {data.permissions.edit && (
                        <button
                          className="secondary"
                          onClick={() =>
                            mutate(
                              `/schedule/dependencies/${d.id}`,
                              "DELETE",
                            ).catch((e) => setError(e.message))
                          }
                        >
                          Remover
                        </button>
                      )}
                    </div>
                  ))}
                  {data.permissions.edit && (
                    <EntryForm
                      title="Adicionar dependência"
                      fields={[
                        {
                          name: "predecessorId",
                          label: "Predecessora",
                          required: true,
                          options: rows
                            .filter((t) => t.taskType !== "SUMMARY")
                            .map((t) => ({ value: t.id, label: t.name })),
                        },
                        {
                          name: "successorId",
                          label: "Sucessora",
                          required: true,
                          options: rows
                            .filter((t) => t.taskType !== "SUMMARY")
                            .map((t) => ({ value: t.id, label: t.name })),
                        },
                        {
                          name: "dependencyType",
                          label: "Ligação",
                          required: true,
                          options: options(["FS", "SS", "FF", "SF"]),
                        },
                        {
                          name: "lagDays",
                          label: "Desfasamento (dias)",
                          type: "number",
                          value: 0,
                          required: true,
                        },
                      ]}
                      onSave={(v) =>
                        mutate("/schedule/dependencies", "POST", {
                          ...v,
                          lagDays: Number(v.lagDays),
                        })
                      }
                    />
                  )}
                </section>
              )}
            </>
          )}
          {tab === "Baseline" && (
            <>
              {data.permissions.baseline && (
                <EntryForm
                  title="Guardar baseline imutável"
                  fields={[
                    {
                      name: "description",
                      label: "Descrição",
                      value: "Baseline 0",
                      required: true,
                    },
                  ]}
                  onSave={(v) => mutate("/schedule/baselines", "POST", v)}
                />
              )}
              <h2>{variance?.baseline.description ?? "Ainda sem baseline"}</h2>
              <div className="execution-cards">
                {variance?.items.map((t) => (
                  <article className="card" key={t.taskId}>
                    <h3>{t.name}</h3>
                    <p>Fim baseline: {dateText(t.plannedEnd)}</p>
                    <p>
                      Fim atual: {dateText(t.currentEnd)} ·{" "}
                      {t.endDeltaDays ?? "—"} dias
                    </p>
                  </article>
                ))}
              </div>
            </>
          )}
          {tab === "Histórico" && (
            <>
              <h2>Atualizações de progresso</h2>
              <div className="execution-cards">
                {history?.items.map((h) => (
                  <article className="card" key={h.id}>
                    <strong>{lookup.get(h.taskId)?.name ?? h.taskId}</strong>
                    <p>
                      {dateText(h.progressDate)} · {h.previousProgress}% →{" "}
                      {h.newProgress}%
                    </p>
                    <p>{h.notes}</p>
                  </article>
                ))}
              </div>
              <h2>Snapshots diários</h2>
              {history?.snapshots.map((s) => (
                <p key={s.id}>
                  {dateText(s.snapshotDate)} · Planeado {s.plannedProgress}% ·
                  Real {s.actualProgress}%
                </p>
              ))}
            </>
          )}
        </>
      )}
    </>
  );
}
