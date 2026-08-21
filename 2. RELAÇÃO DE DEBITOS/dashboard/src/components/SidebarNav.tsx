"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Building2,
  CalendarClock,
  ClipboardList,
  FileUp,
  Landmark,
  LayoutDashboard,
  MapPin,
  Search,
} from "lucide-react";
import { ESFERA_LABELS } from "@/lib/analytics";
import { sortCompetencias } from "@/lib/competencia";
import type { Esfera } from "@/lib/types";
import { cn } from "@/lib/utils";

const ESFERAS: Esfera[] = ["federal", "estadual", "municipal"];

const ESFERA_ICONS = {
  federal: Landmark,
  estadual: Building2,
  municipal: MapPin,
} as const;

type NavItem = {
  id: string;
  label: string;
  href: string;
  active: boolean;
  icon: typeof LayoutDashboard;
  group: "main" | "esferas";
};

type Props = {
  competencias: string[];
  competenciaAtual: string;
};

export function SidebarNav({ competencias, competenciaAtual }: Props) {
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
        icon: LayoutDashboard,
        group: "main",
      },
      {
        id: "upload",
        label: "Importar PDFs",
        href: withCompetencia("/upload"),
        active: isUpload,
        icon: FileUp,
        group: "main",
      },
      {
        id: "consultas",
        label: "Consultas",
        href: withCompetencia("/consultas"),
        active: isConsultas,
        icon: ClipboardList,
        group: "main",
      },
      {
        id: "parcelamentos",
        label: "Parcelamentos",
        href: withCompetencia("/parcelamentos"),
        active: isParcelamentos,
        icon: CalendarClock,
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
    <nav className="flex h-full flex-col text-sm text-shell-foreground">
      <div className="border-b border-white/10 px-3 py-3">
        <label className="relative block">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-shell-muted"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Pesquisar"
            className="h-9 w-full rounded-md border border-white/15 bg-shell-deep/60 py-2 pl-8 pr-3 text-sm text-shell-foreground placeholder:text-shell-muted outline-none focus:border-shell-active/60 focus:ring-1 focus:ring-shell-active/40"
          />
        </label>
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
        {mainItems.map((item) => (
          <NavLink key={item.id} item={item} />
        ))}

        {esferaItems.length > 0 ? (
          <>
            <div className="mt-4 px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-shell-muted">
              Esferas
            </div>
            {esferaItems.map((item) => (
              <NavLink key={item.id} item={item} />
            ))}
          </>
        ) : null}

        {filtered.length === 0 ? (
          <p className="px-3 py-2 text-xs text-shell-muted">Nenhum item encontrado.</p>
        ) : null}
      </div>
    </nav>
  );
}

function NavLink({ item }: { item: NavItem }) {
  const Icon = item.icon;
  const isEsfera = item.group === "esferas";

  return (
    <Link
      href={item.href}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-md px-3 transition-colors",
        isEsfera ? "py-3" : "py-2",
        item.active
          ? "bg-shell-active-bg text-white"
          : "text-shell-foreground/90 hover:bg-shell-hover",
      )}
    >
      {item.active ? (
        <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-r bg-shell-active" />
      ) : null}
      <Icon
        className={cn(
          "shrink-0",
          isEsfera ? "size-5" : "size-4",
          item.active ? "text-shell-active" : "text-shell-muted group-hover:text-shell-foreground",
        )}
        aria-hidden
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
