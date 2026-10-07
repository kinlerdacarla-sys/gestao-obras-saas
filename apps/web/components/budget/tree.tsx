"use client";
import { useState } from "react";
import { type BudgetNode, formatMoney } from "./common";
export function BudgetTree({
  nodes,
  editable,
  onEdit,
  onRemove,
}: {
  nodes: BudgetNode[];
  editable: boolean;
  onEdit: (node: BudgetNode) => void;
  onRemove: (node: BudgetNode) => void;
}) {
  const [collapsed, setCollapsed] = useState(new Set<string>()),
    [limit, setLimit] = useState(200);
  const visible: { node: BudgetNode; depth: number }[] = [];
  const stack = nodes
    .slice()
    .reverse()
    .map((node) => ({ node, depth: 0 }));
  while (stack.length) {
    const row = stack.pop()!;
    visible.push(row);
    if (!collapsed.has(row.node.budgetItemId))
      stack.push(
        ...row.node.children
          .slice()
          .reverse()
          .map((node) => ({ node, depth: row.depth + 1 })),
      );
  }
  function toggle(id: string) {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Código / Descrição</th>
              <th>Unidade</th>
              <th>Quantidade</th>
              <th>Preço unitário</th>
              <th>Total</th>
              {editable && <th>Ações</th>}
            </tr>
          </thead>
          <tbody>
            {visible.slice(0, limit).map(({ node, depth }) => (
              <tr
                key={node.budgetItemId}
                className={node.itemType === "GROUP" ? "budget-group" : ""}
              >
                <td style={{ paddingLeft: 12 + Math.min(depth, 12) * 16 }}>
                  {node.itemType === "GROUP" && (
                    <button
                      className="tree-toggle"
                      aria-expanded={!collapsed.has(node.budgetItemId)}
                      aria-label={`Expandir/recolher ${node.code}`}
                      onClick={() => toggle(node.budgetItemId)}
                    >
                      {collapsed.has(node.budgetItemId) ? "▶" : "▼"}
                    </button>
                  )}
                  <strong>{node.code}</strong> {node.description}
                </td>
                <td>{node.unit ?? "—"}</td>
                <td>{node.quantity ?? "—"}</td>
                <td>{node.unitPrice ? formatMoney(node.unitPrice) : "—"}</td>
                <td>{formatMoney(node.total)}</td>
                {editable && (
                  <td>
                    <div className="actions row-actions">
                      <button
                        className="secondary"
                        onClick={() => onEdit(node)}
                      >
                        Editar {node.code}
                      </button>
                      <button
                        className="secondary"
                        onClick={() => onRemove(node)}
                      >
                        Desativar
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {visible.length === 0 && (
        <p className="empty">Sem itens. Adicione um capítulo ou item.</p>
      )}
      {visible.length > limit && (
        <button
          className="secondary mt-4"
          onClick={() => setLimit(limit + 200)}
        >
          Mostrar mais ({limit} de {visible.length})
        </button>
      )}
    </>
  );
}
