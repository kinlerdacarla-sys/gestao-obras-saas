"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, send } from "../lib/api";
import type { Plan } from "./saas-settings";
interface Config {
  termsVersion: string;
  privacyVersion: string;
  termsUrl: string | null;
  privacyUrl: string | null;
  salesEmail: string | null;
}
const steps = [
  "Empresa",
  "Administrador",
  "Plano",
  "Trial",
  "Preferências",
  "Confirmação",
];
export function Signup() {
  const [step, setStep] = useState(0),
    [plans, setPlans] = useState<Plan[]>([]),
    [config, setConfig] = useState<Config | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [complete, setComplete] = useState(false),
    [accepted, setAccepted] = useState(false);
  const [company, setCompany] = useState({
      legalName: "",
      tradeName: "",
      taxNumber: "",
      email: "",
      phone: "",
      address: "",
      slug: "",
    }),
    [admin, setAdmin] = useState({ name: "", email: "" }),
    [planId, setPlanId] = useState(""),
    [timezone, setTimezone] = useState("Africa/Maputo"),
    [dateFormat, setDateFormat] = useState("dd/MM/yyyy");
  useEffect(() => {
    Promise.all([api<Plan[]>("/plans"), api<Config>("/onboarding/config")])
      .then(([p, c]) => {
        setPlans(p);
        setConfig(c);
      })
      .catch((e) => setError(e.message));
  }, []);
  const plan = plans.find((p) => p.id === planId);
  async function next(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (step === 2 && !plan) {
      setError("Selecione um plano.");
      return;
    }
    if (step < 5) {
      setStep(step + 1);
      return;
    }
    if (!config || !accepted) return;
    setBusy(true);
    try {
      await api(
        "/onboarding",
        send("POST", {
          company,
          admin,
          planId,
          timezone,
          dateFormat,
          termsVersion: config.termsVersion,
          privacyVersion: config.privacyVersion,
        }),
      );
      setComplete(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (complete)
    return (
      <main className="main saas-form">
        <h1>Empresa criada</h1>
        <p role="status">
          O convite para definir a palavra-passe será enviado para {admin.email}
          . Consulte a caixa de entrada e siga a ligação de uso único para
          ativar a conta.
        </p>
        <p>
          Identificador da empresa: <strong>{company.slug}</strong>
        </p>
        <Link className="button" href="/login">
          Ir para o login
        </Link>
      </main>
    );
  return (
    <main className="main saas-form">
      <Link href="/login" className="brand">
        obras.
      </Link>
      <h1>Criar empresa</h1>
      <p>Configure a sua equipa e comece a organizar as obras.</p>
      <ol className="saas-steps">
        {steps.map((name, i) => (
          <li key={name} aria-current={i === step ? "step" : undefined}>
            {i + 1}. {name}
          </li>
        ))}
      </ol>
      {error && <p role="alert">{error}</p>}
      <form className="card" onSubmit={next}>
        <h2>{steps[step]}</h2>
        {step === 0 && (
          <>
            {(
              [
                ["legalName", "Razão social", "text"],
                ["tradeName", "Nome comercial", "text"],
                ["taxNumber", "NUIT", "text"],
                ["email", "E-mail da empresa", "email"],
                ["phone", "Telefone", "tel"],
                ["address", "Endereço", "text"],
                ["slug", "Identificador da empresa", "text"],
              ] as const
            ).map(([key, label, type]) => (
              <label key={key}>
                {label}
                <input
                  type={type}
                  value={company[key]}
                  required={["legalName", "email", "slug"].includes(key)}
                  maxLength={
                    key === "address"
                      ? 1000
                      : key === "slug"
                        ? 60
                        : key === "phone"
                          ? 40
                          : key === "taxNumber"
                            ? 50
                            : 200
                  }
                  minLength={
                    key === "slug" ? 3 : key === "legalName" ? 2 : undefined
                  }
                  pattern={
                    key === "slug" ? "[a-z0-9][a-z0-9-]{2,59}" : undefined
                  }
                  onChange={(e) =>
                    setCompany({ ...company, [key]: e.target.value })
                  }
                />
              </label>
            ))}
            <p className="muted">
              O identificador é usado no login: letras minúsculas, números e
              hífen.
            </p>
          </>
        )}
        {step === 1 && (
          <>
            <label>
              Nome do administrador
              <input
                required
                minLength={2}
                maxLength={200}
                value={admin.name}
                onChange={(e) => setAdmin({ ...admin, name: e.target.value })}
              />
            </label>
            <label>
              E-mail do administrador
              <input
                required
                type="email"
                value={admin.email}
                onChange={(e) => setAdmin({ ...admin, email: e.target.value })}
              />
            </label>
            <p>
              Enviaremos um convite seguro. Nenhuma palavra-passe é enviada por
              e-mail.
            </p>
          </>
        )}
        {step === 2 && (
          <>
            <label>
              Plano
              <select
                required
                value={planId}
                onChange={(e) => setPlanId(e.target.value)}
              >
                <option value="">Selecionar plano</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            {plan && (
              <>
                <p>{plan.description}</p>
                <p>
                  {plan.monthlyPrice === null
                    ? "Condições comerciais sob consulta. Sem cobrança online."
                    : `${plan.monthlyPrice} ${plan.currency} / mês — faturação manual.`}
                </p>
              </>
            )}
            {config?.salesEmail && (
              <a href={`mailto:${config.salesEmail}`}>
                Contactar equipa comercial
              </a>
            )}
          </>
        )}
        {step === 3 && (
          <>
            <p>
              Plano {plan?.name}: {plan?.trialDays ?? 0} dias de avaliação.
            </p>
            <p>
              Após o trial, a conta passa para leitura até regularizar a
              subscrição. Os seus dados são preservados.
            </p>
            <p>Não é necessário cartão de crédito.</p>
          </>
        )}
        {step === 4 && (
          <>
            <label>
              Fuso horário
              <input
                required
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
              />
            </label>
            <label>
              Formato de data
              <select
                value={dateFormat}
                onChange={(e) => setDateFormat(e.target.value)}
              >
                <option value="dd/MM/yyyy">dd/MM/yyyy</option>
                <option value="yyyy-MM-dd">yyyy-MM-dd</option>
              </select>
            </label>
            <p>Moeda operacional: MZN.</p>
          </>
        )}
        {step === 5 && (
          <>
            <p>
              <strong>{company.legalName}</strong> · {company.slug}
            </p>
            <p>
              Administrador: {admin.name} ({admin.email})
            </p>
            <p>
              Plano: {plan?.name} · Trial: {plan?.trialDays} dias
            </p>
            <p>
              {timezone} · {dateFormat} · MZN
            </p>
            {config?.termsUrl && (
              <p>
                <a href={config.termsUrl} target="_blank" rel="noreferrer">
                  Termos de utilização
                </a>
              </p>
            )}
            {config?.privacyUrl && (
              <p>
                <a href={config.privacyUrl} target="_blank" rel="noreferrer">
                  Política de privacidade
                </a>
              </p>
            )}
            <label>
              <input
                required
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
              />
              Confirmo os dados e aceito os termos ({config?.termsVersion}) e a
              política de privacidade ({config?.privacyVersion}). O
              administrador confirmará a aceitação na sua conta.
            </label>
          </>
        )}
        <div className="saas-actions">
          {step > 0 && (
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => setStep(step - 1)}
            >
              Anterior
            </button>
          )}
          <button disabled={busy || !config} type="submit">
            {busy
              ? "A criar…"
              : step === 5
                ? "Criar empresa e enviar convite"
                : "Continuar"}
          </button>
        </div>
      </form>
    </main>
  );
}
