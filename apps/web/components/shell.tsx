"use client";
import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { api, send, type Me } from "../lib/api";
import { Notice } from "@obras/ui";
const Context = createContext<Me | null>(null);
export const useMe = () => useContext(Context)!;
export function Shell({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null),
    [error, setError] = useState(""),
    [open, setOpen] = useState(false);
  useEffect(() => {
    api<Me>("/auth/me")
      .then(setMe)
      .catch(() => window.location.assign("/login"));
  }, []);
  async function logout() {
    try {
      await api("/auth/logout", send("POST"));
      window.location.assign("/login");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (!me)
    return (
      <main className="main" role="status">
        A carregar a sua área de trabalho…
      </main>
    );
  return (
    <Context value={me}>
      <div className="shell">
        <aside className={`sidebar ${open ? "open" : ""}`}>
          <Link href="/dashboard" className="brand">
            obras<span>.</span>
          </Link>
          <button
            className="mobile-toggle"
            aria-expanded={open}
            aria-label="Abrir menu"
            onClick={() => setOpen(!open)}
          >
            ☰
          </button>
          <nav>
            <Link href="/dashboard">Dashboard</Link>
            <Link href="/projects">Obras</Link>
            <span aria-disabled="true">Relatórios · em breve</span>
            {me.role === "ADMIN" && (
              <>
                <small>CONFIGURAÇÕES</small>
                <Link href="/settings/users">Utilizadores</Link>
                <Link href="/settings/organizations">Organizações</Link>
              </>
            )}
          </nav>
          <footer>
            CORE SAAS · M1
            <br />
            Uma base sólida para cada obra.
          </footer>
        </aside>
        <main className="main">
          <header className="topbar">
            <strong>{me.tenant.name}</strong>
            <div>
              <span>{me.user.name}</span>
              <button className="secondary" onClick={logout}>
                Sair
              </button>
            </div>
          </header>
          {error && <Notice error>{error}</Notice>}
          {children}
        </main>
      </div>
    </Context>
  );
}
