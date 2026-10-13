"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Decimal } from "decimal.js";
import { Notice } from "@obras/ui";
import { api, send } from "../../lib/api";
import { useMe } from "../shell";
import { EntryForm, type Field, today, dateText } from "../execution/common";
type Row = {
  id: string;
  version: number;
  [key: string]: string | number | null;
};
type List = { items: Row[]; total: number; page: number; limit: number };
const txt = (v: unknown) => (v == null ? "" : String(v));
const money = (v: unknown) =>
  new Decimal(txt(v) || "0").toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, " ") +
  " MZN";
const states: Record<string, string> = {
  DRAFT: "Rascunho",
  ACTIVE: "Ativo",
  INACTIVE: "Inativo",
  BLOCKED: "Bloqueado",
  SUSPENDED: "Suspenso",
  COMPLETED: "Concluído",
  TERMINATED: "Terminado",
  SUBMITTED: "Submetido",
  APPROVED: "Aprovado",
  REJECTED: "Rejeitado",
  REVERSED: "Estornado",
  SUPPLIER: "Fornecedor",
  SUBCONTRACTOR: "Subempreiteiro",
  SERVICE_PROVIDER: "Prestador",
  CONSULTANT: "Consultor",
  OTHER: "Outro",
  SUBCONTRACT: "Subempreitada",
  CONSTRUCTION: "Construção",
  SUPPLY: "Fornecimento",
  SERVICE: "Serviço",
  CONSULTANCY: "Consultoria",
  ADDITION: "Adição",
  OMISSION: "Supressão",
  TIME_EXTENSION: "Prorrogação",
  INVOICE: "Fatura",
  RECEIPT: "Recibo",
  DELIVERY_NOTE: "Guia de entrega",
  PURCHASE_ORDER: "Encomenda",
};
const opts = (values: string[]) =>
  values.map((value) => ({ value, label: states[value] ?? value }));
const rowOpts = (rows: Row[], label = "name") =>
  rows.map((r) => ({
    value: r.id,
    label: txt(r[label] ?? r.title ?? r.description ?? r.id),
  }));
function clean(values: Record<string, string>, numeric: string[] = []) {
  return Object.fromEntries(
    Object.entries(values)
      .filter(([, v]) => v !== "")
      .map(([k, v]) => [k, numeric.includes(k) ? Number(v) : v]),
  );
}
function Nav({ id }: { id?: string }) {
  const me = useMe();
  return (
    <nav className="budget-nav" aria-label="Comercial">
      <Link href={id ? `/projects/${id}` : "/projects"}>← Obra</Link>
      {["ADMIN", "MANAGER"].includes(me.role) && (
        <Link href="/suppliers">Fornecedores</Link>
      )}
      {id && (
        <>
          <Link href={`/projects/${id}/contracts`}>Contratos</Link>
          <Link href={`/projects/${id}/measurements`}>Medições</Link>
          {["ADMIN", "MANAGER"].includes(me.role) && (
            <>
              <Link href={`/projects/${id}/expenses`}>Despesas</Link>
              <Link href={`/projects/${id}/cost-centers`}>
                Centros de custo
              </Link>
            </>
          )}
          {me.role !== "INSPECTOR" && (
            <Link href={`/projects/${id}/costs`}>Custos</Link>
          )}
        </>
      )}
    </nav>
  );
}
function Pager({
  page,
  total,
  onPage,
}: {
  page: number;
  total: number;
  onPage: (p: number) => void;
}) {
  return (
    <div className="actions">
      <button
        className="secondary"
        disabled={page === 1}
        onClick={() => onPage(page - 1)}
      >
        Anterior
      </button>
      <span>
        Página {page} · {total} registos
      </span>
      <button
        className="secondary"
        disabled={page * 50 >= total}
        onClick={() => onPage(page + 1)}
      >
        Seguinte
      </button>
    </div>
  );
}
function useRows(path: string) {
  const [data, setData] = useState<List>({
      items: [],
      total: 0,
      page: 1,
      limit: 50,
    }),
    [error, setError] = useState("");
  const load = () =>
    api<List>(path)
      .then(setData)
      .catch((e) => setError(e.message));
  useEffect(() => {
    void load();
  }, [path]);
  return { data, error, setError, load };
}
export function SuppliersPage() {
  const me = useMe(),
    [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [type, setType] = useState(""),
    [edit, setEdit] = useState<Row | null | undefined>(),
    [organizations, setOrganizations] = useState<Row[]>([]);
  const { data, error, setError, load } = useRows(
    `/suppliers?page=${page}&limit=50${search ? "&search=" + encodeURIComponent(search) : ""}${status ? "&status=" + status : ""}${type ? "&type=" + type : ""}`,
  );
  useEffect(() => {
    if (me.role === "ADMIN")
      api<Row[]>("/organizations")
        .then(setOrganizations)
        .catch((e) => setError(e.message));
  }, []);
  const fields: Field[] = [
    {
      name: "organizationId",
      label: "Organização existente",
      options: rowOpts(organizations, "legalName"),
    },
    { name: "legalName", label: "Nome legal", required: true },
    { name: "tradeName", label: "Nome comercial" },
    {
      name: "supplierType",
      label: "Tipo",
      required: true,
      options: opts([
        "SUPPLIER",
        "SUBCONTRACTOR",
        "CONSULTANT",
        "SERVICE_PROVIDER",
        "OTHER",
      ]),
    },
    { name: "taxNumber", label: "NUIT" },
    { name: "email", label: "E-mail", type: "email" },
    { name: "phone", label: "Telefone" },
    { name: "address", label: "Endereço" },
    { name: "contactPerson", label: "Pessoa de contacto" },
    { name: "contactEmail", label: "E-mail de contacto", type: "email" },
    { name: "contactPhone", label: "Telefone de contacto" },
    {
      name: "status",
      label: "Estado",
      required: true,
      options: opts(["ACTIVE", "INACTIVE", "BLOCKED"]),
    },
  ];
  return (
    <>
      <h1>Fornecedores e subempreiteiros</h1>
      <Nav />
      {error && <Notice error>{error}</Notice>}
      <div className="actions">
        <label>
          Pesquisar
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          Estado
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {opts(["ACTIVE", "INACTIVE", "BLOCKED"]).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tipo
          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {opts([
              "SUPPLIER",
              "SUBCONTRACTOR",
              "CONSULTANT",
              "SERVICE_PROVIDER",
              "OTHER",
            ]).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {me.role === "ADMIN" && (
          <button onClick={() => setEdit(null)}>Novo fornecedor</button>
        )}
      </div>
      {edit !== undefined && (
        <EntryForm
          key={edit?.id ?? "new"}
          title={edit ? "Editar fornecedor" : "Novo fornecedor"}
          fields={fields.map((f) => ({
            ...f,
            value: txt(edit?.[f.name]) || undefined,
          }))}
          onCancel={() => setEdit(undefined)}
          onSave={async (values) => {
            await api(
              `/suppliers${edit ? "/" + edit.id : ""}`,
              send(edit ? "PATCH" : "POST", {
                ...clean(values),
                ...(edit ? { version: edit.version } : {}),
              }),
            );
            setEdit(undefined);
            await load();
          }}
        />
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {[
                "Nome",
                "Tipo",
                "NUIT",
                "Contacto",
                "Estado",
                "Contratos",
                "Ações",
              ].map((x) => (
                <th key={x}>{x}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.items.map((r) => (
              <tr key={r.id}>
                <td>{r.legalName}</td>
                <td>{states[txt(r.supplierType)]}</td>
                <td>{r.taxNumber}</td>
                <td>
                  {r.contactPerson} {r.phone}
                </td>
                <td>{states[txt(r.status)]}</td>
                <td>{r.contractCount}</td>
                <td>
                  {me.role === "ADMIN" && (
                    <>
                      <button className="secondary" onClick={() => setEdit(r)}>
                        Editar
                      </button>
                      <button
                        className="secondary"
                        disabled={r.status === "INACTIVE"}
                        onClick={() =>
                          void api(
                            `/suppliers/${r.id}/deactivate`,
                            send("POST", { version: r.version }),
                          )
                            .then(load)
                            .catch((e) => setError(e.message))
                        }
                      >
                        Desativar
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} total={data.total} onPage={setPage} />
    </>
  );
}
export function CentersPage({ id }: { id: string }) {
  const [edit, setEdit] = useState<Row | null | undefined>(),
    [page, setPage] = useState(1);
  const path = `/projects/${id}/cost-centers`,
    { data, error, setError, load } = useRows(`${path}?page=${page}&limit=50`);
  const fields: Field[] = [
    { name: "code", label: "Código", required: true },
    { name: "name", label: "Nome", required: true },
    { name: "description", label: "Descrição" },
    {
      name: "parentId",
      label: "Centro pai",
      options: rowOpts(
        data.items.filter((x) => x.id !== edit?.id && x.status === "ACTIVE"),
      ),
    },
  ];
  return (
    <>
      <h1>Centros de custo</h1>
      <Nav id={id} />
      {error && <Notice error>{error}</Notice>}
      <button onClick={() => setEdit(null)}>Novo centro de custo</button>
      {edit !== undefined && (
        <EntryForm
          key={edit?.id ?? "new"}
          title={edit ? "Editar centro" : "Novo centro de custo"}
          fields={fields.map((f) => ({
            ...f,
            value: txt(edit?.[f.name]) || undefined,
          }))}
          onCancel={() => setEdit(undefined)}
          onSave={async (values) => {
            await api(
              path + (edit ? "/" + edit.id : ""),
              send(edit ? "PATCH" : "POST", {
                ...clean(values),
                parentId: values.parentId || null,
                ...(edit ? { version: edit.version } : {}),
              }),
            );
            setEdit(undefined);
            await load();
          }}
        />
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Nome</th>
              <th>Centro pai</th>
              <th>Estado</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((r) => (
              <tr key={r.id}>
                <td>{r.code}</td>
                <td>{r.name}</td>
                <td>
                  {data.items.find((x) => x.id === r.parentId)?.name ?? "—"}
                </td>
                <td>{states[txt(r.status)]}</td>
                <td>
                  <button className="secondary" onClick={() => setEdit(r)}>
                    Editar
                  </button>
                  <button
                    className="secondary"
                    disabled={r.status === "INACTIVE"}
                    onClick={() =>
                      void api(
                        `${path}/${r.id}/deactivate`,
                        send("POST", { version: r.version }),
                      )
                        .then(load)
                        .catch((e) => setError(e.message))
                    }
                  >
                    Desativar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} total={data.total} onPage={setPage} />
    </>
  );
}
const contractFields = (suppliers: Row[]): Field[] => [
  {
    name: "supplierId",
    label: "Fornecedor",
    required: true,
    options: rowOpts(suppliers, "legalName"),
  },
  { name: "contractNumber", label: "Número do contrato", required: true },
  { name: "title", label: "Título", required: true },
  { name: "description", label: "Descrição" },
  {
    name: "contractType",
    label: "Tipo de contrato",
    required: true,
    options: opts([
      "SUBCONTRACT",
      "CONSTRUCTION",
      "SUPPLY",
      "SERVICE",
      "CONSULTANCY",
      "OTHER",
    ]),
  },
  {
    name: "originalValue",
    label: "Valor original (MZN)",
    required: true,
    type: "number",
    min: "0",
    step: "0.01",
  },
  {
    name: "retentionPercentage",
    label: "Retenção (%)",
    type: "number",
    min: "0",
    max: "100",
    step: "0.01",
    value: "0",
  },
  {
    name: "advancePercentage",
    label: "Adiantamento (%)",
    type: "number",
    min: "0",
    max: "100",
    step: "0.01",
    value: "0",
  },
  {
    name: "advanceAmount",
    label: "Adiantamento fixo (MZN)",
    type: "number",
    min: "0",
    step: "0.01",
    value: "0",
  },
  { name: "startDate", label: "Início", type: "date" },
  { name: "endDate", label: "Fim", type: "date" },
];
export function ContractsPage({ id }: { id: string }) {
  const me = useMe(),
    editor = ["ADMIN", "MANAGER"].includes(me.role),
    [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [create, setCreate] = useState(false),
    [suppliers, setSuppliers] = useState<Row[]>([]);
  const path = `/projects/${id}/contracts`,
    { data, error, setError, load } = useRows(
      `${path}?page=${page}&limit=50${search ? "&search=" + encodeURIComponent(search) : ""}${status ? "&status=" + status : ""}`,
    );
  useEffect(() => {
    if (editor)
      api<List>("/suppliers?status=ACTIVE&limit=200")
        .then((r) => setSuppliers(r.items))
        .catch((e) => setError(e.message));
  }, []);
  return (
    <>
      <h1>Contratos</h1>
      <Nav id={id} />
      {error && <Notice error>{error}</Notice>}
      <div className="actions">
        <label>
          Pesquisar
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          Estado
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {opts([
              "DRAFT",
              "ACTIVE",
              "SUSPENDED",
              "COMPLETED",
              "TERMINATED",
            ]).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {editor && (
          <button onClick={() => setCreate(true)}>Novo contrato</button>
        )}
      </div>
      {create && (
        <EntryForm
          title="Novo contrato"
          fields={contractFields(suppliers)}
          onCancel={() => setCreate(false)}
          onSave={async (v) => {
            const r = await api<Row>(path, send("POST", clean(v)));
            await load();
            window.location.assign(`/projects/${id}/contracts/${r.id}`);
          }}
        />
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {[
                "Contrato",
                "Fornecedor",
                "Tipo",
                "Original",
                "Atual",
                "Retenção",
                "Adiantamento",
                "Estado",
                "Início",
                "Fim",
              ].map((x) => (
                <th key={x}>{x}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.items.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link href={`/projects/${id}/contracts/${r.id}`}>
                    {r.contractNumber} · {r.title}
                  </Link>
                </td>
                <td>{r.supplierName}</td>
                <td>{states[txt(r.contractType)]}</td>
                <td>{money(r.originalValue)}</td>
                <td>{money(r.currentValue)}</td>
                <td>{r.retentionPercentage}%</td>
                <td>{money(r.advanceAmount)}</td>
                <td>{states[txt(r.status)]}</td>
                <td>{dateText(txt(r.startDate))}</td>
                <td>{dateText(txt(r.endDate))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} total={data.total} onPage={setPage} />
    </>
  );
}
export function Documents({
  path,
  version,
  editable,
  onChange,
  financial = false,
}: {
  path: string;
  version: number;
  editable: boolean;
  onChange: () => Promise<void>;
  financial?: boolean;
}) {
  const { data, error, setError, load } = useRows(`${path}/documents`),
    [busy, setBusy] = useState(false),
    [type, setType] = useState("INVOICE");
  return (
    <section className="card">
      <h2>Documentos</h2>
      {error && <Notice error>{error}</Notice>}
      {editable && (
        <>
          <label>
            Tipo de comprovativo
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {opts(
                financial
                  ? [
                      "MEASUREMENT_SHEET",
                      "CERTIFICATE",
                      "INVOICE",
                      "PAYMENT_PROOF",
                      "DISBURSEMENT_PROOF",
                      "OTHER",
                    ]
                  : [
                      "INVOICE",
                      "RECEIPT",
                      "DELIVERY_NOTE",
                      "PURCHASE_ORDER",
                      "OTHER",
                    ],
              ).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Anexar comprovativo
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp"
              disabled={busy}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setBusy(true);
                setError("");
                try {
                  const bytes = await file.arrayBuffer(),
                    hash = Array.from(
                      new Uint8Array(
                        await crypto.subtle.digest("SHA-256", bytes),
                      ),
                    )
                      .map((b) => b.toString(16).padStart(2, "0"))
                      .join("");
                  const ticket = await api<{
                    id: string;
                    uploadUrl: string;
                    version: number;
                  }>(
                    `${path}/documents`,
                    send("POST", {
                      version,
                      fileName: file.name,
                      mimeType: file.type,
                      sizeBytes: file.size,
                      checksum: hash,
                      documentType: type,
                    }),
                  );
                  const form = new FormData();
                  form.append("file", file);
                  const upload = await fetch(ticket.uploadUrl, {
                    method: "PUT",
                    body: form,
                    credentials: "include",
                  });
                  if (!upload.ok)
                    throw new Error("Não foi possível enviar o comprovativo");
                  await api(
                    `${path}/documents/${ticket.id}/confirm`,
                    send("POST", { version: ticket.version }),
                  );
                  await load();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  await onChange();
                  setBusy(false);
                }
              }}
            />
          </label>
          {busy && <p role="status">A enviar comprovativo…</p>}
        </>
      )}
      {data.items.map((r) => (
        <p key={r.id}>
          <a href={`/api/v1${path}/documents/${r.id}/content`}>{r.fileName}</a>
        </p>
      ))}
    </section>
  );
}
function History({ path }: { path: string }) {
  const { data, error } = useRows(`${path}/history`);
  return (
    <section className="card">
      <h2>Histórico</h2>
      {error && <Notice error>{error}</Notice>}
      {data.items.map((r) => (
        <p key={r.id}>
          {dateText(txt(r.createdAt))} · {r.action}
        </p>
      ))}
    </section>
  );
}
export function ContractDetail({
  id,
  contractId,
}: {
  id: string;
  contractId: string;
}) {
  const me = useMe(),
    admin = me.role === "ADMIN",
    editor = ["ADMIN", "MANAGER"].includes(me.role),
    path = `/projects/${id}/contracts/${contractId}`;
  const [row, setRow] = useState<Row>(),
    [error, setError] = useState(""),
    [tab, setTab] = useState("Resumo"),
    [items, setItems] = useState<List>({
      items: [],
      total: 0,
      page: 1,
      limit: 50,
    }),
    [amends, setAmends] = useState<List>({
      items: [],
      total: 0,
      page: 1,
      limit: 50,
    }),
    [itemPage, setItemPage] = useState(1),
    [amendPage, setAmendPage] = useState(1),
    [budget, setBudget] = useState<Row[]>([]),
    [edit, setEdit] = useState(false),
    [newItem, setNewItem] = useState<Row | null | undefined>(),
    [newAmend, setNewAmend] = useState<Row | null | undefined>(),
    [suppliers, setSuppliers] = useState<Row[]>([]);
  async function load() {
    const [r, i, a] = await Promise.all([
      api<Row>(path),
      api<List>(`${path}/items?page=${itemPage}`),
      api<List>(`${path}/amendments?page=${amendPage}`),
    ]);
    setRow(r);
    setItems(i);
    setAmends(a);
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [path, itemPage, amendPage]);
  useEffect(() => {
    if (editor) {
      api<List>("/suppliers?status=ACTIVE&limit=200")
        .then((r) => setSuppliers(r.items))
        .catch((e) => setError(e.message));
      api<List>(`/projects/${id}/costs/items?limit=200`)
        .then((r) =>
          setBudget(r.items.map((x) => ({ ...x, id: txt(x.budgetItemId) }))),
        )
        .catch((e) => setError(e.message));
    }
  }, [id]);
  async function mutate(url: string, method: string, data: unknown) {
    try {
      setError("");
      await api(url, send(method, data));
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (!row) return <p>{error || "A carregar contrato…"}</p>;
  const itemFields: Field[] = [
    { name: "code", label: "Código" },
    { name: "description", label: "Descrição do item", required: true },
    {
      name: "budgetItemId",
      label: "Item orçamental",
      options: rowOpts(budget, "description"),
    },
    { name: "unit", label: "Unidade" },
    {
      name: "quantity",
      label: "Quantidade",
      type: "number",
      min: "0",
      step: "0.0001",
    },
    {
      name: "unitPrice",
      label: "Preço unitário",
      type: "number",
      min: "0",
      step: "0.01",
    },
    {
      name: "totalValue",
      label: "Valor fixo (sem quantidade)",
      type: "number",
      min: "0",
      step: "0.01",
    },
  ];
  const amendmentFields: Field[] = [
    {
      name: "amendmentType",
      label: "Tipo de adenda",
      required: true,
      options: opts(["ADDITION", "OMISSION", "TIME_EXTENSION", "OTHER"]),
    },
    { name: "description", label: "Descrição da adenda", required: true },
    {
      name: "amount",
      label: "Valor da adenda (MZN)",
      required: true,
      type: "number",
      min: "0",
      step: "0.01",
    },
    { name: "effectiveDate", label: "Data de efeito", type: "date" },
  ];
  return (
    <>
      <h1>
        {row.contractNumber} · {row.title}
      </h1>
      <Nav id={id} />
      <Link href={`/projects/${id}/contracts/${contractId}/financial`}>
        Retenções e adiantamentos
      </Link>
      <p>
        {row.supplierName} ·{" "}
        <span className="badge">{states[txt(row.status)]}</span>
      </p>
      {error && <Notice error>{error}</Notice>}
      <nav className="execution-tabs">
        {[
          "Resumo",
          "Itens",
          "Adendas",
          "Documentos",
          ...(editor ? ["Histórico"] : []),
        ].map((x) => (
          <button
            key={x}
            className={tab === x ? "" : "secondary"}
            onClick={() => setTab(x)}
          >
            {x}
          </button>
        ))}
      </nav>
      {tab === "Resumo" && (
        <>
          <div className="stats budget-stats">
            {[
              ["Valor original", money(row.originalValue)],
              ["Valor atual", money(row.currentValue)],
              ["Adições aprovadas", money(row.approvedAdditions)],
              ["Supressões aprovadas", money(row.approvedOmissions)],
              [
                "Adendas líquidas",
                money(
                  new Decimal(txt(row.currentValue)).minus(
                    txt(row.originalValue),
                  ),
                ),
              ],
              ["Retenção", txt(row.retentionPercentage) + "%"],
              ["Adiantamento", money(row.advanceAmount)],
              [
                "Prazo",
                dateText(txt(row.startDate)) +
                  " → " +
                  dateText(txt(row.endDate)),
              ],
            ].map(([k, v]) => (
              <div className="stat" key={k}>
                <span>{k}</span>
                <strong>{v}</strong>
              </div>
            ))}
          </div>
          <p>
            Adiantamento calculado sobre o valor original. Recuperação reservada
            para M5.
          </p>
          {editor && row.status === "DRAFT" && (
            <button onClick={() => setEdit(true)}>Editar contrato</button>
          )}
          {edit && (
            <EntryForm
              title="Editar contrato"
              fields={contractFields(suppliers)
                .filter((f) => f.name !== "originalValue")
                .map((f) => ({
                  ...f,
                  value:
                    f.name === "advanceAmount" &&
                    Number(row.advancePercentage) > 0
                      ? "0"
                      : txt(row[f.name]).slice(
                          0,
                          f.type === "date" ? 10 : undefined,
                        ),
                }))}
              onCancel={() => setEdit(false)}
              onSave={async (v) => {
                await api(
                  path,
                  send("PATCH", { ...clean(v), version: row.version }),
                );
                setEdit(false);
                await load();
              }}
            />
          )}
          {admin && (
            <div className="actions">
              {(row.status === "DRAFT"
                ? ["activate"]
                : row.status === "ACTIVE"
                  ? ["suspend", "complete", "terminate"]
                  : row.status === "SUSPENDED"
                    ? ["activate", "terminate"]
                    : []
              ).map((action) => (
                <button
                  key={action}
                  onClick={() =>
                    void mutate(`${path}/${action}`, "POST", {
                      version: row.version,
                    })
                  }
                >
                  {
                    {
                      activate: "Ativar contrato",
                      suspend: "Suspender",
                      complete: "Concluir",
                      terminate: "Terminar",
                    }[action]
                  }
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {tab === "Itens" && (
        <>
          {editor && row.status === "DRAFT" && (
            <button onClick={() => setNewItem(null)}>Adicionar item</button>
          )}
          {newItem !== undefined && (
            <EntryForm
              key={newItem?.id ?? "new"}
              title="Item contratual"
              fields={itemFields.map((f) => ({
                ...f,
                value: txt(newItem?.[f.name]) || undefined,
              }))}
              onCancel={() => setNewItem(undefined)}
              onSave={async (v) => {
                await api(
                  `${path}/items${newItem ? "/" + newItem.id : ""}`,
                  send(newItem ? "PATCH" : "POST", {
                    ...clean(v),
                    budgetItemId: v.budgetItemId || null,
                    quantity: v.quantity || null,
                    unitPrice: v.unitPrice || null,
                    version: row.version,
                  }),
                );
                setNewItem(undefined);
                await load();
              }}
            />
          )}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Descrição</th>
                  <th>Orçamento</th>
                  <th>Quantidade</th>
                  <th>Preço</th>
                  <th>Total</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.items.map((i) => (
                  <tr key={i.id}>
                    <td>{i.description}</td>
                    <td>
                      {budget.find((b) => b.id === i.budgetItemId)
                        ?.description ?? (i.budgetItemId ? "Ligado" : "—")}
                    </td>
                    <td>{i.quantity}</td>
                    <td>{money(i.unitPrice)}</td>
                    <td>{money(i.totalValue)}</td>
                    <td>
                      {editor && row.status === "DRAFT" && (
                        <>
                          <button
                            className="secondary"
                            onClick={() => setNewItem(i)}
                          >
                            Editar
                          </button>
                          <button
                            className="secondary"
                            onClick={() =>
                              void mutate(`${path}/items/${i.id}`, "DELETE", {
                                version: row.version,
                              })
                            }
                          >
                            Remover
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={itemPage} total={items.total} onPage={setItemPage} />
        </>
      )}
      {tab === "Adendas" && (
        <>
          {editor && ["ACTIVE", "SUSPENDED"].includes(txt(row.status)) && (
            <button onClick={() => setNewAmend(null)}>Nova adenda</button>
          )}
          {newAmend !== undefined && (
            <EntryForm
              key={newAmend?.id ?? "new"}
              title="Adenda contratual"
              fields={amendmentFields.map((f) => ({
                ...f,
                value:
                  txt(newAmend?.[f.name]).slice(
                    0,
                    f.type === "date" ? 10 : undefined,
                  ) || undefined,
              }))}
              onCancel={() => setNewAmend(undefined)}
              onSave={async (v) => {
                await api(
                  `${path}/amendments${newAmend ? "/" + newAmend.id : ""}`,
                  send(newAmend ? "PATCH" : "POST", {
                    ...clean(v),
                    ...(newAmend ? { version: newAmend.version } : {}),
                  }),
                );
                setNewAmend(undefined);
                await load();
              }}
            />
          )}
          {amends.items.map((a) => (
            <section className="card" key={a.id}>
              <h2>
                {a.code} · {a.description}
              </h2>
              <p>
                {states[txt(a.amendmentType)]} · {money(a.amount)} ·{" "}
                {states[txt(a.status)]}
              </p>
              <div className="actions">
                {editor && a.status === "DRAFT" && (
                  <>
                    <button
                      className="secondary"
                      onClick={() => setNewAmend(a)}
                    >
                      Editar
                    </button>
                    <button
                      onClick={() =>
                        void mutate(
                          `${path}/amendments/${a.id}/submit`,
                          "POST",
                          { version: a.version },
                        )
                      }
                    >
                      Submeter adenda
                    </button>
                  </>
                )}
                {admin && a.status === "SUBMITTED" && (
                  <>
                    <button
                      onClick={() =>
                        void mutate(
                          `${path}/amendments/${a.id}/approve`,
                          "POST",
                          { version: a.version },
                        )
                      }
                    >
                      Aprovar adenda
                    </button>
                    <button
                      className="secondary"
                      onClick={() => {
                        const reason = window.prompt("Motivo da rejeição");
                        if (reason)
                          void mutate(
                            `${path}/amendments/${a.id}/reject`,
                            "POST",
                            { version: a.version, reason },
                          );
                      }}
                    >
                      Rejeitar
                    </button>
                  </>
                )}
              </div>
            </section>
          ))}
          <Pager page={amendPage} total={amends.total} onPage={setAmendPage} />
        </>
      )}
      {tab === "Documentos" && (
        <Documents
          path={path}
          version={row.version}
          editable={editor && row.status === "DRAFT"}
          onChange={load}
        />
      )}{" "}
      {tab === "Histórico" && <History path={path} />}
    </>
  );
}
export function ExpensesPage({
  id,
  expenseId,
}: {
  id: string;
  expenseId?: string;
}) {
  const me = useMe(),
    admin = me.role === "ADMIN",
    path = `/projects/${id}/expenses`;
  const [row, setRow] = useState<Row>(),
    [edit, setEdit] = useState(false),
    [page, setPage] = useState(1),
    [filters, setFilters] = useState<Record<string, string>>({}),
    [centers, setCenters] = useState<Row[]>([]),
    [contracts, setContracts] = useState<Row[]>([]),
    [suppliers, setSuppliers] = useState<Row[]>([]),
    [budget, setBudget] = useState<Row[]>([]),
    [total, setTotal] = useState("0.00"),
    [action, setAction] = useState("");
  const query = new URLSearchParams({
      page: String(page),
      limit: "50",
      ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
    }),
    { data, error, setError, load } = useRows(`${path}?${query}`);
  async function refresh() {
    if (expenseId) setRow(await api<Row>(`${path}/${expenseId}`));
    await load();
  }
  useEffect(() => {
    Promise.all([
      api<List>(`/projects/${id}/cost-centers?limit=200`),
      api<List>(`/projects/${id}/contracts?limit=200`),
      api<List>("/suppliers?limit=200"),
      api<List>(`/projects/${id}/costs/items?limit=200`),
    ])
      .then(([c, k, s, b]) => {
        setCenters(c.items);
        setContracts(k.items);
        setSuppliers(s.items);
        setBudget(b.items.map((x) => ({ ...x, id: txt(x.budgetItemId) })));
      })
      .catch((e) => setError(e.message));
    refresh().catch((e) => setError(e.message));
  }, [id, expenseId]);
  const fields: Field[] = [
    { name: "expenseNumber", label: "Número da despesa", required: true },
    {
      name: "expenseDate",
      label: "Data",
      type: "date",
      required: true,
      value: today(),
    },
    {
      name: "supplierId",
      label: "Fornecedor",
      options: rowOpts(suppliers, "legalName"),
    },
    {
      name: "contractId",
      label: "Contrato",
      options: rowOpts(
        contracts.filter((x) =>
          ["ACTIVE", "SUSPENDED", "COMPLETED"].includes(txt(x.status)),
        ),
        "contractNumber",
      ),
    },
    {
      name: "budgetItemId",
      label: "Item orçamental",
      options: rowOpts(budget, "description"),
    },
    {
      name: "costCenterId",
      label: "Centro de custo",
      required: true,
      options: rowOpts(centers.filter((x) => x.status === "ACTIVE")),
    },
    { name: "description", label: "Descrição", required: true },
    { name: "documentNumber", label: "Número do documento" },
    {
      name: "subtotal",
      label: "Subtotal (MZN)",
      required: true,
      type: "number",
      min: "0",
      step: "0.01",
    },
    {
      name: "taxAmount",
      label: "Imposto (MZN)",
      type: "number",
      min: "0",
      step: "0.01",
      value: "0",
    },
  ];
  return (
    <>
      <h1>
        {expenseId
          ? `${row?.expenseNumber ?? "Despesa"} · ${states[txt(row?.status)] ?? ""}`
          : "Despesas"}
      </h1>
      <Nav id={id} />
      {error && <Notice error>{error}</Notice>}
      {!expenseId && (
        <>
          <div className="actions">
            <button
              onClick={() => {
                setEdit(true);
                setTotal("0.00");
              }}
            >
              Nova despesa
            </button>
            <Link href={`/projects/${id}/cost-centers`}>
              Criar centro de custo
            </Link>
          </div>
          <form
            className="execution-fields"
            onSubmit={(e) => e.preventDefault()}
          >
            {[
              { name: "search", label: "Pesquisar" },
              { name: "date_from", label: "Desde", type: "date" },
              { name: "date_to", label: "Até", type: "date" },
              {
                name: "status",
                label: "Estado",
                options: opts([
                  "DRAFT",
                  "SUBMITTED",
                  "APPROVED",
                  "REJECTED",
                  "REVERSED",
                ]),
              },
              {
                name: "supplier",
                label: "Fornecedor",
                options: rowOpts(suppliers, "legalName"),
              },
              {
                name: "contract",
                label: "Contrato",
                options: rowOpts(contracts, "contractNumber"),
              },
              {
                name: "cost_center",
                label: "Centro de custo",
                options: rowOpts(centers),
              },
              {
                name: "budget_item",
                label: "Item orçamental",
                options: rowOpts(budget, "description"),
              },
            ].map((f) => (
              <label key={f.name}>
                {f.label}
                {f.options ? (
                  <select
                    value={filters[f.name] ?? ""}
                    onChange={(e) => {
                      setFilters({ ...filters, [f.name]: e.target.value });
                      setPage(1);
                    }}
                  >
                    <option value="">Todos</option>
                    {f.options.map((o) => (
                      <option value={o.value} key={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={f.type ?? "text"}
                    value={filters[f.name] ?? ""}
                    onChange={(e) => {
                      setFilters({ ...filters, [f.name]: e.target.value });
                      setPage(1);
                    }}
                  />
                )}
              </label>
            ))}
          </form>
        </>
      )}
      {row && (
        <>
          <section className="card">
            <h2>{row.description}</h2>
            <p>
              {dateText(txt(row.expenseDate))} ·{" "}
              {centers.find((c) => c.id === row.costCenterId)?.name}
            </p>
            <p>
              Subtotal: {money(row.subtotal)} · Imposto: {money(row.taxAmount)}
            </p>
            <strong>Total: {money(row.totalAmount)}</strong>
          </section>
          {row.status === "DRAFT" && (
            <div className="actions">
              <button
                className="secondary"
                onClick={() => {
                  setEdit(true);
                  setTotal(txt(row.totalAmount));
                }}
              >
                Editar despesa
              </button>
              <button
                onClick={() =>
                  void api(
                    `${path}/${expenseId}/submit`,
                    send("POST", { version: row.version }),
                  )
                    .then(refresh)
                    .catch((e) => setError(e.message))
                }
              >
                Submeter despesa
              </button>
            </div>
          )}
          {admin && row.status === "SUBMITTED" && (
            <div className="actions">
              <button
                onClick={() =>
                  void api(
                    `${path}/${expenseId}/approve`,
                    send("POST", { version: row.version }),
                  )
                    .then(refresh)
                    .catch((e) => setError(e.message))
                }
              >
                Aprovar despesa
              </button>
              <button className="secondary" onClick={() => setAction("reject")}>
                Rejeitar despesa
              </button>
            </div>
          )}
          {admin && row.status === "APPROVED" && (
            <button onClick={() => setAction("reverse")}>
              Estornar despesa
            </button>
          )}
          {action && (
            <EntryForm
              title={action === "reverse" ? "Estorno" : "Rejeição"}
              fields={[
                {
                  name: "reason",
                  label: "Motivo",
                  required: true,
                  type: "textarea",
                },
              ]}
              submit="Confirmar"
              onCancel={() => setAction("")}
              onSave={async (values) => {
                await api(
                  `${path}/${expenseId}/${action}`,
                  send("POST", { version: row.version, reason: values.reason }),
                );
                setAction("");
                await refresh();
              }}
            />
          )}
        </>
      )}
      {edit && (
        <div
          onChange={(e) => {
            const form = (e.target as HTMLElement).closest("form");
            if (form) {
              const v = new FormData(form);
              try {
                setTotal(
                  new Decimal(txt(v.get("subtotal")) || "0")
                    .plus(txt(v.get("taxAmount")) || "0")
                    .toFixed(2),
                );
              } catch {
                setTotal("0.00");
              }
            }
          }}
        >
          <EntryForm
            title={expenseId ? "Editar despesa" : "Nova despesa"}
            fields={fields.map((f) => ({
              ...f,
              value: row
                ? txt(row[f.name]).slice(
                    0,
                    f.type === "date" ? 10 : undefined,
                  ) || f.value
                : f.value,
            }))}
            onCancel={() => setEdit(false)}
            onSave={async (values) => {
              const r = await api<Row>(
                path + (expenseId ? "/" + expenseId : ""),
                send(expenseId ? "PATCH" : "POST", {
                  ...clean(values),
                  supplierId: values.supplierId || null,
                  contractId: values.contractId || null,
                  budgetItemId: values.budgetItemId || null,
                  ...(row ? { version: row.version } : {}),
                }),
              );
              setEdit(false);
              if (expenseId) await refresh();
              else window.location.assign(`/projects/${id}/expenses/${r.id}`);
            }}
          />
          <p role="status">Total calculado: {money(total)}</p>
        </div>
      )}
      {!expenseId && (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {[
                    "Número",
                    "Data",
                    "Fornecedor",
                    "Centro de custo",
                    "Contrato",
                    "Descrição",
                    "Valor",
                    "Estado",
                  ].map((x) => (
                    <th key={x}>{x}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.items.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <Link href={`/projects/${id}/expenses/${e.id}`}>
                        {e.expenseNumber}
                      </Link>
                    </td>
                    <td>{dateText(txt(e.expenseDate))}</td>
                    <td>
                      {suppliers.find((s) => s.id === e.supplierId)
                        ?.legalName ?? "—"}
                    </td>
                    <td>
                      {centers.find((c) => c.id === e.costCenterId)?.name ??
                        "—"}
                    </td>
                    <td>
                      {contracts.find((c) => c.id === e.contractId)
                        ?.contractNumber ?? "—"}
                    </td>
                    <td>{e.description}</td>
                    <td>{money(e.totalAmount)}</td>
                    <td>{states[txt(e.status)]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} total={data.total} onPage={setPage} />
        </>
      )}
      {row && (
        <>
          <Documents
            path={`${path}/${expenseId}`}
            version={row.version}
            editable={row.status === "DRAFT"}
            onChange={refresh}
          />
          <History key={row.version} path={`${path}/${expenseId}`} />
        </>
      )}
    </>
  );
}
export function CostsPage({ id }: { id: string }) {
  const [summary, setSummary] = useState<Record<string, string>>(),
    [error, setError] = useState(""),
    [page, setPage] = useState(1);
  const { data } = useRows(`/projects/${id}/costs/items?page=${page}&limit=50`);
  useEffect(() => {
    api<Record<string, string>>(`/projects/${id}/costs/summary`)
      .then(setSummary)
      .catch((e) => setError(e.message));
  }, [id]);
  return (
    <>
      <h1>Custos da obra</h1>
      <Nav id={id} />
      {error && <Notice error>{error}</Notice>}
      {summary && (
        <div className="stats budget-stats">
          {[
            ["Orçamento aprovado", "approvedBudget"],
            ["Contratado original", "contractedOriginal"],
            ["Adições aprovadas", "approvedAdditions"],
            ["Supressões aprovadas", "approvedOmissions"],
            ["Valor contratual atual", "currentContracted"],
            ["Despesas aprovadas", "approvedExpenses"],
            ["Despesas diretas", "approvedDirectExpenses"],
            ["Saldo orçamental", "remainingBudget"],
            ["Compromisso ativo", "committedCost"],
          ].map(([label, key]) => (
            <div className="stat" key={key}>
              <span>{label}</span>
              <strong>{money(summary[key])}</strong>
            </div>
          ))}
        </div>
      )}
      <p>
        Saldo = orçamento aprovado − contratos atuais − despesas aprovadas sem
        contrato. Despesas contratuais aparecem no realizado, sem duplicar o
        compromisso. Adendas sem rubrica são apresentadas no total da obra; não
        são distribuídas arbitrariamente pelos itens.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {[
                "Rubrica",
                "Orçamento",
                "Contratado",
                "Gasto aprovado",
                "Saldo",
                "Desvio",
              ].map((x) => (
                <th key={x}>{x}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.items.map((r) => (
              <tr key={txt(r.budgetItemId)}>
                <td>
                  {r.code} · {r.description}
                  {new Decimal(txt(r.contractedValue)).gt(
                    txt(r.budgetValue),
                  ) && (
                    <p className="badge">
                      Sobrecontratação · BUDGET_ITEM_OVERCONTRACTED
                    </p>
                  )}
                </td>
                {[
                  "budgetValue",
                  "contractedValue",
                  "approvedExpenseValue",
                  "remainingValue",
                  "variance",
                ].map((k) => (
                  <td key={k}>{money(r[k])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} total={data.total} onPage={setPage} />
    </>
  );
}
