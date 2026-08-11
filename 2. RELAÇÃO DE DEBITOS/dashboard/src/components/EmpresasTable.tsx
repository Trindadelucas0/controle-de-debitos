"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type PaginationState,
  type SortingState,
} from "@tanstack/react-table";
import { DashboardOverview } from "@/components/DashboardOverview";
import { CompetenciaControls } from "@/components/CompetenciaControls";
import { PageHeader } from "@/components/PageHeader";
import { PaginationBar } from "@/components/PaginationBar";
import { StatusBadge } from "@/components/StatusBadges";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ESFERA_FONTES, ESFERA_LABELS } from "@/lib/analytics";
import { formatCompetencia } from "@/lib/competencia";
import { formatBRL, formatCnpj } from "@/lib/format";
import type { Empresa, Esfera, StatusEsfera } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Landmark,
  ListFilter,
  MapPin,
  Search,
} from "lucide-react";

type Props = {
  empresas: Empresa[];
  totais: {
    empresas: number;
    com_pendencia: number;
    regulares: number;
    saldo: number;
    consolidado: number;
    docs_federal?: number;
    docs_estadual?: number;
    docs_municipal?: number;
  };
  geradoEm: string;
  competencias: string[];
  competencia: string;
};

type StatusFiltro = "todas" | "pendencia" | "regular";

const ESFERAS_VALIDAS: Esfera[] = ["federal", "estadual", "municipal"];

const columnHelper = createColumnHelper<Empresa>();

function parseEsfera(value: string | null): Esfera | null {
  if (!value) return null;
  return ESFERAS_VALIDAS.includes(value as Esfera) ? (value as Esfera) : null;
}

function parseStatus(value: string | null): StatusFiltro {
  if (value === "pendencia" || value === "regular") return value;
  return "todas";
}

export function EmpresasTable({ empresas, totais, geradoEm, competencias, competencia }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const esferaFiltro = parseEsfera(searchParams.get("esfera"));
  const filtro = parseStatus(searchParams.get("status"));

  const competenciaQS = `competencia=${encodeURIComponent(competencia)}`;

  const [query, setQuery] = useState("");
  const [sorting, setSorting] = useState<SortingState>([
    { id: "totais_consolidado", desc: true },
  ]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 25,
  });

  const setStatusFiltro = (value: StatusFiltro) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("competencia", competencia);
    if (value === "todas") {
      params.delete("status");
    } else {
      params.set("status", value);
    }
    const queryString = params.toString();
    router.push(queryString ? `/?${queryString}` : "/");
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return empresas.filter((empresa) => {
      if (esferaFiltro) {
        const bucket = empresa.esferas?.[esferaFiltro];
        // Só entra na esfera se houver documento nela (evita falso municipal).
        // Inclui indeterminado (pasta revisar) para municipal/federal não “sumirem”.
        if (!bucket || bucket.qtdDocs <= 0) return false;
        if (bucket.status !== "pendencia" && bucket.status !== "indeterminado") return false;
      }
      if (filtro !== "todas" && empresa.status !== filtro) return false;
      if (!q) return true;
      const codigos = (empresa.codigos ?? (empresa.codigo ? [empresa.codigo] : [])).join(" ");
      const lancamentos = empresa.debitos
        .map((d) => d.numero_lancamento || "")
        .filter(Boolean)
        .join(" ");
      return (
        empresa.nome.toLowerCase().includes(q) ||
        (empresa.cnpj || "").toLowerCase().includes(q) ||
        (empresa.codigo || "").toLowerCase().includes(q) ||
        codigos.toLowerCase().includes(q) ||
        lancamentos.toLowerCase().includes(q) ||
        empresa.tipos.some((tipo) => tipo.toLowerCase().includes(q))
      );
    });
  }, [empresas, esferaFiltro, filtro, query]);

  useEffect(() => {
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  }, [query, filtro, esferaFiltro]);

  const columns = useMemo(
    () => [
      columnHelper.accessor((row) => row.codigo ?? "", {
        id: "codigo",
        header: "Cód.",
        cell: (info) => {
          const empresa = info.row.original;
          const labels =
            (empresa.codigos?.length ? empresa.codigos : null) ??
            (empresa.codigo ? [empresa.codigo] : []);
          return (
            <span className="tabular font-semibold text-slate-800">
              {labels.join(", ") || "—"}
            </span>
          );
        },
      }),
      columnHelper.accessor("nome", {
        header: "Empresa",
        cell: (info) => (
          <div>
            <div className="font-semibold tracking-tight text-slate-900">{info.getValue()}</div>
            <div className="tabular text-[11px] text-muted-foreground">
              {formatCnpj(info.row.original.cnpj)}
            </div>
          </div>
        ),
      }),
      columnHelper.accessor("status", {
        header: "Status",
        cell: (info) => <StatusBadge status={info.getValue()} />,
      }),
      columnHelper.display({
        id: "esferas",
        header: "Esferas",
        cell: (info) => <EsferasMarks empresa={info.row.original} />,
      }),
      columnHelper.accessor(
        (row) =>
          esferaFiltro
            ? (row.esferas?.[esferaFiltro]?.qtd_debitos ?? 0)
            : row.qtd_debitos,
        {
          id: "qtd_debitos",
          header: "Lanç.",
          cell: (info) => <span className="tabular">{info.getValue()}</span>,
        },
      ),
      columnHelper.accessor(
        (row) =>
          esferaFiltro
            ? (row.esferas?.[esferaFiltro]?.totais.saldo ?? 0)
            : row.totais.saldo,
        {
          id: "totais_saldo",
          header: "Saldo",
          cell: (info) => (
            <span className="tabular font-semibold text-slate-800">
              {formatBRL(info.getValue())}
            </span>
          ),
        },
      ),
      columnHelper.accessor(
        (row) =>
          esferaFiltro
            ? (row.esferas?.[esferaFiltro]?.totais.consolidado ?? 0)
            : row.totais.consolidado,
        {
          id: "totais_consolidado",
          header: "Consolidado",
          cell: (info) => (
            <span className="tabular font-semibold text-cyan-800">
              {formatBRL(info.getValue())}
            </span>
          ),
        },
      ),
      columnHelper.accessor("tipos", {
        header: "Tipos",
        cell: (info) => (
          <span className="text-[11px] text-muted-foreground">
            {info.getValue().slice(0, 2).join(" / ") || "—"}
          </span>
        ),
      }),
    ],
    [esferaFiltro],
  );

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const subtitulo = esferaFiltro
    ? `Pendências · ${ESFERA_LABELS[esferaFiltro]}`
    : filtro === "pendencia"
      ? "Pendências"
      : filtro === "regular"
        ? "Sem pendências"
        : "Filtre e abra o detalhe para agir por esfera";

  return (
    <div className="space-y-6 px-4 py-5 lg:px-6">
      <PageHeader
        icon={Building2}
        title={`Painel · ${formatCompetencia(competencia)}`}
        description="Escolha a competência para ver o recorte completo do mês"
        actions={<CompetenciaControls competencias={competencias} competencia={competencia} />}
      />

      <DashboardOverview
        empresas={empresas}
        totais={totais}
        geradoEm={geradoEm}
        esfera={esferaFiltro}
        competencia={competencia}
      />

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 flex size-8 items-center justify-center rounded-md bg-slate-100 text-slate-700">
              <ListFilter className="size-4" aria-hidden />
            </span>
            <div>
              <h3 className="text-lg font-bold tracking-tight">Empresas</h3>
              <p className="text-sm text-muted-foreground">{subtitulo}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[240px] flex-1">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar código, nº lançamento, empresa, CNPJ ou tipo"
              className="pl-8"
            />
          </div>
          <div className="flex gap-1 rounded-md bg-muted/70 p-1">
            {(
              [
                ["todas", "Todas", null],
                ["pendencia", "Pendência", AlertTriangle],
                ["regular", "Regulares", CheckCircle2],
              ] as const
            ).map(([value, label, Icon]) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={filtro === value ? "default" : "ghost"}
                onClick={() => setStatusFiltro(value)}
              >
                {Icon ? <Icon className="size-3.5" aria-hidden /> : null}
                {label}
              </Button>
            ))}
          </div>
        </div>

        <Card className="overflow-hidden shadow-none">
          <div className="overflow-auto">
            <table className="w-full min-w-[980px] border-collapse text-left text-sm">
              <thead className="border-b border-border bg-[#F7F9FC] text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        className="cursor-pointer px-3 py-3 font-semibold"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {{
                          asc: " ↑",
                          desc: " ↓",
                        }[header.column.getIsSorted() as string] ?? null}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-border/70 transition-colors duration-200 hover:bg-slate-50"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-3 py-3 align-top">
                        <Link
                          href={`/empresas/${row.original.id}?${competenciaQS}`}
                          className="block"
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </Link>
                      </td>
                    ))}
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                      Nenhuma empresa encontrada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <PaginationBar
            pageIndex={table.getState().pagination.pageIndex}
            pageCount={table.getPageCount()}
            pageSize={table.getState().pagination.pageSize}
            totalRows={filtered.length}
            canPreviousPage={table.getCanPreviousPage()}
            canNextPage={table.getCanNextPage()}
            onPrevious={() => table.previousPage()}
            onNext={() => table.nextPage()}
            onPageSizeChange={(size) => table.setPageSize(size)}
          />
        </Card>
      </section>
    </div>
  );
}

function EsferasMarks({ empresa }: { empresa: Empresa }) {
  const items: {
    key: Esfera;
    Icon: typeof Landmark;
    on: boolean;
    status: StatusEsfera;
  }[] = [
    {
      key: "federal",
      Icon: Landmark,
      on: (empresa.esferas?.federal?.qtdDocs ?? 0) > 0 || !!empresa.temFederal,
      status: empresa.esferas?.federal?.status ?? "sem_documento",
    },
    {
      key: "estadual",
      Icon: Building2,
      on: (empresa.esferas?.estadual?.qtdDocs ?? 0) > 0 || !!empresa.temEstadual,
      status: empresa.esferas?.estadual?.status ?? "sem_documento",
    },
    {
      key: "municipal",
      Icon: MapPin,
      on: (empresa.esferas?.municipal?.qtdDocs ?? 0) > 0 || !!empresa.temMunicipal,
      status: empresa.esferas?.municipal?.status ?? "sem_documento",
    },
  ];

  const ativos = items.filter((item) => item.on);

  if (ativos.length === 0) {
    return <span className="text-[11px] text-muted-foreground">—</span>;
  }

  return (
    <div className="flex gap-1.5">
      {ativos.map((item) => {
        const Icon = item.Icon;
        return (
          <span
            key={item.key}
            title={`${ESFERA_LABELS[item.key]} · ${ESFERA_FONTES[item.key]}: ${item.status}`}
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold transition-colors",
              item.key === "federal"
                ? "bg-blue-100 text-blue-800"
                : item.key === "estadual"
                  ? "bg-teal-100 text-teal-800"
                  : "bg-orange-100 text-orange-800",
            )}
          >
            <Icon className="size-3" aria-hidden />
            <span
              className={cn(
                "inline-block size-1.5 rounded-full",
                item.status === "pendencia"
                  ? "bg-amber-500"
                  : item.status === "regular"
                    ? "bg-emerald-500"
                    : "bg-slate-400",
              )}
            />
          </span>
        );
      })}
    </div>
  );
}
