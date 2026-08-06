"use client";

import Link from "next/link";
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
import { PaginationBar } from "@/components/PaginationBar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { labelMunicipal } from "@/lib/cadastro-utils";
import { formatCnpj } from "@/lib/format";
import type { CadastroConsulta } from "@/lib/types";

type DebitoLink = {
  id: string;
  codigo?: string;
  cnpj: string | null;
};

type Props = {
  empresas: CadastroConsulta[];
  competencia: string;
  debitoLinks: DebitoLink[];
};

const columnHelper = createColumnHelper<CadastroConsulta>();

function digits(value: string | null | undefined): string {
  return (value || "").replace(/\D/g, "");
}

/** Normaliza texto para busca (minúsculo + sem acento). */
function fold(value: string | null | undefined): string {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function matchesQuery(row: CadastroConsulta, rawQuery: string): boolean {
  const q = fold(rawQuery.trim());
  if (!q) return true;

  const qDigits = digits(rawQuery);
  const mun = fold(labelMunicipal(row.municipal).text);
  const haystack = [
    fold(row.numero),
    fold(row.empresa),
    fold(row.cnpj),
    fold(row.uf),
    fold(row.federal),
    fold(row.estadual),
    mun,
  ];

  if (haystack.some((field) => field.includes(q))) return true;

  // CNPJ / N° só com dígitos (evita "".includes("") matchar tudo)
  if (qDigits.length > 0) {
    if (digits(row.cnpj).includes(qDigits)) return true;
    if (digits(row.numero).includes(qDigits)) return true;
    // "6" encontra "06"
    if (String(Number(qDigits)) === qDigits && digits(row.numero) === qDigits) return true;
  }

  return false;
}

export function ConsultasTable({ empresas, competencia, debitoLinks }: Props) {
  const [query, setQuery] = useState("");
  const [sorting, setSorting] = useState<SortingState>([{ id: "numero", desc: false }]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 25,
  });

  const linkByCnpj = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of debitoLinks) {
      const d = digits(item.cnpj);
      if (d) map.set(d, item.id);
    }
    return map;
  }, [debitoLinks]);

  const linkByCodigo = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of debitoLinks) {
      if (item.codigo) map.set(String(item.codigo).trim(), item.id);
    }
    return map;
  }, [debitoLinks]);

  const filtered = useMemo(
    () => empresas.filter((row) => matchesQuery(row, query)),
    [empresas, query],
  );

  useEffect(() => {
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  }, [query]);

  const columns = useMemo(
    () => [
      columnHelper.accessor("numero", {
        header: "N°",
        cell: (info) => (
          <span className="tabular font-semibold text-slate-800">{info.getValue()}</span>
        ),
      }),
      columnHelper.accessor("empresa", {
        header: "Empresa",
        cell: (info) => (
          <span className="font-semibold tracking-tight text-slate-900">{info.getValue()}</span>
        ),
      }),
      columnHelper.accessor("cnpj", {
        header: "CNPJ",
        cell: (info) => (
          <span className="tabular text-sm text-slate-800">{formatCnpj(info.getValue())}</span>
        ),
      }),
      columnHelper.accessor("uf", {
        header: "UF",
        cell: (info) => (
          <Badge variant={info.getValue() === "DF" ? "secondary" : "outline"}>
            {info.getValue() || "—"}
          </Badge>
        ),
      }),
      columnHelper.accessor("federal", {
        header: "Federal",
        cell: (info) => <span className="text-sm text-slate-800">{info.getValue()}</span>,
      }),
      columnHelper.accessor("estadual", {
        header: "Estadual",
        cell: (info) => <span className="text-sm text-slate-800">{info.getValue()}</span>,
      }),
      columnHelper.accessor("municipal", {
        header: "Municipal",
        cell: (info) => {
          const label = labelMunicipal(info.getValue());
          if (label.semMunicipal) {
            return (
              <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-900">
                Não tem
              </Badge>
            );
          }
          return <span className="text-sm text-slate-800">{label.text}</span>;
        },
      }),
      columnHelper.display({
        id: "debitos",
        header: "",
        cell: (info) => {
          const row = info.row.original;
          const id =
            linkByCnpj.get(digits(row.cnpj)) ?? linkByCodigo.get(row.numero) ?? null;
          if (!id || !competencia) return null;
          return (
            <Link
              href={`/empresas/${id}?competencia=${encodeURIComponent(competencia)}`}
              className="text-xs font-medium text-teal-800 underline-offset-2 hover:underline"
            >
              Ver débitos
            </Link>
          );
        },
      }),
    ],
    [competencia, linkByCnpj, linkByCodigo],
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

  return (
    <div className="space-y-6 px-4 py-5 lg:px-6">
      <div>
        <h2 className="text-lg font-bold tracking-tight">Consultas</h2>
        <p className="text-sm text-muted-foreground">
          Empresas e portais por esfera (Federal, Estadual e Municipal)
        </p>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="text-lg font-bold tracking-tight">Cadastro</h3>
            <p className="text-sm text-muted-foreground">
              {filtered.length} empresa{filtered.length === 1 ? "" : "s"}
              {empresas.length !== filtered.length ? ` de ${empresas.length}` : ""}
            </p>
          </div>
        </div>

        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar N°, empresa, CNPJ, UF ou portal"
          className="min-w-[240px] max-w-xl"
          aria-label="Buscar no cadastro de consultas"
          autoComplete="off"
        />

        <Card className="overflow-hidden">
          <div className="overflow-auto">
            <table className="w-full min-w-[860px] border-collapse text-left text-sm">
              <thead className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
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
                    className="border-b border-border/70 transition-colors duration-200 hover:bg-sky-50/60"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-3 py-3 align-middle">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                      {query.trim()
                        ? "Nenhuma empresa encontrada para essa busca."
                        : "Nenhuma empresa no cadastro de consultas."}
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
