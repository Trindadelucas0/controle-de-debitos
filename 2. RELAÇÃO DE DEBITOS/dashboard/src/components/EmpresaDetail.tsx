"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  Download,
  Landmark,
  MapPin,
  Trash2,
  Wallet,
  type LucideIcon,
} from "lucide-react";
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
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PaginationBar } from "@/components/PaginationBar";
import { CompetenciaComparacao } from "@/components/CompetenciaComparacao";
import { CompetenciaControls } from "@/components/CompetenciaControls";
import { PageHeader } from "@/components/PageHeader";
import { EsferaBadge, StatusBadge } from "@/components/StatusBadges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { buildEmpresaAnalytics, ESFERA_FONTES, ESFERA_LABELS } from "@/lib/analytics";
import { formatCompetencia } from "@/lib/competencia";
import { formatBRL, formatCnpj } from "@/lib/format";
import type { DebitoLinha, Empresa, Esfera, StatusEsfera } from "@/lib/types";

const columnHelper = createColumnHelper<DebitoLinha>();

const ESFERAS: Esfera[] = ["federal", "estadual", "municipal"];

const ESFERA_ICONS: Record<Esfera, LucideIcon> = {
  federal: Landmark,
  estadual: Building2,
  municipal: MapPin,
};

type Props = {
  empresa: Empresa;
  competencias: string[];
  competencia: string;
  compararCompetencia?: string | null;
  empresaComparacao?: Empresa | null;
};

export function EmpresaDetail({
  empresa,
  competencias,
  competencia,
  compararCompetencia = null,
  empresaComparacao = null,
}: Props) {
  const analytics = useMemo(() => buildEmpresaAnalytics(empresa), [empresa]);
  const defaultTab =
    ESFERAS.find((esfera) => (empresa.esferas?.[esfera]?.qtdDocs ?? 0) > 0) ?? "federal";

  const backHref =
    competencia && competencia !== competencias[competencias.length - 1]
      ? `/?competencia=${competencia}`
      : "/";

  return (
    <div className="space-y-5 px-4 py-5 lg:px-6">
      <div>
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-sm text-primary underline-offset-2 transition-colors hover:underline"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Voltar para o painel
        </Link>
      </div>

      <header className="space-y-4">
        <PageHeader
          icon={Building2}
          title={empresa.nome}
          description={[
            empresa.codigo
              ? `Cód. ${empresa.codigo}${(empresa.codigos?.length ?? 0) > 1 ? ` (${empresa.codigos!.join(", ")})` : ""}`
              : null,
            `CNPJ ${formatCnpj(empresa.cnpj)}`,
            `Competência ${formatCompetencia(competencia)}`,
          ]
            .filter(Boolean)
            .join(" · ")}
          actions={<StatusBadge status={empresa.status} />}
        />

        <CompetenciaControls
          competencias={competencias}
          competencia={competencia}
          comparar={compararCompetencia}
          allowCompare
        />

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Kpi label="Original" value={formatBRL(empresa.totais.original)} />
          <Kpi label="Saldo" value={formatBRL(empresa.totais.saldo)} accent="text-cyan-800" icon={Wallet} />
          <Kpi label="Multa" value={formatBRL(empresa.totais.multa)} accent="text-amber-700" icon={AlertTriangle} />
          <Kpi label="Juros" value={formatBRL(empresa.totais.juros)} accent="text-red-600" />
          <Kpi
            label="Consolidado"
            value={formatBRL(empresa.totais.consolidado)}
            accent="text-teal-700"
            icon={Wallet}
          />
        </div>

        {empresa.tipos.length > 0 && (
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {empresa.tipos.join(" · ")}
          </p>
        )}

        {empresa.avisos.length > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {empresa.avisos.join(" · ")}
          </div>
        )}
      </header>

      {compararCompetencia ? (
        <CompetenciaComparacao
          base={empresa}
          baseCompetencia={competencia}
          other={empresaComparacao}
          otherCompetencia={compararCompetencia}
        />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Composição do valor</CardTitle>
            <CardDescription>Saldo, multa e juros desta empresa</CardDescription>
          </CardHeader>
          <CardContent className="h-[240px]">
            {analytics.composicao.length === 0 ? (
              <Empty message="Sem valores para compor o gráfico." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={analytics.composicao}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                  >
                    {analytics.composicao.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => formatBRL(Number(value ?? 0))}
                    contentStyle={tooltipStyle}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Saldo por esfera</CardTitle>
            <CardDescription>
              ECAC · Receita Federal · Agenci@Net · Prefeitura
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.porEsfera} margin={{ left: 0, right: 8, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#64748b" }} />
                <YAxis
                  tickFormatter={(v) => compactBRL(Number(v))}
                  tick={{ fontSize: 11, fill: "#64748b" }}
                />
                <Tooltip
                  formatter={(value) => formatBRL(Number(value ?? 0))}
                  contentStyle={tooltipStyle}
                />
                <Bar dataKey="consolidado" radius={[6, 6, 0, 0]} barSize={36}>
                  {analytics.porEsfera.map((entry) => (
                    <Cell key={entry.esfera} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue={defaultTab} className="w-full">
        <TabsList>
          {ESFERAS.map((esfera) => {
            const bucket = empresa.esferas?.[esfera];
            const Icon = ESFERA_ICONS[esfera];
            return (
              <TabsTrigger key={esfera} value={esfera} className="gap-2">
                <Icon className="size-3.5" aria-hidden />
                {ESFERA_LABELS[esfera]}
                <span className="rounded bg-background/80 px-1.5 py-0.5 text-[10px] tabular">
                  {bucket?.qtdDocs ?? 0}
                </span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {ESFERAS.map((esfera) => (
          <TabsContent key={esfera} value={esfera}>
            <EsferaPanel empresa={empresa} esfera={esfera} competencia={competencia} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function EsferaPanel({
  empresa,
  esfera,
  competencia,
}: {
  empresa: Empresa;
  esfera: Esfera;
  competencia: string;
}) {
  const router = useRouter();
  const bucket = empresa.esferas?.[esfera];
  const status: StatusEsfera = bucket?.status ?? "sem_documento";
  const debitos = useMemo(
    () => empresa.debitos.filter((item) => (item.esfera ?? inferEsfera(item.arquivo)) === esfera),
    [empresa.debitos, esfera],
  );
  const arquivosBase =
    bucket?.arquivos?.length
      ? bucket.arquivos
      : empresa.documentos?.filter((d) => d.esfera === esfera).map((d) => d.arquivo) ?? [];

  const [sorting, setSorting] = useState<SortingState>([{ id: "consolidado", desc: true }]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 25,
  });
  const [removedFiles, setRemovedFiles] = useState<string[]>([]);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const arquivos = arquivosBase.filter((a) => !removedFiles.includes(a));

  const excluirArquivo = async (arquivo: string) => {
    if (deletingFile) return;
    const confirmado = window.confirm(
      `Excluir o PDF importado "${arquivo}"?\n\nOs débitos deste arquivo saem do painel após a exclusão.`,
    );
    if (!confirmado) return;

    setDeletingFile(arquivo);
    setDeleteError(null);
    try {
      const res = await fetch("/api/delete-imported", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          competencia,
          empresaId: empresa.id,
          arquivo,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (res.status === 409) {
        setDeleteError(
          payload?.erro ||
            "Outra importação/exclusão ainda está em andamento. Aguarde e tente de novo.",
        );
        return;
      }
      const removed =
        Boolean(payload?.ok) ||
        Number(payload?.excluidos || 0) > 0 ||
        payload?.code === "REBUILD_FAILED";
      if (!removed) {
        setDeleteError(payload?.erro || "Falha ao excluir o arquivo importado");
        return;
      }
      if (payload?.code === "REBUILD_FAILED" || payload?.aviso_global) {
        setDeleteError(
          payload?.aviso_global ||
            payload?.erro ||
            "Arquivo removido, mas o painel pode estar desatualizado. Atualize a página.",
        );
      }
      setRemovedFiles((prev) => [...prev, arquivo]);
      const restantes = empresa.arquivos.filter(
        (a) => a !== arquivo && !removedFiles.includes(a),
      );
      if (restantes.length === 0) {
        router.push(`/?competencia=${encodeURIComponent(competencia)}`);
        router.refresh();
        return;
      }
      router.refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Erro de rede na exclusão");
    } finally {
      setDeletingFile(null);
    }
  };

  const columns = useMemo(
    () => [
      columnHelper.accessor((row) => row.codigo || empresa.codigo || "", {
        id: "codigo",
        header: "Cód.",
        cell: (info) => <span className="tabular">{info.getValue() || "—"}</span>,
      }),
      columnHelper.accessor("numero_lancamento", {
        header: "Nº lanç.",
        cell: (info) => (
          <span className="tabular text-[11px]">{info.getValue() || "—"}</span>
        ),
      }),
      columnHelper.accessor("receita", {
        header: "Receita",
        cell: (info) => <span className="font-semibold">{info.getValue()}</span>,
      }),
      columnHelper.accessor("pa", { header: "PA/Exerc." }),
      columnHelper.accessor("vencimento", {
        header: "Vencimento",
        cell: (info) => <span className="tabular">{info.getValue()}</span>,
      }),
      columnHelper.accessor("original", {
        header: "Vl. original",
        cell: (info) => <span className="tabular">{formatBRL(info.getValue())}</span>,
      }),
      columnHelper.accessor("saldo", {
        header: "Sdo. devedor",
        cell: (info) => (
          <span className="tabular font-semibold text-cyan-800">{formatBRL(info.getValue())}</span>
        ),
      }),
      columnHelper.accessor("multa", {
        header: "Multa",
        cell: (info) => <span className="tabular">{formatBRL(info.getValue())}</span>,
      }),
      columnHelper.accessor("juros", {
        header: "Juros",
        cell: (info) => <span className="tabular">{formatBRL(info.getValue())}</span>,
      }),
      columnHelper.accessor("consolidado", {
        header: "Sdo. consol.",
        cell: (info) => (
          <span className="tabular font-semibold text-teal-700">{formatBRL(info.getValue())}</span>
        ),
      }),
      columnHelper.accessor("situacao", {
        header: "Situação",
        cell: (info) => (
          <span className="text-[10px] font-bold uppercase tracking-[0.08em]">{info.getValue()}</span>
        ),
      }),
    ],
    [empresa.codigo],
  );

  const table = useReactTable({
    data: debitos,
    columns,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  if (!bucket || bucket.qtdDocs === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Não há documento {ESFERA_LABELS[esfera].toLowerCase()} nesta competência
          ({ESFERA_FONTES[esfera]}).
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {status === "pendencia" || status === "regular" ? (
          <StatusBadge status={status} />
        ) : (
          <Badge variant={statusBadgeVariant(status)}>{statusLabel(status)}</Badge>
        )}
        <EsferaBadge esfera={esfera} label={ESFERA_LABELS[esfera]} />
        <span className="text-xs text-muted-foreground">
          {ESFERA_FONTES[esfera]} · {bucket.qtdDocs} documento(s) · {bucket.qtd_debitos}{" "}
          lançamento(s)
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Original" value={formatBRL(bucket.totais.original)} />
        <Kpi label="Saldo" value={formatBRL(bucket.totais.saldo)} accent="text-cyan-800" />
        <Kpi label="Multa" value={formatBRL(bucket.totais.multa)} accent="text-amber-700" />
        <Kpi label="Juros" value={formatBRL(bucket.totais.juros)} accent="text-red-600" />
        <Kpi
          label="Consolidado"
          value={formatBRL(bucket.totais.consolidado)}
          accent="text-teal-700"
        />
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold">Lançamentos · {ESFERA_LABELS[esfera]}</h3>
        </div>

        {empresa.status === "regular" && debitos.length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">
            Nenhuma pendência detectada nesta esfera.
          </div>
        ) : debitos.length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">
            Valores não extraídos automaticamente. Baixe o PDF abaixo para conferência.
          </div>
        ) : (
          <>
            <div className="overflow-auto">
              <table className="w-full min-w-[1000px] border-collapse text-left text-sm">
                <thead className="border-b border-border bg-[#F7F9FC] text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                  {table.getHeaderGroups().map((headerGroup) => (
                    <tr key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <th
                          key={header.id}
                          className="cursor-pointer px-3 py-2 font-semibold"
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
                      className="border-b border-border/70 transition-colors hover:bg-slate-50"
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-3 py-2 align-top">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationBar
              pageIndex={table.getState().pagination.pageIndex}
              pageCount={table.getPageCount()}
              pageSize={table.getState().pagination.pageSize}
              totalRows={debitos.length}
              canPreviousPage={table.getCanPreviousPage()}
              canNextPage={table.getCanNextPage()}
              onPrevious={() => table.previousPage()}
              onNext={() => table.nextPage()}
              onPageSizeChange={(size) => table.setPageSize(size)}
            />
          </>
        )}

        <div className="border-t border-border">
          <div className="border-b border-border px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Arquivos · {ESFERA_LABELS[esfera]}
          </div>
          {deleteError ? (
            <p className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
              {deleteError}
            </p>
          ) : null}
          <ul>
            {arquivos.length === 0 ? (
              <li className="px-4 py-3 text-sm text-muted-foreground">
                Nenhum arquivo nesta esfera
              </li>
            ) : (
              arquivos.map((arquivo) => (
                <li
                  key={arquivo}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 py-3 last:border-b-0"
                >
                  <span className="text-sm">{arquivo}</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button asChild size="sm" variant="outline">
                      <a
                        href={`/api/pdf/${empresa.id}/${encodeURIComponent(arquivo)}?competencia=${encodeURIComponent(competencia)}`}
                        download={arquivo}
                      >
                        <Download />
                        Baixar PDF
                      </a>
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={deletingFile !== null}
                      onClick={() => excluirArquivo(arquivo)}
                    >
                      <Trash2 />
                      {deletingFile === arquivo ? "Excluindo…" : "Excluir"}
                    </Button>
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      </Card>
    </div>
  );
}

function Kpi({
  label,
  value,
  accent,
  icon: Icon,
}: {
  label: string;
  value: string;
  accent?: string;
  icon?: LucideIcon;
}) {
  return (
    <Card className="shadow-none">
      <CardContent className="pt-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            {label}
          </p>
          {Icon ? (
            <span className="flex size-7 items-center justify-center rounded-md bg-muted text-slate-600">
              <Icon className="size-3.5" aria-hidden />
            </span>
          ) : null}
        </div>
        <p className={`mt-1 tabular text-lg font-bold ${accent ?? "text-slate-900"}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function Empty({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function statusBadgeVariant(status: StatusEsfera) {
  if (status === "pendencia") return "danger" as const;
  if (status === "regular") return "success" as const;
  return "muted" as const;
}

function statusLabel(status: StatusEsfera) {
  if (status === "pendencia") return "Pendência";
  if (status === "regular") return "Regular";
  if (status === "sem_documento") return "Sem documento";
  return "Indeterminado";
}

function inferEsfera(arquivo: string): Esfera {
  const upper = arquivo.toUpperCase();
  if (upper.includes("ECAC")) return "federal";
  if (upper.includes("AGENCIANET")) return "estadual";
  if (
    upper.includes("MUNICIPAL") ||
    upper.includes("PREFEITURA") ||
    upper.includes("IPTU") ||
    upper.includes("ISSQN") ||
    upper.includes("CCM") ||
    upper.includes("NFSE")
  ) {
    return "municipal";
  }
  return "federal";
}

function compactBRL(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
  return String(Math.round(value));
}

const tooltipStyle = {
  borderRadius: 10,
  border: "1px solid #d7dee8",
  fontSize: 12,
  boxShadow: "0 8px 24px rgba(15,23,42,0.08)",
};
