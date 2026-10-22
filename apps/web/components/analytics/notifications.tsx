"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, Notice } from "@obras/ui";
import { api, send } from "../../lib/api";
export function Alerts() {
  const [items, setItems] = useState<
      {
        id: string;
        title: string;
        message: string;
        severity: string;
        status: string;
        version: number;
        canManage: boolean;
        projectId: string;
      }[]
    >([]),
    [error, setError] = useState(""),
    [status, setStatus] = useState("ACTIVE"),
    [busy, setBusy] = useState(false);
  const load = () =>
    api<{ items: typeof items }>(`/alerts?status=${status}`).then((x) =>
      setItems(x.items),
    );
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [status]);
  async function act(id: string, version: number, next: string) {
    setBusy(true);
    try {
      await api(`/alerts/${id}`, send("PATCH", { version, status: next }));
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h1>Alertas</h1>
      <label>
        Estado{" "}
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          {[
            ["ACTIVE", "Ativos"],
            ["ACKNOWLEDGED", "Reconhecidos"],
            ["RESOLVED", "Resolvidos"],
            ["DISMISSED", "Dispensados"],
          ].map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      {error && <Notice error>{error}</Notice>}
      {items.map((x) => (
        <Card key={x.id} title={x.title}>
          <p>
            {x.severity} · {x.status}
          </p>
          <p>{x.message}</p>
          <Link href={`/projects/${x.projectId}`}>Consultar obra →</Link>
          {x.canManage && ["ACTIVE", "ACKNOWLEDGED"].includes(x.status) && (
            <div>
              {[
                ["ACKNOWLEDGED", "Reconhecer"],
                ["RESOLVED", "Resolver"],
                ["DISMISSED", "Dispensar"],
              ].map(([v, l]) => (
                <button
                  key={v}
                  disabled={busy || v === x.status}
                  onClick={() => act(x.id, x.version, v)}
                >
                  {l}
                </button>
              ))}
            </div>
          )}
        </Card>
      ))}
      {!items.length && <p>Nenhum alerta neste estado.</p>}
    </>
  );
}
export function Notifications() {
  const [items, setItems] = useState<
      {
        id: string;
        title: string;
        type: string;
        resourcePath: string;
        readAt: string | null;
      }[]
    >([]),
    [preferences, setPreferences] = useState<Record<string, boolean>>(),
    [count, setCount] = useState(0),
    [error, setError] = useState("");
  async function load() {
    const [list, unread, p] = await Promise.all([
      api<{ items: typeof items }>("/notifications"),
      api<{ count: number }>("/notifications/unread-count"),
      api<Record<string, boolean>>("/notifications/preferences"),
    ]);
    setItems(list.items);
    setCount(unread.count);
    setPreferences(p);
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  async function read(id?: string) {
    try {
      await api(
        id ? `/notifications/${id}/read` : "/notifications/read-all",
        send("POST"),
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const labels: Record<string, string> = {
    emailEnabled: "E-mail",
    inAppEnabled: "Notificações na aplicação",
    dailyDigestEnabled: "Resumo diário",
    inspectionNotifications: "Inspeções",
    measurementNotifications: "Medições",
    qualityNotifications: "Qualidade",
    financialNotifications: "Finanças",
    scheduleNotifications: "Cronograma",
  };
  async function save() {
    try {
      const body = Object.fromEntries(
        Object.keys(labels).map((k) => [k, preferences?.[k] ?? false]),
      );
      await api("/notifications/preferences", send("PATCH", body));
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <h1>Notificações</h1>
      <p>{count} por ler</p>
      <button onClick={() => read()}>Marcar todas como lidas</button>
      {error && <Notice error>{error}</Notice>}
      <div>
        {items.map((x) => (
          <Card key={x.id} title={x.title}>
            <p>
              {x.type} · {x.readAt ? "Lida" : "Por ler"}
            </p>
            <Link href={x.resourcePath}>Abrir →</Link>
            {!x.readAt && (
              <button onClick={() => read(x.id)}>Marcar como lida</button>
            )}
          </Card>
        ))}
      </div>
      <Card title="Preferências">
        {preferences &&
          Object.entries(labels).map(([k, l]) => (
            <label key={k} style={{ display: "block", padding: 8 }}>
              <input
                type="checkbox"
                checked={Boolean(preferences[k])}
                onChange={(e) =>
                  setPreferences({ ...preferences, [k]: e.target.checked })
                }
              />{" "}
              {l}
            </label>
          ))}
        <button onClick={save}>Guardar preferências</button>
      </Card>
    </>
  );
}
