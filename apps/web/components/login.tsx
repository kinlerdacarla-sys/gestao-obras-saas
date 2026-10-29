"use client";
import { useState } from "react";
import Link from "next/link";
import { api, send } from "../lib/api";
import { Notice } from "@obras/ui";
export function Login({
  mode = "login",
}: {
  mode?: "login" | "forgot" | "reset";
}) {
  const [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      if (mode === "login") {
        await api("/auth/login", send("POST", data));
        window.location.assign("/dashboard");
      } else if (mode === "forgot") {
        const result = await api<{ message: string }>(
          "/auth/forgot-password",
          send("POST", data),
        );
        setSuccess(result.message);
      } else {
        const token = new URLSearchParams(window.location.search).get("token");
        await api(
          "/auth/reset-password",
          send("POST", { token, password: data.password }),
        );
        setSuccess("Password atualizada. Pode iniciar sessão.");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login">
      <aside className="login-art">
        <div className="brand">
          obras<span>.</span>
        </div>
        <h1>
          Uma base sólida.
          <br />
          Para cada obra.
        </h1>
        <p>
          Equipas, organizações e obras, num espaço de trabalho seguro e
          organizado.
        </p>
        <small>GESTÃO DE OBRAS · MOÇAMBIQUE</small>
      </aside>
      <main className="login-form">
        <span className="eyebrow">O seu espaço de trabalho</span>
        <h1>
          {mode === "login"
            ? "Bem-vindo de volta"
            : mode === "forgot"
              ? "Recuperar acesso"
              : "Definir password"}
        </h1>
        <p className="muted">
          {mode === "login"
            ? "Entre com a sua conta para continuar."
            : "Siga as instruções para proteger a sua conta."}
        </p>
        {error && <Notice error>{error}</Notice>}
        {success && <Notice>{success}</Notice>}
        <form className="form" onSubmit={submit}>
          {mode !== "reset" && (
            <>
              <label>
                Empresa
                <input
                  name="tenantSlug"
                  placeholder="construtora-demo"
                  required
                  autoComplete="organization"
                />
              </label>
              <label>
                E-mail
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                />
              </label>
            </>
          )}
          {mode !== "forgot" && (
            <label>
              Password
              <input
                name="password"
                type="password"
                required
                minLength={mode === "reset" ? 10 : 1}
                autoComplete={
                  mode === "reset" ? "new-password" : "current-password"
                }
              />
            </label>
          )}
          <button disabled={busy}>
            {busy
              ? "A processar…"
              : mode === "login"
                ? "Entrar"
                : mode === "forgot"
                  ? "Enviar instruções"
                  : "Guardar password"}
          </button>
          <Link
            className="text-link"
            href={mode === "login" ? "/forgot-password" : "/login"}
          >
            {mode === "login" ? "Esqueceu-se da password?" : "Voltar ao login"}
          </Link>
          {mode === "login" && <Link className="text-link" href="/signup">Criar empresa</Link>}
        </form>
      </main>
    </div>
  );
}
