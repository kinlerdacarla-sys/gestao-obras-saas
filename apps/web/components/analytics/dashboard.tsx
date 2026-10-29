"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, Notice } from "@obras/ui";
import { api, ApiError } from "../../lib/api";
import { useMe } from "../shell";
type Values = Record<string, string | number | null | boolean>;
export type Executive = {
  project: {
    id: string;
    code: string;
    name: string;
    status: string;
    managers: { id: string; name: string }[];
    organizations: { id: string; relationship: string; legalName: string }[];
  };
  role: string;
  schedule: Values;
  financial: Values | null;
  quality: Values;
  executiveStatus: string;
  riskReasons: string[];
  assessmentComplete: boolean;
  assessedAt: string;
};
const stateNames: Record<string, string> = {
  ON_TRACK: "No prazo",
  ATTENTION: "Atenção",
  AT_RISK: "Em risco",
  CRITICAL: "Crítico",
};
const value = (v: unknown) =>
  v === null || v === undefined ? "Sem dados" : String(v);
const currency = (v: unknown) =>
  v === null || v === undefined
    ? "Sem dados"
    : `${Number(v).toLocaleString("pt-MZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MZN`;
export function ExecutiveTable({ items }: { items: Executive[] }) {
  return (
    <div className="table-wrap">
      <table>
        <caption>Progresso e situação das obras autorizadas</caption>
        <thead>
          <tr>
            {[
              "Obra",
              "Estado executivo",
              "Gestor",
              "Planeado",
              "Real",
              "Desvio (pp)",
              "Orçamento",
              "Contratado",
              "Certificado",
              "Pago",
              "NCR abertas",
              "Atrasos",
              "Fim previsto",
            ].map((x) => (
              <th key={x}>{x}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((x) => (
            <tr key={x.project.id}>
              <td>
                <Link href={`/projects/${x.project.id}`}>{x.project.name}</Link>
                <br />
                <small>{x.project.code}</small>
              </td>
              <td>
                {stateNames[x.executiveStatus]}
                {!x.assessmentComplete && <small> · Dados parciais</small>}
              </td>
              <td>
                {x.project.managers.map((m) => m.name).join(", ") ||
                  "Por atribuir"}
              </td>
              <td>{value(x.schedule.plannedProgress)}</td>
              <td>{value(x.schedule.actualProgress)}</td>
              <td>{value(x.schedule.progressVariance)}</td>
              {["approvedBudget", "currentContracts", "certified", "paid"].map(
                (k) => (
                  <td key={k}>{currency(x.financial?.[k])}</td>
                ),
              )}
              <td>
                <Link
                  href={`/projects/${x.project.id}/non-conformities?active=true`}
                >
                  {value(x.quality.openNonConformities)}
                </Link>
              </td>
              <td>
                <Link href={`/projects/${x.project.id}/schedule?delayed=true`}>
                  {value(x.schedule.delayedTasks)}
                </Link>
              </td>
              <td>{value(x.schedule.forecastEnd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!items.length && <p>Nenhuma obra corresponde aos filtros.</p>}
    </div>
  );
}
export function ExecutiveDashboard() {
  const me = useMe();
  const [data, setData] = useState<{ items: Executive[]; totals: Values }>(),
    [error, setError] = useState(""),
    [filter, setFilter] = useState("all"),
    [query, setQuery] = useState(""),
    [catalog, setCatalog] = useState<Executive[]>([]),
    [locked, setLocked] = useState(false);
  useEffect(() => {
    let active = true;
    setData(undefined);
    api<{ items: Executive[]; totals: Values }>(
      `/dashboard/portfolio?portfolio=${filter}&${query}`,
    )
      .then((x) => {
        if (active) {
          setData(x);
          if (!catalog.length) setCatalog(x.items);
        }
      })
      .catch((e) => {
        if (active) {
          if (e instanceof ApiError && e.code === "FEATURE_NOT_AVAILABLE")
            setLocked(true);
          else setError(e.message);
        }
      });
    return () => {
      active = false;
    };
  }, [filter, query]);
  if (locked)
    return (
      <>
        <h1>Dashboard</h1>
        <section className="card">
          <h2>As suas obras</h2>
          <p>Comece por criar uma obra ou consultar as obras existentes.</p>
          <Link className="button" href="/projects">
            Abrir obras
          </Link>
        </section>
        <section className="card">
          <h2>Analytics de portfólio</h2>
          <p>Esta funcionalidade exige um plano com analytics de portfólio.</p>
          <Link href="/settings/subscription">Comparar planos</Link>
        </section>
      </>
    );
  return (
    <>
      <div className="heading">
        <div>
          <span className="eyebrow">
            {me.role === "CLIENT"
              ? "Portal do cliente"
              : me.role === "FINANCIER"
                ? "Portal do financiador"
                : me.role === "INSPECTOR"
                  ? "Fiscalização"
                  : me.role === "MANAGER"
                    ? "As minhas obras"
                    : "Visão executiva"}
          </span>
          <h1>Dashboard</h1>
          <p>Indicadores consolidados das obras a que tem acesso.</p>
        </div>
        <Link href="/analytics/compare" className="button">
          Comparar obras
        </Link>
      </div>
      <label>
        Portfólio{" "}
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">Todas</option>
          <option value="active">Ativas</option>
          <option value="completed">Concluídas</option>
          <option value="at-risk">Em risco</option>
        </select>
      </label>
      <form
        className="analytics-filter"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(
            new URLSearchParams(
              [...new FormData(e.currentTarget)]
                .filter(([, v]) => String(v))
                .map(([k, v]) => [k, String(v)]),
            ).toString(),
          );
        }}
      >
        <label>
          Obra{" "}
          <select name="project">
            <option value="">Todas as obras</option>
            {catalog.map((x) => (
              <option key={x.project.id} value={x.project.id}>
                {x.project.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Estado{" "}
          <select name="status">
            <option value="">Todos os estados</option>
            {[
              ["PLANNING", "Planeamento"],
              ["ACTIVE", "Ativa"],
              ["SUSPENDED", "Suspensa"],
              ["COMPLETED", "Concluída"],
              ["CANCELLED", "Cancelada"],
            ].map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          Gestor{" "}
          <select name="manager">
            <option value="">Todos os gestores</option>
            {[
              ...new Map(
                catalog
                  .flatMap((x) => x.project.managers)
                  .map((x) => [x.id, x]),
              ).values(),
            ].map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Cliente{" "}
          <select name="client">
            <option value="">Todos os clientes</option>
            {[
              ...new Map(
                catalog
                  .flatMap((x) => x.project.organizations)
                  .filter((x) => x.relationship === "OWNER")
                  .map((x) => [x.id, x]),
              ).values(),
            ].map((x) => (
              <option key={x.id} value={x.id}>
                {x.legalName}
              </option>
            ))}
          </select>
        </label>
        <label>
          Início da obra de <input type="date" name="date_from" />
        </label>
        <label>
          Início da obra até <input type="date" name="date_to" />
        </label>
        <button>Aplicar filtros</button>
        <button className="secondary" type="reset" onClick={() => setQuery("")}>
          Limpar filtros
        </button>
      </form>
      {error && <Notice error>{error}</Notice>}
      {!data ? (
        <p role="status">A carregar indicadores…</p>
      ) : (
        <>
          <div className="analytics-grid">
            {[
              ["total", "Obras"],
              ["active", "Ativas"],
              ["planning", "Em planeamento"],
              ["completed", "Concluídas"],
              ["openNcr", "NCR abertas"],
              ["criticalNcr", "NCR críticas"],
              ["delayedTasks", "Tarefas atrasadas"],
            ].map(([k, label]) => (
              <Card key={k} title={label}>
                <strong className="analytics-number">
                  {value(data.totals[k])}
                </strong>
              </Card>
            ))}
          </div>
          {me.role !== "INSPECTOR" && (
            <div className="analytics-grid">
              {[
                ["approvedBudget", "Orçamento aprovado"],
                ["currentContracts", "Contratos"],
                ["certified", "Certificado"],
                ["paid", "Pago"],
                ["fundingApproved", "Financiamento aprovado"],
                ["fundingDisbursed", "Desembolsado"],
              ].map(([k, label]) => (
                <Card key={k} title={label}>
                  {currency(data.totals[k])}
                </Card>
              ))}
            </div>
          )}
          <Worklist />
          <Card title="Portfólio executivo">
            <ExecutiveTable items={data.items} />
          </Card>
        </>
      )}
    </>
  );
}
export function ProjectExecutive({ id }: { id: string }) {
  const [data, setData] = useState<Executive>(),
    [error, setError] = useState("");
  useEffect(() => {
    api<Executive>(`/projects/${id}/analytics`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [id]);
  if (error) return <Notice error>{error}</Notice>;
  if (!data) return <p role="status">A carregar visão executiva…</p>;
  return (
    <Card title="Visão executiva">
      <p>
        <Link href={`/projects/${id}/gallery`}>Fotografias autorizadas →</Link>{" "}
        · <Link href="/reports">Relatórios →</Link>
      </p>
      <p>
        <strong>{stateNames[data.executiveStatus]}</strong>
        {!data.assessmentComplete &&
          " · Avaliação parcial: faltam dados de cronograma ou financeiros."}
      </p>
      <div className="analytics-grid">
        <div>
          <h3>Progresso físico</h3>
          <p>
            Planeado: {value(data.schedule.plannedProgress)}% · Real:{" "}
            {value(data.schedule.actualProgress)}%
          </p>
          <p>Desvio: {value(data.schedule.progressVariance)} pp</p>
          <p>
            Previsão: {value(data.schedule.forecastEnd)} · Confiança:{" "}
            {value(data.schedule.forecastConfidence)}
          </p>
          <Link href={`/projects/${id}/schedule?delayed=true`}>
            Consultar cronograma e atrasos →
          </Link>
        </div>
        <div>
          <h3>Qualidade</h3>
          <p>
            {value(data.quality.openNonConformities)} NCR abertas ·{" "}
            {value(data.quality.criticalNonConformities)} críticas
          </p>
          <Link href={`/projects/${id}/non-conformities?active=true`}>
            Consultar não conformidades →
          </Link>
        </div>
        {data.financial && (
          <div>
            <h3>Financeiro</h3>
            <p>Orçamento: {currency(data.financial.approvedBudget)}</p>
            <p>
              Certificado: {currency(data.financial.certified)} · Pago:{" "}
              {currency(data.financial.paid)}
            </p>
            <p>
              Custo final conhecido:{" "}
              {currency(data.financial.forecastFinalCost)}
            </p>
            <Link href={`/projects/${id}/measurements`}>
              Consultar medições →
            </Link>
          </div>
        )}
      </div>
      {data.project.organizations.length > 0 && (
        <p>
          {data.project.organizations
            .map((x) => `${x.relationship}: ${x.legalName}`)
            .join(" · ")}
        </p>
      )}
      {data.role !== "INSPECTOR" && <SCurve id={id} />}
    </Card>
  );
}
export function SCurve({ id }: { id: string }) {
  const [period, setPeriod] = useState("90"),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [data, setData] = useState<{
      items: {
        date: string;
        plannedPhysical: string;
        actualPhysical: string;
        plannedFinancial: string | null;
        actualFinancial: string | null;
      }[];
      sources: Record<string, string>;
    }>(),
    [error, setError] = useState("");
  useEffect(() => {
    const q = new URLSearchParams({ granularity: "DAY" });
    if (period !== "all" && period !== "custom") {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - Number(period));
      q.set("from", d.toISOString().slice(0, 10));
    }
    if (period === "custom") {
      if (from) q.set("from", from);
      if (to) q.set("to", to);
    }
    let active = true;
    api<typeof data>(`/projects/${id}/analytics/s-curve?${q}`)
      .then((x) => {
        if (active) {
          setData(x);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [id, period, from, to]);
  const series = [
    { key: "plannedPhysical", name: "Físico planeado", color: "#0d6b5c" },
    { key: "actualPhysical", name: "Físico real", color: "#275dad" },
    { key: "plannedFinancial", name: "Financeiro planeado", color: "#9b4d00" },
    { key: "actualFinancial", name: "Financeiro real", color: "#823b8b" },
  ] as const;
  const scale = Math.max(
    100,
    ...(data?.items ?? [])
      .flatMap((x) => series.map((s) => Number(x[s.key] ?? 0)))
      .filter(Number.isFinite),
  );
  return (
    <section>
      <h3>Curva S consolidada</h3>
      <label>
        Período{" "}
        <select value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value="30">30 dias</option>
          <option value="90">90 dias</option>
          <option value="365">Um ano</option>
          <option value="all">Todo o histórico</option>
          <option value="custom">Personalizado</option>
        </select>
      </label>
      {period === "custom" && (
        <>
          <label>
            De{" "}
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            Até{" "}
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
        </>
      )}
      {error && <Notice error>{error}</Notice>}
      {data && (
        <>
          {data.items.length ? (
            <>
              <svg
                viewBox="0 0 800 240"
                role="img"
                aria-label="Curva S: quatro séries percentuais, valores disponíveis na tabela"
              >
                <line x1="35" y1="210" x2="780" y2="210" stroke="#738883" />
                <text x="0" y="20">
                  {Math.ceil(scale)}%
                </text>
                <text x="0" y="210">
                  0%
                </text>
                {series.map((s) => (
                  <polyline
                    key={s.key}
                    fill="none"
                    stroke={s.color}
                    strokeWidth="2"
                    strokeDasharray={
                      s.key.startsWith("planned") ? "7 4" : undefined
                    }
                    points={data.items
                      .flatMap((x, i) =>
                        x[s.key] === null
                          ? []
                          : [
                              `${35 + (i / Math.max(data.items.length - 1, 1)) * 740},${210 - (Math.max(0, Number(x[s.key])) / scale) * 190}`,
                            ],
                      )
                      .join(" ")}
                  />
                ))}
              </svg>
              <p>
                {series.map((s) => (
                  <span key={s.key} style={{ color: s.color, marginRight: 16 }}>
                    {s.name}{" "}
                    {s.key.startsWith("planned") ? "(tracejado)" : "(contínuo)"}
                  </span>
                ))}
              </p>
              <details>
                <summary>Ver valores e fontes</summary>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Data</th>
                        {series.map((s) => (
                          <th key={s.key}>{s.name} %</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.items.map((x) => (
                        <tr key={x.date}>
                          <td>{x.date}</td>
                          {series.map((s) => (
                            <td key={s.key}>{value(x[s.key])}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {Object.entries(data.sources).map(([key, text]) => (
                  <p key={key}>{text}</p>
                ))}
              </details>
            </>
          ) : (
            <p>Sem histórico para o período selecionado.</p>
          )}
          <p className="muted">
            O planeamento financeiro é aproximado pelo progresso físico
            planeado. Sem baseline financeira, os indicadores financeiros ficam
            indisponíveis.
          </p>
        </>
      )}
    </section>
  );
}
export function CompareProjects() {
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [items, setItems] = useState<Executive[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    api<typeof projects>("/projects")
      .then(setProjects)
      .catch((e) => setError(e.message));
  }, []);
  async function compare() {
    try {
      setError("");
      setItems(
        (
          await api<{ items: Executive[] }>(
            `/analytics/projects/compare?projects=${selected.join(",")}`,
          )
        ).items,
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <h1>Comparar obras</h1>
      <p>Selecione entre duas e dez obras.</p>
      <fieldset>
        <legend>Obras autorizadas</legend>
        {projects.map((p) => (
          <label key={p.id}>
            <input
              type="checkbox"
              checked={selected.includes(p.id)}
              disabled={selected.length >= 10 && !selected.includes(p.id)}
              onChange={(e) =>
                setSelected(
                  e.target.checked
                    ? [...selected, p.id]
                    : selected.filter((x) => x !== p.id),
                )
              }
            />
            {p.name}
          </label>
        ))}
      </fieldset>
      <button disabled={selected.length < 2} onClick={compare}>
        Comparar
      </button>
      {error && <Notice error>{error}</Notice>}
      <ExecutiveTable items={items} />
    </>
  );
}

export function Worklist() {
  const [data, setData] = useState<
      Record<
        string,
        {
          id: string;
          projectId: string;
          code?: string;
          expenseNumber?: string;
          logDate?: string;
          status: string;
          title?: string;
        }[]
      >
    >(),
    [error, setError] = useState("");
  useEffect(() => {
    api<typeof data>("/dashboard/worklist")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  const names: Record<string, string> = {
    inspections: "Inspeções em curso",
    requests: "Pedidos de inspeção",
    measurements: "Medições pendentes",
    diaries: "Diários pendentes",
    expenses: "Despesas para aprovação",
    ncr: "NCR da equipa",
  };
  const route: Record<string, string> = {
    inspections: "inspections",
    requests: "inspection-requests",
    measurements: "measurements",
    diaries: "daily-logs",
    expenses: "expenses",
    ncr: "non-conformities",
  };
  return (
    <>
      {error && <Notice error>{error}</Notice>}
      {data && (
        <div className="analytics-grid">
          {Object.entries(data)
            .filter(([, rows]) => rows.length)
            .map(([key, rows]) => (
              <section className="card" id={key} key={key}>
                <h2>{names[key]}</h2>
                <ul>
                  {rows.map((x) => (
                    <li key={x.id}>
                      <Link
                        href={`/projects/${x.projectId}/${route[key]}${["requests", "expenses"].includes(key) ? "" : `/${x.id}`}`}
                      >
                        {x.code ?? x.expenseNumber ?? x.logDate?.slice(0, 10)}{" "}
                        {x.title} · {x.status}
                      </Link>
                    </li>
                  ))}
                </ul>
                <small>Até dez registos, por prioridade temporal.</small>
              </section>
            ))}
        </div>
      )}
    </>
  );
}
