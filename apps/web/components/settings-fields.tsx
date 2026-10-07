import { labels, type Member, type Organization } from "../lib/api";
export function UserFields({
  member,
  editing,
}: {
  member: Member | null;
  editing: boolean;
}) {
  return (
    <>
      <label>
        Nome
        <input
          name="name"
          required
          maxLength={200}
          defaultValue={member?.user.name}
        />
      </label>
      {!editing && (
        <label>
          E-mail
          <input name="email" type="email" required />
        </label>
      )}
      <label>
        Perfil
        <select name="role" defaultValue={member?.role ?? "CLIENT"}>
          {["ADMIN", "MANAGER", "INSPECTOR", "FINANCIER", "CLIENT"].map((r) => (
            <option key={r} value={r}>
              {labels[r]}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
export function OrganizationFields({ org }: { org: Organization | null }) {
  return (
    <>
      <label>
        Nome legal
        <input
          name="legalName"
          required
          maxLength={200}
          defaultValue={org?.legalName}
        />
      </label>
      <label>
        Nome comercial
        <input
          name="tradeName"
          maxLength={200}
          defaultValue={org?.tradeName ?? ""}
        />
      </label>
      <label>
        NUIT
        <input
          name="taxNumber"
          maxLength={50}
          defaultValue={org?.taxNumber ?? ""}
        />
      </label>
      <label>
        Tipo
        <select
          name="organizationType"
          defaultValue={org?.organizationType ?? "CONTRACTOR"}
        >
          {[
            "CONTRACTOR",
            "CLIENT",
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
      <label>
        E-mail
        <input name="email" type="email" defaultValue={org?.email ?? ""} />
      </label>
      <label>
        Telefone
        <input name="phone" maxLength={40} defaultValue={org?.phone ?? ""} />
      </label>
      <label className="wide">
        Endereço
        <textarea
          name="address"
          maxLength={2000}
          defaultValue={org?.address ?? ""}
        />
      </label>
    </>
  );
}
