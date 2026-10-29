"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { send } from "../lib/api";
import { UsageBars, type Plan } from "./saas-settings";
async function platform<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api/v1/platform${path}`, {
    ...options,
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
  });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && path !== "/auth/login")
      window.location.assign("/platform/login");
    throw Error(data.message ?? "Operação indisponível");
  }
  return data;
}
interface Session {
  id: string;
  tenantName?: string;
  expiresAt: string;
  reason: string;
}
interface Detail {
  tenant: { id: string; name: string; slug: string; status: string };
  usage: Record<string, string>;
  limits: Plan["limits"];
  subscription: {
    version: number;
    status: string;
    billingCycle: string;
    trialEnd: string | null;
    currentPeriodEnd: string;
  } | null;
  users: {
    role: string;
    status: string;
    user: { id: string; name: string; email: string };
  }[];
  projects: { id: string; name: string; code: string; status: string }[];
  audit: { id: string; action: string; createdAt: string }[];
}
export function PlatformLogin() {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function login(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await platform(
        "/auth/login",
        send("POST", {
          email: form.get("email"),
          password: form.get("password"),
        }),
      );
      window.location.assign("/platform");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="main saas-form">
      <h1>Acesso à plataforma</h1>
      <p>Área reservada aos operadores da plataforma.</p>
      {error && <p role="alert">{error}</p>}
      <form className="card" onSubmit={login}>
        <label>
          E-mail
          <input name="email" type="email" required autoComplete="username" />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
          />
        </label>
        <button disabled={busy}>Entrar na plataforma</button>
      </form>
      <Link href="/login">Login da empresa</Link>
    </main>
  );
}
export function PlatformConsole({
  tenantId,
  listOnly = false,
}: {
  tenantId?: string;
  listOnly?: boolean;
}) {
  const [me, setMe] = useState<{ id: string; role: string } | null>(null),
    [error, setError] = useState(""),
    [detail, setDetail] = useState<Detail | null>(null),
    [tab, setTab] = useState("Overview"),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [tenants, setTenants] = useState<{
      items: Detail["tenant"][];
      total: number;
    }>({ items: [], total: 0 }),
    [dashboard, setDashboard] = useState<{
      tenants: { status: string; _count: number }[];
      subscriptions: { status: string; _count: number }[];
      users: number;
      projects: number;
      storageBytes: string;
    } | null>(null),
    [reason, setReason] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [busy, setBusy] = useState(false),
    [operators, setOperators] = useState<
      { id: string; user: { name: string; email: string }; role: string }[]
    >([]),
    [operator, setOperator] = useState(""),
    [sessions, setSessions] = useState<Session[]>([]),
    [support, setSupport] = useState<{
      session: Session;
      tenant: { name: string; status: string };
      banner: string;
      usage: Record<string, string>;
    } | null>(null),
    [now, setNow] = useState(Date.now());
  async function loadDetail() {
    if (tenantId) setDetail(await platform<Detail>(`/tenants/${tenantId}`));
  }
  useEffect(() => {
    platform<{ id: string; role: string }>("/me")
      .then(async (m) => {
        setMe(m);
        setSessions(await platform<Session[]>("/support-sessions"));
        if (m.role === "SUPER_ADMIN") {
          if (tenantId) {
            await loadDetail();
            setOperators(await platform("/operators"));
          } else if (!listOnly) setDashboard(await platform("/dashboard"));
        }
      })
      .catch((e) => setError(e.message));
  }, [tenantId, listOnly]);
  useEffect(() => {
    if (me?.role === "SUPER_ADMIN" && !tenantId)
      platform<typeof tenants>(
        `/tenants?search=${encodeURIComponent(search)}&page=${page}`,
      )
        .then(setTenants)
        .catch((e) => setError(e.message));
  }, [me, tenantId, search, page]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  async function status(action: string) {
    if (!detail || confirmation !== detail.tenant.slug) return;
    setBusy(true);
    setError("");
    try {
      await platform(
        `/tenants/${tenantId}/${action}`,
        send("POST", { reason }),
      );
      await loadDetail();
      setReason("");
      setConfirmation("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function subscriptionStatus(status: string) {
    if (!detail?.subscription) return;
    setBusy(true);
    setError("");
    try {
      await platform(
        `/tenants/${tenantId}/subscription/status`,
        send("POST", { status, version: detail.subscription.version, reason }),
      );
      await loadDetail();
      setReason("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function openSupport(id: string) {
    setError("");
    try {
      setSupport(await platform(`/support-sessions/${id}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function grant(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const s = await platform<Session>(
        "/support-sessions",
        send("POST", { tenantId, platformUserId: operator, reason }),
      );
      setSessions(await platform("/support-sessions"));
      if (operator === me?.id) await openSupport(s.id);
      setReason("");
      await loadDetail();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function end() {
    if (!support) return;
    try {
      await platform(
        `/support-sessions/${support.session.id}/end`,
        send("POST"),
      );
      setSupport(null);
      setSessions(await platform("/support-sessions"));
      await loadDetail();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const supportActive =
    support && new Date(support.session.expiresAt).getTime() > now;
  return (
    <main className="main">
      <header className="topbar">
        <Link href="/platform">Plataforma Obras</Link>
        <nav>
          <Link href="/platform/tenants">Empresas</Link>{" "}
          <button
            className="secondary"
            onClick={() =>
              void platform("/auth/logout", send("POST"))
                .then(() => window.location.assign("/platform/login"))
                .catch((e) => setError(e.message))
            }
          >
            Sair
          </button>
        </nav>
      </header>
      {support && (
        <aside className="support-banner" role="status">
          <strong>{support.banner}</strong>
          <p>
            {supportActive
              ? `Sessão de leitura · expira em ${Math.ceil((new Date(support.session.expiresAt).getTime() - now) / 60000)} min`
              : "Sessão expirada. Acesso de suporte encerrado."}
          </p>
          <button onClick={() => void end()}>Encerrar sessão</button>
          {supportActive && (
            <>
              <p>
                Empresa: {support.tenant.name} · {support.tenant.status}
              </p>
              <dl>
                {Object.entries(support.usage).map(([key, value]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
        </aside>
      )}
      {error && <p role="alert">{error}</p>}
      {!me ? (
        <p>A carregar…</p>
      ) : (
        <>
          {me.role === "SUPER_ADMIN" && !tenantId && (
            <>
              <h1>{listOnly ? "Empresas" : "Dashboard da plataforma"}</h1>
              {dashboard && (
                <div className="saas-grid">
                  <article className="card">
                    <h2>Empresas</h2>
                    {dashboard.tenants.map((x) => (
                      <p key={x.status}>
                        {x.status}: {x._count}
                      </p>
                    ))}
                  </article>
                  <article className="card">
                    <h2>Subscrições e trials</h2>
                    {dashboard.subscriptions.map((x) => (
                      <p key={x.status}>
                        {x.status}: {x._count}
                      </p>
                    ))}
                  </article>
                  <article className="card">
                    <h2>Operação</h2>
                    <p>Utilizadores: {dashboard.users}</p>
                    <p>Obras: {dashboard.projects}</p>
                    <p>
                      Storage:{" "}
                      {(Number(dashboard.storageBytes) / 1073741824).toFixed(2)}{" "}
                      GiB
                    </p>
                  </article>
                </div>
              )}
              <label>
                Pesquisar empresa
                <input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                />
              </label>
              <ul>
                {tenants.items.map((t) => (
                  <li className="card" key={t.id}>
                    <Link href={`/platform/tenants/${t.id}`}>
                      <strong>{t.name}</strong> · {t.slug} · {t.status}
                    </Link>
                  </li>
                ))}
              </ul>
              <p>
                {tenants.total} empresas · página {page}
              </p>
              <button disabled={page === 1} onClick={() => setPage(page - 1)}>
                Anterior
              </button>
              <button
                disabled={page * 25 >= tenants.total}
                onClick={() => setPage(page + 1)}
              >
                Seguinte
              </button>
            </>
          )}
          {detail && me.role === "SUPER_ADMIN" && (
            <>
              <h1>{detail.tenant.name}</h1>
              <nav className="saas-actions" aria-label="Detalhes da empresa">
                {[
                  "Overview",
                  "Subscription",
                  "Usage",
                  "Users",
                  "Projects",
                  "Audit",
                  "Support",
                ].map((t) => (
                  <button
                    key={t}
                    className={tab === t ? "" : "secondary"}
                    onClick={() => setTab(t)}
                  >
                    {t}
                  </button>
                ))}
              </nav>
              <section className="card">
                {tab === "Overview" && (
                  <>
                    <h2>Estado: {detail.tenant.status}</h2>
                    <p>Identificador: {detail.tenant.slug}</p>
                    <label>
                      Motivo
                      <textarea
                        minLength={10}
                        maxLength={2000}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      />
                    </label>
                    <label>
                      Escreva {detail.tenant.slug} para confirmar
                      <input
                        value={confirmation}
                        onChange={(e) => setConfirmation(e.target.value)}
                      />
                    </label>
                    {["ACTIVE", "SUSPENDED"].includes(detail.tenant.status) && (
                      <button
                        disabled={
                          busy ||
                          reason.trim().length < 10 ||
                          confirmation !== detail.tenant.slug
                        }
                        onClick={() =>
                          void status(
                            detail.tenant.status === "ACTIVE"
                              ? "suspend"
                              : "reactivate",
                          )
                        }
                      >
                        {detail.tenant.status === "ACTIVE"
                          ? "Suspender empresa"
                          : "Reativar empresa"}
                      </button>
                    )}
                  </>
                )}
                {tab === "Subscription" && (
                  <>
                    <h2>Subscrição</h2>
                    {detail.subscription ? (
                      <>
                        <p>
                          {detail.subscription.status} ·{" "}
                          {detail.subscription.billingCycle}
                        </p>
                        <p>
                          Fim do período:{" "}
                          {new Date(
                            detail.subscription.currentPeriodEnd,
                          ).toLocaleString("pt-MZ")}
                        </p>
                        <label>
                          Motivo da alteração
                          <textarea
                            minLength={10}
                            maxLength={2000}
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                          />
                        </label>
                        <div className="saas-actions">
                          {["ACTIVE", "PAST_DUE", "SUSPENDED"]
                            .filter((v) => v !== detail.subscription!.status)
                            .map((status) => (
                              <button
                                key={status}
                                disabled={busy || reason.trim().length < 10}
                                onClick={() => void subscriptionStatus(status)}
                              >
                                Alterar para {status}
                              </button>
                            ))}
                        </div>
                        {detail.subscription.trialEnd && (
                          <p>
                            Fim do trial:{" "}
                            {new Date(
                              detail.subscription.trialEnd,
                            ).toLocaleString("pt-MZ")}
                          </p>
                        )}
                      </>
                    ) : (
                      <p>Sem subscrição configurada.</p>
                    )}
                  </>
                )}
                {tab === "Usage" && (
                  <UsageBars
                    data={{ usage: detail.usage, limits: detail.limits }}
                  />
                )}
                {tab === "Users" && (
                  <>
                    <h2>Utilizadores</h2>
                    <p>Até 100 registos.</p>
                    <ul>
                      {detail.users.map((u) => (
                        <li key={u.user.id}>
                          {u.user.name} · {u.user.email} · {u.role} · {u.status}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {tab === "Projects" && (
                  <>
                    <h2>Obras</h2>
                    <p>Até 100 registos.</p>
                    <ul>
                      {detail.projects.map((p) => (
                        <li key={p.id}>
                          {p.code} · {p.name} · {p.status}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {tab === "Audit" && (
                  <>
                    <h2>Auditoria da plataforma</h2>
                    <ul>
                      {detail.audit.map((a) => (
                        <li key={a.id}>
                          {new Date(a.createdAt).toLocaleString("pt-MZ")} ·{" "}
                          {a.action}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {tab === "Support" && (
                  <form onSubmit={grant}>
                    <h2>Autorizar sessão de suporte</h2>
                    <p>
                      A sessão dura 15 minutos e permite apenas diagnóstico de
                      leitura.
                    </p>
                    <label>
                      Operador
                      <select
                        required
                        value={operator}
                        onChange={(e) => setOperator(e.target.value)}
                      >
                        <option value="">Selecionar</option>
                        {operators.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.user.name} · {o.role}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Motivo
                      <textarea
                        required
                        minLength={10}
                        maxLength={2000}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      />
                    </label>
                    <button disabled={busy}>Iniciar sessão autorizada</button>
                  </form>
                )}
              </section>
            </>
          )}
          {me.role === "SUPPORT" && (
            <>
              <h1>Suporte da plataforma</h1>
              <p>
                Selecione uma sessão autorizada por um Super Admin. Não existe
                acesso geral aos dados das empresas.
              </p>
            </>
          )}
          <section className="card">
            <h2>As minhas sessões de suporte</h2>
            {sessions.length === 0 ? (
              <p>Nenhuma sessão autorizada ativa.</p>
            ) : (
              sessions.map((s) => (
                <div key={s.id}>
                  <p>
                    {s.tenantName} · {s.reason}
                  </p>
                  <button onClick={() => void openSupport(s.id)}>
                    Abrir suporte
                  </button>
                </div>
              ))
            )}
          </section>
        </>
      )}
    </main>
  );
}
