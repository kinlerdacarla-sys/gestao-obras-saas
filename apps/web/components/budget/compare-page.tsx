"use client";
import { useEffect, useState } from "react";
import { Card, Notice } from "@obras/ui";
import { api } from "../../lib/api";
import { BudgetNavigation, formatMoney, type Revision } from "./common";
interface Change {
  id: string;
  code: string;
  description: string;
  classification: string;
  metadataChanged: boolean;
  previousQuantity: string | null;
  newQuantity: string | null;
  previousUnitPrice: string | null;
  newUnitPrice: string | null;
  previousValue: string;
  newValue: string;
  difference: string;
  differencePercentage: string | null;
}
interface Comparison {
  previousTotal: string;
  newTotal: string;
  difference: string;
  differencePercentage: string | null;
  data: Change[];
  meta: { totalPages: number };
}
const names: Record<string, string> = {
  ADDED: "+ Adicionado",
  REMOVED: "− Removido",
  UNCHANGED: "= Sem alteração financeira",
  QUANTITY_CHANGED: "↕ Quantidade alterada",
  PRICE_CHANGED: "↕ Preço alterado",
  QUANTITY_AND_PRICE_CHANGED: "↕ Quantidade e preço alterados",
};
export function ComparePage({ id }: { id: string }) {
  const [revisions, setRevisions] = useState<Revision[]>([]),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [result, setResult] = useState<Comparison>(),
    [error, setError] = useState(""),
    [page, setPage] = useState(1),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api<{ data: Revision[] }>(`/projects/${id}/budget/revisions?limit=200`)
      .then((r) => {
        setRevisions(r.data);
        setFrom(r.data.at(-1)?.id ?? "");
        setTo(r.data[0]?.id ?? "");
      })
      .catch((e) => setError(e.message));
  }, [id]);
  async function fetchPage(nextPage: number) {
    setError("");
    setBusy(true);
    try {
      setResult(
        await api<Comparison>(
          `/projects/${id}/budget/revisions/compare?fromRevisionId=${from}&toRevisionId=${to}&page=${nextPage}&limit=100`,
        ),
      );
      setPage(nextPage);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <BudgetNavigation id={id} />
      <h1>Comparar revisões</h1>
      {error && <Notice error>{error}</Notice>}
      <Card>
        <form
          className="form grid"
          onSubmit={(e) => {
            e.preventDefault();
            void fetchPage(1);
          }}
        >
          <label>
            De
            <select
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              required
            >
              {revisions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code}
                </option>
              ))}
            </select>
          </label>
          <label>
            Para
            <select value={to} onChange={(e) => setTo(e.target.value)} required>
              {revisions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code}
                </option>
              ))}
            </select>
          </label>
          <button disabled={busy || !from || !to}>Comparar</button>
        </form>
      </Card>
      {result && (
        <>
          <div className="stats">
            {[
              ["Valor anterior", formatMoney(result.previousTotal)],
              ["Valor novo", formatMoney(result.newTotal)],
              ["Diferença", formatMoney(result.difference)],
              [
                "Variação",
                result.differencePercentage === null
                  ? "Sem base"
                  : `${result.differencePercentage}%`,
              ],
            ].map(([k, v]) => (
              <div className="card stat" key={k}>
                <span>{k}</span>
                <strong className="budget-amount">{v}</strong>
              </div>
            ))}
          </div>
          <Card title="Alterações por item">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Alteração</th>
                    <th>Quantidade anterior → nova</th>
                    <th>Preço anterior → novo</th>
                    <th>Valor anterior</th>
                    <th>Valor novo</th>
                    <th>Diferença / %</th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <strong>{row.code}</strong>
                        <br />
                        {row.description}
                      </td>
                      <td>
                        {names[row.classification]}
                        {row.metadataChanged && (
                          <small> · Descrição/hierarquia alterada</small>
                        )}
                      </td>
                      <td>
                        {row.previousQuantity ?? "—"} → {row.newQuantity ?? "—"}
                      </td>
                      <td>
                        {formatMoney(row.previousUnitPrice)} →{" "}
                        {formatMoney(row.newUnitPrice)}
                      </td>
                      <td>{formatMoney(row.previousValue)}</td>
                      <td>{formatMoney(row.newValue)}</td>
                      <td>
                        {formatMoney(row.difference)}
                        <br />
                        {row.differencePercentage === null
                          ? "Sem base"
                          : `${row.differencePercentage}%`}
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
                onClick={() => void fetchPage(page - 1)}
              >
                Anterior
              </button>
              <span>Página {page}</span>
              <button
                className="secondary"
                disabled={page >= result.meta.totalPages}
                onClick={() => void fetchPage(page + 1)}
              >
                Seguinte
              </button>
            </div>
          </Card>
        </>
      )}
    </>
  );
}
