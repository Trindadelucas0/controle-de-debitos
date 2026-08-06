import { formatBRL } from "@/lib/format";
import { formatCompetencia } from "@/lib/competencia";
import type { Empresa, Esfera } from "@/lib/types";
import { ESFERA_LABELS } from "@/lib/analytics";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const ESFERAS: Esfera[] = ["federal", "estadual", "municipal"];

type Props = {
  base: Empresa;
  baseCompetencia: string;
  other: Empresa | null;
  otherCompetencia: string;
};

function delta(a: number, b: number) {
  return a - b;
}

function DeltaValue({ value }: { value: number }) {
  const positive = value > 0;
  const negative = value < 0;
  const cls = positive ? "text-amber-700" : negative ? "text-emerald-700" : "text-muted-foreground";
  const prefix = positive ? "+" : "";
  return (
    <span className={`tabular text-sm font-semibold ${cls}`}>
      {prefix}
      {formatBRL(value)}
    </span>
  );
}

export function CompetenciaComparacao({
  base,
  baseCompetencia,
  other,
  otherCompetencia,
}: Props) {
  if (!other) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Comparação</CardTitle>
          <CardDescription>
            Empresa não encontrada na competência {formatCompetencia(otherCompetencia)}.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const rows = [
    {
      label: "Saldo",
      base: base.totais.saldo,
      other: other.totais.saldo,
    },
    {
      label: "Consolidado",
      base: base.totais.consolidado,
      other: other.totais.consolidado,
    },
    {
      label: "Original",
      base: base.totais.original,
      other: other.totais.original,
    },
    {
      label: "Multa",
      base: base.totais.multa,
      other: other.totais.multa,
    },
    {
      label: "Juros",
      base: base.totais.juros,
      other: other.totais.juros,
    },
    {
      label: "Lançamentos",
      base: base.qtd_debitos,
      other: other.qtd_debitos,
      money: false,
    },
  ] as const;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Comparação de competências</CardTitle>
        <CardDescription>
          {formatCompetencia(baseCompetencia)} (atual) vs {formatCompetencia(otherCompetencia)}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Indicador</th>
                <th className="px-3 py-2 font-medium">{formatCompetencia(baseCompetencia)}</th>
                <th className="px-3 py-2 font-medium">{formatCompetencia(otherCompetencia)}</th>
                <th className="px-3 py-2 font-medium">Diferença</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const money = !("money" in row && row.money === false);
                const d = delta(row.base, row.other);
                return (
                  <tr key={row.label} className="border-t">
                    <td className="px-3 py-2 font-medium">{row.label}</td>
                    <td className="px-3 py-2 tabular">
                      {money ? formatBRL(row.base) : row.base}
                    </td>
                    <td className="px-3 py-2 tabular">
                      {money ? formatBRL(row.other) : row.other}
                    </td>
                    <td className="px-3 py-2">
                      {money ? (
                        <DeltaValue value={d} />
                      ) : (
                        <span className="tabular text-sm font-semibold">
                          {d > 0 ? `+${d}` : d}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          {ESFERAS.map((esfera) => {
            const b = base.esferas?.[esfera]?.totais.consolidado ?? 0;
            const o = other.esferas?.[esfera]?.totais.consolidado ?? 0;
            return (
              <div key={esfera} className="rounded-md border bg-muted/20 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {ESFERA_LABELS[esfera]}
                </p>
                <p className="mt-1 tabular text-sm">{formatBRL(b)}</p>
                <p className="tabular text-xs text-muted-foreground">
                  vs {formatBRL(o)}
                </p>
                <div className="mt-1">
                  <DeltaValue value={delta(b, o)} />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
