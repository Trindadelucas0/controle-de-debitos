"use client";

import Link from "next/link";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { TituloSlice } from "@/lib/analytics";
import { formatBRL, formatTituloResumo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const tooltipStyle = {
  borderRadius: 10,
  border: "1px solid #d7dee8",
  fontSize: 12,
  boxShadow: "0 8px 24px rgba(15,23,42,0.08)",
};

type Props = {
  items: TituloSlice[];
  pieHeight?: number;
  /** Título ativo na URL (?titulo=). */
  activeTitulo?: string | null;
  /** Clique no card filtra a tabela de empresas. */
  onTituloClick?: (titulo: string) => void;
  competencia?: string;
};

export function TituloConsolChart({
  items,
  pieHeight = 160,
  activeTitulo = null,
  onTituloClick,
  competencia,
}: Props) {
  if (items.length === 0) return null;

  const cols =
    items.length === 1
      ? "grid-cols-1"
      : items.length === 2
        ? "grid-cols-1 sm:grid-cols-2"
        : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3";

  return (
    <div className={`grid gap-4 ${cols}`}>
      {items.map((item) => (
        <TituloChartCard
          key={item.titulo || item.label}
          item={item}
          pieHeight={pieHeight}
          active={Boolean(activeTitulo && activeTitulo === item.titulo)}
          onClick={onTituloClick ? () => onTituloClick(item.titulo) : undefined}
          competencia={competencia}
        />
      ))}
    </div>
  );
}

function TituloChartCard({
  item,
  pieHeight,
  active,
  onClick,
  competencia,
}: {
  item: TituloSlice;
  pieHeight: number;
  active?: boolean;
  onClick?: () => void;
  competencia?: string;
}) {
  const clickable = Boolean(onClick);
  const qtdEmpresas = item.qtdEmpresas || item.empresas.length;

  return (
    <Card
      className={cn(
        "transition-colors",
        clickable && "cursor-pointer hover:border-slate-400 hover:shadow-sm",
        active && "border-cyan-600 ring-2 ring-cyan-600/30",
      )}
      onClick={onClick}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
    >
      <CardHeader>
        <CardTitle className="flex items-start gap-2 leading-snug">
          <span
            className="mt-1 inline-block size-2.5 shrink-0 rounded-full"
            style={{ background: item.fill }}
            aria-hidden
          />
          <span>{item.label}</span>
        </CardTitle>
        <CardDescription>
          {formatTituloResumo(qtdEmpresas, item.qtd, item.consolidado)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {item.composicao.length > 0 ? (
          <div className="flex flex-col gap-2">
            <div style={{ height: pieHeight }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={item.composicao}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={42}
                    outerRadius={68}
                    paddingAngle={3}
                  >
                    {item.composicao.map((slice) => (
                      <Cell key={slice.name} fill={slice.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => formatBRL(Number(value ?? 0))}
                    contentStyle={tooltipStyle}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-slate-700">
              {item.composicao.map((slice) => (
                <li key={slice.name} className="flex items-center gap-1.5">
                  <span
                    className="inline-block size-2.5 shrink-0 rounded-full"
                    style={{ background: slice.fill }}
                    aria-hidden
                  />
                  {slice.name}: {formatBRL(slice.value)}
                </li>
              ))}
            </ul>
          </div>
        ) : item.empresas.length > 0 ? (
          <ul className="space-y-1.5 py-2">
            {item.empresas.map((empresa) => {
              const href = competencia
                ? `/empresas/${empresa.id}?competencia=${encodeURIComponent(competencia)}`
                : `/empresas/${empresa.id}`;
              return (
                <li key={empresa.id}>
                  <Link
                    href={href}
                    className="block truncate text-sm text-slate-800 underline-offset-2 hover:text-cyan-800 hover:underline"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {empresa.nome}
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Sem valores monetários neste título.
          </p>
        )}
        {clickable ? (
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            {active ? "Filtro ativo — clique para remover" : "Clique para filtrar empresas"}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
