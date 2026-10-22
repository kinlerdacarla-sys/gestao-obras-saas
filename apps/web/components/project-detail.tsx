"use client";
import { useEffect, useState } from "react";
import { Notice } from "@obras/ui";
import {
  api,
  send,
  labels,
  type Project,
  type Member,
  type Organization,
} from "../lib/api";
import { useMe } from "./shell";
import { ProjectForm } from "./projects";
import Link from "next/link";
import { BudgetDashboard } from "./budget/common";
import { OperationalDashboard } from "./execution/common";
import {
  ProjectOverview,
  ProjectParticipants,
  ProjectOrganizations,
  type Participant,
  type LinkedOrganization,
} from "./project-sections";
export function ProjectDetail({ id }: { id: string }) {
  const me = useMe();
  const [project, setProject] = useState<Project>(),
    [participants, setParticipants] = useState<Participant[]>([]),
    [organizations, setOrganizations] = useState<LinkedOrganization[]>([]),
    [users, setUsers] = useState<Member[]>([]),
    [available, setAvailable] = useState<Organization[]>([]),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [edit, setEdit] = useState(false),
    [busy, setBusy] = useState(false);
  const admin = me.role === "ADMIN";
  const canEdit =
    admin ||
    (me.role === "MANAGER" &&
      participants.some(
        (p) =>
          p.userId === me.user.id &&
          p.role === "MANAGER" &&
          p.status === "ACTIVE",
      ));
  async function load() {
    const [p, u, o] = await Promise.all([
      api<Project>(`/projects/${id}`),
      api<Participant[]>(`/projects/${id}/users`),
      api<LinkedOrganization[]>(`/projects/${id}/organizations`),
    ]);
    setProject(p);
    setParticipants(u);
    setOrganizations(o);
    if (admin) {
      setUsers(await api<Member[]>("/users"));
      setAvailable(await api<Organization[]>("/organizations"));
    }
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [id]);
  async function mutate(path: string, method: string, data?: unknown) {
    setError("");
    setBusy(true);
    try {
      await api(path, send(method, data));
      setSuccess("Alteração guardada");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function add(e: React.SubmitEvent<HTMLFormElement>, kind: string) {
    e.preventDefault();
    void mutate(
      `/projects/${id}/${kind}`,
      "POST",
      Object.fromEntries(new FormData(e.currentTarget)),
    );
  }
  if (!project)
    return error ? (
      <Notice error>{error}</Notice>
    ) : (
      <p role="status">A carregar obraâ€¦</p>
    );
  return (
    <>
      <div className="heading">
        <div>
          <span className="eyebrow">{project.code} · Obra</span>
          <h1>{project.name}</h1>
          <span className="badge">{labels[project.status]}</span>
        </div>
        {canEdit && <button onClick={() => setEdit(true)}>Editar obra</button>}
      </div>
      <div className="tabs">
        <Link className="button" href={`/projects/${id}/quality`}>
          Fiscalização e qualidade
        </Link>
        <Link className="button" href={`/projects/${id}/schedule`}>
          Cronograma
        </Link>
        <Link className="button" href={`/projects/${id}/daily-logs`}>
          Diário
        </Link>
        <Link className="button" href={`/projects/${id}/budget`}>
          Orçamento
        </Link>
        {["Visão Geral", "Medições", "Financeiro", "Documentos"].map(
          (tab, i) => (
            <button
              key={tab}
              disabled={i !== 0}
              title={i ? "Disponível numa próxima milestone" : undefined}
            >
              {tab}
            </button>
          ),
        )}
      </div>
      {error && <Notice error>{error}</Notice>}
      {success && <Notice>{success}</Notice>}
      {edit && (
        <ProjectForm
          initial={project}
          manager={!admin}
          onCancel={() => setEdit(false)}
          onSave={async (data) => {
            await api(`/projects/${id}`, send("PATCH", data));
            setEdit(false);
            setSuccess("Obra atualizada");
            await load();
          }}
        />
      )}
      <ProjectOverview project={project} />
      <BudgetDashboard id={id} />
      <OperationalDashboard id={id} />
      <section className="card">
        <h2>Medições e financiamento</h2>
        <nav className="budget-nav">
          <Link href={`/projects/${id}/measurements`}>Medições</Link>
          {me.role !== "INSPECTOR" && (
            <>
              <Link href={`/projects/${id}/financial`}>Financeiro</Link>
              <Link href={`/projects/${id}/funding`}>Financiamento</Link>
              <Link href={`/projects/${id}/payments`}>Pagamentos</Link>
            </>
          )}
        </nav>
      </section>
      {me.role !== "CLIENT" && (
        <section className="card">
          <h2>Gestão comercial</h2>
          <nav className="budget-nav">
            <Link href={`/projects/${id}/contracts`}>Contratos</Link>
            {["ADMIN", "MANAGER"].includes(me.role) && (
              <>
                <Link href={`/projects/${id}/expenses`}>Despesas</Link>
                <Link href={`/projects/${id}/cost-centers`}>
                  Centros de custo
                </Link>
              </>
            )}
            {me.role !== "INSPECTOR" && (
              <Link href={`/projects/${id}/costs`}>Custos</Link>
            )}
          </nav>
        </section>
      )}
      <ProjectParticipants
        id={id}
        participants={participants}
        users={users}
        admin={admin}
        busy={busy}
        add={add}
        mutate={mutate}
      />
      <ProjectOrganizations
        id={id}
        organizations={organizations}
        available={available}
        admin={admin}
        busy={busy}
        add={add}
        mutate={mutate}
      />
    </>
  );
}
