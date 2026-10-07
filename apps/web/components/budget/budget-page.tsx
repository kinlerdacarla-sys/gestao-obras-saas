"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, Notice } from "@obras/ui";
import { api, send } from "../../lib/api";
import { useMe } from "../shell";
import {
  BudgetNavigation,
  BudgetMetrics,
  states,
  formatMoney,
  useBudgetAccess,
  type Summary,
  type Revision,
  type BudgetNode,
} from "./common";
import { BudgetTree } from "./tree";
import { BudgetItemForm } from "./item-form";
export function BudgetPage({
  id,
  revisionId,
}: {
  id: string;
  revisionId?: string;
}) {
  const me = useMe(),
    editor = useBudgetAccess(id),
    [summary, setSummary] = useState<Summary>(),
    [revision, setRevision] = useState<Revision>(),
    [empty, setEmpty] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [editing, setEditing] = useState<BudgetNode | null | undefined>(),
    [busy, setBusy] = useState(false);
  const base = `/projects/${id}/budget`;
  async function load(selected = revisionId) {
    setError("");
    try {
      const data = await api<Summary>(base);
      setSummary(data);
      setEmpty(false);
      const chosen =
        selected ?? data.workingRevision?.id ?? data.currentRevision?.id;
      if (chosen)
        setRevision(await api<Revision>(`${base}/revisions/${chosen}`));
      else setRevision(undefined);
    } catch (e) {
      if ((e as Error).message.includes("ainda não possui")) setEmpty(true);
      else setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, [id, revisionId]);
  async function mutate(path: string, data: unknown, confirmation?: string) {
    if (confirmation && !window.confirm(confirmation)) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<Revision>(`${base}${path}`, send("POST", data));
      setSuccess("Operação concluída");
      await load(path === "" ? undefined : (result.id ?? revision?.id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(node: BudgetNode) {
    if (
      !revision ||
      !window.confirm(
        `Desativar ${node.code} nesta revisão? O histórico será preservado.`,
      )
    )
      return;
    try {
      await api(
        `${base}/items/${node.budgetItemId}`,
        send("DELETE", { revisionId: revision.id, version: revision.version }),
      );
      await load(revision.id);
      setSuccess("Item desativado");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <BudgetNavigation id={id} />
      <div className="heading">
        <div>
          <span className="eyebrow">Planeamento da obra</span>
          <h1>Orçamento</h1>
          <p className="muted">Histórico e valores em MZN.</p>
        </div>
        {editor && (
          <Link className="button" href={`${base}/import`}>
            Importar Excel
          </Link>
        )}
      </div>
      {error && <Notice error>{error}</Notice>}
      {success && <Notice>{success}</Notice>}
      {empty ? (
        <Card>
          <p>Esta obra ainda não possui orçamento.</p>
          {editor && (
            <button onClick={() => mutate("", { name: "Orçamento principal" })}>
              Criar orçamento
            </button>
          )}
        </Card>
      ) : !summary ? (
        <p role="status">A carregar orçamento…</p>
      ) : (
        <>
          <BudgetMetrics summary={summary} />
          {!revision && <Card>Nenhuma revisão aprovada disponível.</Card>}
          {revision && (
            <>
              <Card>
                <div className="heading">
                  <div>
                    <h2>
                      Revisão {revision.code}{" "}
                      <span className="badge">{states[revision.status]}</span>
                    </h2>
                    <p>
                      Total: <strong>{formatMoney(revision.total)}</strong>
                    </p>
                    <small>
                      Última aprovação:{" "}
                      {revision.approvedAt
                        ? new Date(revision.approvedAt).toLocaleString("pt-MZ")
                        : "—"}
                    </small>
                  </div>
                  <div className="actions">
                    <a
                      className="button secondary"
                      href={`/api/v1${base}/revisions/${revision.id}/export`}
                    >
                      Exportar Excel
                    </a>
                    {editor && revision.status === "DRAFT" && (
                      <>
                        <button onClick={() => setEditing(null)}>
                          Adicionar item
                        </button>
                        <button
                          disabled={busy}
                          onClick={() =>
                            mutate(`/revisions/${revision.id}/submit`, {
                              version: revision.version,
                            })
                          }
                        >
                          Submeter revisão
                        </button>
                        <button
                          className="secondary"
                          onClick={() =>
                            mutate(
                              `/revisions/${revision.id}/cancel`,
                              { version: revision.version },
                              "Cancelar este rascunho? O histórico será preservado.",
                            )
                          }
                        >
                          Cancelar revisão
                        </button>
                      </>
                    )}
                    {me.role === "ADMIN" && revision.status === "SUBMITTED" && (
                      <>
                        <button
                          disabled={busy}
                          onClick={() =>
                            mutate(
                              `/revisions/${revision.id}/approve`,
                              { version: revision.version },
                              `Aprovar ${revision.code} no valor de ${formatMoney(revision.total)}? Esta revisão ficará imutável.`,
                            )
                          }
                        >
                          Aprovar revisão
                        </button>
                        <button
                          className="secondary"
                          onClick={() => {
                            const reason = window.prompt("Motivo da rejeição");
                            if (reason)
                              void mutate(`/revisions/${revision.id}/reject`, {
                                version: revision.version,
                                reason,
                              });
                          }}
                        >
                          Rejeitar revisão
                        </button>
                      </>
                    )}
                    {editor &&
                      ["APPROVED", "REJECTED"].includes(revision.status) && (
                        <button
                          disabled={busy}
                          onClick={() =>
                            mutate("/revisions", {
                              sourceRevisionId: revision.id,
                            })
                          }
                        >
                          Criar nova revisão
                        </button>
                      )}
                  </div>
                </div>
              </Card>
              {editing !== undefined && (
                <BudgetItemForm
                  item={editing ?? undefined}
                  nodes={revision.items}
                  onCancel={() => setEditing(undefined)}
                  onSave={async (data) => {
                    setBusy(true);
                    try {
                      await api(
                        `${base}/items${editing ? `/${editing.budgetItemId}` : ""}`,
                        send(editing ? "PATCH" : "POST", {
                          ...data,
                          revisionId: revision.id,
                          version: revision.version,
                        }),
                      );
                      await load(revision.id);
                      setEditing(undefined);
                      setSuccess("Item guardado");
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
              )}
              <Card title="Estrutura orçamental">
                <BudgetTree
                  nodes={revision.items}
                  editable={editor && !busy && revision.status === "DRAFT"}
                  onEdit={setEditing}
                  onRemove={remove}
                />
              </Card>
            </>
          )}
        </>
      )}
    </>
  );
}
