"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { TituloSlice } from "@/lib/analytics";
import { formatBRL, formatItensETotal } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const tooltipStyle = {
  borderRadius: 10,
  border: "1px solid #d7dee8",
  fontSize: 12,
  boxShadow: "0 8px 24px rgba(15,23,42,0.08)",
};

export function TituloConsolChart({
  items,
  pieHeight = 160,
}: {
  items: TituloSlice[];
  pieHeight?: number;
}) {
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
        <TituloChartCard key={item.titulo || item.label} item={item} pieHeight={pieHeight} />
      ))}
    </div>
  );
}

function TituloChartCard({
  item,
  pieHeight,
}: {
  item: TituloSlice;
  pieHeight: number;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-start gap-2 leading-snug">
          <span
            className="mt-1 inline-block size-2.5 shrink-0 rounded-full"
            style={{ background: item.fill }}
            aria-hidden
          />
          <span>{item.label}</span>
        </CardTitle>
        <CardDescription>{formatItensETotal(item.qtd, item.consolidado)}</CardDescription>
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
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Sem valores monetários neste título.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
