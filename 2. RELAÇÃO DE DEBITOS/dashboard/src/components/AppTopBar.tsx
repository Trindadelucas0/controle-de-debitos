"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  CalendarDays,
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
  const router = useRouter();
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

  const setCompetencia = (next: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("competencia", next);
    if (params.get("comparar") === next) params.delete("comparar");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
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
      <div className="flex h-16 items-center gap-4 px-4 lg:px-5">
        <Link href={withCompetencia("/")} className="flex shrink-0 items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-md bg-shell-active/25 text-shell-active">
            <Scale className="size-5" aria-hidden />
          </span>
          <p className="text-sm font-bold uppercase tracking-wide sm:text-base">
            RELAÇÃO DE DEBITOS MENSAL
          </p>
        </Link>

        <div className="mx-2 hidden h-8 w-px bg-white/15 sm:block" />

        <nav className="flex items-center gap-1.5" aria-label="Atalhos rápidos">
          {tools.map((tool) => {
            const Icon = tool.icon;
            return (
              <Link
                key={tool.label}
                href={tool.href}
                title={tool.label}
                className={cn(
                  "inline-flex size-10 items-center justify-center rounded-md transition-colors",
                  tool.active
                    ? "bg-shell-active/25 text-white"
                    : "text-shell-muted hover:bg-shell-hover hover:text-shell-foreground",
                )}
              >
                <Icon className="size-5" aria-hidden />
                <span className="sr-only">{tool.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {list.length > 0 && competencia ? (
            <label className="inline-flex items-center gap-2 rounded-md border border-shell-active/50 bg-shell-active-bg px-3 py-1.5 text-shell-foreground sm:px-4 sm:py-2">
              <span className="hidden items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-shell-muted sm:inline-flex">
                <CalendarDays className="size-3.5 text-shell-active" aria-hidden />
                Competência
              </span>
              <select
                className="h-8 min-w-[7.5rem] cursor-pointer rounded border-0 bg-transparent text-base font-bold tabular text-shell-foreground outline-none focus-visible:ring-1 focus-visible:ring-shell-active/60"
                value={competencia}
                onChange={(event) => setCompetencia(event.target.value)}
                aria-label="Competência"
              >
                {list.map((id) => (
                  <option key={id} value={id} className="bg-shell text-shell-foreground">
                    {formatCompetencia(id)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      </div>
    </header>
  );
}
