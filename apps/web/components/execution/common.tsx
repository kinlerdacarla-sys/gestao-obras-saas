"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Notice } from "@obras/ui";
import { api } from "../../lib/api";
export const dateText = (value?: string | null) => value?.slice(0, 10) ?? "—";
export const today = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Maputo" });
export const stateNames: Record<string, string> = {
  DRAFT: "Rascunho",
  SUBMITTED: "Submetido",
  APPROVED: "Aprovado",
  REOPENED: "Reaberto",
  ACTIVE: "Ativo",
  COMPLETED: "Concluído",
  ARCHIVED: "Arquivado",
  NOT_STARTED: "Por iniciar",
  IN_PROGRESS: "Em curso",
  ON_HOLD: "Suspenso",
  CANCELLED: "Cancelado",
  ON_TIME: "No prazo",
  AT_RISK: "Em risco",
  DELAYED: "Atrasado",
  AHEAD: "Adiantado",
  SUMMARY: "Resumo",
  TASK: "Tarefa",
  MILESTONE: "Marco",
  MANUAL: "Pesos manuais",
  BUDGET_VALUE: "Valor orçamental",
  INTERNAL: "Interno · gestão",
  PROJECT_MEMBERS: "Equipa e fiscalização",
  CLIENT_VISIBLE: "Visível ao cliente",
  FINANCIER_VISIBLE: "Visível ao financiador",
  PUBLIC_PROJECT: "Todos os participantes",
  OPERATING: "Operacional",
  IDLE: "Parado",
  BROKEN: "Avariado",
  MAINTENANCE: "Manutenção",
  LOW: "Baixa",
  MEDIUM: "Média",
  HIGH: "Alta",
  CRITICAL: "Crítica",
};
export function Navigation({ id }: { id: string }) {
  return (
    <nav className="budget-nav" aria-label="Execução">
      <Link href={`/projects/${id}`}>← Obra</Link>
      <Link href={`/projects/${id}/schedule`}>Cronograma</Link>
      <Link href={`/projects/${id}/daily-logs`}>Diário de obra</Link>
    </nav>
  );
}
export type Field = {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  value?: string | number;
  min?: string;
  max?: string;
  step?: string;
};
export function EntryForm({
  title,
  fields,
  onSave,
  onCancel,
  submit = "Guardar",
}: {
  title: string;
  fields: Field[];
  onSave: (values: Record<string, string>) => Promise<void>;
  onCancel?: () => void;
  submit?: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      values = Object.fromEntries(new FormData(form).entries()) as Record<
        string,
        string
      >;
    setBusy(true);
    setError("");
    try {
      await onSave(values);
      form.reset();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card execution-form">
      <h2>{title}</h2>
      {error && <Notice error>{error}</Notice>}
      <form onSubmit={save}>
        <fieldset disabled={busy}>
          <div className="execution-fields">
            {fields.map((f) => (
              <label key={f.name}>
                {f.label}
                {f.options ? (
                  <select
                    name={f.name}
                    defaultValue={f.value ?? ""}
                    required={f.required}
                  >
                    {!f.required && <option value="">—</option>}
                    {f.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : f.type === "textarea" ? (
                  <textarea
                    name={f.name}
                    defaultValue={f.value}
                    required={f.required}
                    rows={3}
                  />
                ) : (
                  <input
                    name={f.name}
                    type={f.type ?? "text"}
                    defaultValue={f.value}
                    required={f.required}
                    min={f.min}
                    max={f.max}
                    step={f.step}
                  />
                )}
              </label>
            ))}
          </div>
          <div className="actions">
            <button type="submit">{busy ? "A guardar…" : submit}</button>
            {onCancel && (
              <button type="button" className="secondary" onClick={onCancel}>
                Cancelar
              </button>
            )}
          </div>
        </fieldset>
      </form>
    </section>
  );
}
export const options = (values: string[]) =>
  values.map((value) => ({ value, label: stateNames[value] ?? value }));
export type Metrics = {
  plannedProgress: string;
  actualProgress: string;
  deviation: string;
  delayed: number;
  inProgress: number;
  completed: number;
};
export function ProgressCards({ data }: { data: Metrics }) {
  return (
    <div className="stats budget-stats">
      {[
        ["Planeado", `${data.plannedProgress}%`],
        ["Real", `${data.actualProgress}%`],
        ["Desvio", `${data.deviation} pp`],
        ["Atrasadas", data.delayed],
        ["Em curso", data.inProgress],
        ["Concluídas", data.completed],
      ].map(([label, value]) => (
        <div className="stat" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}
export function OperationalDashboard({ id }: { id: string }) {
  const [photos, setPhotos] = useState<
    {
      id: string;
      dailyLogId: string;
      caption: string | null;
      fileName: string;
    }[]
  >([]);
  const [data, setData] = useState<Metrics>(),
    [logs, setLogs] = useState<
      { id: string; logDate: string; workers: number; photos: number }[]
    >([]),
    [error, setError] = useState("");
  useEffect(() => {
    api<Metrics>(`/projects/${id}/progress`)
      .then(setData)
      .catch((e) => {
        if (!e.message.includes("Cronograma não encontrado"))
          setError(e.message);
      });
    api<{ items: typeof logs }>(`/projects/${id}/daily-logs?limit=3`)
      .then(async (r) => {
        setLogs(r.items);
        const details = await Promise.all(
          r.items.map((l) =>
            api<{ photos: typeof photos }>(
              `/projects/${id}/daily-logs/${l.id}`,
            ),
          ),
        );
        setPhotos(details.flatMap((d) => d.photos).slice(0, 6));
      })
      .catch((e) => setError(e.message));
  }, [id]);
  return (
    <section className="card">
      <h2>Execução da obra</h2>
      {error && <Notice error>{error}</Notice>}
      {data ? (
        <ProgressCards data={data} />
      ) : (
        <p>Cronograma ainda não criado.</p>
      )}
      <Navigation id={id} />
      <p>
        Trabalhadores hoje:{" "}
        {logs.find((l) => dateText(l.logDate) === today())?.workers ?? 0}
      </p>
      {photos.length > 0 && (
        <div className="execution-cards">
          {photos.map((photo) => (
            <figure className="card" key={photo.id}>
              <img
                className="execution-photo"
                src={`/api/v1/projects/${id}/daily-logs/${photo.dailyLogId}/documents/${photo.id}/content`}
                alt={photo.caption ?? photo.fileName}
                loading="lazy"
              />
              <figcaption>{photo.caption ?? photo.fileName}</figcaption>
            </figure>
          ))}
        </div>
      )}
      {logs.length > 0 && (
        <div className="execution-cards">
          {logs.map((l) => (
            <Link
              className="card"
              key={l.id}
              href={`/projects/${id}/daily-logs/${l.id}`}
            >
              <strong>{dateText(l.logDate)}</strong>
              <p>
                {l.workers} trabalhadores · {l.photos} fotografias autorizadas
              </p>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
