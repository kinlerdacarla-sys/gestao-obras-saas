import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Obras | Gestão de obras",
  description: "Plataforma de gestão de obras • Core SaaS",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt">
      <body>{children}</body>
    </html>
  );
}
