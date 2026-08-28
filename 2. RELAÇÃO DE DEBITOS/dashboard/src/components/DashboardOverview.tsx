"use client";

import Link from "next/link";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  FileText,
  Landmark,
  MapPin,
  type LucideIcon,
} from "lucide-react";
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
import { formatBRL } from "@/lib/format";
import type { Empresa, Esfera, TotaisGerais } from "@/lib/types";
import { TituloConsolChart } from "@/components/TituloConsolList";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  empresas: Empresa[];
  totais: TotaisGerais;
  esfera?: Esfera | null;
  competencia?: string;
  activeTitulo?: string | null;
  onTituloClick?: (titulo: string) => void;
};

export function DashboardOverview({
  empresas,
  totais,
  esfera = null,
  competencia,
  activeTitulo = null,
  onTituloClick,
}: Props) {
  const analytics = buildPortfolioAnalytics(empresas, esfera);
  const kpis = esfera ? buildTotaisGerais(empresas, esfera) : totais;
  const tituloEsfera = esfera ? ESFERA_LABELS[esfera] : null;
  const fonteEsfera = esfera ? ESFERA_FONTES[esfera] : null;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard
          icon={Building2}
          label="Empresas"
          value={String(kpis.empresas)}
          hint={esfera ? `Com documento ${tituloEsfera?.toLowerCase()}` : "Total no mês"}
          iconTone="bg-slate-100 text-slate-700"
        />
        <KpiCard
          icon={AlertTriangle}
          label="Com pendência"
          value={String(kpis.com_pendencia)}
          hint={esfera ? `Pendência na esfera ${tituloEsfera?.toLowerCase()}` : "Prioridade de ação"}
          accent="text-amber-700"
          iconTone="bg-amber-100 text-amber-700"
        />
        <KpiCard
          icon={CheckCircle2}
          label="Regulares"
          value={String(kpis.regulares)}
          hint={esfera ? `Regulares nesta esfera` : "Sem cobrança imediata"}
          accent="text-emerald-700"
          iconTone="bg-emerald-100 text-emerald-700"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {(
          [
            ["federal", "ECAC · Receita Federal", "bg-blue-500", "border-blue-300", "border-blue-500 ring-1 ring-blue-400/40", Landmark],
            ["estadual", "Agenci@Net · Estadual", "bg-teal-500", "border-teal-300", "border-teal-500 ring-1 ring-teal-400/40", Building2],
            ["municipal", "Prefeitura · Municipal", "bg-orange-500", "border-orange-300", "border-orange-500 ring-1 ring-orange-400/40", MapPin],
          ] as const
        ).map(([key, label, color, border, borderActive, Icon]) => {
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
              icon={Icon}
              label={label}
              value={dimmed ? 0 : value}
              color={color}
              borderClass={border}
              borderActiveClass={borderActive}
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
          <CardContent className="flex h-[300px] flex-col gap-2">
            <div className="min-h-0 flex-1">
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
                        innerRadius={52}
                        outerRadius={82}
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
            </div>
            {esfera && analytics.composicao.length > 0 && (
              <div className="flex shrink-0 flex-wrap justify-center gap-x-4 gap-y-1 pb-1 text-xs text-slate-700">
                {analytics.composicao.map((item) => (
                  <div key={item.name} className="flex items-center gap-1.5">
                    <span
                      className="inline-block size-2.5 shrink-0 rounded-full"
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
          <CardContent className="flex h-[300px] flex-col gap-2">
            <div className="min-h-0 flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={analytics.statusDonut}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={52}
                    outerRadius={82}
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
                      };
                      return [
                        `${value} empresas · ${formatBRL(payload?.saldo ?? 0)}`,
                        "Quantidade",
                      ];
                    }}
                    contentStyle={tooltipStyle}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex shrink-0 flex-wrap justify-center gap-x-4 gap-y-1 pb-1 text-xs text-slate-700">
              {analytics.statusDonut.map((item) => (
                <div key={item.name} className="flex items-center gap-1.5">
                  <span
                    className="inline-block size-2.5 shrink-0 rounded-full"
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
                : "Maiores saldos — clique para abrir"}
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

      </div>

      {analytics.porTitulo.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Por título</CardTitle>
            <CardDescription>
              {esfera
                ? `Mesmos títulos do relatório · ${fonteEsfera}`
                : "Títulos do diagnóstico e total de cada seção"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex h-[180px] items-center justify-center">
              <EmptyChart message="Sem títulos do diagnóstico nesta competência." />
            </div>
          </CardContent>
        </Card>
      ) : (
        <TituloConsolChart
          items={analytics.porTitulo}
          activeTitulo={activeTitulo}
          onTituloClick={onTituloClick}
          competencia={competencia}
        />
      )}
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  accent,
  iconTone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
  accent?: string;
  iconTone?: string;
}) {
  return (
    <Card className="overflow-hidden shadow-none">
      <CardContent className="pt-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {label}
          </p>
          <span
            className={`flex size-8 shrink-0 items-center justify-center rounded-md ${iconTone ?? "bg-muted text-slate-600"}`}
          >
            <Icon className="size-4" aria-hidden />
          </span>
        </div>
        <p className={`mt-2 tabular text-2xl font-bold ${accent ?? "text-slate-900"}`}>{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function MiniDoc({
  icon: Icon,
  label,
  value,
  color,
  borderClass,
  borderActiveClass,
  dimmed,
  active,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  color: string;
  borderClass: string;
  borderActiveClass: string;
  dimmed?: boolean;
  active?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-lg border-2 bg-card px-4 py-3 transition-opacity ${
        active ? borderActiveClass : borderClass
      } ${dimmed ? "opacity-40" : ""}`}
    >
      <span className={`flex size-8 items-center justify-center rounded-md text-white ${color}`}>
        <Icon className="size-4" aria-hidden />
      </span>
      <div>
        <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
          <FileText className="size-3 opacity-60" aria-hidden />
          {label}
        </p>
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
  const barColor = accent ?? "#0891b2";

  return (
    <ol className="space-y-2.5">
      {items.map((item, index) => {
        const pct = Math.max((item.consolidado / max) * 100, 2);
        return (
          <li key={item.id}>
            <Link
              href={`/empresas/${item.id}`}
              className="group grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1 rounded-md px-1.5 py-1 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600/40"
              title={item.nomeCompleto}
            >
              <span className="text-center text-[11px] font-semibold tabular text-slate-400">
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-slate-800 group-hover:text-cyan-800">
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
