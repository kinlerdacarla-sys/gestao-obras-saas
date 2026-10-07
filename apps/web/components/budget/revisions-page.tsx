"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, Notice } from "@obras/ui";
import { api } from "../../lib/api";
import { BudgetNavigation, formatMoney, states, type Revision } from "./common";
export function RevisionsPage({ id }: { id: string }) {
  const [data, setData] = useState<{
      data: Revision[];
      meta: { totalPages: number };
    }>(),
    [page, setPage] = useState(1),
    [error, setError] = useState("");
  useEffect(() => {
    api<typeof data>(`/projects/${id}/budget/revisions?page=${page}&limit=50`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [id, page]);
  return (
    <>
      <BudgetNavigation id={id} />
      <h1>Revisões do orçamento</h1>
      {error && <Notice error>{error}</Notice>}
      <Card>
        {!data ? (
          <p role="status">A carregar revisões…</p>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Revisão</th>
                    <th>Descrição</th>
                    <th>Estado</th>
                    <th>Valor</th>
                    <th>Criada por / Data</th>
                    <th>Aprovação</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <Link
                          href={`/projects/${id}/budget?revisionId=${r.id}`}
                        >
                          {r.code}
                        </Link>
                      </td>
                      <td>{r.description ?? "—"}</td>
                      <td>
                        <span className="badge">{states[r.status]}</span>
                      </td>
                      <td>{formatMoney(r.total)}</td>
                      <td>
                        {r.createdByName}
                        <br />
                        {new Date(r.createdAt).toLocaleString("pt-MZ")}
                      </td>
                      <td>
                        {r.approvedByName ?? "—"}
                        <br />
                        {r.approvedAt
                          ? new Date(r.approvedAt).toLocaleString("pt-MZ")
                          : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.data.length === 0 && (
              <p className="empty">Sem revisões disponíveis.</p>
            )}
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
                disabled={page >= data.meta.totalPages}
                onClick={() => setPage(page + 1)}
              >
                Seguinte
              </button>
            </div>
          </>
        )}
      </Card>
    </>
  );
}
