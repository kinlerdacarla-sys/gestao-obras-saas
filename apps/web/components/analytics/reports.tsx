"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, Notice } from "@obras/ui";
import { api, send } from "../../lib/api";
import { useMe } from "../shell";
const names: Record<string, string> = {
  PROJECT_EXECUTIVE: "Executivo da obra",
  PROJECT_PROGRESS: "Progresso",
  FINANCIAL: "Financeiro",
  MEASUREMENTS: "Medições",
  CONTRACTS: "Contratos",
  QUALITY: "Qualidade",
  DAILY_LOG: "Diário de obra",
  FUNDING: "Financiamento",
  PORTFOLIO: "Portfólio",
};
export function Reports() {
  const me = useMe(),
    [projects, setProjects] = useState<{ id: string; name: string }[]>([]),
    [projectId, setProjectId] = useState(""),
    [type, setType] = useState("PROJECT_EXECUTIVE"),
    [format, setFormat] = useState("PDF"),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [items, setItems] = useState<
      {
        id: string;
        reportType: string;
        format: string;
        status: string;
        createdAt: string;
        errorMessage: string | null;
      }[]
    >([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [advanced, setAdvanced] = useState(false);
  const load = () =>
    api<{ items: typeof items }>("/reports").then((x) => setItems(x.items));
  useEffect(() => {
    api<{ features: string[] }>("/entitlements")
      .then((v) => setAdvanced(v.features.includes("ADVANCED_REPORTS")))
      .catch((e) => setError(e.message));
    api<typeof projects>("/projects")
      .then((x) => {
        setProjects(x);
        setProjectId(x[0]?.id ?? "");
      })
      .catch((e) => setError(e.message));
    load().catch((e) => setError(e.message));
    const timer = setInterval(() => {
      load().catch((e) => setError(e.message));
    }, 5000);
    return () => clearInterval(timer);
  }, []);
  async function create(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      setError("");
      await api(
        "/reports",
        send("POST", {
          ...(type === "PORTFOLIO" ? {} : { projectId }),
          reportType: allowed.includes(type) ? type : allowed[0],
          format,
          parameters: {
            ...(from ? { date_from: from } : {}),
            ...(to ? { date_to: to } : {}),
          },
        }),
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function download(id: string) {
    try {
      const ticket = await api<{ url: string }>(
        `/reports/${id}/download`,
        send("POST"),
      );
      const result = await fetch(ticket.url, { credentials: "include" });
      if (!result.ok) {
        const body = await result.json();
        throw Error(body.message);
      }
      const blob = await result.blob(),
        url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = `relatorio-${id}.${items.find((x) => x.id === id)?.format.toLowerCase()}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const roleAllowed =
    me.role === "ADMIN"
      ? Object.keys(names)
      : me.role === "MANAGER"
        ? Object.keys(names).filter((x) => x !== "PORTFOLIO")
        : me.role === "INSPECTOR"
          ? ["PROJECT_PROGRESS", "MEASUREMENTS", "QUALITY", "DAILY_LOG"]
          : me.role === "FINANCIER"
            ? [
                "PROJECT_EXECUTIVE",
                "PROJECT_PROGRESS",
                "FINANCIAL",
                "MEASUREMENTS",
                "QUALITY",
                "FUNDING",
              ]
            : ["PROJECT_EXECUTIVE", "PROJECT_PROGRESS", "QUALITY"];
  const allowed = advanced
    ? roleAllowed
    : roleAllowed.filter((v) => v === "PROJECT_PROGRESS");
  return (
    <>
      <h1>Relatórios</h1>
      <p>
        Geração assíncrona. Os ficheiros ficam disponíveis durante sete dias.
      </p>
      {error && <Notice error>{error}</Notice>}
      <Card title="Solicitar relatório">
        <form onSubmit={create}>
          <label>
            Tipo{" "}
            <select
              value={allowed.includes(type) ? type : allowed[0]}
              onChange={(e) => setType(e.target.value)}
            >
              {allowed.map((x) => (
                <option key={x} value={x}>
                  {names[x]}
                </option>
              ))}
            </select>
          </label>
          {type !== "PORTFOLIO" && (
            <label>
              Obra{" "}
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                required
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Formato{" "}
            <select value={format} onChange={(e) => setFormat(e.target.value)}>
              <option>PDF</option>
              <option>XLSX</option>
            </select>
          </label>
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
          <button disabled={busy}>Gerar relatório</button>
        </form>
      </Card>
      <Card title="Os meus relatórios">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Formato</th>
                <th>Estado</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {items.map((x) => (
                <tr key={x.id}>
                  <td>{names[x.reportType]}</td>
                  <td>{x.format}</td>
                  <td>
                    {x.status}
                    {x.errorMessage && ` · ${x.errorMessage}`}
                  </td>
                  <td>
                    {x.status === "COMPLETED" && (
                      <button onClick={() => download(x.id)}>
                        Descarregar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
export function Gallery({ id }: { id: string }) {
  const [items, setItems] = useState<
      { id: string; fileName: string; url: string; createdAt: string }[]
    >([]),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [error, setError] = useState(""),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [filters, setFilters] = useState({
      daily_log: "",
      inspection: "",
      activity: "",
    }),
    [options, setOptions] = useState<
      Record<string, { id: string; label: string }[]>
    >({});
  useEffect(() => {
    setPage(1);
    setFilters({ daily_log: "", inspection: "", activity: "" });
    const sources = [
      ["daily_log", "daily-logs"],
      ["inspection", "inspections"],
      ["activity", "schedule/tasks"],
    ];
    void Promise.all(
      sources.map(async ([key, endpoint]) => {
        try {
          const result = await api<{
            items: {
              id: string;
              code?: string;
              name?: string;
              logDate?: string;
            }[];
          }>(`/projects/${id}/${endpoint}?limit=100`);
          return [
            key,
            result.items.map((x) => ({
              id: x.id,
              label: x.code
                ? `${x.code} ${x.name ?? ""}`
                : (x.logDate?.slice(0, 10) ?? x.name ?? "Registo"),
            })),
          ] as const;
        } catch {
          return [key, []] as const;
        }
      }),
    ).then((entries) => setOptions(Object.fromEntries(entries)));
  }, [id]);
  useEffect(() => {
    const q = new URLSearchParams();
    if (from) q.set("date_from", from);
    if (to) q.set("date_to", to);
    q.set("page", String(page));
    for (const [key, value] of Object.entries(filters))
      if (value) q.set(key, value);
    setError("");
    api<{ items: typeof items; total: number }>(`/projects/${id}/gallery?${q}`)
      .then((x) => {
        setItems(x.items);
        setTotal(x.total);
      })
      .catch((e) => setError(e.message));
  }, [id, from, to, page, filters]);
  return (
    <>
      <h1>Galeria da obra</h1>
      <Link href={`/projects/${id}`}>Voltar à obra</Link>
      <div>
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
      </div>
      <div className="analytics-filters">
        {(
          [
            ["daily_log", "Diário"],
            ["inspection", "Inspeção"],
            ["activity", "Atividade"],
          ] as const
        ).map(([key, title]) => (
          <label key={key}>
            {title}
            <select
              value={filters[key]}
              onChange={(e) => {
                setFilters({ ...filters, [key]: e.target.value });
                setPage(1);
              }}
            >
              <option value="">Todos</option>
              {(options[key] ?? []).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {error && <Notice error>{error}</Notice>}
      <div className="analytics-grid">
        {items.map((x) => (
          <figure key={x.id}>
            <img
              src={x.url}
              alt={x.fileName}
              loading="lazy"
              style={{ maxWidth: "100%", height: 200, objectFit: "contain" }}
            />
            <figcaption>
              {x.fileName} · {new Date(x.createdAt).toLocaleDateString("pt-MZ")}
            </figcaption>
          </figure>
        ))}
      </div>
      {total > 24 && (
        <nav aria-label="Páginas da galeria">
          <button disabled={page === 1} onClick={() => setPage(page - 1)}>
            Anterior
          </button>
          <span>
            {" "}
            Página {page} de {Math.ceil(total / 24)}{" "}
          </span>
          <button
            disabled={page * 24 >= total}
            onClick={() => setPage(page + 1)}
          >
            Seguinte
          </button>
        </nav>
      )}
      {!items.length && <p>Sem fotografias autorizadas neste período.</p>}
    </>
  );
}
export function ProjectFiles({ photos = false }: { photos?: boolean }) {
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]),
    [id, setId] = useState(""),
    [documents, setDocuments] = useState<
      { id: string; fileName: string; url: string }[]
    >([]),
    [error, setError] = useState("");
  useEffect(() => {
    api<typeof projects>("/projects")
      .then((x) => {
        setProjects(x);
        setId(x[0]?.id ?? "");
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (id && !photos)
      api<{ items: typeof documents }>(`/projects/${id}/documents`)
        .then((x) => setDocuments(x.items))
        .catch((e) => setError(e.message));
  }, [id, photos]);
  return (
    <>
      <h1>{photos ? "Fotografias" : "Documentos"}</h1>
      <label>
        Obra{" "}
        <select value={id} onChange={(e) => setId(e.target.value)}>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      {error && <Notice error>{error}</Notice>}
      {id &&
        (photos ? (
          <Gallery id={id} />
        ) : (
          <Card title="Documentos autorizados">
            <ul>
              {documents.map((x) => (
                <li key={x.id}>
                  <a href={x.url}>{x.fileName}</a>
                </li>
              ))}
            </ul>
            {!documents.length && <p>Sem documentos autorizados.</p>}
          </Card>
        ))}
    </>
  );
}
export function AlertSettings() {
  const [data, setData] = useState<Record<string, number | boolean>>(),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  useEffect(() => {
    api<Record<string, number | boolean>>("/alert-settings")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  const labels: Record<string, string> = {
    scheduleDelayThresholdPP: "Desvio de progresso (pontos percentuais)",
    fundingLowThresholdPercentage: "Saldo de financiamento mínimo (%)",
    contractExpiryDays: "Antecedência de fim de contrato (dias)",
    missingDailyLogDays: "Dias sem diário aprovado",
    enableEmail: "Ativar e-mail",
    enableInApp: "Ativar notificações na aplicação",
  };
  async function save(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      await api(
        "/alert-settings",
        send(
          "PATCH",
          Object.fromEntries(Object.keys(labels).map((k) => [k, data?.[k]])),
        ),
      );
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <h1>Configuração de alertas</h1>
      {error && <Notice error>{error}</Notice>}
      {saved && <Notice>Configuração guardada.</Notice>}
      {data && (
        <form onSubmit={save}>
          {Object.entries(labels).map(([k, l]) => (
            <label key={k} style={{ display: "block", padding: 8 }}>
              {l}{" "}
              {k.startsWith("enable") ? (
                <input
                  type="checkbox"
                  checked={Boolean(data[k])}
                  onChange={(e) => setData({ ...data, [k]: e.target.checked })}
                />
              ) : (
                <input
                  type="number"
                  min={k.endsWith("Days") ? 1 : 0}
                  max={k.endsWith("Days") ? 365 : 100}
                  step={k.endsWith("Days") ? 1 : 0.01}
                  value={Number(data[k])}
                  onChange={(e) =>
                    setData({ ...data, [k]: Number(e.target.value) })
                  }
                />
              )}
            </label>
          ))}
          <button>Guardar configuração</button>
        </form>
      )}
    </>
  );
}
