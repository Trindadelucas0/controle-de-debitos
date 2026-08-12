import type { Metadata } from "next";
import { Suspense } from "react";
import { AppTopBar } from "@/components/AppTopBar";
import { SidebarNav } from "@/components/SidebarNav";
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
      <body className="min-h-screen bg-background text-foreground antialiased">
        <div className="flex min-h-screen flex-col">
          <Suspense
            fallback={
              <header className="h-16 border-b border-white/10 bg-shell text-shell-foreground" />
            }
          >
            <AppTopBar competencias={competencias} competenciaAtual={competenciaAtual} />
          </Suspense>

          <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[240px_1fr]">
            <aside className="border-b border-white/10 bg-shell lg:border-b-0 lg:border-r lg:border-white/10">
              <Suspense
                fallback={
                  <nav className="px-3 py-3 text-sm text-shell-muted">Carregando…</nav>
                }
              >
                <SidebarNav competencias={competencias} competenciaAtual={competenciaAtual} />
              </Suspense>
            </aside>
            <main className="min-w-0 bg-background">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
