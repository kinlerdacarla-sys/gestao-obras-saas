"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, send } from "../lib/api";
interface Checklist {
  items: { title: string; href: string; done: boolean }[];
  completed: number;
  total: number;
}
interface Legal {
  termsVersion: string;
  privacyVersion: string;
  termsUrl: string | null;
  privacyUrl: string | null;
}
export function OnboardingChecklist() {
  const [data, setData] = useState<Checklist | null>(null),
    [legal, setLegal] = useState<Legal | null>(null),
    [error, setError] = useState(""),
    [accepted, setAccepted] = useState(false);
  useEffect(() => {
    api<Checklist>("/onboarding-checklist")
      .then(setData)
      .catch((e) => setError(e.message));
    api<Legal & { accepted: boolean }>("/legal-acceptances")
      .then((v) => {
        setLegal(v);
        setAccepted(v.accepted);
      })
      .catch((e) => setError(e.message));
  }, []);
  async function accept() {
    try {
      await api("/legal-acceptances", send("POST", legal));
      setAccepted(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      {error && <p role="alert">{error}</p>}
      {data && data.completed < data.total && (
        <section className="card" aria-label="Primeiros passos">
          <h2>
            Primeiros passos · {data.completed}/{data.total}
          </h2>
          <p>Complete a configuração ao seu ritmo.</p>
          <ul>
            {data.items.map((i) => (
              <li key={i.title}>
                {i.done ? "✓ " : "○ "}
                <Link href={i.href}>{i.title}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {legal && !accepted && (
        <section className="card">
          <h2>Documentos legais</h2>
          <p>Confirme a aceitação na sua própria conta.</p>
          {legal.termsUrl && (
            <p>
              <a href={legal.termsUrl} target="_blank" rel="noreferrer">
                Termos de utilização ({legal.termsVersion})
              </a>
            </p>
          )}
          {legal.privacyUrl && (
            <p>
              <a href={legal.privacyUrl} target="_blank" rel="noreferrer">
                Privacidade ({legal.privacyVersion})
              </a>
            </p>
          )}
          <button onClick={() => void accept()}>
            Aceitar termos e política de privacidade
          </button>
        </section>
      )}
    </>
  );
}
