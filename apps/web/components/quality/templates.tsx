"use client";
import { useEffect, useState } from "react";
import { Notice } from "@obras/ui";
import { api, send } from "../../lib/api";
import { useMe } from "../shell";
import { EntryForm, text, label, type Row } from "./common";
const defaultItem = {
  code: "01",
  description: "Verificação inicial",
  responseType: "PASS_FAIL_NA",
  isRequired: true,
  allowComment: true,
  requirePhotoOnFail: true,
  isHoldPoint: false,
  sortOrder: 0,
};
export function Templates() {
  const me = useMe(),
    [rows, setRows] = useState<Row[]>([]),
    [selected, setSelected] = useState<Row>(),
    [version, setVersion] = useState<Row>(),
    [error, setError] = useState("");
  async function load() {
    setRows((await api<{ items: Row[] }>("/checklist-templates")).items);
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  async function select(id: string) {
    setSelected(await api<Row>(`/checklist-templates/${id}`));
    setVersion(undefined);
  }
  async function loadVersion(id: string) {
    setVersion(await api<Row>(`/checklist-template-versions/${id}`));
  }
  async function changeItem(itemId: string, values?: Record<string, string>) {
    if (!version) return;
    const items = (version.items as Row[])
      .filter((x) => values || x.id !== itemId)
      .map((x) => {
        const {
          section,
          code,
          description,
          responseType,
          isRequired,
          allowComment,
          requirePhotoOnFail,
          isHoldPoint,
          sortOrder,
        } = x;
        return x.id === itemId && values
          ? {
              section: values.section || null,
              code: values.code,
              description: values.description,
              responseType: values.responseType,
              isRequired: values.isRequired === "true",
              allowComment: values.allowComment === "true",
              requirePhotoOnFail: values.requirePhotoOnFail === "true",
              isHoldPoint: values.isHoldPoint === "true",
              sortOrder: Number(values.sortOrder),
            }
          : {
              section,
              code,
              description,
              responseType,
              isRequired,
              allowComment,
              requirePhotoOnFail,
              isHoldPoint,
              sortOrder,
            };
      });
    await api(
      `/checklist-template-versions/${version.id}/items`,
      send("PATCH", { version: version.version, items }),
    );
    await loadVersion(version.id);
  }
  return (
    <>
      <h1>Templates de checklist</h1>
      <p>
        Versões publicadas são imutáveis. Os exemplos demo devem ser adaptados
        ao projeto.
      </p>
      {error && <Notice error>{error}</Notice>}
      {me.role === "ADMIN" && (
        <EntryForm
          title="Novo template"
          fields={[
            { name: "name", label: "Nome", required: true },
            { name: "code", label: "Código", required: true },
          ]}
          onSave={async (v) => {
            const r = await api<Row>(
              "/checklist-templates",
              send("POST", { ...v, items: [defaultItem] }),
            );
            await load();
            await select(r.id);
            await loadVersion(text(r.draftVersionId));
          }}
        />
      )}
      {rows.map((r) => (
        <button
          key={r.id}
          onClick={() => select(r.id).catch((e) => setError(e.message))}
        >
          {text(r.code)} · {text(r.name)}
        </button>
      ))}
      {selected && (
        <section className="card">
          <h2>{text(selected.name)}</h2>
          {(selected.versions as Row[]).map((v) => (
            <button
              key={v.id}
              onClick={() =>
                loadVersion(v.id).catch((e) => setError(e.message))
              }
            >
              Versão {text(v.versionNumber)} · {label(v.status)}
            </button>
          ))}
          {me.role === "ADMIN" && version && version.status !== "DRAFT" && (
            <button
              onClick={async () => {
                const items = (version.items as Row[]).map(
                  ({
                    section,
                    code,
                    description,
                    responseType,
                    isRequired,
                    allowComment,
                    requirePhotoOnFail,
                    isHoldPoint,
                    sortOrder,
                  }) => ({
                    section,
                    code,
                    description,
                    responseType,
                    isRequired,
                    allowComment,
                    requirePhotoOnFail,
                    isHoldPoint,
                    sortOrder,
                  }),
                );
                const row = await api<Row>(
                  `/checklist-templates/${selected.id}/versions`,
                  send("POST", { items }),
                );
                await select(selected.id);
                await loadVersion(row.id);
              }}
            >
              Criar nova versão a partir desta
            </button>
          )}
        </section>
      )}
      {version && (
        <section className="card">
          <h2>Itens · versão {text(version.versionNumber)}</h2>
          {(version.items as Row[]).map((i) => (
            <div key={i.id}>
              <p>
                {text(i.code)} · {text(i.description)} · {text(i.responseType)}
                {i.isHoldPoint ? " · HOLD POINT" : ""}
              </p>
              {me.role === "ADMIN" && version.status === "DRAFT" && (
                <details>
                  <summary>Editar item {text(i.code)}</summary>
                  <EntryForm
                    title={`Item ${text(i.code)}`}
                    fields={[
                      {
                        name: "code",
                        label: "Código",
                        value: text(i.code),
                        required: true,
                      },
                      {
                        name: "description",
                        label: "Descrição",
                        value: text(i.description),
                        required: true,
                      },
                      {
                        name: "section",
                        label: "Secção",
                        value: text(i.section),
                      },
                      {
                        name: "responseType",
                        label: "Tipo",
                        value: text(i.responseType),
                        required: true,
                        options: [
                          "PASS_FAIL_NA",
                          "YES_NO_NA",
                          "TEXT",
                          "NUMBER",
                          "DATE",
                        ].map((value) => ({ value, label: value })),
                      },
                      {
                        name: "sortOrder",
                        label: "Ordem",
                        type: "number",
                        min: "0",
                        value: text(i.sortOrder),
                        required: true,
                      },
                      ...[
                        { name: "isRequired", label: "Obrigatório" },
                        { name: "allowComment", label: "Permitir comentário" },
                        {
                          name: "requirePhotoOnFail",
                          label: "Exigir fotografia em FAIL",
                        },
                        { name: "isHoldPoint", label: "Hold point" },
                      ].map((f) => ({
                        ...f,
                        value: i[f.name] ? "true" : "false",
                        required: true,
                        options: [
                          { value: "true", label: "Sim" },
                          { value: "false", label: "Não" },
                        ],
                      })),
                    ]}
                    onSave={(values) => changeItem(i.id, values)}
                  />
                  <button
                    disabled={(version.items as Row[]).length <= 1}
                    onClick={() =>
                      changeItem(i.id).catch((e) => setError(e.message))
                    }
                  >
                    Remover item do rascunho
                  </button>
                </details>
              )}
            </div>
          ))}
          {me.role === "ADMIN" && version.status === "DRAFT" && (
            <>
              <EntryForm
                title="Adicionar item"
                fields={[
                  { name: "code", label: "Código do item", required: true },
                  {
                    name: "description",
                    label: "Descrição do item",
                    required: true,
                  },
                  { name: "section", label: "Secção" },
                  {
                    name: "responseType",
                    label: "Tipo de resposta",
                    required: true,
                    options: [
                      "PASS_FAIL_NA",
                      "YES_NO_NA",
                      "TEXT",
                      "NUMBER",
                      "DATE",
                    ].map((value) => ({ value, label: value })),
                  },
                  {
                    name: "hold",
                    label: "Hold point",
                    required: true,
                    options: [
                      { value: "false", label: "Não" },
                      { value: "true", label: "Sim" },
                    ],
                  },
                  {
                    name: "photo",
                    label: "Fotografia obrigatória se não conforme",
                    required: true,
                    options: [
                      { value: "true", label: "Sim" },
                      { value: "false", label: "Não" },
                    ],
                  },
                ]}
                onSave={async (v) => {
                  const items = (version.items as Row[]).map(
                    ({
                      section,
                      code,
                      description,
                      responseType,
                      isRequired,
                      allowComment,
                      requirePhotoOnFail,
                      isHoldPoint,
                      sortOrder,
                    }) => ({
                      section,
                      code,
                      description,
                      responseType,
                      isRequired,
                      allowComment,
                      requirePhotoOnFail,
                      isHoldPoint,
                      sortOrder,
                    }),
                  );
                  items.push({
                    ...defaultItem,
                    section: v.section || null,
                    code: v.code,
                    description: v.description,
                    responseType: v.responseType,
                    isHoldPoint: v.hold === "true",
                    requirePhotoOnFail: v.photo === "true",
                    sortOrder: items.length,
                  });
                  await api(
                    `/checklist-template-versions/${version.id}/items`,
                    send("PATCH", { version: version.version, items }),
                  );
                  await loadVersion(version.id);
                }}
              />
              <button
                onClick={async () => {
                  try {
                    await api(
                      `/checklist-template-versions/${version.id}/publish`,
                      send("POST", { version: version.version }),
                    );
                    await load();
                    await select(selected!.id);
                    await loadVersion(version.id);
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Publicar versão
              </button>
            </>
          )}
        </section>
      )}
    </>
  );
}
