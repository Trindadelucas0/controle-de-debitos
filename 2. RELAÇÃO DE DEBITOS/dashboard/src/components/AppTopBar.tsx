"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { formatCompetencia, sortCompetencias } from "@/lib/competencia";
import { Icon } from "@/components/ui/icon";
import { selectDenseClass } from "@/components/ui/select-native";
import { cn } from "@/lib/utils";

type Props = {
  competencias: string[];
  competenciaAtual: string;
  onOpenMenu?: () => void;
};

export function AppTopBar({ competencias, competenciaAtual, onOpenMenu }: Props) {
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
      icon: "dashboard",
      active: visaoGeralAtiva,
    },
    {
      href: withCompetencia("/upload"),
      label: "Importar PDFs",
      icon: "upload_file",
      active: isUpload,
    },
    {
      href: withCompetencia("/consultas"),
      label: "Consultas",
      icon: "assignment",
      active: isConsultas,
    },
  ] as const;

  return (
    <header
      className="sticky top-0 z-40 border-b border-line bg-card text-ink"
      style={{ height: "var(--topbar-h)" }}
    >
      <div className="grid h-full grid-cols-[auto_1fr_auto] items-center gap-2 px-4 sm:grid-cols-[1fr_auto_1fr] sm:gap-4 lg:px-5">
        <nav className="flex items-center justify-start gap-1.5" aria-label="Atalhos rápidos">
          {onOpenMenu ? (
            <button
              type="button"
              className="inline-flex size-10 items-center justify-center rounded-ctl text-green hover:bg-surface-low lg:hidden"
              onClick={onOpenMenu}
              aria-label="Abrir menu"
            >
              <Icon name="menu" size={22} />
            </button>
          ) : null}
          {tools.map((tool) => (
            <Link
              key={tool.label}
              href={tool.href}
              title={tool.label}
              className={cn(
                "inline-flex size-10 items-center justify-center rounded-ctl transition-colors",
                tool.active
                  ? "bg-success-bg text-green"
                  : "text-green hover:bg-surface-low",
              )}
            >
              <Icon name={tool.icon} size={22} />
              <span className="sr-only">{tool.label}</span>
            </Link>
          ))}
        </nav>

        <Link
          href={withCompetencia("/")}
          className="flex min-w-0 items-center justify-center gap-2 sm:gap-3"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-ctl bg-success-bg text-green sm:size-10">
            <Icon name="balance" size={22} />
          </span>
          <p className="t-brand truncate text-center text-xs uppercase tracking-wide text-ink sm:text-base">
            RELAÇÃO DE DEBITOS MENSAL
          </p>
        </Link>

        <div className="flex items-center justify-end gap-2">
          {list.length > 0 && competencia ? (
            <label className="relative inline-flex cursor-pointer items-center gap-2">
              <span className="hidden items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-exito-muted sm:inline-flex">
                <Icon name="calendar_month" size={14} className="text-green" />
                Competência
              </span>
              <span className="relative">
                <select
                  className={cn(selectDenseClass, "h-10 min-w-[7.5rem] pr-8 text-base font-bold tabular")}
                  value={competencia}
                  onChange={(event) => setCompetencia(event.target.value)}
                  aria-label="Competência"
                >
                  {list.map((id) => (
                    <option key={id} value={id}>
                      {formatCompetencia(id)}
                    </option>
                  ))}
                </select>
                <Icon
                  name="expand_more"
                  size={18}
                  className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-green"
                />
              </span>
            </label>
          ) : null}
        </div>
      </div>
    </header>
  );
}
