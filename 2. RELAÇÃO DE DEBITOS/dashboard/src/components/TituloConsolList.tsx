"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { TituloSlice } from "@/lib/analytics";
import { formatItensETotal } from "@/lib/format";

export function TituloConsolList({
  items,
}: {
  items: TituloSlice[];
}) {
  const max = Math.max(...items.map((item) => item.consolidado), 1);

  return (
    <ul className="space-y-2.5">
      {items.map((item) => {
        const pct = Math.max((item.consolidado / max) * 100, 2);
        return (
          <li
            key={item.titulo || item.label}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1"
          >
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-slate-800" title={item.label}>
                {item.label}
              </p>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${pct}%`, background: item.fill }}
                />
              </div>
            </div>
            <span className="shrink-0 tabular text-xs font-medium text-slate-600">
              {formatItensETotal(item.qtd, item.consolidado)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

const tooltipStyle = {
  borderRadius: 10,
  border: "1px solid #d7dee8",
  fontSize: 12,
  boxShadow: "0 8px 24px rgba(15,23,42,0.08)",
};

export function TituloConsolChart({
  items,
  pieHeight = 180,
}: {
  items: TituloSlice[];
  pieHeight?: number;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div style={{ height: pieHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={items}
              dataKey="consolidado"
              nameKey="label"
              innerRadius={48}
              outerRadius={74}
              paddingAngle={3}
            >
              {items.map((entry) => (
                <Cell key={entry.titulo || entry.label} fill={entry.fill} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value, _name, item) => {
                const qtd = Number((item?.payload as { qtd?: number })?.qtd ?? 0);
                return [formatItensETotal(qtd, Number(value ?? 0)), "Sdo. consol."];
              }}
              contentStyle={tooltipStyle}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <TituloConsolList items={items} />
    </div>
  );
}
