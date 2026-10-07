"use client";
import { useState } from "react";
import { Card, Notice } from "@obras/ui";
import { money } from "@obras/domain/budget";
import { type BudgetNode, flatten, formatMoney } from "./common";
export function BudgetItemForm({
  item,
  nodes,
  onSave,
  onCancel,
}: {
  item?: BudgetNode;
  nodes: BudgetNode[];
  onSave: (data: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}) {
  const [type, setType] = useState(item?.itemType ?? "ITEM"),
    [quantity, setQuantity] = useState(item?.quantity ?? ""),
    [price, setPrice] = useState(item?.unitPrice ?? ""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  let total = "—";
  try {
    if (type === "ITEM") total = formatMoney(money(quantity, price));
  } catch {
    /* Incomplete values remain editable. */
  }
  async function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const raw = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await onSave({
        ...raw,
        itemType: type,
        parentId: raw.parentId || null,
        unit: type === "GROUP" ? null : raw.unit,
        quantity: type === "GROUP" ? null : quantity,
        unitPrice: type === "GROUP" ? null : price,
        sortOrder: Number(raw.sortOrder),
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card title={item ? "Editar item" : "Novo item ou capítulo"}>
      {error && <Notice error>{error}</Notice>}
      <form className="form grid" onSubmit={submit}>
        <label>
          Código
          <input
            name="code"
            defaultValue={item?.code}
            required
            maxLength={100}
          />
        </label>
        <label>
          Descrição
          <input
            name="description"
            defaultValue={item?.description}
            required
            maxLength={5000}
          />
        </label>
        <label>
          Tipo
          <select
            name="itemType"
            disabled={!!item}
            value={type}
            onChange={(e) => setType(e.target.value as "GROUP" | "ITEM")}
          >
            <option value="ITEM">Item</option>
            <option value="GROUP">Capítulo / Grupo</option>
          </select>
        </label>
        <label>
          Grupo pai
          <select name="parentId" defaultValue={item?.parentId ?? ""}>
            <option value="">Nível principal</option>
            {flatten(nodes)
              .filter(
                (n) =>
                  n.itemType === "GROUP" &&
                  n.budgetItemId !== item?.budgetItemId,
              )
              .map((n) => (
                <option key={n.budgetItemId} value={n.budgetItemId}>
                  {n.code} — {n.description}
                </option>
              ))}
          </select>
        </label>
        {type === "ITEM" && (
          <>
            <label>
              Unidade
              <input
                name="unit"
                defaultValue={item?.unit ?? ""}
                required
                maxLength={30}
              />
            </label>
            <label>
              Quantidade
              <input
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                inputMode="decimal"
                required
              />
            </label>
            <label>
              Preço unitário
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                inputMode="decimal"
                required
              />
            </label>
          </>
        )}
        <label>
          Ordem
          <input
            name="sortOrder"
            type="number"
            min={0}
            defaultValue={item?.sortOrder ?? 0}
          />
        </label>
        <p>
          Total previsto:{" "}
          <strong>{type === "GROUP" ? "Soma dos descendentes" : total}</strong>
        </p>
        <div className="actions wide">
          <button disabled={busy}>Guardar item</button>
          <button type="button" className="secondary" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </form>
    </Card>
  );
}
