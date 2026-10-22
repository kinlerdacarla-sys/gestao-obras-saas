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
  today,
  useQuality,
  rowOptions,
  links,
  clean,
  text,
  label,
  choices,
  useResource,
  Evidence,
  type Row,
  type Field,
} from "./common";
export function Requests({ id }: { id: string }) {
  const o = useQuality(id),
    me = useMe(),
    [rows, setRows] = useState<Row[]>([]),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [error, setError] = useState("");
  const base = `/projects/${id}/inspection-requests`;
  async function load() {
    const result = await api<{ items: Row[]; total: number }>(
      base + `?page=${page}`,
    );
    setRows(result.items);
    setTotal(result.total);
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [base, page]);
  async function action(row: Row, a: string, extra: object = {}) {
    await api(
      base + `/${row.id}/${a}`,
      send("POST", { version: row.version, ...extra }),
    );
    await load();
  }
  return (
    <>
      <Nav id={id} />
      <h1>Pedidos de inspeção</h1>
      <Paging page={page} total={total} onPage={setPage} />
      {error && <Notice error>{error}</Notice>}
      {["ADMIN", "MANAGER"].includes(o.role ?? me.role) && (
        <EntryForm
          title="Novo pedido"
          fields={[
            { name: "title", label: "Título", required: true },
            {
              name: "requestedInspectionDate",
              label: "Data solicitada",
              type: "date",
              value: today(),
              required: true,
            },
            ...links(o).filter((f) => f.name !== "measurementId"),
          ]}
          onSave={async (v) => {
            await api(base, send("POST", clean(v)));
            await load();
          }}
          submit="Criar pedido"
        />
      )}
      {rows.map((r) => (
        <section className="card" key={r.id}>
          <h2>
            {text(r.code)} · {text(r.title)}
          </h2>
          <p>
            {label(r.status)} · {text(r.requestedInspectionDate).slice(0, 10)}
          </p>
          {r.status === "DRAFT" &&
            ["ADMIN", "MANAGER"].includes(o.role ?? me.role) && (
              <button
                onClick={() =>
                  action(r, "submit").catch((e) => setError(e.message))
                }
              >
                Submeter pedido
              </button>
            )}
          {r.status === "SUBMITTED" &&
            ["ADMIN", "INSPECTOR"].includes(o.role ?? me.role) && (
              <EntryForm
                title="Agendar inspeção"
                fields={[
                  {
                    name: "assignedInspectorId",
                    label: "Fiscal",
                    required: true,
                    options: rowOptions(
                      o.users.filter((x) =>
                        ["ADMIN", "INSPECTOR"].includes(text(x.role)),
                      ),
                    ),
                  },
                ]}
                onSave={(v) => action(r, "schedule", v)}
                submit="Agendar"
              />
            )}
          {r.status === "SCHEDULED" && (
            <Link href={`/projects/${id}/inspections?request=${r.id}`}>
              Criar inspeção deste pedido
            </Link>
          )}
        </section>
      ))}
    </>
  );
}
export function Inspections({ id }: { id: string }) {
  const o = useQuality(id),
    me = useMe(),
    [rows, setRows] = useState<Row[]>([]),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [versions, setVersions] = useState<Row[]>([]),
    [filter, setFilter] = useState(""),
    [error, setError] = useState("");
  const base = `/projects/${id}/inspections`;
  async function load() {
    const q = new URLSearchParams(filter);
    q.set("page", String(page));
    const result = await api<{ items: Row[]; total: number }>(base + "?" + q);
    setRows(result.items);
    setTotal(result.total);
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [base, filter, page]);
  useEffect(() => {
    Promise.all(
      o.templates.map((t) =>
        api<Row>(`/checklist-templates/${t.id}`).then((row) =>
          (row.versions as Row[])
            .filter((v) => v.status === "PUBLISHED")
            .map((v) => ({
              ...v,
              name: `${text(t.name)} · v${text(v.versionNumber)}`,
            })),
        ),
      ),
    )
      .then((x) => setVersions(x.flat()))
      .catch(() => {});
  }, [o.templates]);
  return (
    <>
      <Nav id={id} />
      <h1>Inspeções</h1>
      <Paging page={page} total={total} onPage={setPage} />
      {error && <Notice error>{error}</Notice>}
      <EntryForm
        title="Filtrar inspeções"
        fields={[
          { name: "search", label: "Pesquisar" },
          {
            name: "status",
            label: "Estado",
            options: choices([
              "DRAFT",
              "IN_PROGRESS",
              "SUBMITTED",
              "CLOSED",
              "CANCELLED",
            ]),
          },
          {
            name: "result",
            label: "Resultado",
            options: choices(["PASS", "PASS_WITH_OBSERVATIONS", "FAIL"]),
          },
          {
            name: "inspector",
            label: "Fiscal",
            options: rowOptions(
              o.users.filter((x) =>
                ["INSPECTOR", "ADMIN"].includes(text(x.role)),
              ),
            ),
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
          { name: "date_from", label: "Data inicial", type: "date" },
          { name: "date_to", label: "Data final", type: "date" },
        ]}
        submit="Filtrar"
        onSave={async (v) => {
          setPage(1);
          setFilter("?" + new URLSearchParams(clean(v)));
        }}
      />
      {["ADMIN", "INSPECTOR"].includes(o.role ?? me.role) && (
        <EntryForm
          title="Nova inspeção"
          fields={[
            { name: "title", label: "Título", required: true },
            {
              name: "inspectionDate",
              label: "Data da inspeção",
              type: "date",
              value: today(),
              required: true,
            },
            {
              name: "inspectorId",
              label: "Fiscal",
              required: true,
              options: rowOptions(
                o.users.filter((x) =>
                  ["INSPECTOR", "ADMIN"].includes(text(x.role)),
                ),
              ),
            },
            {
              name: "checklistTemplateVersionId",
              label: "Checklist publicado",
              required: true,
              options: rowOptions(versions),
            },
            ...links(o),
          ]}
          submit="Criar inspeção"
          onSave={async (v) => {
            const requestId = new URLSearchParams(window.location.search).get(
              "request",
            );
            const row = await api<Row>(
              base,
              send("POST", {
                ...clean(v),
                ...(requestId ? { inspectionRequestId: requestId } : {}),
              }),
            );
            window.location.assign(`/projects/${id}/inspections/${row.id}`);
          }}
        />
      )}
      <div className="quality-list">
        {rows.map((r) => (
          <article className="card" key={r.id}>
            <h2>
              <Link href={`${base}/${r.id}`}>
                {text(r.code)} · {text(r.title)}
              </Link>
            </h2>
            <p>
              {text(r.inspectionDate).slice(0, 10)} · {label(r.status)} ·{" "}
              {label(r.overallResult)}
            </p>
            <p>
              Fiscal: {text(o.users.find((u) => u.id === r.inspectorId)?.name)}{" "}
              · Contrato:{" "}
              {text(
                o.contracts.find((c) => c.id === r.contractId)?.contractNumber,
              ) || "—"}
            </p>
          </article>
        ))}
      </div>
    </>
  );
}
function ChecklistItem({
  item,
  projectId,
  inspectionId,
  version,
  editable,
  onChange,
}: {
  item: Row;
  projectId: string;
  inspectionId: string;
  version: number;
  editable: boolean;
  onChange: () => Promise<void>;
}) {
  const t = item.template as Row,
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const binary = ["PASS_FAIL_NA", "YES_NO_NA"].includes(text(t.responseType));
  async function save(body: object) {
    setBusy(true);
    setError("");
    try {
      await api(
        `/projects/${projectId}/inspections/${inspectionId}/items/${item.id}`,
        send("PATCH", { version, ...body }),
      );
      await onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const field: Field = {
    name:
      t.responseType === "NUMBER"
        ? "numericValue"
        : t.responseType === "DATE"
          ? "dateValue"
          : "textValue",
    label: "Resposta",
    type:
      t.responseType === "NUMBER"
        ? "number"
        : t.responseType === "DATE"
          ? "date"
          : "text",
    step: "0.000001",
    required: !!t.isRequired,
  };
  return (
    <article className="card quality-item">
      <h3>
        {text(t.code)} · {text(t.description)}
      </h3>
      <p>
        {t.isRequired ? "Obrigatório" : "Opcional"}
        {t.isHoldPoint ? " · ⚠ Ponto de paragem (hold point)" : ""}
      </p>
      {error && <Notice error>{error}</Notice>}
      {binary ? (
        <div
          className="quality-answers"
          role="group"
          aria-label={text(t.description)}
        >
          {["PASS", "FAIL", "NA"].map((value) => (
            <button
              key={value}
              type="button"
              disabled={!editable || busy}
              aria-pressed={item.result === value}
              onClick={() => void save({ result: value })}
            >
              {label(value)}
            </button>
          ))}
        </div>
      ) : editable ? (
        <EntryForm
          title="Resposta do item"
          fields={[
            {
              ...field,
              value: text(item[field.name]).slice(
                0,
                t.responseType === "DATE" ? 10 : 10000,
              ),
            },
          ]}
          onSave={save}
        />
      ) : (
        <p>{text(item.textValue ?? item.numericValue ?? item.dateValue)}</p>
      )}
      {editable && t.allowComment ? (
        <EntryForm
          title="Observação do fiscal"
          fields={[
            { name: "comment", label: "Comentário", value: text(item.comment) },
          ]}
          onSave={save}
        />
      ) : (
        <p>{text(item.comment)}</p>
      )}
      {item.result === "FAIL" && !!t.requirePhotoOnFail && (
        <p>Fotografia obrigatória antes de submeter.</p>
      )}
      <Evidence
        projectId={projectId}
        kind="inspections"
        id={inspectionId}
        itemId={item.id}
        version={version}
        editable={editable}
        onChange={onChange}
      />
      {!!t.isHoldPoint && item.result === "FAIL" && (
        <p>
          {item.holdPointReleasedAt
            ? "Hold point liberado pelo fiscal"
            : "⚠ Liberação pendente"}
        </p>
      )}
    </article>
  );
}
export function InspectionDetail({
  id,
  inspectionId,
}: {
  id: string;
  inspectionId: string;
}) {
  const me = useMe(),
    o = useQuality(id),
    {
      data: r,
      error,
      busy,
      load,
      mutate,
    } = useResource(`/projects/${id}/inspections/${inspectionId}`);
  const fiscal = ["ADMIN", "INSPECTOR"].includes(o.role ?? me.role);
  if (!r)
    return (
      <>
        <Nav id={id} />
        <Notice error={!!error}>{error || "A carregar inspeção…"}</Notice>
      </>
    );
  const editable = fiscal && ["DRAFT", "IN_PROGRESS"].includes(text(r.status)),
    items = (r.items ?? []) as Row[];
  return (
    <>
      <Nav id={id} />
      <h1>
        {text(r.code)} · {text(r.title)}
      </h1>
      {error && <Notice error>{error}</Notice>}
      <p role="status">
        {label(r.status)} · Resultado:{" "}
        {label(r.overallResult) || "Por preencher"}
      </p>
      <Link
        href={`/projects/${id}/quality/report?kind=inspection&id=${inspectionId}`}
      >
        Relatório de inspeção
      </Link>
      <div className="actions">
        {fiscal &&
          [
            ...(r.status === "DRAFT" ? ["start"] : []),
            ...(r.status === "IN_PROGRESS" ? ["submit"] : []),
            ...(r.status === "SUBMITTED" ? ["close"] : []),
          ].map((a) => (
            <button
              disabled={busy}
              key={a}
              onClick={() => mutate("/" + a).catch(() => {})}
            >
              {
                {
                  start: "Iniciar inspeção",
                  submit: "Submeter inspeção",
                  close: "Encerrar inspeção",
                }[a]
              }
            </button>
          ))}
      </div>
      <h2>Checklist</h2>
      {items.map((item) => (
        <ChecklistItem
          key={item.id}
          item={item}
          projectId={id}
          inspectionId={inspectionId}
          version={r.version}
          editable={editable && !busy}
          onChange={load}
        />
      ))}
      {fiscal &&
        r.status !== "CLOSED" &&
        items
          .filter(
            (i) =>
              (i.template as Row).isHoldPoint &&
              i.result === "FAIL" &&
              !i.holdPointReleasedAt,
          )
          .map((i) => (
            <EntryForm
              key={i.id}
              title={`Liberar hold point · ${text((i.template as Row).code)}`}
              fields={[
                {
                  name: "comment",
                  label: "Justificação da liberação",
                  required: true,
                },
              ]}
              submit="Liberar hold point"
              onSave={(v) => mutate(`/items/${i.id}/release-hold-point`, v)}
            />
          ))}
      <h2>Não conformidades</h2>
      {((r.nonConformities ?? []) as Row[]).map((n) => (
        <p key={n.id}>
          <Link href={`/projects/${id}/non-conformities/${n.id}`}>
            {text(n.code)} · {text(n.title)} · {label(n.severity)}
          </Link>
        </p>
      ))}
      {fiscal && (
        <EntryForm
          title="Criar NCR"
          fields={[
            { name: "title", label: "Título da NCR", required: true },
            { name: "description", label: "Descrição da NCR", required: true },
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
              options: choices([
                "WORKMANSHIP",
                "MATERIAL",
                "DESIGN",
                "DIMENSION",
                "SAFETY",
                "DOCUMENTATION",
                "EQUIPMENT",
                "PROCESS",
                "OTHER",
              ]),
            },
            {
              name: "inspectionItemId",
              label: "Item do checklist",
              options: items.map((i) => ({
                value: i.id,
                label: text((i.template as Row).description),
              })),
            },
            {
              name: "responsibleUserId",
              label: "Responsável",
              options: rowOptions(o.users),
            },
            { name: "dueDate", label: "Prazo", type: "date" },
          ]}
          submit="Registar NCR"
          onSave={async (v) => {
            await api(
              `/projects/${id}/non-conformities`,
              send("POST", { ...clean(v), inspectionId }),
            );
            await load();
          }}
        />
      )}
      <details>
        <summary>Histórico da inspeção</summary>
        {((r.history ?? []) as Row[]).map((e) => (
          <p key={e.id}>
            {text(e.createdAt)} · {text(e.action)}
          </p>
        ))}
      </details>
    </>
  );
}
