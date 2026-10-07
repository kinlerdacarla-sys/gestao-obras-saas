"use client";
import { useEffect, useState } from "react";
import { Card, Empty, Notice } from "@obras/ui";
import { api, send, labels, type Member, type Organization } from "../lib/api";
import { useMe } from "./shell";
import { UserFields, OrganizationFields } from "./settings-fields";
export function Settings({ kind }: { kind: "users" | "organizations" }) {
  const me = useMe();
  const [users, setUsers] = useState<Member[]>([]),
    [organizations, setOrganizations] = useState<Organization[]>([]),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState<Organization | Member | null>(null),
    [show, setShow] = useState(false);
  const isUsers = kind === "users";
  async function load() {
    if (isUsers) setUsers(await api<Member[]>("/users"));
    else setOrganizations(await api<Organization[]>("/organizations"));
    setLoading(false);
  }
  useEffect(() => {
    if (me.role === "ADMIN")
      load().catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [kind, me.role]);
  if (me.role !== "ADMIN")
    return <Notice error>Sem acesso às configurações administrativas.</Notice>;
  async function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const data: Record<string, unknown> = Object.fromEntries(
      new FormData(e.currentTarget),
    );
    for (const key of Object.keys(data)) if (data[key] === "") data[key] = null;
    try {
      const id = editing
        ? "user" in editing
          ? editing.user.id
          : editing.id
        : null;
      await api(
        id ? `/${kind}/${id}` : isUsers ? "/users/invite" : "/organizations",
        send(id ? "PATCH" : "POST", data),
      );
      setShow(false);
      setEditing(null);
      setSuccess(
        isUsers && !id
          ? "Convite criado. Consulte o link nos logs da API em desenvolvimento."
          : "Dados guardados",
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function disable(id: string) {
    setBusy(true);
    setError("");
    try {
      await api(`/users/${id}/disable`, send("POST"));
      setSuccess("Utilizador desativado");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const org = editing && "legalName" in editing ? editing : null;
  const member = editing && "user" in editing ? editing : null;
  return (
    <>
      <div className="heading">
        <div>
          <span className="eyebrow">Configurações</span>
          <h1>{isUsers ? "Utilizadores" : "Organizações"}</h1>
          <p className="muted">
            {isUsers
              ? "Pessoas e acessos da sua empresa."
              : "Entidades que participam nas suas obras."}
          </p>
        </div>
        <button
          onClick={() => {
            setEditing(null);
            setShow(true);
          }}
        >
          {isUsers ? "Convidar utilizador" : "Nova organização"}
        </button>
      </div>
      {error && <Notice error>{error}</Notice>}
      {success && <Notice>{success}</Notice>}
      {show && (
        <Card
          title={
            editing
              ? "Editar dados"
              : isUsers
                ? "Convidar utilizador"
                : "Nova organização"
          }
        >
          <form
            className="form grid"
            key={org?.id ?? member?.user.id ?? "new"}
            onSubmit={submit}
          >
            {isUsers ? (
              <UserFields member={member} editing={Boolean(editing)} />
            ) : (
              <OrganizationFields org={org} />
            )}
            <div className="actions wide">
              <button disabled={busy}>
                {busy
                  ? "A guardar…"
                  : isUsers && !editing
                    ? "Enviar convite"
                    : "Guardar"}
              </button>
              <button
                className="secondary"
                type="button"
                onClick={() => setShow(false)}
              >
                Cancelar
              </button>
            </div>
          </form>
        </Card>
      )}
      <Card>
        {loading ? (
          <p role="status">A carregar…</p>
        ) : isUsers ? (
          users.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Utilizador</th>
                    <th>Perfil</th>
                    <th>Estado</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((m) => (
                    <tr key={m.user.id}>
                      <td>
                        {m.user.name}
                        <br />
                        <small className="muted">{m.user.email}</small>
                      </td>
                      <td>{labels[m.role]}</td>
                      <td>{labels[m.status] ?? m.status}</td>
                      <td className="row-actions">
                        <div className="actions">
                          <button
                            className="secondary"
                            onClick={() => {
                              setEditing(m);
                              setShow(true);
                            }}
                          >
                            Editar
                          </button>
                          {m.user.id !== me.user.id &&
                            m.status !== "DISABLED" && (
                              <button
                                className="secondary"
                                disabled={busy}
                                onClick={() => disable(m.user.id)}
                              >
                                Desativar
                              </button>
                            )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>Sem utilizadores.</Empty>
          )
        ) : organizations.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Organização</th>
                  <th>Tipo</th>
                  <th>E-mail</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {organizations.map((o) => (
                  <tr key={o.id}>
                    <td>{o.legalName}</td>
                    <td>{o.organizationType}</td>
                    <td>{o.email ?? "—"}</td>
                    <td>
                      <button
                        className="secondary"
                        onClick={() => {
                          setEditing(o);
                          setShow(true);
                        }}
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Sem organizações. Adicione a primeira.</Empty>
        )}
      </Card>
    </>
  );
}
