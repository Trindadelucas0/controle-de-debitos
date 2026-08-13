"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Download,
  ExternalLink,
  FileText,
  Landmark,
  MapPin,
  Trash2,
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
import { BlockingOverlay } from "@/components/BlockingOverlay";
import { CompetenciaComparacao } from "@/components/CompetenciaComparacao";
import { CompetenciaControls } from "@/components/CompetenciaControls";
import { PageHeader } from "@/components/PageHeader";
import { BaixarRelatorioButton } from "@/components/relatorio/BaixarRelatorioButton";
import { EsferaBadge, StatusBadge } from "@/components/StatusBadges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  aggregatePorTitulo,
  buildEmpresaAnalytics,
  groupDebitosByTitulo,
  ESFERA_FONTES,
  ESFERA_LABELS,
} from "@/lib/analytics";
import { formatCompetencia } from "@/lib/competencia";
import { formatBRL, formatCnpj, isOmissaoDebito } from "@/lib/format";
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
          actions={
            <>
              {empresa.arquivos.slice(0, 3).map((arquivo) => (
                <Button key={arquivo} asChild size="sm" variant="outline">
                  <a
                    href={pdfHref(empresa.id, arquivo, competencia)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink />
                    Abrir PDF
                  </a>
                </Button>
              ))}
              <BaixarRelatorioButton empresa={empresa} competencia={competencia} />
              <StatusBadge status={empresa.status} />
            </>
          }
        />

        <CompetenciaControls
          competencias={competencias}
          competencia={competencia}
          comparar={compararCompetencia}
          allowCompare
          hideCompetencia
        />

        {visibleAvisos(empresa.avisos).length > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <ul className="list-disc space-y-1 pl-4">
              {visibleAvisos(empresa.avisos).map((aviso) => (
                <li key={aviso}>{aviso}</li>
              ))}
            </ul>
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

      {analytics.composicao.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
            <span className="flex size-10 items-center justify-center rounded-md bg-muted text-slate-600">
              <FileText className="size-5" aria-hidden />
            </span>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-900">Ainda sem valores extraídos</p>
              <p className="text-sm text-muted-foreground">
                Abra o PDF para conferir o diagnóstico. Se os valores existirem no arquivo, eles
                devem aparecer aqui após a extração.
              </p>
            </div>
            {empresa.arquivos.length > 0 ? (
              <div className="flex flex-wrap justify-center gap-2">
                {empresa.arquivos.map((arquivo) => (
                  <Button key={arquivo} asChild size="sm">
                    <a
                      href={pdfHref(empresa.id, arquivo, competencia)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink />
                      Abrir {arquivo}
                    </a>
                  </Button>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <div
          className={`grid gap-4 ${
            analytics.porTitulo.length > 1 ? "lg:grid-cols-3" : "lg:grid-cols-2"
          }`}
        >
          <Card>
            <CardHeader>
              <CardTitle>Composição do valor</CardTitle>
              <CardDescription>Saldo, multa e juros desta empresa</CardDescription>
            </CardHeader>
            <CardContent className="h-[240px]">
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

          {analytics.porTitulo.length > 1 ? (
            <Card>
              <CardHeader>
                <CardTitle>Sdo. consol. por título</CardTitle>
                <CardDescription>Seções do diagnóstico fiscal</CardDescription>
              </CardHeader>
              <CardContent className="flex h-[240px] flex-col gap-2">
                <div className="min-h-0 flex-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={analytics.porTitulo}
                        dataKey="consolidado"
                        nameKey="label"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={3}
                      >
                        {analytics.porTitulo.map((entry) => (
                          <Cell key={entry.titulo || entry.label} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value, _name, item) => {
                          const qtd = Number((item?.payload as { qtd?: number })?.qtd ?? 0);
                          return [
                            `${formatBRL(Number(value ?? 0))} · ${qtd} lançamento${qtd === 1 ? "" : "s"}`,
                            "Sdo. consol.",
                          ];
                        }}
                        contentStyle={tooltipStyle}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex shrink-0 flex-wrap justify-center gap-x-3 gap-y-1 pb-1 text-[11px] text-slate-700">
                  {analytics.porTitulo.map((item) => (
                    <div key={item.titulo || item.label} className="flex items-center gap-1.5">
                      <span
                        className="inline-block size-2.5 shrink-0 rounded-full"
                        style={{ background: item.fill }}
                      />
                      {item.labelCurto}: {formatBRL(item.consolidado)}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}

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

  const grupos = useMemo(() => groupDebitosByTitulo(debitos), [debitos]);
  const porTitulo = useMemo(() => aggregatePorTitulo(debitos), [debitos]);
  const agruparPorTitulo =
    esfera === "federal" && (grupos.length > 1 || grupos.some((grupo) => Boolean(grupo.titulo)));
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

  if (!bucket || bucket.qtdDocs === 0) {
    const arquivosOrfaos = empresa.arquivos.filter((arquivo) => inferEsfera(arquivo) === esfera);
    return (
      <Card>
        <CardContent className="space-y-3 py-8 text-center">
          <p className="text-sm font-medium text-slate-800">
            Ainda não há documento {ESFERA_LABELS[esfera].toLowerCase()} nesta competência
          </p>
          <p className="text-xs text-muted-foreground">Fonte: {ESFERA_FONTES[esfera]}</p>
          {arquivosOrfaos.length > 0 ? (
            <div className="flex flex-wrap justify-center gap-2 pt-1">
              {arquivosOrfaos.map((arquivo) => (
                <Button key={arquivo} asChild size="sm" variant="outline">
                  <a
                    href={pdfHref(empresa.id, arquivo, competencia)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink />
                    Abrir {arquivo}
                  </a>
                </Button>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <BlockingOverlay
        open={Boolean(deletingFile)}
        title="Excluindo PDF…"
        description={
          deletingFile
            ? `Aguarde enquanto "${deletingFile}" é removido. Não feche nem clique em outra ação.`
            : undefined
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        {status === "pendencia" || status === "regular" ? (
          <StatusBadge status={status} />
        ) : (
          <Badge variant={statusBadgeVariant(status)}>{statusLabel(status)}</Badge>
        )}
        <EsferaBadge esfera={esfera} label={ESFERA_LABELS[esfera]} />
      </div>

      {agruparPorTitulo && porTitulo.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Sdo. consol. por título</CardTitle>
            <CardDescription>Lançamentos · {ESFERA_LABELS[esfera]}</CardDescription>
          </CardHeader>
          <CardContent className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={porTitulo}
                layout="vertical"
                margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                <XAxis
                  type="number"
                  tickFormatter={(v) => compactBRL(Number(v))}
                  tick={{ fontSize: 11, fill: "#64748b" }}
                />
                <YAxis
                  type="category"
                  dataKey="labelCurto"
                  width={148}
                  tick={{ fontSize: 11, fill: "#334155" }}
                />
                <Tooltip
                  formatter={(value, _name, item) => {
                    const qtd = Number((item?.payload as { qtd?: number })?.qtd ?? 0);
                    return [
                      `${formatBRL(Number(value ?? 0))} · ${qtd} lançamento${qtd === 1 ? "" : "s"}`,
                      "Sdo. consol.",
                    ];
                  }}
                  labelFormatter={(_, payload) =>
                    String(payload?.[0]?.payload?.label ?? "")
                  }
                  contentStyle={tooltipStyle}
                />
                <Bar dataKey="consolidado" radius={[0, 6, 6, 0]} barSize={18}>
                  {porTitulo.map((entry) => (
                    <Cell key={entry.titulo || entry.label} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      ) : null}

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
        ) : agruparPorTitulo ? (
          <div className="divide-y divide-border">
            {grupos.map((grupo) => (
              <DebitosTableBlock
                key={grupo.titulo || "__sem_titulo__"}
                debitos={grupo.debitos}
                codigoEmpresa={empresa.codigo}
                heading={grupo.label}
                subtotal={grupo.consolidado}
              />
            ))}
          </div>
        ) : (
          <DebitosTableBlock debitos={debitos} codigoEmpresa={empresa.codigo} />
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
                    <Button asChild size="sm">
                      <a
                        href={pdfHref(empresa.id, arquivo, competencia)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink />
                        Abrir PDF
                      </a>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <a
                        href={pdfHref(empresa.id, arquivo, competencia, true)}
                        download={arquivo}
                      >
                        <Download />
                        Baixar
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

function DebitosTableBlock({
  debitos,
  codigoEmpresa,
  heading,
  subtotal,
}: {
  debitos: DebitoLinha[];
  codigoEmpresa?: string;
  heading?: string;
  subtotal?: number;
}) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "consolidado", desc: true }]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 25,
  });

  const columns = useMemo(
    () => [
      columnHelper.accessor((row) => row.codigo || codigoEmpresa || "", {
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
        cell: (info) => {
          const row = info.row.original;
          if (isOmissaoDebito(row) || !info.getValue()) return <span>—</span>;
          return <span className="tabular">{info.getValue()}</span>;
        },
      }),
      columnHelper.accessor("original", {
        header: "Vl. original",
        cell: (info) => (
          <span className="tabular">
            {isOmissaoDebito(info.row.original) ? "—" : formatBRL(info.getValue())}
          </span>
        ),
      }),
      columnHelper.accessor("saldo", {
        header: "Sdo. devedor",
        cell: (info) => (
          <span className="tabular font-semibold text-cyan-800">
            {isOmissaoDebito(info.row.original) ? "—" : formatBRL(info.getValue())}
          </span>
        ),
      }),
      columnHelper.accessor("multa", {
        header: "Multa",
        cell: (info) => (
          <span className="tabular">
            {isOmissaoDebito(info.row.original) ? "—" : formatBRL(info.getValue())}
          </span>
        ),
      }),
      columnHelper.accessor("juros", {
        header: "Juros",
        cell: (info) => (
          <span className="tabular">
            {isOmissaoDebito(info.row.original) ? "—" : formatBRL(info.getValue())}
          </span>
        ),
      }),
      columnHelper.accessor("consolidado", {
        header: "Sdo. consol.",
        cell: (info) => (
          <span className="tabular font-semibold text-teal-700">
            {isOmissaoDebito(info.row.original) ? "—" : formatBRL(info.getValue())}
          </span>
        ),
      }),
      columnHelper.accessor("situacao", {
        header: "Situação",
        cell: (info) => (
          <span className="text-[10px] font-bold uppercase tracking-[0.08em]">{info.getValue()}</span>
        ),
      }),
    ],
    [codigoEmpresa],
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

  return (
    <div>
      {heading ? (
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border bg-slate-50 px-4 py-2.5">
          <h4 className="text-sm font-semibold text-slate-800">{heading}</h4>
          <p className="text-xs text-muted-foreground">
            {debitos.length} {debitos.length === 1 ? "item" : "itens"}
            {subtotal && subtotal > 0 ? ` · ${formatBRL(subtotal)}` : null}
          </p>
        </div>
      ) : null}
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
      {debitos.length > pagination.pageSize || table.getPageCount() > 1 ? (
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
      ) : null}
    </div>
  );
}

function pdfHref(
  empresaId: string,
  arquivo: string,
  competencia: string,
  download = false,
) {
  const params = new URLSearchParams({ competencia });
  if (download) params.set("download", "1");
  return `/api/pdf/${empresaId}/${encodeURIComponent(arquivo)}?${params.toString()}`;
}

function visibleAvisos(avisos: string[]) {
  return avisos
    .map(humanizeAviso)
    .filter((item): item is string => Boolean(item));
}

function humanizeAviso(aviso: string): string | null {
  if (/OCR indisponível|OCR sem texto/i.test(aviso)) return null;
  if (/ECAC filial ignorado/i.test(aviso)) {
    return "Há um ECAC de filial. Os totais usam só a matriz (/0001). O PDF da filial continua disponível para abrir.";
  }
  if (/falta ECAC da matriz/i.test(aviso)) {
    return "Falta o ECAC da matriz (/0001).";
  }
  if (/valores não extraídos/i.test(aviso)) {
    return "Não foi possível ler os valores automaticamente. Abra o PDF para conferir.";
  }
  if (/sem texto em /i.test(aviso)) {
    return "O PDF veio sem texto legível. Abra o arquivo para conferir.";
  }
  return aviso;
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
