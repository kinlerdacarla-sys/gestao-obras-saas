"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, send } from "../lib/api";
import { useMe } from "./shell";
export interface Plan {
  id: string;
  name: string;
  description: string | null;
  trialDays: number;
  monthlyPrice: string | null;
  annualPrice: string | null;
  currency: string;
  limits: { limitKey: string; limitValue: number | null; unlimited: boolean }[];
  features: { enabled: boolean; feature: { code: string; name: string } }[];
}
interface Subscription {
  subscription: {
    version: number;
    billingCycle: string;
    trialEnd: string | null;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
  };
  plan: Plan;
  effectiveStatus: string;
}
interface Usage {
  usage: Record<string, string>;
  limits: Plan["limits"];
}
const names: Record<string, string> = {
  ACTIVE_PROJECTS: "Obras ativas",
  USERS: "Utilizadores",
  STORAGE_GB: "Armazenamento (GiB)",
  MONTHLY_REPORTS: "Relatórios neste mês",
  MONTHLY_AI_ACTIONS: "Ações de IA neste mês",
};
const date = (value: string) => new Date(value).toLocaleDateString("pt-MZ");
export function UsageBars({ data }: { data: Usage }) {
  return (
    <div className="saas-grid">
      {data.limits.map((l) => {
        const used =
          Number(data.usage[l.limitKey] ?? 0) /
          (l.limitKey === "STORAGE_GB" ? 1073741824 : 1);
        const percent = l.unlimited
          ? 0
          : l.limitValue
            ? (used / l.limitValue) * 100
            : used > 0
              ? 100
              : 0;
        return (
          <article className="card" key={l.limitKey}>
            <h3>{names[l.limitKey] ?? l.limitKey}</h3>
            <p>
              {used.toLocaleString("pt-MZ", { maximumFractionDigits: 2 })} /{" "}
              {l.unlimited ? "Ilimitado" : l.limitValue}
            </p>
            {!l.unlimited && (
              <progress
                aria-label={names[l.limitKey]}
                value={Math.min(percent, 100)}
                max={100}
              />
            )}
            {percent >= 80 && (
              <p role="status" className="saas-warning">
                {percent >= 100
                  ? "Limite atingido"
                  : percent >= 90
                    ? "Atenção: utilização acima de 90%"
                    : "Utilização acima de 80%"}
                . Reveja o plano antes de adicionar recursos.
              </p>
            )}
          </article>
        );
      })}
    </div>
  );
}
export function SubscriptionSettings() {
  const me = useMe();
  const [data, setData] = useState<Subscription | null>(null),
    [usage, setUsage] = useState<Usage | null>(null),
    [plans, setPlans] = useState<Plan[]>([]),
    [selected, setSelected] = useState(""),
    [cycle, setCycle] = useState("MANUAL"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [cancel, setCancel] = useState(false),
    [sales, setSales] = useState<string | null>(null);
  async function load() {
    const [s, u, p, c] = await Promise.all([
      api<Subscription>("/subscription"),
      api<Usage>("/usage"),
      api<Plan[]>("/plans"),
      api<{ salesEmail: string | null }>("/onboarding/config"),
    ]);
    setData(s);
    setUsage(u);
    setPlans(p);
    setCycle(s.subscription.billingCycle);
    setSales(c.salesEmail);
  }
  useEffect(() => {
    if (me.role === "ADMIN") void load().catch((e) => setError(e.message));
  }, [me.role]);
  async function action(kind: "change-plan" | "cancel") {
    if (!data) return;
    setBusy(true);
    setError("");
    try {
      await api(
        `/subscription/${kind}`,
        send("POST", {
          version: data.subscription.version,
          ...(kind === "change-plan"
            ? { planId: selected, billingCycle: cycle }
            : { mode: "end_of_period" }),
        }),
      );
      setSelected("");
      setCancel(false);
      await load();
      setNotice("Subscrição atualizada.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (me.role !== "ADMIN")
    return <p role="alert">Apenas administradores podem gerir a subscrição.</p>;
  const candidate = plans.find((p) => p.id === selected);
  const blockers =
    candidate?.limits.flatMap((l) => {
      if (!usage || l.unlimited) return [];
      const current =
        Number(usage.usage[l.limitKey] ?? 0) /
        (l.limitKey === "STORAGE_GB" ? 1073741824 : 1);
      return current > (l.limitValue ?? 0)
        ? [
            `${names[l.limitKey]}: este plano permite ${l.limitValue}, mas a empresa utiliza ${current.toLocaleString("pt-MZ", { maximumFractionDigits: 2 })}.`,
          ]
        : [];
    }) ?? [];
  return (
    <>
      <h1>Subscrição</h1>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!data ? (
        <p>A carregar…</p>
      ) : (
        <>
          <section className="card">
            <h2>{data.plan.name}</h2>
            <p>
              Estado: {data.effectiveStatus} · Ciclo:{" "}
              {data.subscription.billingCycle}
            </p>
            <p>
              Período: {date(data.subscription.currentPeriodStart)} —{" "}
              {date(data.subscription.currentPeriodEnd)}
            </p>
            {data.subscription.trialEnd && (
              <p>Fim do trial: {date(data.subscription.trialEnd)}</p>
            )}
            {!["ACTIVE", "TRIALING"].includes(data.effectiveStatus) && (
              <p role="status">
                A subscrição está em modo de leitura. A faturação e a exportação
                de dados continuam disponíveis.
              </p>
            )}
            {data.subscription.cancelAtPeriodEnd && (
              <p>Cancelamento agendado para o final do período.</p>
            )}
            {sales ? (
              <a href={`mailto:${sales}`}>Contactar equipa comercial</a>
            ) : (
              <p className="muted">
                Contacte o operador da plataforma para condições comerciais.
              </p>
            )}
          </section>
          {usage && <UsageBars data={usage} />}
          <h2>Comparar planos</h2>
          <div className="saas-grid">
            {plans.map((p) => (
              <article className="card" key={p.id}>
                <h3>{p.name}</h3>
                <p>{p.description}</p>
                <p>
                  {p.monthlyPrice === null
                    ? "Preço sob consulta"
                    : `${p.monthlyPrice} ${p.currency} / mês`}
                </p>
                <ul>
                  {p.limits.map((l) => (
                    <li key={l.limitKey}>
                      {names[l.limitKey]}:{" "}
                      {l.unlimited ? "Ilimitado" : l.limitValue}
                    </li>
                  ))}
                </ul>
                <ul>
                  {p.features
                    .filter((f) => f.enabled)
                    .map((f) => (
                      <li key={f.feature.code}>{f.feature.name}</li>
                    ))}
                </ul>
                <button
                  disabled={
                    busy ||
                    p.id === data.plan.id ||
                    !["ACTIVE", "TRIALING"].includes(data.effectiveStatus)
                  }
                  onClick={() => {
                    setSelected(p.id);
                    setCancel(false);
                    setNotice("");
                  }}
                >
                  {p.id === data.plan.id
                    ? "Plano atual"
                    : `Selecionar ${p.name}`}
                </button>
              </article>
            ))}
          </div>
          {candidate && (
            <section className="card" aria-label="Confirmar alteração de plano">
              <h2>Confirmar {candidate.name}</h2>
              <label>
                Ciclo de faturação
                <select
                  value={cycle}
                  onChange={(e) => setCycle(e.target.value)}
                >
                  <option value="MANUAL">Manual</option>
                  <option value="MONTHLY">Mensal</option>
                  <option value="ANNUAL">Anual</option>
                </select>
              </label>
              <p>
                A faturação é manual. Esta alteração não efetua um pagamento
                online.
              </p>
              {blockers.map((b) => (
                <p role="alert" key={b}>
                  {b}
                </p>
              ))}
              <button
                disabled={busy || blockers.length > 0}
                onClick={() => void action("change-plan")}
              >
                Confirmar alteração
              </button>
              <button className="secondary" onClick={() => setSelected("")}>
                Voltar
              </button>
            </section>
          )}
          {["ACTIVE", "TRIALING"].includes(data.effectiveStatus) &&
            !data.subscription.cancelAtPeriodEnd && (
              <section className="card">
                <button className="secondary" onClick={() => setCancel(true)}>
                  Cancelar subscrição
                </button>
                {cancel && (
                  <>
                    <p>
                      O acesso operacional termina em{" "}
                      {date(data.subscription.currentPeriodEnd)}. Os dados são
                      preservados.
                    </p>
                    <button
                      disabled={busy}
                      onClick={() => void action("cancel")}
                    >
                      Confirmar cancelamento no final do período
                    </button>
                  </>
                )}
              </section>
            )}
          <Link href="/settings/billing">Consultar faturação</Link>
        </>
      )}
    </>
  );
}
interface Invoice {
  id: string;
  invoiceNumber: string | null;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
  dueDate: string | null;
  totalAmount: string;
  currency: string;
  status: string;
}
export function BillingSettings() {
  const me = useMe(),
    [rows, setRows] = useState<Invoice[] | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    if (me.role === "ADMIN")
      api<Invoice[]>("/billing/invoices")
        .then(setRows)
        .catch((e) => setError(e.message));
  }, [me.role]);
  if (me.role !== "ADMIN")
    return (
      <p role="alert">Apenas administradores podem consultar a faturação.</p>
    );
  return (
    <>
      <h1>Faturação</h1>
      <p>
        Faturação manual. Para pagamento ou esclarecimentos, contacte o
        operador.
      </p>
      {error && <p role="alert">{error}</p>}
      {rows === null ? (
        <p>A carregar…</p>
      ) : rows.length === 0 ? (
        <section className="card">
          <h2>Ainda não existem faturas</h2>
          <p>As faturas emitidas para a sua empresa aparecerão aqui.</p>
          <Link href="/settings/subscription">Ver subscrição</Link>
        </section>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {[
                  "Número",
                  "Período",
                  "Emissão",
                  "Vencimento",
                  "Montante",
                  "Estado",
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id}>
                  <td>{i.invoiceNumber ?? "Rascunho"}</td>
                  <td>
                    {date(i.periodStart)} — {date(i.periodEnd)}
                  </td>
                  <td>{date(i.createdAt)}</td>
                  <td>{i.dueDate ? date(i.dueDate) : "—"}</td>
                  <td>
                    {i.totalAmount} {i.currency}
                  </td>
                  <td>{i.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
interface ExportJob {
  id: string;
  status: string;
  createdAt: string;
  expiresAt: string;
  errorCode?: string | null;
  downloadUrl?: string | null;
}
export function DataExportSettings() {
  const me = useMe(),
    [rows, setRows] = useState<ExportJob[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    setRows(await api<ExportJob[]>("/data-exports"));
  }
  useEffect(() => {
    if (me.role !== "ADMIN") return;
    const refresh = () => void load().catch((e) => setError(e.message));
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [me.role]);
  async function request() {
    setBusy(true);
    setError("");
    try {
      await api("/data-exports", send("POST"));
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function download(id: string) {
    try {
      const job = await api<ExportJob>(`/data-exports/${id}`);
      if (!job.downloadUrl) throw Error("Exportação indisponível ou expirada");
      window.location.assign(job.downloadUrl);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (me.role !== "ADMIN")
    return <p role="alert">Apenas administradores podem exportar dados.</p>;
  return (
    <>
      <h1>Exportar dados da empresa</h1>
      <p>
        Receba os dados estruturados em JSON comprimido (.json.gz), incluindo
        metadados dos documentos. As palavras-passe e os tokens são excluídos. O
        ficheiro fica disponível durante 24 horas.
      </p>
      {error && <p role="alert">{error}</p>}
      <button disabled={busy} onClick={() => void request()}>
        Solicitar exportação
      </button>
      {rows.length === 0 && <p>Nenhuma exportação solicitada.</p>}
      <ul>
        {rows.map((row) => (
          <li className="card" key={row.id}>
            <p>
              {date(row.createdAt)} · {row.status}
            </p>
            <p>Expira em {new Date(row.expiresAt).toLocaleString("pt-MZ")}</p>
            {row.errorCode && (
              <p role="alert">
                Não foi possível gerar este ficheiro: {row.errorCode}
              </p>
            )}
            {row.status === "COMPLETED" && (
              <button onClick={() => void download(row.id)}>
                Descarregar exportação
              </button>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
