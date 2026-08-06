"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ESFERA_FONTES, ESFERA_LABELS } from "@/lib/analytics";
import { formatCompetencia, sortCompetencias } from "@/lib/competencia";
import type { Esfera } from "@/lib/types";
import { cn } from "@/lib/utils";

const ESFERAS: Esfera[] = ["federal", "estadual", "municipal"];

const linkClass = (active: boolean) =>
  cn(
    "block rounded-md px-3 py-2 text-sm font-medium transition-colors duration-200",
    active
      ? "bg-teal-100 text-teal-900"
      : "text-slate-800 hover:bg-teal-50 hover:text-teal-900",
  );

type Props = {
  competencias: string[];
  competenciaAtual: string;
};

export function SidebarNav({ competencias, competenciaAtual }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isHome = pathname === "/";
  const isUpload = pathname.startsWith("/upload");
  const isConsultas = pathname.startsWith("/consultas");
  const esferaAtiva = searchParams.get("esfera");
  const fromQs = searchParams.get("competencia");
  const list = sortCompetencias(competencias);
  const competencia =
    fromQs && list.includes(fromQs) ? fromQs : competenciaAtual || list[list.length - 1] || "";

  const withCompetencia = (href: string) => {
    const url = new URL(href, "http://local");
    if (competencia) url.searchParams.set("competencia", competencia);
    const qs = url.searchParams.toString();
    return qs ? `${url.pathname}?${qs}` : url.pathname;
  };

  const visaoGeralAtiva = isHome && !esferaAtiva;

  return (
    <nav className="space-y-1 px-2 py-3 text-sm">
      <div className="mb-3 px-3 text-[11px] text-muted-foreground">
        Competência atual:{" "}
        <span className="font-semibold text-slate-800">{formatCompetencia(competencia)}</span>
        {list.length > 1 ? (
          <span className="mt-0.5 block text-[10px]">{list.length} competências carregadas</span>
        ) : null}
      </div>

      <Link href={withCompetencia("/")} className={linkClass(visaoGeralAtiva)}>
        Visão geral
      </Link>

      <Link href={withCompetencia("/upload")} className={linkClass(isUpload)}>
        Importar PDFs
      </Link>

      <Link href={withCompetencia("/consultas")} className={linkClass(isConsultas)}>
        Consultas
      </Link>

      <div className="mt-4 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Esferas
      </div>
      {ESFERAS.map((esfera) => (
        <Link
          key={esfera}
          href={withCompetencia(`/?esfera=${esfera}`)}
          className={linkClass(isHome && esferaAtiva === esfera)}
        >
          <span className="block">{ESFERA_LABELS[esfera]}</span>
          <span className="block text-[10px] font-normal text-muted-foreground">
            {ESFERA_FONTES[esfera]}
          </span>
        </Link>
      ))}
    </nav>
  );
}
