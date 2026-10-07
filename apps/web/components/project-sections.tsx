import { Card, Empty } from "@obras/ui";
import {
  labels,
  type Project,
  type Member,
  type Organization,
} from "../lib/api";
export interface Participant {
  userId: string;
  role: string;
  status: string;
  membership: { user: { name: string; email: string } };
}
export interface LinkedOrganization {
  organizationId: string;
  relationshipType: string;
  organization: Organization;
}

interface AssociationProps {
  id: string;
  admin: boolean;
  busy: boolean;
  add: (event: React.SubmitEvent<HTMLFormElement>, kind: string) => void;
  mutate: (path: string, method: string, data?: unknown) => Promise<void>;
}
interface ParticipantProps extends AssociationProps {
  participants: Participant[];
  users: Member[];
}
interface OrganizationProps extends AssociationProps {
  organizations: LinkedOrganization[];
  available: Organization[];
}
export function ProjectOverview({ project }: { project: Project }) {
  const date = (v: string | null) =>
    v
      ? new Intl.DateTimeFormat("pt-MZ", { timeZone: "UTC" }).format(
          new Date(v),
        )
      : "—";
  return (
    <Card title="Informação da obra">
      <dl className="detail-grid">
        {[
          ["Código", project.code],
          ["Localização", project.location ?? "—"],
          ["Estado", labels[project.status]],
          ["Data início", date(project.startDate)],
          ["Data fim planeada", date(project.plannedEndDate)],
          [
            "Valor contratual",
            project.contractValue ? `${project.contractValue} MZN` : "—",
          ],
        ].map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {project.description && <p className="muted">{project.description}</p>}
    </Card>
  );
}

export function ProjectParticipants({
  id,
  participants,
  users,
  admin,
  busy,
  add,
  mutate,
}: ParticipantProps) {
  return (
    <Card title="Participantes">
      {participants.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Perfil</th>
                <th>Estado</th>
                {admin && <th>Ações</th>}
              </tr>
            </thead>
            <tbody>
              {participants.map((p) => (
                <tr key={p.userId}>
                  <td>
                    {p.membership.user.name}
                    <br />
                    <small className="muted">{p.membership.user.email}</small>
                  </td>
                  <td>{labels[p.role]}</td>
                  <td>{labels[p.status] ?? p.status}</td>
                  {admin && (
                    <td className="row-actions">
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() =>
                          mutate(`/projects/${id}/users/${p.userId}`, "DELETE")
                        }
                      >
                        Remover
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>Sem participantes associados.</Empty>
      )}
      {admin && (
        <form className="form grid mt-6" onSubmit={(e) => add(e, "users")}>
          <label>
            Utilizador
            <select name="userId" required>
              <option value="">Selecionar utilizador</option>
              {users
                .filter(
                  (u) =>
                    u.status !== "DISABLED" &&
                    !participants.some((p) => p.userId === u.user.id),
                )
                .map((u) => (
                  <option value={u.user.id} key={u.user.id}>
                    {u.user.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Perfil na obra
            <select name="role">
              {["MANAGER", "INSPECTOR", "FINANCIER", "CLIENT", "ADMIN"].map(
                (r) => (
                  <option value={r} key={r}>
                    {labels[r]}
                  </option>
                ),
              )}
            </select>
          </label>
          <div>
            <button disabled={busy}>Adicionar participante</button>
          </div>
        </form>
      )}
    </Card>
  );
}

export function ProjectOrganizations({
  id,
  organizations,
  available,
  admin,
  busy,
  add,
  mutate,
}: OrganizationProps) {
  return (
    <Card title="Organizações">
      {organizations.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Organização</th>
                <th>Relação</th>
                {admin && <th>Ações</th>}
              </tr>
            </thead>
            <tbody>
              {organizations.map((o) => (
                <tr key={o.organizationId}>
                  <td>{o.organization.legalName}</td>
                  <td>{o.relationshipType}</td>
                  {admin && (
                    <td>
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() =>
                          mutate(
                            `/projects/${id}/organizations/${o.organizationId}`,
                            "DELETE",
                          )
                        }
                      >
                        Remover
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>Sem organizações associadas.</Empty>
      )}
      {admin && (
        <form
          className="form grid mt-6"
          onSubmit={(e) => add(e, "organizations")}
        >
          <label>
            Organização
            <select name="organizationId" required>
              <option value="">Selecionar organização</option>
              {available
                .filter(
                  (o) => !organizations.some((x) => x.organizationId === o.id),
                )
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.legalName}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Relação
            <select name="relationshipType">
              {[
                "OWNER",
                "CONTRACTOR",
                "INSPECTOR",
                "FINANCIER",
                "SUPPLIER",
                "SUBCONTRACTOR",
                "OTHER",
              ].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <div>
            <button disabled={busy}>Associar organização</button>
          </div>
        </form>
      )}
    </Card>
  );
}
