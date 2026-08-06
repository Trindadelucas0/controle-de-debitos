import type { Metadata } from "next";
import { Suspense } from "react";
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
      <body className="min-h-screen text-foreground antialiased">
        <div className="min-h-screen lg:grid lg:grid-cols-[220px_1fr]">
          <aside className="border-b border-border/80 bg-card/80 backdrop-blur lg:border-b-0 lg:border-r">
            <div className="border-b border-border/80 px-4 py-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-teal-700">
                Razão fiscal
              </p>
              <h1 className="mt-1 text-base font-bold tracking-tight text-slate-900">
                Relação de Débitos
              </h1>
              <p className="mt-1 text-xs text-muted-foreground">por competência · painel analítico</p>
            </div>
            <Suspense
              fallback={<nav className="px-2 py-3 text-sm text-muted-foreground">Carregando…</nav>}
            >
              <SidebarNav competencias={competencias} competenciaAtual={competenciaAtual} />
            </Suspense>
          </aside>
          <main className="min-w-0">{children}</main>
        </div>
      </body>
    </html>
  );
}
