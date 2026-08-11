"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { resolveMunicipal } from "@/lib/cadastro-utils";
import { formatCnpj } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CadastroConsulta } from "@/lib/types";

type DebitoLink = {
  id: string;
  codigo?: string;
  cnpj: string | null;
  nome?: string;
};

type Props = {
  empresas: CadastroConsulta[];
  competencia: string;
  debitoLinks: DebitoLink[];
};

type EditableRow = CadastroConsulta & {
  /** Identidade estável da linha (número/CNPJ/id originais ao carregar). */
  _matchNumero: string;
  _matchCnpj: string | null;
  _matchId: string | null;
};

type FieldKey = keyof CadastroConsulta;

const columnHelper = createColumnHelper<EditableRow>();

const cellInputClass =
  "h-8 min-w-0 border-transparent bg-transparent px-1.5 shadow-none hover:border-border focus-visible:border-input focus-visible:bg-card focus-visible:ring-1";

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

function municipalDisplay(value: string): string {
  return value.trim() === "***" ? "Não tem" : value;
}

function municipalForSave(uf: string, value: string): string {
  const trimmed = value.trim();
  if (trimmed.toLowerCase() === "não tem" || trimmed.toLowerCase() === "nao tem") {
    return "***";
  }
  return resolveMunicipal(uf, trimmed);
}

function toEditableRows(
  empresas: CadastroConsulta[],
  resolveId: (row: CadastroConsulta) => string | null,
): EditableRow[] {
  return empresas.map((row) => ({
    ...row,
    _matchNumero: row.numero,
    _matchCnpj: row.cnpj,
    _matchId: resolveId(row),
  }));
}

function matchesQuery(row: CadastroConsulta, rawQuery: string): boolean {
  const q = fold(rawQuery.trim());
  if (!q) return true;

  const qDigits = digits(rawQuery);
  const mun = fold(municipalDisplay(row.municipal));
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

  if (qDigits.length > 0) {
    if (digits(row.cnpj).includes(qDigits)) return true;
    if (digits(row.numero).includes(qDigits)) return true;
    if (String(Number(qDigits)) === qDigits && digits(row.numero) === qDigits) return true;
  }

  return false;
}

function sameRow(a: CadastroConsulta, b: CadastroConsulta): boolean {
  return (
    a.numero === b.numero &&
    a.empresa === b.empresa &&
    (a.cnpj ?? "") === (b.cnpj ?? "") &&
    a.uf === b.uf &&
    a.federal === b.federal &&
    a.estadual === b.estadual &&
    a.municipal === b.municipal
  );
}

type CellInputProps = {
  value: string;
  className?: string;
  ariaLabel: string;
  disabled?: boolean;
  onCommit: (next: string) => void;
};

function CellInput({ value, className, ariaLabel, disabled, onCommit }: CellInputProps) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);

  return (
    <Input
      value={draft}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(cellInputClass, className)}
      onFocus={() => {
        focused.current = true;
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        focused.current = false;
        onCommit(draft);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }
      }}
    />
  );
}

export function ConsultasTable({ empresas, competencia, debitoLinks }: Props) {
  const resolveDebitoId = useCallback((row: CadastroConsulta) => {
    const dig = digits(row.cnpj);
    const codigo = row.numero.trim();
    const nomeFold = fold(row.empresa);

    const byBoth = debitoLinks.filter((item) => {
      const sameCnpj = dig.length > 0 && digits(item.cnpj) === dig;
      const sameCodigo = Boolean(codigo) && String(item.codigo ?? "").trim() === codigo;
      return sameCnpj && sameCodigo;
    });
    if (byBoth.length === 1) return byBoth[0].id;
    if (byBoth.length > 1) {
      const byNome = byBoth.find((item) => fold(item.nome) === nomeFold);
      if (byNome) return byNome.id;
      // Preferir id cujo slug contém pedaço do nome.
      const slugHit = byBoth.find((item) =>
        nomeFold.split(/\s+/).some((part) => part.length > 3 && item.id.includes(part.slice(0, 6))),
      );
      if (slugHit) return slugHit.id;
      return byBoth[0].id;
    }

    const byCnpj = debitoLinks.filter(
      (item) => dig.length > 0 && digits(item.cnpj) === dig,
    );
    if (byCnpj.length === 1) return byCnpj[0].id;
    if (byCnpj.length > 1) {
      const byNome = byCnpj.find((item) => fold(item.nome) === nomeFold);
      if (byNome) return byNome.id;
    }

    const byCodigo = debitoLinks.filter(
      (item) => Boolean(codigo) && String(item.codigo ?? "").trim() === codigo,
    );
    if (byCodigo.length === 1) return byCodigo[0].id;
    if (byCodigo.length > 1) {
      const byNome = byCodigo.find((item) => fold(item.nome) === nomeFold);
      if (byNome) return byNome.id;
    }

    return byCnpj[0]?.id ?? byCodigo[0]?.id ?? null;
  }, [debitoLinks]);

  const [rows, setRows] = useState<EditableRow[]>(() =>
    toEditableRows(empresas, resolveDebitoId),
  );
  const [query, setQuery] = useState("");
  const [sorting, setSorting] = useState<SortingState>([{ id: "numero", desc: false }]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 25,
  });
  const [saveState, setSaveState] = useState<{
    key: string;
    status: "saving" | "saved" | "error";
    message?: string;
  } | null>(null);
  const savingKeys = useRef(new Set<string>());

  useEffect(() => {
    setRows(toEditableRows(empresas, resolveDebitoId));
  }, [empresas, resolveDebitoId]);

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
    () => rows.filter((row) => matchesQuery(row, query)),
    [rows, query],
  );

  useEffect(() => {
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  }, [query]);

  const persistRow = useCallback(async (row: EditableRow) => {
    const key = `${row._matchNumero}|${digits(row._matchCnpj)}`;
    if (savingKeys.current.has(key)) return;
    savingKeys.current.add(key);
    setSaveState({ key, status: "saving" });

    try {
      const payload = {
        item: {
          numero: row.numero,
          empresa: row.empresa,
          cnpj: row.cnpj,
          uf: row.uf,
          federal: row.federal,
          estadual: row.estadual,
          municipal: row.municipal,
        },
        match: {
          numero: row._matchNumero,
          cnpj: row._matchCnpj,
          id: row._matchId ?? undefined,
        },
      };
      const res = await fetch("/api/cadastro", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { item?: CadastroConsulta; error?: string };
      if (!res.ok || !data.item) {
        throw new Error(data.error || "Falha ao salvar.");
      }

      setRows((prev) =>
        prev.map((r) =>
          r._matchNumero === row._matchNumero &&
          digits(r._matchCnpj) === digits(row._matchCnpj)
            ? {
                ...data.item!,
                _matchNumero: data.item!.numero,
                _matchCnpj: data.item!.cnpj,
                _matchId: row._matchId,
              }
            : r,
        ),
      );
      setSaveState({ key, status: "saved" });
      window.setTimeout(() => {
        setSaveState((curr) => (curr?.key === key && curr.status === "saved" ? null : curr));
      }, 1800);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao salvar.";
      setSaveState({ key, status: "error", message });
    } finally {
      savingKeys.current.delete(key);
    }
  }, []);

  const commitField = useCallback(
    (row: EditableRow, field: FieldKey, rawValue: string) => {
      let next: EditableRow = { ...row };

      if (field === "cnpj") {
        const dig = digits(rawValue);
        next.cnpj = dig ? formatCnpj(dig) : rawValue.trim() || null;
      } else if (field === "uf") {
        next.uf = rawValue.trim().toUpperCase();
        next.municipal = municipalForSave(next.uf, next.municipal);
      } else if (field === "municipal") {
        next.municipal = municipalForSave(next.uf, rawValue);
      } else if (field === "numero") {
        next.numero = rawValue.trim();
      } else if (field === "empresa") {
        next.empresa = rawValue.trim();
      } else if (field === "federal") {
        next.federal = rawValue.trim();
      } else if (field === "estadual") {
        next.estadual = rawValue.trim();
      }

      // Exibir "—" vazio na UI como string vazia até salvar/normalizar no servidor.
      if (field === "uf" && !next.uf) next.uf = "";

      const baseline: CadastroConsulta = {
        numero: row.numero,
        empresa: row.empresa,
        cnpj: row.cnpj,
        uf: row.uf,
        federal: row.federal,
        estadual: row.estadual,
        municipal: row.municipal,
      };
      const candidate: CadastroConsulta = {
        numero: next.numero,
        empresa: next.empresa,
        cnpj: next.cnpj,
        uf: next.uf,
        federal: next.federal,
        estadual: next.estadual,
        municipal: next.municipal,
      };
      if (sameRow(baseline, candidate)) return;

      setRows((prev) =>
        prev.map((r) =>
          r._matchNumero === row._matchNumero &&
          digits(r._matchCnpj) === digits(row._matchCnpj)
            ? next
            : r,
        ),
      );
      void persistRow(next);
    },
    [persistRow],
  );

  const columns = useMemo(
    () => [
      columnHelper.accessor("numero", {
        header: "N°",
        cell: (info) => (
          <CellInput
            value={info.getValue() === "—" ? "" : info.getValue()}
            ariaLabel="Número"
            className="w-14 tabular font-semibold text-slate-800"
            onCommit={(value) => commitField(info.row.original, "numero", value)}
          />
        ),
      }),
      columnHelper.accessor("empresa", {
        header: "Empresa",
        cell: (info) => (
          <CellInput
            value={info.getValue() === "—" ? "" : info.getValue()}
            ariaLabel="Empresa"
            className="min-w-[180px] font-semibold tracking-tight text-slate-900"
            onCommit={(value) => commitField(info.row.original, "empresa", value)}
          />
        ),
      }),
      columnHelper.accessor("cnpj", {
        header: "CNPJ",
        cell: (info) => (
          <CellInput
            value={info.getValue() ? formatCnpj(info.getValue()) : ""}
            ariaLabel="CNPJ"
            className="min-w-[150px] tabular text-sm text-slate-800"
            onCommit={(value) => commitField(info.row.original, "cnpj", value)}
          />
        ),
      }),
      columnHelper.accessor("uf", {
        header: "UF",
        cell: (info) => (
          <CellInput
            value={info.getValue() === "—" ? "" : info.getValue()}
            ariaLabel="UF"
            className="w-12 text-center text-xs font-medium uppercase"
            onCommit={(value) => commitField(info.row.original, "uf", value)}
          />
        ),
      }),
      columnHelper.accessor("federal", {
        header: "Federal",
        cell: (info) => (
          <CellInput
            value={info.getValue()}
            ariaLabel="Portal federal"
            className="min-w-[90px] text-sm text-slate-800"
            onCommit={(value) => commitField(info.row.original, "federal", value)}
          />
        ),
      }),
      columnHelper.accessor("estadual", {
        header: "Estadual",
        cell: (info) => (
          <CellInput
            value={info.getValue()}
            ariaLabel="Portal estadual"
            className="min-w-[110px] text-sm text-slate-800"
            onCommit={(value) => commitField(info.row.original, "estadual", value)}
          />
        ),
      }),
      columnHelper.accessor("municipal", {
        header: "Municipal",
        cell: (info) => {
          const row = info.row.original;
          const isDf = row.uf.trim().toUpperCase() === "DF";
          const display = municipalDisplay(info.getValue());
          return (
            <CellInput
              value={display === "—" ? "" : display}
              ariaLabel="Portal municipal"
              disabled={isDf}
              className={cn(
                "min-w-[100px] text-sm text-slate-800",
                isDf && "text-amber-900",
              )}
              onCommit={(value) => commitField(row, "municipal", value)}
            />
          );
        },
      }),
      columnHelper.display({
        id: "debitos",
        header: "",
        cell: (info) => {
          const row = info.row.original;
          const id =
            info.row.original._matchId ??
            linkByCnpj.get(digits(row.cnpj)) ??
            linkByCodigo.get(row.numero) ??
            linkByCodigo.get(row._matchNumero) ??
            null;
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
    [commitField, competencia, linkByCnpj, linkByCodigo],
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
    getRowId: (row) => `${row._matchNumero}|${digits(row._matchCnpj)}|${row.empresa}`,
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
              {rows.length !== filtered.length ? ` de ${rows.length}` : ""}
              {" · "}edite a célula e saia do campo para salvar
            </p>
          </div>
          {saveState && (
            <p
              className={cn(
                "text-xs font-medium",
                saveState.status === "saving" && "text-slate-500",
                saveState.status === "saved" && "text-teal-700",
                saveState.status === "error" && "text-red-600",
              )}
              role="status"
            >
              {saveState.status === "saving" && "Salvando…"}
              {saveState.status === "saved" && "Salvo"}
              {saveState.status === "error" && (saveState.message || "Erro ao salvar")}
            </p>
          )}
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
                      <td key={cell.id} className="px-2 py-2 align-middle">
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
