"use client";

import { CalendarDays, GitCompare } from "lucide-react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { formatCompetencia } from "@/lib/competencia";
import { cn } from "@/lib/utils";

type Props = {
  competencias: string[];
  competencia: string;
  comparar?: string | null;
  /** Se true, mostra seletor de comparação (página da empresa). */
  allowCompare?: boolean;
  /** Se true, oculta o select de competência (já existe na top bar). */
  hideCompetencia?: boolean;
  className?: string;
};

export function CompetenciaControls({
  competencias,
  competencia,
  comparar = null,
  allowCompare = false,
  hideCompetencia = false,
  className,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const pushParams = (next: { competencia?: string; comparar?: string | null }) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next.competencia) params.set("competencia", next.competencia);
    if (next.comparar === null) {
      params.delete("comparar");
    } else if (next.comparar !== undefined) {
      if (next.comparar) params.set("comparar", next.comparar);
      else params.delete("comparar");
    }
    // Evita comparar a mesma competência
    if (params.get("comparar") === params.get("competencia")) {
      params.delete("comparar");
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  if (competencias.length === 0) return null;
  if (hideCompetencia && !allowCompare) return null;

  return (
    <div className={cn("flex flex-wrap items-end gap-3", className)}>
      {!hideCompetencia ? (
        <label className="grid gap-1 text-xs font-medium text-slate-700">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="size-3.5 text-primary" aria-hidden />
            Competência
          </span>
          <select
            className="h-9 min-w-[140px] rounded-md border border-input bg-card px-2 text-sm"
            value={competencia}
            onChange={(event) => pushParams({ competencia: event.target.value })}
          >
            {competencias.map((id) => (
              <option key={id} value={id}>
                {formatCompetencia(id)}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {allowCompare && (
        <label className="grid gap-1 text-xs font-medium text-slate-700">
          <span className="inline-flex items-center gap-1.5">
            <GitCompare className="size-3.5 text-primary" aria-hidden />
            Comparar com
          </span>
          <select
            className="h-9 min-w-[140px] rounded-md border border-input bg-card px-2 text-sm"
            value={comparar ?? ""}
            onChange={(event) =>
              pushParams({ comparar: event.target.value ? event.target.value : null })
            }
            disabled={competencias.length < 2}
          >
            <option value="">Nenhuma</option>
            {competencias
              .filter((id) => id !== competencia)
              .map((id) => (
                <option key={id} value={id}>
                  {formatCompetencia(id)}
                </option>
              ))}
          </select>
        </label>
      )}

      {competencias.length < 2 && allowCompare && (
        <p className="max-w-xs text-[11px] text-muted-foreground">
          Inclua outra pasta MM-YYYY (ex.: 06-2026) e regenere os dados para comparar.
        </p>
      )}
    </div>
  );
}
