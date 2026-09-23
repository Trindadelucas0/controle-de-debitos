import type { Metadata } from "next";
import { Suspense } from "react";
import { ShellFrame } from "@/components/ShellFrame";
import { getCompetenciaAtual, listCompetencias } from "@/lib/data";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pendências | Relação de Débitos",
  description: "Painel analítico de pendências fiscais por empresa e esfera",
};

export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const competencias = listCompetencias();
  const competenciaAtual = getCompetenciaAtual();

  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-surface text-ink antialiased">
        <Suspense
          fallback={
            <div className="flex min-h-screen flex-col bg-surface">
              <header
                className="border-b border-line bg-card"
                style={{ height: "var(--topbar-h)" }}
              />
              <div className="flex flex-1">
                <aside className="hidden w-[var(--sidebar-w)] border-r border-line bg-card lg:block" />
                <main className="min-w-0 flex-1 px-4 py-5 text-sm text-exito-muted">
                  Carregando…
                </main>
              </div>
            </div>
          }
        >
          <ShellFrame competencias={competencias} competenciaAtual={competenciaAtual}>
            {children}
          </ShellFrame>
        </Suspense>
      </body>
    </html>
  );
}
