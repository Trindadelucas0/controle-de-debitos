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
import { PageHeader } from "@/components/PageHeader";
import { PaginationBar } from "@/components/PaginationBar";
import { SiteEmissaoButton } from "@/components/SiteEmissaoButton";
import { StatusBadge } from "@/components/StatusBadges";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ESFERA_FONTES, ESFERA_LABELS, empresaTemTitulo } from "@/lib/analytics";
import {
  collapseCodigos,
  fold,
  formatBRL,
  formatCnpj,
  formatTituloPendencia,
  normalizeTituloKey,
} from "@/lib/format";
import {
  padCnpj14,
  type SiteEmissaoRef,
} from "@/lib/parcelamentos-utils";
import type { Empresa, Esfera, StatusEsfera } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  FileSpreadsheet,
  Landmark,
  LayoutDashboard,
  ListFilter,
  MapPin,
  Search,
  X,
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
  competencia: string;
  /** Cruzamento com parcelamentos por CNPJ (14 dígitos). */
  siteEmissaoByCnpj?: Record<string, SiteEmissaoRef>;
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

export function EmpresasTable({
  empresas,
  totais,
  geradoEm,
  competencia,
  siteEmissaoByCnpj = {},
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const esferaFiltro = parseEsfera(searchParams.get("esfera"));
  const filtro = parseStatus(searchParams.get("status"));
  const tituloFiltro = normalizeTituloKey(searchParams.get("titulo"));

  const competenciaQS = `competencia=${encodeURIComponent(competencia)}`;

  const [query, setQuery] = useState("");
  const [sorting, setSorting] = useState<SortingState>([
    { id: "totais_saldo", desc: true },
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

  const setTituloFiltro = (titulo: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("competencia", competencia);
    const key = normalizeTituloKey(titulo);
    if (tituloFiltro && tituloFiltro === key) {
      params.delete("titulo");
    } else if (key) {
      params.set("titulo", key);
    } else {
      params.delete("titulo");
    }
    const queryString = params.toString();
    router.push(queryString ? `/?${queryString}` : "/");
  };

  const clearTituloFiltro = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("competencia", competencia);
    params.delete("titulo");
    const queryString = params.toString();
    router.push(queryString ? `/?${queryString}` : "/");
  };

  const filtered = useMemo(() => {
    const q = fold(query);
    return empresas.filter((empresa) => {
      if (esferaFiltro) {
        const bucket = empresa.esferas?.[esferaFiltro];
        // Só entra na esfera se houver documento nela (evita falso municipal).
        // Inclui indeterminado (pasta revisar) para municipal/federal não “sumirem”.
        if (!bucket || bucket.qtdDocs <= 0) return false;
        if (bucket.status !== "pendencia" && bucket.status !== "indeterminado") return false;
      }
      if (filtro !== "todas" && empresa.status !== filtro) return false;
      if (tituloFiltro && !empresaTemTitulo(empresa, tituloFiltro, esferaFiltro)) return false;
      if (!q) return true;
      const codigos = (empresa.codigos ?? (empresa.codigo ? [empresa.codigo] : [])).join(" ");
      const lancamentos = empresa.debitos
        .map((d) => d.numero_lancamento || "")
        .filter(Boolean)
        .join(" ");
      const tiposFold = empresa.tipos
        .flatMap((tipo) => [tipo, formatTituloPendencia(tipo)])
        .map(fold)
        .join(" ");
      const debitosFold = empresa.debitos
        .flatMap((d) => [
          d.titulo,
          d.receita,
          formatTituloPendencia(d.titulo),
        ])
        .map(fold)
        .join(" ");
      return (
        fold(empresa.nome).includes(q) ||
        fold(empresa.cnpj).includes(q) ||
        fold(empresa.codigo).includes(q) ||
        fold(codigos).includes(q) ||
        fold(lancamentos).includes(q) ||
        tiposFold.includes(q) ||
        debitosFold.includes(q)
      );
    });
  }, [empresas, esferaFiltro, filtro, tituloFiltro, query]);

  useEffect(() => {
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  }, [query, filtro, esferaFiltro, tituloFiltro]);

  const columns = useMemo(
    () => [
      columnHelper.accessor((row) => row.codigo ?? "", {
        id: "codigo",
        header: "Cód.",
        cell: (info) => {
          const empresa = info.row.original;
          const labels = collapseCodigos(
            empresa.codigos?.length ? empresa.codigos : empresa.codigo ? [empresa.codigo] : [],
          );
          return (
            <span className="tabular font-semibold text-slate-800">
              {labels.join(", ") || "—"}
            </span>
          );
        },
      }),
      columnHelper.accessor("nome", {
        header: "Empresa",
        cell: (info) => {
          const row = info.row.original;
          const dig = padCnpj14(row.cnpj);
          const ref = dig ? siteEmissaoByCnpj[dig] : undefined;
          const href = `/empresas/${row.id}?${competenciaQS}`;
          return (
            <div className="flex flex-wrap items-start gap-2">
              <Link href={href} className="min-w-0 flex-1 hover:underline">
                <div className="font-semibold tracking-tight text-slate-900">
                  {info.getValue()}
                </div>
                <div className="tabular text-[11px] text-muted-foreground">
                  {formatCnpj(row.cnpj)}
                </div>
              </Link>
              <SiteEmissaoButton
                siteEmissao={ref?.siteEmissao}
                tipo={ref?.tipo}
                stopPropagation
              />
            </div>
          );
        },
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
      columnHelper.accessor("tipos", {
        header: "Tipos",
        cell: (info) => (
          <span className="text-[11px] text-muted-foreground">
            {info.getValue().slice(0, 2).join(" / ") || "—"}
          </span>
        ),
      }),
    ],
    [esferaFiltro, competenciaQS, siteEmissaoByCnpj],
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

  const subtitulo = tituloFiltro
    ? `${formatTituloPendencia(tituloFiltro)} · ${filtered.length} ${filtered.length === 1 ? "empresa" : "empresas"}`
    : esferaFiltro
      ? `Pendências · ${ESFERA_LABELS[esferaFiltro]}`
      : filtro === "pendencia"
        ? "Pendências"
        : filtro === "regular"
          ? "Sem pendências"
          : "Filtre e abra o detalhe para agir por esfera";

  return (
    <div className="space-y-6 px-4 py-5 lg:px-6">
      <PageHeader
        icon={esferaFiltro ? Landmark : LayoutDashboard}
        title={
          esferaFiltro
            ? ESFERA_LABELS[esferaFiltro].toUpperCase()
            : "VISÃO GERAL DOS DEBITOS"
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                window.location.href = "/api/omissoes/export?formato=xlsx";
              }}
            >
              <FileSpreadsheet className="size-3.5" aria-hidden />
              Exportar omissões
            </Button>
            <p className="text-xs text-muted-foreground">
              Gerado em {new Date(geradoEm).toLocaleString("pt-BR")}
            </p>
          </div>
        }
      />

      <DashboardOverview
        empresas={empresas}
        totais={totais}
        esfera={esferaFiltro}
        competencia={competencia}
        activeTitulo={tituloFiltro || null}
        onTituloClick={setTituloFiltro}
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
              placeholder="Buscar empresa, CNPJ, omissão, DCTFWeb ou tipo"
              className="pl-8"
            />
          </div>
          {tituloFiltro ? (
            <Button type="button" size="sm" variant="outline" onClick={clearTituloFiltro}>
              <X className="size-3.5" aria-hidden />
              Limpar título
            </Button>
          ) : null}
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
                    {row.getVisibleCells().map((cell) => {
                      const isEmpresa = cell.column.id === "nome";
                      return (
                        <td key={cell.id} className="px-3 py-3 align-top">
                          {isEmpresa ? (
                            flexRender(cell.column.columnDef.cell, cell.getContext())
                          ) : (
                            <Link
                              href={`/empresas/${row.original.id}?${competenciaQS}`}
                              className="block"
                            >
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </Link>
                          )}
                        </td>
                      );
                    })}
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
