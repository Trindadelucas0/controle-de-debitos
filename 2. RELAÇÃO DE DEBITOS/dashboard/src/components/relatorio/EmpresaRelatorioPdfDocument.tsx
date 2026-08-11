import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Svg,
  Rect,
  Path,
  G,
  Circle,
} from "@react-pdf/renderer";
import {
  buildEmpresaAnalytics,
  buildEsferaComposicao,
  debitosDaEsfera,
  ESFERA_COLORS,
  ESFERA_FONTES,
  ESFERA_LABELS,
  type ComposicaoSlice,
} from "@/lib/analytics";
import { formatCompetencia } from "@/lib/competencia";
import { formatBRL, formatCnpj } from "@/lib/format";
import type { DebitoLinha, Empresa, Esfera, StatusEsfera, Totais } from "@/lib/types";

const ESFERAS: Esfera[] = ["federal", "estadual", "municipal"];

type Props = {
  empresa: Empresa;
  competencia: string;
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 42,
    paddingHorizontal: 36,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: "#0f172a",
  },
  header: {
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  title: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 9,
    color: "#64748b",
    marginBottom: 2,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    marginBottom: 8,
    marginTop: 14,
    color: "#0f172a",
  },
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  kpiCard: {
    width: "18.5%",
    padding: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 4,
    backgroundColor: "#f8fafc",
  },
  kpiLabel: {
    fontSize: 7,
    color: "#64748b",
    marginBottom: 3,
    textTransform: "uppercase",
  },
  kpiValue: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
  },
  chartsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4,
  },
  chartCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 4,
    padding: 10,
  },
  chartTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
  },
  chartDesc: {
    fontSize: 7,
    color: "#64748b",
    marginBottom: 8,
  },
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  legendSwatch: {
    width: 8,
    height: 8,
    borderRadius: 2,
  },
  legendText: {
    fontSize: 7,
    color: "#475569",
  },
  emptyChart: {
    fontSize: 8,
    color: "#94a3b8",
    marginTop: 24,
    textAlign: "center",
  },
  esferaBlock: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  esferaHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  esferaTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
  },
  esferaMeta: {
    fontSize: 8,
    color: "#64748b",
    marginTop: 2,
  },
  semDoc: {
    padding: 10,
    backgroundColor: "#f1f5f9",
    borderRadius: 4,
    fontSize: 8,
    color: "#64748b",
  },
  table: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 3,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    paddingVertical: 5,
    paddingHorizontal: 4,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  th: {
    fontSize: 6.5,
    fontFamily: "Helvetica-Bold",
    color: "#475569",
  },
  td: {
    fontSize: 6.5,
    color: "#0f172a",
  },
  tdRight: {
    fontSize: 6.5,
    textAlign: "right",
  },
  footer: {
    position: "absolute",
    bottom: 18,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: "#94a3b8",
  },
});

const COL = {
  codigo: "7%",
  lanc: "10%",
  receita: "22%",
  pa: "9%",
  venc: "10%",
  original: "10%",
  saldo: "10%",
  multa: "7%",
  juros: "7%",
  consol: "8%",
} as const;

function statusLabel(status: StatusEsfera | "pendencia" | "regular") {
  if (status === "pendencia") return "Pendência";
  if (status === "regular") return "Regular";
  if (status === "sem_documento") return "Sem documento";
  return "Indeterminado";
}

function statusColors(status: StatusEsfera | "pendencia" | "regular") {
  if (status === "pendencia") return { bg: "#fef3c7", fg: "#92400e" };
  if (status === "regular") return { bg: "#d1fae5", fg: "#065f46" };
  return { bg: "#e2e8f0", fg: "#475569" };
}

function StatusBadge({ status }: { status: StatusEsfera | "pendencia" | "regular" }) {
  const colors = statusColors(status);
  return (
    <Text style={[styles.badge, { backgroundColor: colors.bg, color: colors.fg }]}>
      {statusLabel(status)}
    </Text>
  );
}

function KpiCards({ totais }: { totais: Totais }) {
  const items = [
    { label: "Original", value: totais.original },
    { label: "Saldo", value: totais.saldo },
    { label: "Multa", value: totais.multa },
    { label: "Juros", value: totais.juros },
    { label: "Consolidado", value: totais.consolidado },
  ];
  return (
    <View style={styles.kpiGrid}>
      {items.map((item) => (
        <View key={item.label} style={styles.kpiCard} wrap={false}>
          <Text style={styles.kpiLabel}>{item.label}</Text>
          <Text style={styles.kpiValue}>{formatBRL(item.value)}</Text>
        </View>
      ))}
    </View>
  );
}

function Legend({ items }: { items: { label: string; fill: string; value?: string }[] }) {
  return (
    <View style={styles.legendRow}>
      {items.map((item) => (
        <View key={item.label} style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: item.fill }]} />
          <Text style={styles.legendText}>
            {item.label}
            {item.value ? ` · ${item.value}` : ""}
          </Text>
        </View>
      ))}
    </View>
  );
}

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function slicePath(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
): string {
  const start = polar(cx, cy, r, endAngle);
  const end = polar(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return [
    `M ${cx} ${cy}`,
    `L ${start.x} ${start.y}`,
    `A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`,
    "Z",
  ].join(" ");
}

function PieChartPdf({
  data,
  size = 120,
}: {
  data: ComposicaoSlice[];
  size?: number;
}) {
  if (data.length === 0) {
    return <Text style={styles.emptyChart}>Sem valores para compor o gráfico.</Text>;
  }

  const total = data.reduce((sum, item) => sum + item.value, 0);
  if (total <= 0) {
    return <Text style={styles.emptyChart}>Sem valores para compor o gráfico.</Text>;
  }

  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.4;
  let angle = 0;

  return (
    <View>
      <Svg width={size} height={size}>
        <G>
          {data.map((item) => {
            const sweep = (item.value / total) * 360;
            const start = angle;
            const end = angle + sweep;
            angle = end;
            if (sweep >= 359.9) {
              return <Circle key={item.name} cx={cx} cy={cy} r={r} fill={item.fill} />;
            }
            return (
              <Path
                key={item.name}
                d={slicePath(cx, cy, r, start, end)}
                fill={item.fill}
              />
            );
          })}
          <Circle cx={cx} cy={cy} r={r * 0.45} fill="#ffffff" />
        </G>
      </Svg>
      <Legend
        items={data.map((item) => ({
          label: item.name,
          fill: item.fill,
          value: formatBRL(item.value),
        }))}
      />
    </View>
  );
}

function BarChartPdf({
  items,
}: {
  items: { label: string; value: number; fill: string }[];
}) {
  const width = 220;
  const height = 110;
  const padL = 8;
  const padR = 8;
  const padT = 8;
  const padB = 22;
  const max = Math.max(...items.map((i) => i.value), 1);
  const gap = 12;
  const barArea = width - padL - padR;
  const barW = (barArea - gap * (items.length - 1)) / items.length;
  const chartH = height - padT - padB;

  return (
    <View>
      <Svg width={width} height={height}>
        {items.map((item, index) => {
          const h = (item.value / max) * chartH;
          const x = padL + index * (barW + gap);
          const y = padT + chartH - h;
          return (
            <G key={item.label}>
              <Rect x={x} y={y} width={barW} height={Math.max(h, 1)} fill={item.fill} />
            </G>
          );
        })}
      </Svg>
      <Legend
        items={items.map((item) => ({
          label: item.label,
          fill: item.fill,
          value: formatBRL(item.value),
        }))}
      />
    </View>
  );
}

function DebitosTable({ debitos, codigoEmpresa }: { debitos: DebitoLinha[]; codigoEmpresa?: string }) {
  if (debitos.length === 0) {
    return <Text style={styles.semDoc}>Nenhum lançamento nesta esfera.</Text>;
  }

  return (
    <View style={styles.table}>
      <View style={styles.tableHeader} fixed>
        <Text style={[styles.th, { width: COL.codigo }]}>Cód.</Text>
        <Text style={[styles.th, { width: COL.lanc }]}>Nº lanç.</Text>
        <Text style={[styles.th, { width: COL.receita }]}>Receita</Text>
        <Text style={[styles.th, { width: COL.pa }]}>PA/Exerc.</Text>
        <Text style={[styles.th, { width: COL.venc }]}>Vencimento</Text>
        <Text style={[styles.th, styles.tdRight, { width: COL.original }]}>Original</Text>
        <Text style={[styles.th, styles.tdRight, { width: COL.saldo }]}>Saldo</Text>
        <Text style={[styles.th, styles.tdRight, { width: COL.multa }]}>Multa</Text>
        <Text style={[styles.th, styles.tdRight, { width: COL.juros }]}>Juros</Text>
        <Text style={[styles.th, styles.tdRight, { width: COL.consol }]}>Consol.</Text>
      </View>
      {debitos.map((row, index) => (
        <View key={`${row.arquivo}-${row.numero_lancamento}-${index}`} style={styles.tableRow} wrap={false}>
          <Text style={[styles.td, { width: COL.codigo }]}>{row.codigo || codigoEmpresa || "—"}</Text>
          <Text style={[styles.td, { width: COL.lanc }]}>{row.numero_lancamento || "—"}</Text>
          <Text style={[styles.td, { width: COL.receita }]}>{row.receita || "—"}</Text>
          <Text style={[styles.td, { width: COL.pa }]}>{row.pa || "—"}</Text>
          <Text style={[styles.td, { width: COL.venc }]}>{row.vencimento || "—"}</Text>
          <Text style={[styles.td, styles.tdRight, { width: COL.original }]}>
            {formatBRL(row.original)}
          </Text>
          <Text style={[styles.td, styles.tdRight, { width: COL.saldo }]}>{formatBRL(row.saldo)}</Text>
          <Text style={[styles.td, styles.tdRight, { width: COL.multa }]}>{formatBRL(row.multa)}</Text>
          <Text style={[styles.td, styles.tdRight, { width: COL.juros }]}>{formatBRL(row.juros)}</Text>
          <Text style={[styles.td, styles.tdRight, { width: COL.consol }]}>
            {formatBRL(row.consolidado)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function EsferaSection({ empresa, esfera }: { empresa: Empresa; esfera: Esfera }) {
  const bucket = empresa.esferas?.[esfera];
  const status: StatusEsfera = bucket?.status ?? "sem_documento";
  const qtdDocs = bucket?.qtdDocs ?? 0;
  const totais = bucket?.totais;
  const composicao = buildEsferaComposicao(empresa, esfera);
  const debitos = debitosDaEsfera(empresa, esfera);

  return (
    <View style={styles.esferaBlock} break={esfera !== "federal"}>
      <View style={styles.esferaHeader}>
        <View>
          <Text style={[styles.esferaTitle, { color: ESFERA_COLORS[esfera] }]}>
            {ESFERA_LABELS[esfera]}
          </Text>
          <Text style={styles.esferaMeta}>
            {ESFERA_FONTES[esfera]} · {qtdDocs} doc(s) · {debitos.length} lançamento(s)
          </Text>
        </View>
        <StatusBadge status={status} />
      </View>

      {qtdDocs === 0 && status === "sem_documento" ? (
        <Text style={styles.semDoc}>Sem documento nesta esfera para a competência.</Text>
      ) : (
        <>
          {totais ? <KpiCards totais={totais} /> : null}
          <View style={[styles.chartCard, { marginTop: 8 }]} wrap={false}>
            <Text style={styles.chartTitle}>Composição — {ESFERA_LABELS[esfera]}</Text>
            <Text style={styles.chartDesc}>Saldo, multa e juros</Text>
            <PieChartPdf data={composicao} size={110} />
          </View>
          <Text style={[styles.sectionTitle, { marginTop: 10 }]}>Lançamentos</Text>
          <DebitosTable debitos={debitos} codigoEmpresa={empresa.codigo} />
        </>
      )}
    </View>
  );
}

export function EmpresaRelatorioPdfDocument({ empresa, competencia }: Props) {
  const analytics = buildEmpresaAnalytics(empresa);
  const codigoLabel = empresa.codigo
    ? `Cód. ${empresa.codigo}${(empresa.codigos?.length ?? 0) > 1 ? ` (${empresa.codigos!.join(", ")})` : ""}`
    : null;

  return (
    <Document
      title={`Relatório — ${empresa.nome} — ${formatCompetencia(competencia)}`}
      author="Controle de Débitos"
      subject={`Relatório de débitos por esfera — competência ${formatCompetencia(competencia)}`}
    >
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.header}>
          <Text style={styles.title}>{empresa.nome}</Text>
          {codigoLabel ? <Text style={styles.subtitle}>{codigoLabel}</Text> : null}
          <Text style={styles.subtitle}>CNPJ {formatCnpj(empresa.cnpj)}</Text>
          <Text style={styles.subtitle}>
            Competência {formatCompetencia(competencia)} · Relatório de débitos por esfera
          </Text>
          <View style={styles.statusRow}>
            <StatusBadge status={empresa.status} />
            {empresa.tipos?.length ? (
              <Text style={styles.subtitle}>{empresa.tipos.join(" · ")}</Text>
            ) : null}
          </View>
        </View>

        <Text style={[styles.sectionTitle, { marginTop: 0 }]}>Resumo geral</Text>
        <KpiCards totais={empresa.totais} />

        <View style={styles.chartsRow} wrap={false}>
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Composição do valor</Text>
            <Text style={styles.chartDesc}>Saldo, multa e juros desta empresa</Text>
            <PieChartPdf data={analytics.composicao} />
          </View>
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Saldo por esfera</Text>
            <Text style={styles.chartDesc}>Federal · Estadual · Municipal</Text>
            <BarChartPdf
              items={analytics.porEsfera.map((item) => ({
                label: item.label,
                value: item.consolidado,
                fill: item.fill,
              }))}
            />
          </View>
        </View>

        {ESFERAS.map((esfera) => (
          <EsferaSection key={esfera} empresa={empresa} esfera={esfera} />
        ))}

        <View style={styles.footer} fixed>
          <Text>Controle de Débitos — relatório por empresa</Text>
          <Text
            render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
