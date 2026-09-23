"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ESFERA_LABELS } from "@/lib/analytics";
import { sortCompetencias } from "@/lib/competencia";
import type { Esfera } from "@/lib/types";
import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

const ESFERAS: Esfera[] = ["federal", "estadual", "municipal"];

const ESFERA_ICONS: Record<Esfera, IconName> = {
  federal: "account_balance",
  estadual: "apartment",
  municipal: "location_on",
};

type NavItem = {
  id: string;
  label: string;
  href: string;
  active: boolean;
  icon: IconName;
  group: "main" | "esferas";
};

type Props = {
  competencias: string[];
  competenciaAtual: string;
  onNavigate?: () => void;
};

export function SidebarNav({ competencias, competenciaAtual, onNavigate }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");

  const isHome = pathname === "/";
  const isUpload = pathname.startsWith("/upload");
  const isConsultas = pathname.startsWith("/consultas");
  const isParcelamentos = pathname.startsWith("/parcelamentos");
  const esferaAtiva = searchParams.get("esfera");
  const fromQs = searchParams.get("competencia");
  const list = sortCompetencias(competencias);
  const competencia =
    fromQs && list.includes(fromQs) ? fromQs : competenciaAtual || list[list.length - 1] || "";

  const withCompetencia = useCallback(
    (href: string) => {
      const url = new URL(href, "http://local");
      if (competencia) url.searchParams.set("competencia", competencia);
      const qs = url.searchParams.toString();
      return qs ? `${url.pathname}?${qs}` : url.pathname;
    },
    [competencia],
  );

  const items = useMemo<NavItem[]>(
    () => [
      {
        id: "visao",
        label: "Visão geral",
        href: withCompetencia("/"),
        active: isHome && !esferaAtiva,
        icon: "dashboard",
        group: "main",
      },
      {
        id: "upload",
        label: "Importar PDFs",
        href: withCompetencia("/upload"),
        active: isUpload,
        icon: "upload_file",
        group: "main",
      },
      {
        id: "consultas",
        label: "Consultas",
        href: withCompetencia("/consultas"),
        active: isConsultas,
        icon: "assignment",
        group: "main",
      },
      {
        id: "parcelamentos",
        label: "Parcelamentos",
        href: withCompetencia("/parcelamentos"),
        active: isParcelamentos,
        icon: "event_repeat",
        group: "main",
      },
      ...ESFERAS.map((esfera) => ({
        id: esfera,
        label: ESFERA_LABELS[esfera],
        href: withCompetencia(`/?esfera=${esfera}`),
        active: isHome && esferaAtiva === esfera,
        icon: ESFERA_ICONS[esfera],
        group: "esferas" as const,
      })),
    ],
    [withCompetencia, isHome, isUpload, isConsultas, isParcelamentos, esferaAtiva],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => item.label.toLowerCase().includes(q));
  }, [items, query]);

  const mainItems = filtered.filter((item) => item.group === "main");
  const esferaItems = filtered.filter((item) => item.group === "esferas");

  return (
    <nav className="flex h-full flex-col text-sm text-ink">
      <div className="border-b border-line px-3 py-3">
        <label className="relative block">
          <Icon
            name="search"
            size={16}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-exito-muted"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Pesquisar"
            className="h-10 w-full rounded-ctl border-0 bg-surface-low py-2 pl-8 pr-3 text-sm text-ink placeholder:text-[var(--placeholder)] outline-none focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2"
          />
        </label>
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
        {mainItems.map((item) => (
          <NavLink key={item.id} item={item} onNavigate={onNavigate} />
        ))}

        {esferaItems.length > 0 ? (
          <>
            <div className="t-eyebrow mt-4 px-3 pb-1 text-exito-muted">Esferas</div>
            {esferaItems.map((item) => (
              <NavLink key={item.id} item={item} onNavigate={onNavigate} />
            ))}
          </>
        ) : null}

        {filtered.length === 0 ? (
          <p className="px-3 py-2 text-xs text-exito-muted">Nenhum item encontrado.</p>
        ) : null}
      </div>
    </nav>
  );
}

function NavLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const isEsfera = item.group === "esferas";

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-ctl px-3 transition-colors",
        isEsfera ? "py-3" : "py-2",
        item.active
          ? "bg-green text-on-primary"
          : "text-on-surface-variant hover:bg-surface-container",
      )}
    >
      <Icon
        name={item.icon}
        size={isEsfera ? 20 : 18}
        className={cn(
          "shrink-0",
          item.active ? "text-on-primary" : "text-exito-muted group-hover:text-on-surface-variant",
        )}
      />
      <span
        className={cn(
          "min-w-0 leading-snug",
          isEsfera ? "text-base font-semibold" : "text-sm font-medium",
        )}
      >
        {item.label}
      </span>
    </Link>
  );
}
