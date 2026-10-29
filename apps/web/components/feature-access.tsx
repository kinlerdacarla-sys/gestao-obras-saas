"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../lib/api";
export function FeatureAccess({
  feature,
  children,
  advisory = false,
}: {
  feature: string;
  children: React.ReactNode;
  advisory?: boolean;
}) {
  const [allowed, setAllowed] = useState<boolean | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    api<{ features: string[] }>("/entitlements")
      .then((e) => setAllowed(e.features.includes(feature)))
      .catch((e) => setError(e.message));
  }, [feature]);
  if (error) return <p role="alert">{error}</p>;
  if (allowed === null) return <p>A verificar o plano…</p>;
  return (
    <>
      {!allowed && (
        <section className="card" role="status">
          <h2>Funcionalidade não incluída no plano</h2>
          <p>
            {advisory
              ? "Os relatórios básicos de progresso continuam disponíveis. Relatórios avançados exigem outro plano."
              : "Contacte o administrador da empresa para alterar o plano."}
          </p>
          <Link href="/settings/subscription">Comparar planos</Link>
        </section>
      )}
      {(allowed || advisory) && children}
    </>
  );
}
