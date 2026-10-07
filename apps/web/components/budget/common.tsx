"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useMe } from "../shell";
export interface BudgetNode {
  budgetItemId: string;
  parentId: string | null;
  code: string;
  description: string;
  itemType: "GROUP" | "ITEM";
  unit: string | null;
  quantity: string | null;
  unitPrice: string | null;
  total: string;
  children: BudgetNode[];
  sortOrder: number;
}
export interface Revision {
  id: string;
  code: string;
  description: string | null;
  status: string;
  version: number;
  total: string;
  createdAt: string;
  createdByName?: string;
  approvedByName?: string;
  approvedAt: string | null;
  items: BudgetNode[];
  canEdit: boolean;
}
export interface Summary {
  id: string;
  canEdit: boolean;
  originalTotal: string;
  currentTotal: string;
  difference: string;
  differencePercentage: string | null;
  revisionCount: number;
  currentRevision: Revision | null;
  workingRevision: Revision | null;
}
export const states: Record<string, string> = {
  DRAFT: "Rascunho",
  SUBMITTED: "Submetido",
  APPROVED: "Aprovado",
  REJECTED: "Rejeitado",
  SUPERSEDED: "Substituído",
  CANCELLED: "Cancelado",
  UPLOADED: "Carregado",
  PROCESSING: "A processar e validar",
  READY: "Pronto para confirmar",
  FAILED: "Falhou",
  CONFIRMED: "Confirmado",
  VALID: "Válido",
  INVALID: "Erro",
  WARNING: "Aviso",
};
export function formatMoney(value: string | undefined | null) {
  if (value == null) return "—";
  const negative = value.startsWith("-");
  const [whole, decimal = ""] = value.replace("-", "").split(".");
  return `${negative ? "-" : ""}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${decimal.padEnd(2, "0").slice(0, 2)} MZN`;
}
export function BudgetNavigation({ id }: { id: string }) {
  return (
    <nav className="budget-nav" aria-label="Orçamento">
      <Link href={`/projects/${id}`}>← Obra</Link>
      <Link href={`/projects/${id}/budget`}>Orçamento</Link>
      <Link href={`/projects/${id}/budget/revisions`}>Revisões</Link>
      <Link href={`/projects/${id}/budget/compare`}>Comparar revisões</Link>
    </nav>
  );
}
export function BudgetMetrics({ summary }: { summary: Summary }) {
  return (
    <div className="stats budget-stats">
      {[
        ["Orçamento Inicial", formatMoney(summary.originalTotal)],
        ["Orçamento Atual", formatMoney(summary.currentTotal)],
        ["Variação", formatMoney(summary.difference)],
        [
          "% Variação",
          summary.differencePercentage === null
            ? "Sem base de comparação"
            : `${summary.differencePercentage}%`,
        ],
        ["Revisões", String(summary.revisionCount)],
      ].map(([k, v]) => (
        <div className="card stat" key={k}>
          <span className="muted">{k}</span>
          <strong>{v}</strong>
        </div>
      ))}
    </div>
  );
}
export function useBudgetAccess(id: string) {
  const me = useMe(),
    [editor, setEditor] = useState(me.role === "ADMIN");
  useEffect(() => {
    if (me.role === "MANAGER")
      api<{ userId: string; role: string; status: string }[]>(
        `/projects/${id}/users`,
      )
        .then((rows) =>
          setEditor(
            rows.some(
              (r) =>
                r.userId === me.user.id &&
                r.role === "MANAGER" &&
                r.status === "ACTIVE",
            ),
          ),
        )
        .catch(() => setEditor(false));
  }, [id, me.role, me.user.id]);
  return editor;
}
export function BudgetDashboard({ id }: { id: string }) {
  const [summary, setSummary] = useState<Summary>();
  useEffect(() => {
    api<Summary>(`/projects/${id}/budget`)
      .then(setSummary)
      .catch(() => undefined);
  }, [id]);
  return (
    <section className="card">
      <div className="heading">
        <h2>Orçamento da obra</h2>
        <Link className="button" href={`/projects/${id}/budget`}>
          Abrir Orçamento
        </Link>
      </div>
      {summary ? (
        <>
          <p>
            Revisão atual:{" "}
            <strong>{summary.currentRevision?.code ?? "Sem aprovação"}</strong>
          </p>
          <BudgetMetrics summary={summary} />
        </>
      ) : (
        <p className="muted">Consulte ou prepare o orçamento desta obra.</p>
      )}
    </section>
  );
}
export function flatten(nodes: BudgetNode[]): BudgetNode[] {
  const result: BudgetNode[] = [],
    stack = nodes.slice().reverse();
  while (stack.length) {
    const node = stack.pop()!;
    result.push(node);
    stack.push(...node.children.slice().reverse());
  }
  return result;
}
