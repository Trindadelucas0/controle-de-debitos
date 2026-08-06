"use client";

import Link from "next/link";
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
import {
  buildPortfolioAnalytics,
  buildTotaisGerais,
  ESFERA_COLORS,
  ESFERA_FONTES,
  ESFERA_LABELS,
} from "@/lib/analytics";
import { formatCompetencia } from "@/lib/competencia";
import { formatBRL } from "@/lib/format";
import type { Empresa, Esfera, TotaisGerais } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  empresas: Empresa[];
  totais: TotaisGerais;
  geradoEm: string;
  esfera?: Esfera | null;
  competencia?: string;
};

export function DashboardOverview({
  empresas,
  totais,
  geradoEm,
  esfera = null,
  competencia,
}: Props) {
  const analytics = buildPortfolioAnalytics(empresas, esfera);
  const kpis = esfera ? buildTotaisGerais(empresas, esfera) : totais;
  const tituloEsfera = esfera ? ESFERA_LABELS[esfera] : null;
  const fonteEsfera = esfera ? ESFERA_FONTES[esfera] : null;
  const competenciaLabel = competencia ? formatCompetencia(competencia) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Visão analítica
            {tituloEsfera ? ` · ${tituloEsfera}` : ""}
          </p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Relação de débitos
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {fonteEsfera
              ? `${fonteEsfera}${competenciaLabel ? ` · competência ${competenciaLabel}` : ""}`
              : competenciaLabel
                ? `Competência ${competenciaLabel} · decisões de cobrança e risco do portfólio`
                : "Decisões de cobrança e risco do portfólio"}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Gerado em {new Date(geradoEm).toLocaleString("pt-BR")}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Empresas"
          value={String(kpis.empresas)}
          hint={esfera ? `Com documento ${tituloEsfera?.toLowerCase()}` : "Total no mês"}
        />
        <KpiCard
          label="Com pendência"
          value={String(kpis.com_pendencia)}
          hint={esfera ? `Pendência na esfera ${tituloEsfera?.toLowerCase()}` : "Prioridade de ação"}
          accent="text-amber-700"
        />
        <KpiCard
          label="Regulares"
          value={String(kpis.regulares)}
          hint={esfera ? `Regulares nesta esfera` : "Sem cobrança imediata"}
          accent="text-emerald-700"
        />
        <KpiCard
          label="Saldo consolidado"
          value={formatBRL(kpis.consolidado)}
          hint={esfera ? `Exposição · ${tituloEsfera}` : "Exposição financeira"}
          accent="text-blue-700"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {(
          [
            ["federal", "ECAC · Receita Federal", "bg-blue-500"],
            ["estadual", "Agenci@Net · Estadual", "bg-teal-500"],
            ["municipal", "Prefeitura · Municipal", "bg-orange-500"],
          ] as const
        ).map(([key, label, color]) => {
          const value =
            key === "federal"
              ? (kpis.docs_federal ?? 0)
              : key === "estadual"
                ? (kpis.docs_estadual ?? 0)
                : (kpis.docs_municipal ?? 0);
          const dimmed = Boolean(esfera && esfera !== key);
          return (
            <MiniDoc
              key={key}
              label={label}
              value={dimmed ? 0 : value}
              color={color}
              dimmed={dimmed}
              active={esfera === key}
            />
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{esfera ? "Composição do saldo" : "Saldo por esfera"}</CardTitle>
            <CardDescription>
              {esfera
                ? `${fonteEsfera} · saldo, multa e juros`
                : "ECAC (Receita Federal) · Agenci@Net · Relatório da Prefeitura"}
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[260px]">
            {esfera ? (
              analytics.composicao.length === 0 ? (
                <EmptyChart message="Sem valores nesta esfera." />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={analytics.composicao}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={58}
                      outerRadius={90}
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
              )
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={analytics.porEsfera}
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
                    dataKey="label"
                    width={78}
                    tick={{ fontSize: 12, fill: "#334155" }}
                  />
                  <Tooltip
                    formatter={(value) => formatBRL(Number(value ?? 0))}
                    labelFormatter={(label) => String(label)}
                    contentStyle={tooltipStyle}
                  />
                  <Bar dataKey="consolidado" radius={[0, 6, 6, 0]} barSize={22}>
                    {analytics.porEsfera.map((entry) => (
                      <Cell key={entry.esfera} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
            {esfera && analytics.composicao.length > 0 && (
              <div className="mt-1 flex justify-center gap-4 text-xs">
                {analytics.composicao.map((item) => (
                  <div key={item.name} className="flex items-center gap-1.5">
                    <span
                      className="inline-block size-2.5 rounded-full"
                      style={{ background: item.fill }}
                    />
                    {item.name}: {formatBRL(item.value)}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Risco do portfólio</CardTitle>
            <CardDescription>
              {esfera
                ? `Pendência vs regular · ${tituloEsfera}`
                : "Pendência vs regular (qtd. de empresas)"}
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={analytics.statusDonut}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={58}
                  outerRadius={90}
                  paddingAngle={3}
                >
                  {analytics.statusDonut.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value, _name, item) => {
                    const payload = item?.payload as {
                      saldo?: number;
                      consolidado?: number;
                    };
                    return [
                      `${value} empresas · consolidado ${formatBRL(payload?.consolidado ?? 0)}`,
                      "Quantidade",
                    ];
                  }}
                  contentStyle={tooltipStyle}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-1 flex justify-center gap-4 text-xs">
              {analytics.statusDonut.map((item) => (
                <div key={item.name} className="flex items-center gap-1.5">
                  <span
                    className="inline-block size-2.5 rounded-full"
                    style={{ background: item.fill }}
                  />
                  {item.name}: {item.value}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top 10 cobrança</CardTitle>
            <CardDescription>
              {esfera
                ? `Maiores saldos · ${tituloEsfera}`
                : "Maiores saldos consolidados — clique para abrir"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {analytics.topEmpresas.length === 0 ? (
              <div className="flex h-[280px] items-center justify-center">
                <EmptyChart />
              </div>
            ) : (
              <TopCobrancaList
                items={analytics.topEmpresas}
                accent={esfera ? ESFERA_COLORS[esfera] : undefined}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tipos de pendência</CardTitle>
            <CardDescription>
              {esfera
                ? `Natureza recorrente · ${fonteEsfera}`
                : "Natureza mais recorrente no portfólio"}
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            {analytics.porTipo.length === 0 ? (
              <EmptyChart message="Sem tipagem agregada nesta competência." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={analytics.porTipo}
                  margin={{ left: 0, right: 8, top: 8, bottom: 48 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="tipo"
                    interval={0}
                    angle={-28}
                    textAnchor="end"
                    tick={{ fontSize: 10, fill: "#64748b" }}
                    height={60}
                  />
                  <YAxis tick={{ fontSize: 11, fill: "#64748b" }} allowDecimals={false} />
                  <Tooltip
                    formatter={(value, name) =>
                      name === "consolidado"
                        ? formatBRL(Number(value ?? 0))
                        : String(value ?? 0)
                    }
                    labelFormatter={(_, payload) =>
                      String(payload?.[0]?.payload?.tipoCompleto ?? "")
                    }
                    contentStyle={tooltipStyle}
                  />
                  <Bar
                    dataKey="count"
                    fill={esfera ? ESFERA_COLORS[esfera] : "#2563eb"}
                    radius={[6, 6, 0, 0]}
                    name="empresas"
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint: string;
  accent?: string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </p>
        <p className={`mt-2 tabular text-2xl font-bold ${accent ?? "text-slate-900"}`}>{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function MiniDoc({
  label,
  value,
  color,
  dimmed,
  active,
}: {
  label: string;
  value: number;
  color: string;
  dimmed?: boolean;
  active?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm transition-opacity ${
        active ? "border-slate-400 ring-1 ring-slate-300/60" : "border-border/80"
      } ${dimmed ? "opacity-40" : ""}`}
    >
      <span className={`size-2.5 rounded-full ${color}`} />
      <div>
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="tabular text-lg font-bold">{value}</p>
      </div>
    </div>
  );
}

function TopCobrancaList({
  items,
  accent,
}: {
  items: {
    id: string;
    nome: string;
    nomeCompleto: string;
    consolidado: number;
  }[];
  accent?: string;
}) {
  const max = Math.max(...items.map((item) => item.consolidado), 1);
  const barColor = accent ?? "#0f766e";

  return (
    <ol className="space-y-2.5">
      {items.map((item, index) => {
        const pct = Math.max((item.consolidado / max) * 100, 2);
        return (
          <li key={item.id}>
            <Link
              href={`/empresas/${item.id}`}
              className="group grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1 rounded-lg px-1.5 py-1 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600/40"
              title={item.nomeCompleto}
            >
              <span className="text-center text-[11px] font-semibold tabular text-slate-400">
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-slate-800 group-hover:text-teal-800">
                  {item.nomeCompleto}
                </p>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full transition-[width] duration-300"
                    style={{ width: `${pct}%`, background: barColor }}
                  />
                </div>
              </div>
              <span className="shrink-0 tabular text-xs font-semibold text-slate-700">
                {formatBRL(item.consolidado)}
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

function EmptyChart({ message = "Sem dados para exibir." }: { message?: string }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      {message}
    </div>
  );
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
