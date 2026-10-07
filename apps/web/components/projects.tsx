"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, Empty, Notice } from "@obras/ui";
import { api, send, labels, type Project } from "../lib/api";
import { useMe } from "./shell";
export function ProjectTable({ projects }: { projects: Project[] }) {
  return projects.length ? (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Obra</th>
            <th>Localização</th>
            <th>Estado</th>
            <th>Moeda</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => (
            <tr key={p.id}>
              <td>
                <Link href={`/projects/${p.id}`}>{p.name}</Link>
                <br />
                <small className="muted">{p.code}</small>
              </td>
              <td>{p.location ?? "—"}</td>
              <td>
                <span className="badge">{labels[p.status]}</span>
              </td>
              <td>MZN</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty>Ainda não existem obras disponíveis.</Empty>
  );
}
export function Dashboard() {
  const [data, setData] = useState<{
      total: number;
      active: number;
      completed: number;
      users: number | null;
      recent: Project[];
    }>(),
    [error, setError] = useState("");
  useEffect(() => {
    api<typeof data>("/dashboard")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <>
      <div className="heading">
        <div>
          <span className="eyebrow">Visão da empresa</span>
          <h1>Dashboard</h1>
          <p className="muted">O essencial para acompanhar as suas obras.</p>
        </div>
        <Link className="button" href="/projects">
          Ver obras →
        </Link>
      </div>
      {error && <Notice error>{error}</Notice>}
      {!data && !error ? (
        <p role="status">A carregar indicadores…</p>
      ) : (
        data && (
          <>
            <div className="stats">
              {[
                ["Total de obras", data.total],
                ["Obras ativas", data.active],
                ["Obras concluídas", data.completed],
                ["Utilizadores", data.users ?? "—"],
              ].map(([name, value]) => (
                <div className="card stat" key={name}>
                  <span className="muted">{name}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
            <Card title="Obras recentes">
              <ProjectTable projects={data.recent} />
            </Card>
          </>
        )
      )}
    </>
  );
}
export function ProjectForm({
  initial,
  onSave,
  onCancel,
  manager = false,
}: {
  initial?: Project;
  onSave: (data: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
  manager?: boolean;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const raw = Object.fromEntries(new FormData(e.currentTarget));
    const data: Record<string, unknown> = { ...raw };
    for (const field of [
      "description",
      "location",
      "startDate",
      "plannedEndDate",
      "contractValue",
    ])
      if (field in data && data[field] === "") data[field] = null;
    try {
      await onSave(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card title={initial ? "Editar obra" : "Nova obra"}>
      {error && <Notice error>{error}</Notice>}
      <form className="form grid" onSubmit={submit}>
        <label>
          Nome
          <input
            name="name"
            required
            maxLength={200}
            defaultValue={initial?.name}
          />
        </label>
        {!manager && (
          <label>
            Código
            <input
              name="code"
              required
              maxLength={50}
              defaultValue={initial?.code}
            />
          </label>
        )}
        <label>
          Localização
          <input
            name="location"
            maxLength={250}
            defaultValue={initial?.location ?? ""}
          />
        </label>
        <label>
          Estado
          <select name="status" defaultValue={initial?.status ?? "PLANNING"}>
            {["PLANNING", "ACTIVE", "SUSPENDED", "COMPLETED", "CANCELLED"].map(
              (s) => (
                <option key={s} value={s}>
                  {labels[s]}
                </option>
              ),
            )}
          </select>
        </label>
        <label>
          Data início
          <input
            name="startDate"
            type="date"
            defaultValue={initial?.startDate?.slice(0, 10)}
          />
        </label>
        <label>
          Data fim planeada
          <input
            name="plannedEndDate"
            type="date"
            defaultValue={initial?.plannedEndDate?.slice(0, 10)}
          />
        </label>
        {!manager && (
          <label>
            Valor contratual (MZN)
            <input
              name="contractValue"
              inputMode="decimal"
              pattern="[0-9]{1,16}(\.[0-9]{1,2})?"
              placeholder="0.00"
              defaultValue={initial?.contractValue ?? ""}
            />
          </label>
        )}
        <label className="wide">
          Descrição
          <textarea
            name="description"
            maxLength={5000}
            defaultValue={initial?.description ?? ""}
          />
        </label>
        <div className="actions wide">
          <button disabled={busy}>
            {busy ? "A guardar…" : "Guardar obra"}
          </button>
          <button type="button" className="secondary" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </form>
    </Card>
  );
}
export function Projects() {
  const me = useMe();
  const [projects, setProjects] = useState<Project[]>(),
    [error, setError] = useState(""),
    [creating, setCreating] = useState(false),
    [success, setSuccess] = useState("");
  const load = () =>
    api<Project[]>("/projects")
      .then(setProjects)
      .catch((e) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);
  return (
    <>
      <div className="heading">
        <div>
          <span className="eyebrow">Portefólio</span>
          <h1>Obras</h1>
          <p className="muted">As obras a que tem acesso, num só lugar.</p>
        </div>
        {me.role === "ADMIN" && (
          <button onClick={() => setCreating(true)}>Criar obra</button>
        )}
      </div>
      {error && <Notice error>{error}</Notice>}
      {success && <Notice>{success}</Notice>}
      {creating && (
        <ProjectForm
          onCancel={() => setCreating(false)}
          onSave={async (data) => {
            await api("/projects", send("POST", data));
            setCreating(false);
            setSuccess("Obra criada com sucesso");
            await load();
          }}
        />
      )}
      <Card>
        {projects ? (
          <ProjectTable projects={projects} />
        ) : (
          <p role="status">A carregar obras…</p>
        )}
      </Card>
    </>
  );
}
