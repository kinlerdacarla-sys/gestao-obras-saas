"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Notice } from "@obras/ui";
import { api, send } from "../../lib/api";
import {
  BudgetNavigation,
  formatMoney,
  states,
  useBudgetAccess,
} from "./common";
interface Row {
  totalValue: string | null;
  rowNumber: number;
  code: string;
  description: string;
  unit: string | null;
  quantity: string | null;
  unitPrice: string | null;
  parentCode: string | null;
  itemType: string;
  status: string;
  errors: string[];
  rawData: { fields: Record<string, string> };
}
interface ImportJob {
  id: string;
  version: number;
  status: string;
  fileName: string;
  fileChecksum: string;
  headers: string[] | null;
  mapping: Record<string, string> | null;
  errorMessage: string | null;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  previewTotal: string;
  rows: { data: Row[]; meta: { totalPages: number } };
}
const mappingLabels: Record<string, string> = {
  code: "Código",
  description: "Descrição",
  unit: "Unidade",
  quantity: "Quantidade",
  unitPrice: "Preço Unitário",
  parentCode: "Código Pai",
  itemType: "Tipo",
};
export function ImportPage({ id }: { id: string }) {
  const router = useRouter(),
    editor = useBudgetAccess(id),
    [job, setJob] = useState<ImportJob>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [filter, setFilter] = useState(""),
    [page, setPage] = useState(1),
    [edit, setEdit] = useState<Row>();
  const base = `/projects/${id}/budget`;
  async function reload(jobId = job?.id) {
    if (jobId)
      setJob(
        await api<ImportJob>(
          `${base}/imports/${jobId}?page=${page}&limit=50${filter ? `&status=${filter}` : ""}`,
        ),
      );
  }
  useEffect(() => {
    if (job?.id) reload().catch((e) => setError(e.message));
  }, [page, filter]);
  useEffect(() => {
    if (!job || !["UPLOADED", "PROCESSING"].includes(job.status)) return;
    const timer = setInterval(() => {
      reload().catch((e) => setError(e.message));
    }, 1000);
    return () => clearInterval(timer);
  }, [job?.id, job?.status]);
  async function upload(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      setJob(
        await api<ImportJob>(`${base}/imports`, {
          method: "POST",
          body: new FormData(e.currentTarget),
        }),
      );
      setPage(1);
      setFilter("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (!job) return;
    setBusy(true);
    setError("");
    try {
      const revision = await api<{ id: string }>(
        `${base}/imports/${job.id}/confirm`,
        send("POST", { version: job.version }),
      );
      router.push(`${base}?revisionId=${revision.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function correct(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!job || !edit) return;
    setBusy(true);
    try {
      await api(
        `${base}/imports/${job.id}/rows/${edit.rowNumber}`,
        send("PATCH", {
          version: job.version,
          data: Object.fromEntries(new FormData(e.currentTarget)),
        }),
      );
      setEdit(undefined);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!editor)
    return (
      <>
        <BudgetNavigation id={id} />
        <Notice error>Sem permissão para importar orçamento.</Notice>
      </>
    );
  return (
    <>
      <BudgetNavigation id={id} />
      <h1>Importar orçamento Excel</h1>
      <p className="muted">
        Carregar → Processar e validar → Rever → Confirmar
      </p>
      {error && <Notice error>{error}</Notice>}
      <Card title="1. Selecionar ficheiro">
        <a className="text-link" href={`/api/v1${base}/import/template`}>
          Descarregar template XLSX
        </a>
        <form className="form mt-4" onSubmit={upload}>
          <label>
            Ficheiro Excel
            <input type="file" name="file" accept=".xlsx" required />
          </label>
          <button disabled={busy}>
            {busy ? "A carregar…" : "Carregar Excel"}
          </button>
        </form>
        <small>
          Até 10 MB e 10.000 linhas. Os valores só serão aplicados após
          confirmação.
        </small>
      </Card>
      {job && (
        <>
          <Card title="2. Processamento">
            <p role="status">
              <strong>{states[job.status]}</strong> · {job.fileName}
            </p>
            {["UPLOADED", "PROCESSING"].includes(job.status) && (
              <progress aria-label="Processamento do Excel" />
            )}
            {job.errorMessage && <Notice error>{job.errorMessage}</Notice>}
            {["FAILED", "UPLOADED"].includes(job.status) && (
              <button
                className="secondary"
                onClick={async () => {
                  try {
                    await api(
                      `${base}/imports/${job.id}/retry`,
                      send("POST", { version: job.version }),
                    );
                    await reload();
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Tentar novamente
              </button>
            )}
            <a
              className="text-link"
              href={`/api/v1${base}/imports/${job.id}/original`}
            >
              Descarregar original preservado
            </a>
          </Card>
          {job.status === "READY" && (
            <>
              <MappingForm
                job={job}
                onSave={async (mapping) => {
                  await api(
                    `${base}/imports/${job.id}/mapping`,
                    send("PATCH", { version: job.version, mapping }),
                  );
                  await reload();
                }}
              />
              <div className="stats">
                {[
                  ["Total de linhas", job.totalRows],
                  ["Válidas / avisos", job.validRows],
                  ["Inválidas", job.invalidRows],
                  ["Valor previsto", formatMoney(job.previewTotal)],
                ].map(([k, v]) => (
                  <div className="card stat" key={k}>
                    <span>{k}</span>
                    <strong className="budget-amount">{v}</strong>
                  </div>
                ))}
              </div>
              {edit && (
                <Card title={`Corrigir linha ${edit.rowNumber}`}>
                  <form className="form grid" onSubmit={correct}>
                    {Object.entries(mappingLabels).map(([key, label]) => (
                      <label key={key}>
                        {label}
                        <input
                          name={key}
                          defaultValue={
                            edit.rawData.fields[key] ??
                            (key === "itemType"
                              ? edit.itemType
                              : key === "parentCode"
                                ? (edit.parentCode ?? "")
                                : "")
                          }
                        />
                      </label>
                    ))}
                    <button disabled={busy}>Validar correção</button>
                    <button
                      className="secondary"
                      type="button"
                      onClick={() => setEdit(undefined)}
                    >
                      Cancelar
                    </button>
                  </form>
                </Card>
              )}
              <Card title="3. Preview">
                <label>
                  Filtrar linhas
                  <select
                    value={filter}
                    onChange={(e) => {
                      setFilter(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">Todos</option>
                    <option value="VALID">Válidos</option>
                    <option value="WARNING">Warnings</option>
                    <option value="INVALID">Erros</option>
                  </select>
                </label>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        {[
                          "Linha",
                          "Código",
                          "Descrição",
                          "Unidade",
                          "Quantidade",
                          "Preço unitário",
                          "Valor",
                          "Estado",
                          "Problema",
                          "Ações",
                        ].map((h) => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {job.rows.data.map((row) => (
                        <tr key={row.rowNumber}>
                          <td>{row.rowNumber}</td>
                          <td>{row.code}</td>
                          <td>{row.description}</td>
                          <td>{row.unit}</td>
                          <td>{row.quantity}</td>
                          <td>{formatMoney(row.unitPrice)}</td>
                          <td>{formatMoney(row.totalValue)}</td>
                          <td>{states[row.status]}</td>
                          <td className="budget-problem">
                            {row.errors.join("; ")}
                          </td>
                          <td>
                            <button
                              className="secondary"
                              onClick={() => setEdit(row)}
                            >
                              Corrigir linha {row.rowNumber}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="actions mt-4">
                  <button
                    className="secondary"
                    disabled={page === 1}
                    onClick={() => setPage(page - 1)}
                  >
                    Anterior
                  </button>
                  <span>Página {page}</span>
                  <button
                    className="secondary"
                    disabled={page >= job.rows.meta.totalPages}
                    onClick={() => setPage(page + 1)}
                  >
                    Seguinte
                  </button>
                </div>
              </Card>
              <Card title="4. Confirmar">
                <p>
                  Será criada uma revisão em rascunho. Revisões aprovadas
                  permanecem intactas.
                </p>
                {job.invalidRows > 0 && (
                  <Notice error>
                    Corrija todas as linhas inválidas antes de confirmar.
                  </Notice>
                )}
                <button
                  disabled={
                    busy || job.invalidRows !== 0 || job.totalRows === 0
                  }
                  onClick={confirm}
                >
                  Confirmar importação
                </button>
              </Card>
            </>
          )}
        </>
      )}
    </>
  );
}
function MappingForm({
  job,
  onSave,
}: {
  job: ImportJob;
  onSave: (mapping: Record<string, string>) => Promise<void>;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      const mapping = Object.fromEntries(
        [...new FormData(e.currentTarget)]
          .filter(([, v]) => v !== "")
          .map(([k, v]) => [k, String(v)]),
      );
      await onSave(mapping);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card title="Mapeamento de colunas">
      {error && <Notice error>{error}</Notice>}
      <details>
        <summary>Rever ou alterar o mapeamento</summary>
        <form className="form grid mt-4" onSubmit={submit}>
          {Object.entries(mappingLabels).map(([key, label]) => (
            <label key={key}>
              {label}
              <select
                name={key}
                defaultValue={job.mapping?.[key] ?? ""}
                required={key === "code" || key === "description"}
              >
                <option value="">Não mapear</option>
                {job.headers?.map((h) => (
                  <option key={h}>{h}</option>
                ))}
              </select>
            </label>
          ))}
          <button disabled={busy}>Aplicar mapeamento</button>
        </form>
      </details>
    </Card>
  );
}
