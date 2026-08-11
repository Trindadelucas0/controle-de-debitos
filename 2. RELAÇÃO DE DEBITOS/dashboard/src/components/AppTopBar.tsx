"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  ClipboardList,
  FileUp,
  LayoutDashboard,
  Scale,
} from "lucide-react";
import { formatCompetencia, sortCompetencias } from "@/lib/competencia";
import { cn } from "@/lib/utils";

type Props = {
  competencias: string[];
  competenciaAtual: string;
};

export function AppTopBar({ competencias, competenciaAtual }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const list = sortCompetencias(competencias);
  const fromQs = searchParams.get("competencia");
  const competencia =
    fromQs && list.includes(fromQs) ? fromQs : competenciaAtual || list[list.length - 1] || "";

  const withCompetencia = (href: string) => {
    const url = new URL(href, "http://local");
    if (competencia) url.searchParams.set("competencia", competencia);
    const qs = url.searchParams.toString();
    return qs ? `${url.pathname}?${qs}` : url.pathname;
  };

  const isHome = pathname === "/";
  const isUpload = pathname.startsWith("/upload");
  const isConsultas = pathname.startsWith("/consultas");
  const esferaAtiva = searchParams.get("esfera");
  const visaoGeralAtiva = isHome && !esferaAtiva;

  const tools = [
    {
      href: withCompetencia("/"),
      label: "Visão geral",
      icon: LayoutDashboard,
      active: visaoGeralAtiva,
    },
    {
      href: withCompetencia("/upload"),
      label: "Importar PDFs",
      icon: FileUp,
      active: isUpload,
    },
    {
      href: withCompetencia("/consultas"),
      label: "Consultas",
      icon: ClipboardList,
      active: isConsultas,
    },
  ] as const;

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-shell text-shell-foreground">
      <div className="flex h-12 items-center gap-3 px-3 lg:px-4">
        <Link href={withCompetencia("/")} className="flex shrink-0 items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-md bg-shell-active/25 text-shell-active">
            <Scale className="size-4" aria-hidden />
          </span>
          <div className="leading-tight">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-shell-muted">
              Razão fiscal
            </p>
            <p className="text-sm font-bold tracking-tight">Relação de Débitos</p>
          </div>
        </Link>

        <div className="mx-2 hidden h-7 w-px bg-white/15 sm:block" />

        <nav className="flex items-center gap-1" aria-label="Atalhos rápidos">
          {tools.map((tool) => {
            const Icon = tool.icon;
            return (
              <Link
                key={tool.label}
                href={tool.href}
                title={tool.label}
                className={cn(
                  "inline-flex size-9 items-center justify-center rounded-md transition-colors",
                  tool.active
                    ? "bg-shell-active/25 text-white"
                    : "text-shell-muted hover:bg-shell-hover hover:text-shell-foreground",
                )}
              >
                <Icon className="size-[18px]" aria-hidden />
                <span className="sr-only">{tool.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {competencia ? (
            <span className="hidden items-center gap-1.5 rounded-md border border-white/15 bg-shell-deep/50 px-2.5 py-1 text-xs text-shell-foreground sm:inline-flex">
              <span className="text-shell-muted">Competência</span>
              <span className="font-semibold tabular">{formatCompetencia(competencia)}</span>
            </span>
          ) : null}
        </div>
      </div>
    </header>
  );
}
