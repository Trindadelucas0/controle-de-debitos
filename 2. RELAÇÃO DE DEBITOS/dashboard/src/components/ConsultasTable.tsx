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
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { resolveMunicipal } from "@/lib/cadastro-utils";
import { formatCnpj } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CadastroConsulta } from "@/lib/types";
import { ClipboardList, ExternalLink, Plus, Search, X } from "lucide-react";

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
  /** Identidade estável da linha no React (não vai para a API). */
  _clientId: string;
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
  return empresas.map((row, index) => ({
    ...row,
    _clientId: `loaded-${digits(row.cnpj) || row.numero || "x"}-${index}`,
    _matchNumero: row.numero,
    _matchCnpj: row.cnpj,
    _matchId: resolveId(row),
  }));
}

function nextNumero(rows: EditableRow[]): string {
  let max = 0;
  for (const row of rows) {
    const n = Number(String(row.numero).replace(/\D/g, ""));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return String(max + 1);
}

function makeClientId() {
  return `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

type NovaEmpresaForm = {
  numero: string;
  empresa: string;
  cnpj: string;
  uf: string;
  federal: string;
  estadual: string;
  municipal: string;
};

function emptyNovaForm(numero: string): NovaEmpresaForm {
  return {
    numero,
    empresa: "",
    cnpj: "",
    uf: "",
    federal: "ECAC",
    estadual: "AGENCIA NET",
    municipal: "",
  };
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
  const [panelOpen, setPanelOpen] = useState(false);
  const [novaForm, setNovaForm] = useState<NovaEmpresaForm>(() => emptyNovaForm("1"));
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const savingKeys = useRef(new Set<string>());
  const empresaInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRows(toEditableRows(empresas, resolveDebitoId));
  }, [empresas, resolveDebitoId]);

  useEffect(() => {
    if (!panelOpen) return;
    const timer = window.setTimeout(() => empresaInputRef.current?.focus(), 50);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !creating) setPanelOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, [panelOpen, creating]);

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
    const key = row._clientId;
    if (savingKeys.current.has(key)) return;

    if (!row.empresa.trim()) {
      setSaveState({
        key,
        status: "error",
        message: "Informe o nome da empresa.",
      });
      return;
    }

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
          r._clientId === row._clientId
            ? {
                ...data.item!,
                _clientId: row._clientId,
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

      setRows((prev) => prev.map((r) => (r._clientId === row._clientId ? next : r)));
      void persistRow(next);
    },
    [persistRow],
  );

  const openNovaEmpresa = useCallback(() => {
    setCreateError(null);
    setNovaForm(emptyNovaForm(nextNumero(rows)));
    setPanelOpen(true);
  }, [rows]);

  const closeNovaEmpresa = useCallback(() => {
    if (creating) return;
    setPanelOpen(false);
    setCreateError(null);
  }, [creating]);

  const submitNovaEmpresa = useCallback(async () => {
    const empresa = novaForm.empresa.trim();
    if (!empresa) {
      setCreateError("Informe o nome da empresa.");
      empresaInputRef.current?.focus();
      return;
    }

    const uf = novaForm.uf.trim().toUpperCase();
    const dig = digits(novaForm.cnpj);
    const item = {
      numero: novaForm.numero.trim() || nextNumero(rows),
      empresa,
      cnpj: dig ? formatCnpj(dig) : novaForm.cnpj.trim() || null,
      uf,
      federal: novaForm.federal.trim() || "ECAC",
      estadual: novaForm.estadual.trim() || "AGENCIA NET",
      municipal: municipalForSave(uf, novaForm.municipal),
    };

    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/cadastro", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item }),
      });
      const data = (await res.json()) as { item?: CadastroConsulta; error?: string };
      if (!res.ok || !data.item) {
        throw new Error(data.error || "Falha ao criar empresa.");
      }

      const saved = data.item;
      const clientId = makeClientId();
      setRows((prev) => [
        {
          ...saved,
          _clientId: clientId,
          _matchNumero: saved.numero,
          _matchCnpj: saved.cnpj,
          _matchId: null,
        },
        ...prev,
      ]);
      setQuery("");
      setPagination((prev) => ({ ...prev, pageIndex: 0 }));
      setPanelOpen(false);
      setSaveState({ key: clientId, status: "saved" });
      window.setTimeout(() => {
        setSaveState((curr) => (curr?.key === clientId && curr.status === "saved" ? null : curr));
      }, 1800);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Falha ao criar empresa.");
    } finally {
      setCreating(false);
    }
  }, [novaForm, rows]);

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
              className="inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline"
            >
              Ver débitos
              <ExternalLink className="size-3" aria-hidden />
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
    getRowId: (row) => row._clientId,
  });

  return (
    <div className="space-y-6 px-4 py-5 lg:px-6">
      <PageHeader
        icon={ClipboardList}
        title="Consultas"
        description="Empresas e portais por esfera (Federal, Estadual e Municipal)"
      />

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
          <div className="flex flex-wrap items-center gap-3">
            {saveState && (
              <p
                className={cn(
                  "text-xs font-medium",
                  saveState.status === "saving" && "text-slate-500",
                  saveState.status === "saved" && "text-primary",
                  saveState.status === "error" && "text-red-600",
                )}
                role="status"
              >
                {saveState.status === "saving" && "Salvando…"}
                {saveState.status === "saved" && "Salvo"}
                {saveState.status === "error" && (saveState.message || "Erro ao salvar")}
              </p>
            )}
            <Button type="button" size="sm" onClick={openNovaEmpresa}>
              <Plus className="size-4" aria-hidden />
              Nova empresa
            </Button>
          </div>
        </div>

        <div className="relative min-w-[240px] max-w-xl">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar N°, empresa, CNPJ, UF ou portal"
            className="pl-8"
            aria-label="Buscar no cadastro de consultas"
            autoComplete="off"
          />
        </div>

        <Card className="overflow-hidden shadow-none">
          <div className="overflow-auto">
            <table className="w-full min-w-[860px] border-collapse text-left text-sm">
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

      {panelOpen ? (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40"
            aria-label="Fechar painel"
            disabled={creating}
            onClick={closeNovaEmpresa}
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="nova-empresa-title"
            className="relative flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Cadastro
                </p>
                <h3 id="nova-empresa-title" className="mt-1 text-lg font-bold text-slate-900">
                  Nova empresa
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Preencha os dados e confirme para incluir na lista.
                </p>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                disabled={creating}
                onClick={closeNovaEmpresa}
                aria-label="Fechar"
              >
                <X className="size-4" />
              </Button>
            </div>

            <form
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={(event) => {
                event.preventDefault();
                void submitNovaEmpresa();
              }}
            >
              <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
                <label className="grid gap-1.5 text-xs font-medium text-slate-700">
                  N°
                  <Input
                    value={novaForm.numero}
                    onChange={(event) =>
                      setNovaForm((prev) => ({ ...prev, numero: event.target.value }))
                    }
                    className="tabular"
                    inputMode="numeric"
                    disabled={creating}
                  />
                </label>

                <label className="grid gap-1.5 text-xs font-medium text-slate-700">
                  Empresa
                  <Input
                    ref={empresaInputRef}
                    value={novaForm.empresa}
                    onChange={(event) =>
                      setNovaForm((prev) => ({ ...prev, empresa: event.target.value }))
                    }
                    placeholder="Razão social"
                    disabled={creating}
                    required
                  />
                </label>

                <label className="grid gap-1.5 text-xs font-medium text-slate-700">
                  CNPJ
                  <Input
                    value={novaForm.cnpj}
                    onChange={(event) =>
                      setNovaForm((prev) => ({ ...prev, cnpj: event.target.value }))
                    }
                    onBlur={() => {
                      const dig = digits(novaForm.cnpj);
                      if (dig) {
                        setNovaForm((prev) => ({ ...prev, cnpj: formatCnpj(dig) }));
                      }
                    }}
                    placeholder="00.000.000/0000-00"
                    className="tabular"
                    disabled={creating}
                  />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="grid gap-1.5 text-xs font-medium text-slate-700">
                    UF
                    <Input
                      value={novaForm.uf}
                      onChange={(event) => {
                        const uf = event.target.value.toUpperCase().slice(0, 2);
                        setNovaForm((prev) => ({
                          ...prev,
                          uf,
                          municipal:
                            uf === "DF"
                              ? "Não tem"
                              : prev.municipal === "Não tem"
                                ? ""
                                : prev.municipal,
                        }));
                      }}
                      placeholder="DF"
                      className="uppercase"
                      maxLength={2}
                      disabled={creating}
                    />
                  </label>
                  <label className="grid gap-1.5 text-xs font-medium text-slate-700">
                    Municipal
                    <Input
                      value={novaForm.municipal}
                      onChange={(event) =>
                        setNovaForm((prev) => ({ ...prev, municipal: event.target.value }))
                      }
                      placeholder="Portal municipal"
                      disabled={creating || novaForm.uf.trim().toUpperCase() === "DF"}
                    />
                  </label>
                </div>

                <label className="grid gap-1.5 text-xs font-medium text-slate-700">
                  Federal
                  <Input
                    value={novaForm.federal}
                    onChange={(event) =>
                      setNovaForm((prev) => ({ ...prev, federal: event.target.value }))
                    }
                    disabled={creating}
                  />
                </label>

                <label className="grid gap-1.5 text-xs font-medium text-slate-700">
                  Estadual
                  <Input
                    value={novaForm.estadual}
                    onChange={(event) =>
                      setNovaForm((prev) => ({ ...prev, estadual: event.target.value }))
                    }
                    disabled={creating}
                  />
                </label>

                {createError ? (
                  <p
                    role="alert"
                    className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
                  >
                    {createError}
                  </p>
                ) : null}
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
                <Button
                  type="button"
                  variant="outline"
                  disabled={creating}
                  onClick={closeNovaEmpresa}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={creating}>
                  <Plus className="size-4" aria-hidden />
                  {creating ? "Salvando…" : "Adicionar"}
                </Button>
              </div>
            </form>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
