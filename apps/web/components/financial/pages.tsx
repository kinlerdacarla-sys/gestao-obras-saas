"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Decimal } from "decimal.js";
import { Notice } from "@obras/ui";
import { api, send } from "../../lib/api";
import { useMe } from "../shell";
import { EntryForm, type Field, today, dateText } from "../execution/common";
import { Documents } from "../commercial/pages";
type Row = { id: string; version: number; [key: string]: unknown };
type List = { items: Row[]; total: number; page: number; limit: number };
const txt = (x: unknown) => (x == null ? "" : String(x));
const money = (x: unknown) =>
  new Decimal(txt(x) || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, " ") +
  " MZN";
const names: Record<string, string> = {
  DRAFT: "Rascunho",
  SUBMITTED: "Submetido",
  FISCAL_REVIEW: "Revisão fiscal",
  FISCAL_REJECTED: "Rejeitado pelo fiscal",
  APPROVAL_REVIEW: "Aprovação final",
  APPROVED: "Aprovado",
  CERTIFIED: "Certificado",
  PARTIALLY_PAID: "Parcialmente pago",
  PAID: "Pago",
  CANCELLED: "Cancelado",
  ACTIVE: "Ativo",
  SUSPENDED: "Suspenso",
  CLOSED: "Encerrado",
  REJECTED: "Rejeitado",
  PARTIALLY_DISBURSED: "Parcialmente desembolsado",
  DISBURSED: "Desembolsado",
  POSTED: "Registado",
  REVERSED: "Estornado",
  PERCENTAGE: "Percentagem",
  FIXED: "Valor fixo",
  MANUAL: "Manual",
  FINANCIER: "Financiador",
  CLIENT: "Cliente",
  BANK_TRANSFER: "Transferência bancária",
  CASH: "Numerário",
  CHEQUE: "Cheque",
  MOBILE_MONEY: "Carteira móvel",
  OTHER: "Outro",
};
const opts = (values: string[]) =>
  values.map((value) => ({ value, label: names[value] ?? value }));
const rowOpts = (rows: Row[], field: string) =>
  rows.map((r) => ({ value: r.id, label: txt(r[field] ?? r.title ?? r.id) }));
const clean = (x: Record<string, string>) =>
  Object.fromEntries(Object.entries(x).filter(([, v]) => v !== ""));
const cash = (name: string, label: string, value = "0"): Field => ({
  name,
  label,
  type: "number",
  step: "0.01",
  min: "0",
  value,
  required: true,
});
const date = (name: string, label: string): Field => ({
  name,
  label,
  type: "date",
  value: today(),
  required: true,
});
function Nav({ id }: { id: string }) {
  const me = useMe();
  return (
    <nav className="budget-nav" aria-label="Financeiro">
      <Link href={`/projects/${id}`}>← Obra</Link>
      <Link href={`/projects/${id}/measurements`}>Medições</Link>
      {me.role !== "INSPECTOR" && (
        <>
          <Link href={`/projects/${id}/funding`}>Financiamento</Link>
          <Link href={`/projects/${id}/payments`}>Pagamentos</Link>
          <Link href={`/projects/${id}/financial`}>Financeiro</Link>
        </>
      )}
    </nav>
  );
}
function useList(path: string) {
  const [data, setData] = useState<List>({
      items: [],
      total: 0,
      page: 1,
      limit: 50,
    }),
    [error, setError] = useState("");
  async function load() {
    try {
      setData(await api<List>(path));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, [path]);
  return { data, error, load };
}
function Pager({
  page,
  total,
  change,
}: {
  page: number;
  total: number;
  change: (p: number) => void;
}) {
  return (
    <div className="actions">
      <button disabled={page === 1} onClick={() => change(page - 1)}>
        Anterior
      </button>
      <span>
        Página {page} · {total} registos
      </span>
      <button disabled={page * 50 >= total} onClick={() => change(page + 1)}>
        Seguinte
      </button>
    </div>
  );
}
function Table({
  rows,
  columns,
  link,
}: {
  rows: Row[];
  columns: [string, string, boolean?][];
  link?: (r: Row) => string;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map(([key, label]) => (
              <th key={key}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              {columns.map(([key, , monetary], i) => (
                <td key={key}>
                  {i === 0 && link ? (
                    <Link href={link(r)}>{txt(r[key])}</Link>
                  ) : monetary ? (
                    money(r[key])
                  ) : (
                    (names[txt(r[key])] ?? txt(r[key]))
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <p>Ainda não existem registos.</p>}
    </div>
  );
}
function Mutation({
  title,
  path,
  version,
  fields = [],
  onDone,
  idempotent = false,
}: {
  title: string;
  path: string;
  version?: number;
  fields?: Field[];
  onDone: () => Promise<void>;
  idempotent?: boolean;
}) {
  const [key, setKey] = useState<string>();
  return (
    <EntryForm
      title={title}
      fields={fields}
      submit={title}
      onSave={async (values) => {
        const token = key ?? crypto.randomUUID();
        setKey(token);
        await api(path, {
          ...send("POST", {
            ...clean(values),
            ...(version === undefined ? {} : { version }),
          }),
          ...(idempotent ? { headers: { "Idempotency-Key": token } } : {}),
        });
        setKey(undefined);
        await onDone();
      }}
    />
  );
}
export function MeasurementsPage({ id }: { id: string }) {
  const me = useMe(),
    editor = ["ADMIN", "MANAGER"].includes(me.role),
    base = `/projects/${id}`;
  const [page, setPage] = useState(1),
    [show, setShow] = useState(false),
    [contracts, setContracts] = useState<Row[]>([]);
  const { data, error, load } = useList(`${base}/measurements?page=${page}`);
  useEffect(() => {
    if (editor)
      api<List>(`${base}/contracts?limit=200&status=ACTIVE`)
        .then((x) => setContracts(x.items))
        .catch(() => {});
  }, [base, editor]);
  return (
    <>
      <Nav id={id} />
      <h1>Medições</h1>
      <p>Quantidades executadas, certificação e saldo a pagar · MZN</p>
      {error && <Notice error>{error}</Notice>}
      {editor && <button onClick={() => setShow(!show)}>Nova medição</button>}
      {show && (
        <EntryForm
          title="1. Contrato e período"
          fields={[
            {
              name: "contractId",
              label: "Contrato",
              options: rowOpts(contracts, "contractNumber"),
              required: true,
            },
            date("periodStart", "Início do período"),
            date("periodEnd", "Fim do período"),
            { name: "description", label: "Descrição" },
          ]}
          onSave={async (values) => {
            const r = await api<Row>(
              `${base}/measurements`,
              send("POST", clean(values)),
            );
            await load();
            window.location.assign(`${base}/measurements/${r.id}`);
          }}
        />
      )}
      <Table
        rows={data.items}
        link={(r) => `${base}/measurements/${r.id}`}
        columns={[
          ["code", "Número"],
          ["contractNumber", "Contrato"],
          ["periodStart", "Início"],
          ["periodEnd", "Fim"],
          ["grossAmount", "Bruto", true],
          ["retentionAmount", "Retenção", true],
          ["advanceRecoveryAmount", "Recuperação", true],
          ["netCertifiedAmount", "Líquido", true],
          ["paid", "Pago", true],
          ["outstandingPayable", "Saldo", true],
          ["status", "Estado"],
        ]}
      />
      <Pager page={page} total={data.total} change={setPage} />
    </>
  );
}
export function MeasurementDetail({
  id,
  measurementId,
}: {
  id: string;
  measurementId: string;
}) {
  const me = useMe(),
    base = `/projects/${id}`,
    path = `${base}/measurements/${measurementId}`;
  const [row, setRow] = useState<Row>(),
    [contract, setContract] = useState<Row>(),
    [contractItems, setContractItems] = useState<Row[]>([]),
    [items, setItems] = useState<List>({
      items: [],
      total: 0,
      page: 1,
      limit: 50,
    }),
    [page, setPage] = useState(1),
    [error, setError] = useState("");
  async function load() {
    try {
      const m = await api<Row>(path);
      setRow(m);
      setItems(await api<List>(`${path}/items?page=${page}`));
      if (["ADMIN", "MANAGER"].includes(me.role)) {
        setContract(await api<Row>(`${base}/contracts/${m.contractId}`));
        setContractItems(
          (await api<List>(`${base}/contracts/${m.contractId}/items?limit=200`))
            .items,
        );
      }
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, [path, page]);
  if (!row)
    return (
      <>
        <Nav id={id} />
        {error ? <Notice error>{error}</Notice> : <p>A carregar medição…</p>}
      </>
    );
  const edit = row.status === "DRAFT" && ["ADMIN", "MANAGER"].includes(me.role),
    independent = row.createdBy !== me.user.id;
  const transitions = (row.transitions ?? []) as Row[],
    reviews = (row.reviews ?? []) as Row[],
    deductions = (row.deductions ?? []) as Row[];
  return (
    <>
      <Nav id={id} />
      <h1>{txt(row.code)}</h1>
      <p>
        {dateText(txt(row.periodStart))} a {dateText(txt(row.periodEnd))} ·{" "}
        <strong>{names[txt(row.status)]}</strong>
      </p>
      {error && <Notice error>{error}</Notice>}
      <div className="stats budget-stats">
        {[
          ["grossAmount", "Bruto"],
          ["retentionAmount", "Retenção"],
          ["advanceRecoveryAmount", "Recuperação"],
          ["otherDeductionsAmount", "Outras deduções"],
          ["netCertifiedAmount", "Líquido certificado"],
          ["paid", "Pago"],
          ["outstandingPayable", "Saldo a pagar"],
        ].map(([key, label]) => (
          <article className="card" key={key}>
            <span>{label}</span>
            <h2>{money(row[key])}</h2>
          </article>
        ))}
      </div>
      <h2>2. Quantidades e valores</h2>
      <Table
        rows={items.items.map((x) => ({
          ...x,
          remainingQuantity: new Decimal(txt(x.contractQuantity))
            .minus(txt(x.cumulativeQuantity))
            .toFixed(4),
        }))}
        columns={[
          ["description", "Item"],
          ["unit", "Unidade"],
          ["contractQuantity", "Contratado"],
          ["previousQuantity", "Anterior"],
          ["currentQuantity", "Atual"],
          ["cumulativeQuantity", "Acumulado"],
          ["remainingQuantity", "Saldo"],
          ["unitPrice", "Preço", true],
          ["currentAmount", "Atual", true],
          ["cumulativeAmount", "Acumulado", true],
        ]}
      />
      <Pager page={page} total={items.total} change={setPage} />
      {edit && (
        <>
          <EntryForm
            title="Adicionar quantidade executada"
            fields={[
              {
                name: "contractItemId",
                label: "Item contratual",
                options: rowOpts(
                  contractItems.filter(
                    (c) => !items.items.some((i) => i.contractItemId === c.id),
                  ),
                  "description",
                ),
                required: true,
              },
              {
                name: "currentQuantity",
                label: "Quantidade atual",
                type: "number",
                step: "0.0001",
                min: "0",
                required: true,
              },
            ]}
            onSave={async (values) => {
              await api(
                `${path}/items`,
                send("POST", { ...values, version: row.version }),
              );
              await load();
            }}
          />
          {items.items.map((item) => (
            <EntryForm
              key={item.id + ":" + row.version}
              title={`Editar ${txt(item.description)}`}
              fields={[
                {
                  name: "currentQuantity",
                  label: "Quantidade",
                  type: "number",
                  step: "0.0001",
                  min: "0",
                  value: txt(item.currentQuantity),
                  required: true,
                },
              ]}
              onSave={async (values) => {
                await api(
                  `${path}/items/${item.id}`,
                  send("PATCH", {
                    ...values,
                    version: row.version,
                    contractItemId: item.contractItemId,
                  }),
                );
                await load();
              }}
            />
          ))}
          <EntryForm
            title="3. Deduções"
            fields={[
              {
                name: "type",
                label: "Tipo",
                options: [
                  { value: "PENALTY", label: "Penalização" },
                  { value: "OTHER", label: "Outra" },
                ],
              },
              { name: "description", label: "Justificação", required: true },
              cash("amount", "Valor"),
            ]}
            onSave={async (values) => {
              await api(
                `${path}/deductions`,
                send("POST", { ...values, version: row.version }),
              );
              await load();
            }}
          />
          <EntryForm
            title="Período e recuperação manual"
            fields={[
              {
                ...date("periodStart", "Início"),
                value: dateText(txt(row.periodStart)),
              },
              {
                ...date("periodEnd", "Fim"),
                value: dateText(txt(row.periodEnd)),
              },
              {
                name: "description",
                label: "Descrição",
                value: txt(row.description),
              },
              cash(
                "manualAdvanceRecovery",
                "Recuperação manual",
                txt(row.manualAdvanceRecovery),
              ),
            ]}
            onSave={async (values) => {
              await api(
                path,
                send("PATCH", { ...values, version: row.version }),
              );
              await load();
            }}
          />
          {contract && (
            <p>
              Recuperação configurada:{" "}
              {names[txt(contract.advanceRecoveryMethod)]}. As condições são
              definidas no contrato.
            </p>
          )}
        </>
      )}
      <Table
        rows={deductions}
        columns={[
          ["type", "Dedução"],
          ["description", "Descrição"],
          ["amount", "Valor", true],
        ]}
      />
      <h2>4. Revisão e certificação</h2>
      {edit && (
        <Mutation
          title="Submeter medição"
          path={`${path}/submit`}
          version={row.version}
          onDone={load}
        />
      )}{" "}
      {row.status === "FISCAL_REJECTED" &&
        ["ADMIN", "MANAGER"].includes(me.role) && (
          <Mutation
            title="Reabrir medição"
            path={`${path}/reopen`}
            version={row.version}
            onDone={load}
          />
        )}{" "}
      {["SUBMITTED", "FISCAL_REVIEW"].includes(txt(row.status)) &&
        ["ADMIN", "INSPECTOR"].includes(me.role) && (
          <>
            {independent && (
              <Mutation
                title="Aprovar revisão fiscal"
                path={`${path}/fiscal-approve`}
                version={row.version}
                onDone={load}
              />
            )}
            <Mutation
              title="Rejeitar revisão fiscal"
              path={`${path}/fiscal-reject`}
              version={row.version}
              fields={[{ name: "reason", label: "Motivo", required: true }]}
              onDone={load}
            />
            <Mutation
              title="Pedir correções"
              path={`${path}/fiscal-request-changes`}
              version={row.version}
              fields={[
                {
                  name: "reason",
                  label: "Correções necessárias",
                  required: true,
                },
              ]}
              onDone={load}
            />
          </>
        )}
      {row.status === "APPROVAL_REVIEW" &&
        (me.role === "ADMIN" || me.role === row.finalApprovalRole) && (
          <>
            {independent && (
              <Mutation
                title="Aprovar medição"
                path={`${path}/approve`}
                version={row.version}
                onDone={load}
              />
            )}
            <Mutation
              title="Rejeitar medição"
              path={`${path}/reject`}
              version={row.version}
              fields={[{ name: "reason", label: "Motivo", required: true }]}
              onDone={load}
            />
          </>
        )}
      {row.status === "APPROVED" && me.role === "ADMIN" && independent && (
        <Mutation
          title="Certificar medição"
          path={`${path}/certify`}
          version={row.version}
          idempotent
          onDone={load}
        />
      )}{" "}
      {me.role === "ADMIN" &&
        ["CERTIFIED", "PARTIALLY_PAID", "PAID"].includes(txt(row.status)) && (
          <Mutation
            title="Estornar medição"
            path={`${path}/reverse`}
            version={row.version}
            fields={[
              { name: "reason", label: "Motivo do estorno", required: true },
            ]}
            idempotent
            onDone={load}
          />
        )}
      <Documents
        financial
        path={path}
        version={row.version}
        editable={edit}
        onChange={load}
      />
      <h2>Histórico de estados</h2>
      <Table
        rows={transitions}
        columns={[
          ["createdAt", "Data"],
          ["fromStatus", "Anterior"],
          ["toStatus", "Estado"],
          ["actorName", "Responsável"],
          ["comments", "Comentário"],
        ]}
      />
      <h2>Pareceres</h2>
      <Table
        rows={reviews}
        columns={[
          ["reviewedAt", "Data"],
          ["reviewType", "Revisão"],
          ["decision", "Decisão"],
          ["actorName", "Responsável"],
          ["comments", "Comentário"],
        ]}
      />
    </>
  );
}

export function FundingPage({ id }: { id: string }) {
  const me = useMe(),
    base = `/projects/${id}`;
  const [page, setPage] = useState(1),
    [requestPage, setRequestPage] = useState(1),
    [selected, setSelected] = useState<Row>(),
    [organizations, setOrganizations] = useState<Row[]>([]),
    [measurements, setMeasurements] = useState<Row[]>([]),
    [error, setError] = useState("");
  const agreements = useList(`${base}/funding-agreements?page=${page}`),
    requests = useList(`${base}/disbursement-requests?page=${requestPage}`);
  async function load() {
    await agreements.load();
    await requests.load();
    if (selected)
      setSelected(await api<Row>(`${base}/funding-agreements/${selected.id}`));
  }
  useEffect(() => {
    if (me.role === "ADMIN")
      api<Row[]>("/organizations")
        .then((x) => setOrganizations(x))
        .catch((e) => setError(e.message));
    if (["ADMIN", "MANAGER"].includes(me.role))
      api<List>(`${base}/measurements?limit=200`)
        .then((x) =>
          setMeasurements(
            x.items.filter((m) =>
              ["CERTIFIED", "PARTIALLY_PAID", "PAID"].includes(txt(m.status)),
            ),
          ),
        )
        .catch((e) => setError(e.message));
  }, [base, me.role]);
  return (
    <>
      <Nav id={id} />
      <h1>Financiamento</h1>
      <p>Acordos, pedidos e desembolsos recebidos pela obra.</p>
      {(error || agreements.error || requests.error) && (
        <Notice error>{error || agreements.error || requests.error}</Notice>
      )}
      {me.role === "ADMIN" && (
        <EntryForm
          title="Novo acordo de financiamento"
          fields={[
            {
              name: "financierOrganizationId",
              label: "Organização financiadora",
              options: rowOpts(organizations, "legalName"),
              required: true,
            },
            {
              name: "agreementNumber",
              label: "Número do acordo",
              required: true,
            },
            { name: "title", label: "Título", required: true },
            cash("approvedAmount", "Montante aprovado"),
            date("startDate", "Data de início"),
            { name: "endDate", label: "Data de fim", type: "date" },
            {
              name: "status",
              label: "Estado",
              options: opts(["DRAFT", "ACTIVE"]),
            },
          ]}
          onSave={async (values) => {
            await api(
              `${base}/funding-agreements`,
              send("POST", clean(values)),
            );
            await load();
          }}
        />
      )}
      <Table
        rows={agreements.data.items}
        columns={[
          ["agreementNumber", "Acordo"],
          ["title", "Título"],
          ["approvedAmount", "Aprovado", true],
          ["status", "Estado"],
        ]}
      />
      <Pager page={page} total={agreements.data.total} change={setPage} />
      <label>
        Abrir acordo
        <select
          value={selected?.id ?? ""}
          onChange={async (e) => {
            if (e.target.value)
              setSelected(
                await api<Row>(`${base}/funding-agreements/${e.target.value}`),
              );
            else setSelected(undefined);
          }}
        >
          <option value="">Selecionar</option>
          {agreements.data.items.map((a) => (
            <option key={a.id} value={a.id}>
              {txt(a.agreementNumber)}
            </option>
          ))}
        </select>
      </label>
      {selected && (
        <section className="card">
          <h2>{txt(selected.title)}</h2>
          <p>
            Desembolsado: {money(selected.disbursed)} · Saldo:{" "}
            {money(selected.fundingBalance)}
          </p>
          {me.role === "ADMIN" && (
            <EntryForm
              key={selected.id + ":" + selected.version}
              title="Atualizar acordo"
              fields={[
                cash(
                  "approvedAmount",
                  "Montante aprovado",
                  txt(selected.approvedAmount),
                ),
                {
                  name: "status",
                  label: "Estado",
                  value: txt(selected.status),
                  options: opts([
                    "DRAFT",
                    "ACTIVE",
                    "SUSPENDED",
                    "CLOSED",
                    "CANCELLED",
                  ]),
                },
              ]}
              onSave={async (values) => {
                await api(
                  `${base}/funding-agreements/${selected.id}`,
                  send("PATCH", { ...values, version: selected.version }),
                );
                await load();
              }}
            />
          )}
          <Documents
            financial
            path={`${base}/funding-agreements/${selected.id}`}
            version={selected.version}
            editable={
              me.role === "ADMIN" &&
              ["DRAFT", "ACTIVE"].includes(txt(selected.status))
            }
            onChange={load}
          />
        </section>
      )}
      {["ADMIN", "MANAGER"].includes(me.role) && (
        <EntryForm
          title="Novo pedido de desembolso"
          fields={[
            {
              name: "fundingAgreementId",
              label: "Acordo",
              options: rowOpts(
                agreements.data.items.filter((a) => a.status === "ACTIVE"),
                "agreementNumber",
              ),
              required: true,
            },
            {
              name: "measurementId",
              label: "Medição certificada (opcional)",
              options: [
                { value: "", label: "Sem medição" },
                ...rowOpts(measurements, "code"),
              ],
            },
            cash("requestedAmount", "Montante solicitado"),
            { name: "description", label: "Descrição" },
          ]}
          onSave={async (values) => {
            await api(
              `${base}/disbursement-requests`,
              send("POST", clean(values)),
            );
            await load();
          }}
        />
      )}
      <h2>Pedidos</h2>
      <Table
        rows={requests.data.items}
        columns={[
          ["requestNumber", "Número"],
          ["requestedAmount", "Solicitado", true],
          ["approvedAmount", "Aprovado", true],
          ["disbursedAmount", "Desembolsado", true],
          ["status", "Estado"],
        ]}
      />
      <Pager
        page={requestPage}
        total={requests.data.total}
        change={setRequestPage}
      />
      {requests.data.items.map((req) => (
        <section className="card" key={req.id}>
          <h3>
            Pedido {txt(req.requestNumber)} · {names[txt(req.status)]}
          </h3>
          {req.status === "DRAFT" && ["ADMIN", "MANAGER"].includes(me.role) && (
            <Mutation
              title="Submeter pedido"
              path={`${base}/disbursement-requests/${req.id}/submit`}
              version={req.version}
              onDone={load}
            />
          )}{" "}
          {req.status === "SUBMITTED" &&
            ["ADMIN", "FINANCIER"].includes(me.role) &&
            req.createdBy !== me.user.id && (
              <>
                <Mutation
                  title="Aprovar pedido"
                  path={`${base}/disbursement-requests/${req.id}/approve`}
                  version={req.version}
                  fields={[
                    cash(
                      "approvedAmount",
                      "Valor aprovado",
                      txt(req.requestedAmount),
                    ),
                  ]}
                  onDone={load}
                />
                <Mutation
                  title="Rejeitar pedido"
                  path={`${base}/disbursement-requests/${req.id}/reject`}
                  version={req.version}
                  fields={[{ name: "reason", label: "Motivo", required: true }]}
                  onDone={load}
                />
              </>
            )}
          {["APPROVED", "PARTIALLY_DISBURSED"].includes(txt(req.status)) &&
            ["ADMIN", "FINANCIER"].includes(me.role) && (
              <Mutation
                title="Registar desembolso"
                path={`${base}/disbursement-requests/${req.id}/disbursements`}
                version={req.version}
                fields={[
                  cash("amount", "Valor do desembolso"),
                  date("disbursementDate", "Data do desembolso"),
                  { name: "reference", label: "Referência" },
                ]}
                idempotent
                onDone={load}
              />
            )}
        </section>
      ))}
    </>
  );
}
export function PaymentsPage({ id }: { id: string }) {
  const me = useMe(),
    base = `/projects/${id}`;
  const [page, setPage] = useState(1),
    [sources, setSources] = useState<Row[]>([]),
    [selected, setSelected] = useState<Row>(),
    [source, setSource] = useState(""),
    [error, setError] = useState("");
  const payments = useList(`${base}/payments?page=${page}`);
  async function load() {
    await payments.load();
    if (me.role === "ADMIN") {
      const [m, c, e] = await Promise.all([
        api<List>(`${base}/measurements?limit=200`),
        api<List>(`${base}/contracts?limit=200`),
        api<List>(`${base}/expenses?limit=200&status=APPROVED`),
      ]);
      const sourceRows = m.items
        .filter((x) => ["CERTIFIED", "PARTIALLY_PAID"].includes(txt(x.status)))
        .map((x) => ({
          ...x,
          sourceType: "measurementId",
          label: `Medição ${txt(x.code)} · ${money(x.outstandingPayable)}`,
          supplierId: c.items.find((a) => a.id === x.contractId)?.supplierId,
        }));
      const expenseRows = e.items
        .filter((x) => x.supplierId)
        .map((x) => ({
          ...x,
          sourceType: "expenseId",
          label: `Despesa ${txt(x.expenseNumber)}`,
        }));
      setSources([...sourceRows, ...expenseRows]);
    }
    if (selected)
      setSelected(await api<Row>(`${base}/payments/${selected.id}`));
  }
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [base, page]);
  const chosen = sources.find((x) => x.id === source);
  return (
    <>
      <Nav id={id} />
      <h1>Pagamentos</h1>
      <p>
        Saídas para fornecedores. Os desembolsos de financiamento são registados
        separadamente.
      </p>
      {(error || payments.error) && (
        <Notice error>{error || payments.error}</Notice>
      )}
      {me.role === "ADMIN" && (
        <>
          <label>
            Origem do pagamento
            <select value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">Selecionar origem</option>
              {sources.map((x) => (
                <option value={x.id} key={x.id}>
                  {txt(x.label)}
                </option>
              ))}
            </select>
          </label>
          {chosen && (
            <Mutation
              key={chosen.id}
              title="Registar pagamento"
              path={`${base}/payments`}
              fields={[
                {
                  name: "supplierId",
                  label: "Fornecedor",
                  value: txt(chosen.supplierId),
                  type: "hidden",
                },
                {
                  name: txt(chosen.sourceType),
                  label: "Origem",
                  value: chosen.id,
                  type: "hidden",
                },
                cash("amount", "Valor do pagamento"),
                date("paymentDate", "Data do pagamento"),
                {
                  name: "method",
                  label: "Método",
                  required: true,
                  value: "BANK_TRANSFER",
                  options: opts([
                    "BANK_TRANSFER",
                    "CASH",
                    "CHEQUE",
                    "MOBILE_MONEY",
                    "OTHER",
                  ]),
                },
                { name: "reference", label: "Referência" },
                { name: "description", label: "Descrição" },
              ]}
              idempotent
              onDone={load}
            />
          )}
        </>
      )}
      <Table
        rows={payments.data.items}
        columns={[
          ["paymentNumber", "Número"],
          ["paymentDate", "Data"],
          ["supplierName", "Fornecedor"],
          ["measurementCode", "Medição"],
          ["expenseNumber", "Despesa"],
          ["retentionReleaseId", "Libertação"],
          ["reference", "Referência"],
          ["amount", "Valor", true],
          ["status", "Estado"],
        ]}
      />
      <Pager page={page} total={payments.data.total} change={setPage} />
      <label>
        Abrir pagamento
        <select
          value={selected?.id ?? ""}
          onChange={(e) =>
            setSelected(
              payments.data.items.find((x) => x.id === e.target.value),
            )
          }
        >
          <option value="">Selecionar</option>
          {payments.data.items.map((x) => (
            <option key={x.id} value={x.id}>
              {txt(x.paymentNumber)} · {money(x.amount)}
            </option>
          ))}
        </select>
      </label>
      {selected && (
        <>
          <Documents
            financial
            path={`${base}/payments/${selected.id}`}
            version={selected.version}
            editable={me.role === "ADMIN" && selected.status === "POSTED"}
            onChange={load}
          />
          {me.role === "ADMIN" && selected.status === "POSTED" && (
            <Mutation
              title="Estornar pagamento"
              path={`${base}/payments/${selected.id}/reverse`}
              version={selected.version}
              fields={[
                { name: "reason", label: "Motivo do estorno", required: true },
              ]}
              idempotent
              onDone={load}
            />
          )}
        </>
      )}
    </>
  );
}
export function FinancialPage({ id }: { id: string }) {
  const [summary, setSummary] = useState<Record<string, string>>(),
    [curve, setCurve] = useState<{ items: Row[]; baselineAmount: string }>(),
    [error, setError] = useState("");
  useEffect(() => {
    Promise.all([
      api<Record<string, string>>(`/projects/${id}/financial/summary`),
      api<{ items: Row[]; baselineAmount: string }>(
        `/projects/${id}/financial/curve`,
      ),
    ])
      .then(([s, c]) => {
        setSummary(s);
        setCurve(c);
      })
      .catch((e) => setError(e.message));
  }, [id]);
  const labels: Record<string, string> = {
    approvedBudget: "Orçamento aprovado",
    currentContractValue: "Valor contratual atual",
    grossMeasured: "Bruto medido",
    certified: "Certificado",
    retentionWithheld: "Retenções constituídas",
    retentionAvailable: "Retenções disponíveis",
    advanceOutstanding: "Adiantamento por recuperar",
    netCertified: "Líquido certificado",
    paid: "Pago em medições",
    outstandingPayable: "Saldo a pagar",
    approvedFunding: "Financiamento aprovado",
    disbursed: "Desembolsado",
    fundingBalance: "Saldo de financiamento",
  };
  return (
    <>
      <Nav id={id} />
      <h1>Dashboard financeiro</h1>
      {error && <Notice error>{error}</Notice>}
      {summary && (
        <>
          <div className="stats budget-stats">
            {Object.entries(labels).map(([key, label]) => (
              <article className="card" key={key}>
                <span>{label}</span>
                <h2>{money(summary[key])}</h2>
              </article>
            ))}
          </div>
          <section className="card">
            <h2>Progresso físico e financeiro</h2>
            <p>
              Físico: {summary.physicalProgress}% · Financeiro certificado:{" "}
              {summary.financialProgress}% · Medido:{" "}
              {summary.measurementProgress}%
            </p>
            <p>
              Diferença físico − financeiro: {summary.physicalFinancialVariance}{" "}
              pontos percentuais. Esta diferença descreve ritmos distintos de
              execução e certificação.
            </p>
          </section>
        </>
      )}
      {curve && (
        <section className="card">
          <h2>Curva S física e financeira</h2>
          <p>
            Baseline financeira: {money(curve.baselineAmount)}. Planeamento
            financeiro proporcional ao planeamento físico da M3.
          </p>
          <svg
            viewBox="0 0 800 280"
            role="img"
            aria-label="Curva S física e financeira"
            style={{ width: "100%", maxHeight: 320 }}
          >
            <path d="M40 10V240H780" stroke="currentColor" fill="none" />
            {[0, 25, 50, 75, 100].map((n) => (
              <g key={n}>
                <text x="0" y={245 - n * 2.2} fontSize="12">
                  {n}%
                </text>
                <path d={`M40 ${240 - n * 2.2}H780`} stroke="#e2e8f0" />
              </g>
            ))}
            {[
              "planned_physical",
              "actual_physical",
              "planned_financial",
              "actual_financial",
            ].map((key, k) => (
              <g key={key}>
                <polyline
                  key={key}
                  fill="none"
                  stroke={["#64748b", "#0d9488", "#d97706", "#2563eb"][k]}
                  strokeDasharray={k % 2 === 0 ? "6 4" : undefined}
                  strokeWidth="2.5"
                  points={curve.items
                    .map(
                      (r, i) =>
                        `${40 + (i * 740) / Math.max(1, curve.items.length - 1)},${240 - Number(r[key]) * 2.2}`,
                    )
                    .join(" ")}
                />
                {curve.items.map((r, i) => (
                  <circle
                    key={txt(r.date)}
                    cx={40 + (i * 740) / Math.max(1, curve.items.length - 1)}
                    cy={240 - Number(r[key]) * 2.2}
                    r="3"
                    fill={["#64748b", "#0d9488", "#d97706", "#2563eb"][k]}
                  >
                    <title>
                      {txt(r.date)}: {txt(r[key])}%
                    </title>
                  </circle>
                ))}
              </g>
            ))}
          </svg>
          <p>
            Físico planeado (cinzento) · Físico real (verde) · Financeiro
            planeado (laranja) · Financeiro real (azul)
          </p>
          <Table
            rows={curve.items.map((x) => ({ ...x, id: txt(x.date) }))}
            columns={[
              ["date", "Data"],
              ["planned_physical", "Físico planeado %"],
              ["actual_physical", "Físico real %"],
              ["planned_financial", "Financeiro planeado %"],
              ["actual_financial", "Financeiro real %"],
              ["certifiedCumulative", "Certificado acumulado", true],
            ]}
          />
        </section>
      )}
    </>
  );
}
export function ContractFinancial({
  id,
  contractId,
}: {
  id: string;
  contractId: string;
}) {
  const me = useMe(),
    path = `/projects/${id}/contracts/${contractId}`;
  const [contract, setContract] = useState<Row>(),
    [balance, setBalance] = useState<Row>(),
    [error, setError] = useState("");
  async function load() {
    try {
      setContract(await api<Row>(path));
      setBalance(await api<Row>(`${path}/retention`));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, [path]);
  return (
    <>
      <Nav id={id} />
      <h1>Retenções e adiantamentos</h1>
      {error && <Notice error>{error}</Notice>}
      {contract && balance && (
        <>
          <p>
            Contrato {txt(contract.contractNumber)} · Retenção disponível:{" "}
            {money(balance.retentionAvailable)} · Adiantamento por recuperar:{" "}
            {money(balance.advanceOutstanding)}
          </p>
          {me.role === "ADMIN" && (
            <EntryForm
              title="Condições de recuperação"
              fields={[
                {
                  name: "advanceRecoveryMethod",
                  label: "Método de recuperação",
                  value: txt(contract.advanceRecoveryMethod),
                  options: opts(["MANUAL", "PERCENTAGE", "FIXED"]),
                },
                cash(
                  "advanceRecoveryPercentage",
                  "Percentagem",
                  txt(contract.advanceRecoveryPercentage) || "0",
                ),
                cash(
                  "advanceRecoveryFixedAmount",
                  "Valor fixo",
                  txt(contract.advanceRecoveryFixedAmount) || "0",
                ),
                {
                  name: "finalApprovalRole",
                  label: "Aprovação final",
                  value: txt(contract.finalApprovalRole),
                  options: opts(["FINANCIER", "CLIENT"]),
                },
              ]}
              onSave={async (values) => {
                await api(
                  `${path}/financial-settings`,
                  send("PATCH", { ...values, version: contract.version }),
                );
                await load();
              }}
            />
          )}
          {["ADMIN", "MANAGER"].includes(me.role) && (
            <Mutation
              title="Solicitar libertação de retenção"
              path={`${path}/retention-releases`}
              fields={[
                cash("amount", "Valor a libertar"),
                { name: "reason", label: "Justificação", required: true },
              ]}
              onDone={load}
            />
          )}
          <h2>Movimentos de retenção</h2>
          <Table
            rows={(balance.transactions ?? []) as Row[]}
            columns={[
              ["createdAt", "Data"],
              ["type", "Movimento"],
              ["amount", "Valor", true],
            ]}
          />
          <h2>Movimentos de adiantamento</h2>
          <Table
            rows={(balance.advances ?? []) as Row[]}
            columns={[
              ["createdAt", "Data"],
              ["type", "Movimento"],
              ["amount", "Valor", true],
            ]}
          />
          <h2>Libertações</h2>
          {((balance.releases ?? []) as Row[]).map((row) => (
            <section className="card" key={row.id}>
              <p>
                {money(row.amount)} · {names[txt(row.status)]} ·{" "}
                {txt(row.reason)}
              </p>
              {row.status === "DRAFT" &&
                ["ADMIN", "MANAGER"].includes(me.role) && (
                  <Mutation
                    title="Submeter libertação"
                    path={`/projects/${id}/retention-releases/${row.id}/submit`}
                    version={row.version}
                    onDone={load}
                  />
                )}{" "}
              {row.status === "SUBMITTED" &&
                ["ADMIN", "FINANCIER"].includes(me.role) &&
                row.createdBy !== me.user.id && (
                  <Mutation
                    title="Aprovar libertação"
                    path={`/projects/${id}/retention-releases/${row.id}/approve`}
                    version={row.version}
                    onDone={load}
                  />
                )}{" "}
              {row.status === "APPROVED" && me.role === "ADMIN" && (
                <Mutation
                  title="Pagar retenção"
                  path={`/projects/${id}/payments`}
                  fields={[
                    {
                      name: "supplierId",
                      label: "Fornecedor",
                      type: "hidden",
                      value: txt(contract.supplierId),
                    },
                    {
                      name: "retentionReleaseId",
                      label: "Origem",
                      type: "hidden",
                      value: row.id,
                    },
                    cash("amount", "Valor", txt(row.amount)),
                    date("paymentDate", "Data"),
                    {
                      name: "method",
                      label: "Método",
                      required: true,
                      value: "BANK_TRANSFER",
                      options: opts([
                        "BANK_TRANSFER",
                        "CASH",
                        "CHEQUE",
                        "MOBILE_MONEY",
                        "OTHER",
                      ]),
                    },
                  ]}
                  idempotent
                  onDone={load}
                />
              )}
            </section>
          ))}
        </>
      )}
    </>
  );
}
