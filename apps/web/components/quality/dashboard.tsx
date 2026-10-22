"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Notice } from "@obras/ui";
import { api, send } from "../../lib/api";
import { useMe } from "../shell";
import {
  Nav,
  EntryForm,
  useQuality,
  text,
  label,
  type Row,
  Evidence,
} from "./common";
function Bars({
  title,
  rows,
  field,
}: {
  title: string;
  rows: Row[];
  field: string;
}) {
  const max = Math.max(1, ...rows.map((r) => Number(r._count)));
  return (
    <section className="card">
      <h2>{title}</h2>
      {rows.map((r, i) => (
        <div className="quality-bar" key={i}>
          <span>{label(r[field]) || "Por atribuir"}</span>
          <meter min={0} max={max} value={Number(r._count)} />
          <strong>{text(r._count)}</strong>
        </div>
      ))}
    </section>
  );
}
export function QualityDashboard({ id }: { id: string }) {
  const me = useMe(),
    o = useQuality(id),
    [summary, setSummary] = useState<Row>(),
    [trends, setTrends] = useState<Row>(),
    [policy, setPolicy] = useState<Row>(),
    [notifications, setNotifications] = useState<Row[]>([]),
    [error, setError] = useState("");
  async function load() {
    const [s, t, p, n] = await Promise.all([
      api<Row>(`/projects/${id}/quality/summary`),
      api<Row>(`/projects/${id}/quality/trends`),
      api<Row>(`/projects/${id}/quality/policy`),
      api<{ items: Row[] }>("/notifications"),
    ]);
    setSummary(s);
    setTrends(t);
    setPolicy(p);
    setNotifications(n.items.filter((x) => x.projectId === id));
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [id]);
  if (!summary)
    return (
      <>
        <Nav id={id} />
        <h1>Dashboard de fiscalização</h1>
        <Notice error={!!error}>{error || "A carregar indicadores…"}</Notice>
      </>
    );
  const metrics = {
    inspectionsTotal: "Inspeções",
    firstPassRate: "Aprovação à primeira (%)",
    openNonConformities: "NCR abertas",
    overdueNonConformities: "NCR vencidas",
    criticalNonConformities: "NCR críticas",
    averageClosureDays: "Tempo médio de encerramento (dias)",
    closureRate: "Taxa de encerramento (%)",
  };
  return (
    <>
      <Nav id={id} />
      <h1>Dashboard de fiscalização</h1>
      {error && <Notice error>{error}</Notice>}
      <Link href={`/projects/${id}/quality/report`}>
        Relatório de qualidade da obra
      </Link>
      <div className="quality-metrics">
        {Object.entries(metrics).map(([key, name]) => (
          <article className="card" key={key}>
            <p>{name}</p>
            <strong>{text(summary?.[key]) || "0"}</strong>
          </article>
        ))}
      </div>
      {summary && (
        <Bars
          title="NCR abertas × encerradas"
          rows={[
            {
              id: "open",
              version: 0,
              name: "Abertas",
              _count: summary.openNonConformities,
            },
            {
              id: "closed",
              version: 0,
              name: "Encerradas",
              _count: summary.closedNonConformities,
            },
          ]}
          field="name"
        />
      )}
      {trends && (
        <>
          <Bars
            title="NCR por categoria"
            rows={trends.category as Row[]}
            field="category"
          />
          <Bars
            title="NCR por severidade"
            rows={trends.severity as Row[]}
            field="severity"
          />
          <Bars
            title="NCR por organização responsável"
            rows={(trends.organizations as Row[]).map((r) => ({
              ...r,
              name:
                o.organizations.find(
                  (x) => x.id === r.responsibleOrganizationId,
                )?.name ?? "Por atribuir",
            }))}
            field="name"
          />
          <section className="card">
            <h2>Tendência mensal · criadas × encerradas</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Mês</th>
                    <th>Inspeções</th>
                    <th>Reprovadas</th>
                    <th>NCR criadas</th>
                    <th>NCR encerradas</th>
                    <th>Críticas</th>
                  </tr>
                </thead>
                <tbody>
                  {(trends.series as Row[]).map((r, i) => (
                    <tr key={i}>
                      {[
                        "period",
                        "inspections",
                        "failed_inspections",
                        "ncr_created",
                        "ncr_closed",
                        "critical_ncr",
                      ].map((k) => (
                        <td key={k}>
                          {k === "period" ? text(r[k]).slice(0, 7) : text(r[k])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
      {(o.role ?? me.role) === "ADMIN" && policy && (
        <EntryForm
          title="Política de certificação"
          fields={[
            {
              name: "block",
              label: "Bloquear medição com NCR crítica não encerrada",
              required: true,
              value: policy.blockMeasurementOnOpenCriticalNcr
                ? "true"
                : "false",
              options: [
                { value: "true", label: "Sim" },
                { value: "false", label: "Não" },
              ],
            },
          ]}
          onSave={async (v) => {
            await api(
              `/projects/${id}/quality/policy`,
              send("PATCH", {
                version: policy.version,
                blockMeasurementOnOpenCriticalNcr: v.block === "true",
                preventSelfVerification: true,
              }),
            );
            await load();
          }}
        />
      )}
      <section className="card">
        <h2>Notificações de fiscalização</h2>
        {notifications.map((n) => (
          <p key={n.id}>
            <Link href={text(n.resourcePath)}>{text(n.title)}</Link> ·{" "}
            {label(n.type)}{" "}
            {!n.readAt && (
              <button
                onClick={async () => {
                  await api(`/notifications/${n.id}/read`, send("POST", {}));
                  await load();
                }}
              >
                Marcar como lida
              </button>
            )}
          </p>
        ))}
      </section>
    </>
  );
}
export function QualityReport({ id }: { id: string }) {
  const [report, setReport] = useState<Row>(),
    [error, setError] = useState("");
  useEffect(() => {
    const q = new URLSearchParams(window.location.search),
      kind = q.get("kind"),
      item = q.get("id");
    const path =
      kind === "inspection"
        ? `inspections/${item}/report`
        : kind === "ncr"
          ? `non-conformities/${item}/report`
          : "quality/report";
    api<Row>(`/projects/${id}/${path}`)
      .then(setReport)
      .catch((e) => setError(e.message));
  }, [id]);
  if (!report)
    return <Notice error={!!error}>{error || "A preparar relatório…"}</Notice>;
  const p = report.project as Row,
    r = report.data as Row;
  return (
    <>
      <div className="no-print">
        <Nav id={id} />
        <button onClick={() => window.print()}>Imprimir / Guardar PDF</button>
      </div>
      <article className="quality-report">
        <h1>
          Relatório de{" "}
          {report.kind === "inspection"
            ? "inspeção"
            : report.kind === "ncr"
              ? "não conformidade"
              : "qualidade da obra"}
        </h1>
        <p>
          {text(p.code)} · {text(p.name)} · {text(p.location)}
        </p>
        <p>Emitido em {text(report.generatedAt)}</p>
        {report.kind === "quality" ? (
          <>
            <h2>Indicadores</h2>
            <dl>
              {Object.entries(r.summary as object).map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{text(v)}</dd>
                </div>
              ))}
            </dl>
          </>
        ) : (
          <>
            <h2>
              {text(r.code)} · {text(r.title)}
            </h2>
            <p>{text(r.description)}</p>
            <p>
              Estado: {label(r.status)} · Resultado: {label(r.overallResult)} ·
              Severidade: {label(r.severity)}
            </p>
            <p>
              Data: {text(r.inspectionDate ?? r.detectedAt)} · Fiscal:{" "}
              {text(
                (report.inspectorIdentity as Row | null)?.name ??
                  r.inspectorId ??
                  r.verifiedBy,
              )}
            </p>
            {!!report.checklist && (
              <p>
                Checklist: {text((report.checklist as Row).code)} ·{" "}
                {text((report.checklist as Row).name)} · v
                {String((report.checklist as Row).versionNumber)}
              </p>
            )}
            <p>{text(r.generalComments)}</p>
            {report.kind === "inspection" ? (
              <>
                {(r.items as Row[]).map((i) => (
                  <section key={i.id}>
                    <h3>{text((i.template as Row).description)}</h3>
                    <p>
                      {label(i.result)}{" "}
                      {text(i.textValue ?? i.numericValue ?? i.dateValue)} ·{" "}
                      {text(i.comment)}
                    </p>
                  </section>
                ))}
                <Evidence
                  projectId={id}
                  kind="inspections"
                  id={r.id}
                  version={r.version}
                  editable={false}
                  onChange={async () => {}}
                />
                <h3>NCR associadas</h3>
                {(r.nonConformities as Row[]).map((n) => (
                  <p key={n.id}>
                    {text(n.code)} · {text(n.title)} · {label(n.severity)}
                  </p>
                ))}
              </>
            ) : (
              <>
                {(r.actions as Row[]).map((a) => (
                  <section key={a.id}>
                    <h3>{text(a.description)}</h3>
                    <p>
                      {label(a.status)} · {text(a.completionNotes)}
                    </p>
                    <Evidence
                      projectId={id}
                      kind="corrective-actions"
                      id={a.id}
                      version={a.version}
                      editable={false}
                      onChange={async () => {}}
                    />
                  </section>
                ))}
              </>
            )}
            <p>
              Identificação eletrónica do responsável pelo encerramento:{" "}
              {text(
                (report.closedByIdentity as Row | null)?.name ?? r.closedBy,
              ) || "Ainda não encerrado"}{" "}
              · {text(r.closedAt)}
            </p>
          </>
        )}
      </article>
    </>
  );
}
