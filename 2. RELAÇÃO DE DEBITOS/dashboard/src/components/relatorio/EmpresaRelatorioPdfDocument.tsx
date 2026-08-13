import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Svg,
  Path,
  G,
  Circle,
} from "@react-pdf/renderer";
import {
  aggregatePorTitulo,
  buildEmpresaAnalytics,
  buildEsferaComposicao,
  debitosDaEsfera,
  groupDebitosByTitulo,
  ESFERA_COLORS,
  ESFERA_FONTES,
  ESFERA_LABELS,
  type ComposicaoSlice,
  type TituloSlice,
} from "@/lib/analytics";
import { formatCompetencia } from "@/lib/competencia";
import { formatBRL, formatCnpj, formatItensETotal, isOmissaoDebito } from "@/lib/format";
import type { DebitoLinha, Empresa, Esfera, StatusEsfera } from "@/lib/types";

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
    alignItems: "center",
  },
  reportTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1.2,
    marginBottom: 8,
    color: "#475569",
    textAlign: "center",
  },
  title: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 9,
    color: "#64748b",
    marginBottom: 2,
    textAlign: "center",
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
  tituloChartsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tituloChartCard: {
    width: "48%",
    flexGrow: 1,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 4,
    padding: 8,
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
  codigo: "8%",
  lanc: "11%",
  receita: "24%",
  pa: "10%",
  venc: "11%",
  original: "11%",
  saldo: "11%",
  multa: "7%",
  juros: "7%",
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
  showLegend = true,
}: {
  data: ComposicaoSlice[];
  size?: number;
  showLegend?: boolean;
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
      {showLegend ? (
        <Legend
          items={data.map((item) => ({
            label: item.name,
            fill: item.fill,
            value: formatBRL(item.value),
          }))}
        />
      ) : null}
    </View>
  );
}

function TituloChartsPdf({ items }: { items: TituloSlice[] }) {
  if (items.length === 0) {
    return <Text style={styles.emptyChart}>Sem títulos do diagnóstico.</Text>;
  }

  return (
    <View style={styles.tituloChartsGrid}>
      {items.map((item) => (
        <View key={item.titulo || item.label} style={styles.tituloChartCard} wrap={false}>
          <Text style={styles.chartTitle}>{item.label}</Text>
          <Text style={styles.chartDesc}>{formatItensETotal(item.qtd, item.consolidado)}</Text>
          {item.composicao.length > 0 ? (
            <PieChartPdf data={item.composicao} size={96} />
          ) : (
            <Text style={styles.emptyChart}>Sem valores neste título.</Text>
          )}
        </View>
      ))}
    </View>
  );
}

function moneyCell(row: DebitoLinha, value: number): string {
  return isOmissaoDebito(row) ? "—" : formatBRL(value);
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
      </View>
      {debitos.map((row, index) => (
        <View key={`${row.arquivo}-${row.numero_lancamento}-${index}`} style={styles.tableRow} wrap={false}>
          <Text style={[styles.td, { width: COL.codigo }]}>{row.codigo || codigoEmpresa || "—"}</Text>
          <Text style={[styles.td, { width: COL.lanc }]}>{row.numero_lancamento || "—"}</Text>
          <Text style={[styles.td, { width: COL.receita }]}>{row.receita || "—"}</Text>
          <Text style={[styles.td, { width: COL.pa }]}>{row.pa || "—"}</Text>
          <Text style={[styles.td, { width: COL.venc }]}>
            {isOmissaoDebito(row) || !row.vencimento ? "—" : row.vencimento}
          </Text>
          <Text style={[styles.td, styles.tdRight, { width: COL.original }]}>
            {moneyCell(row, row.original)}
          </Text>
          <Text style={[styles.td, styles.tdRight, { width: COL.saldo }]}>{moneyCell(row, row.saldo)}</Text>
          <Text style={[styles.td, styles.tdRight, { width: COL.multa }]}>{moneyCell(row, row.multa)}</Text>
          <Text style={[styles.td, styles.tdRight, { width: COL.juros }]}>{moneyCell(row, row.juros)}</Text>
        </View>
      ))}
    </View>
  );
}

function EsferaSection({ empresa, esfera }: { empresa: Empresa; esfera: Esfera }) {
  const bucket = empresa.esferas?.[esfera];
  const status: StatusEsfera = bucket?.status ?? "sem_documento";
  const qtdDocs = bucket?.qtdDocs ?? 0;
  const composicao = buildEsferaComposicao(empresa, esfera);
  const debitos = debitosDaEsfera(empresa, esfera);
  const grupos = groupDebitosByTitulo(debitos);
  const porTitulo = aggregatePorTitulo(debitos);
  const agruparPorTitulo =
    esfera === "federal" && (grupos.length > 1 || grupos.some((grupo) => Boolean(grupo.titulo)));

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
          {agruparPorTitulo && porTitulo.length > 0 ? (
            <View style={{ marginTop: 8 }}>
              <TituloChartsPdf items={porTitulo} />
            </View>
          ) : (
            <View style={[styles.chartCard, { marginTop: 8 }]} wrap={false}>
              <Text style={styles.chartTitle}>Composição — {ESFERA_LABELS[esfera]}</Text>
              <Text style={styles.chartDesc}>Saldo, multa e juros</Text>
              <PieChartPdf data={composicao} size={110} />
            </View>
          )}
          {agruparPorTitulo ? (
            grupos.map((grupo) => (
              <View key={grupo.titulo || "__sem_titulo__"}>
                <Text style={[styles.sectionTitle, { marginTop: 10 }]}>{grupo.label}</Text>
                <Text style={styles.esferaMeta}>
                  {formatItensETotal(grupo.debitos.length, grupo.consolidado)}
                </Text>
                <DebitosTable debitos={grupo.debitos} codigoEmpresa={empresa.codigo} />
              </View>
            ))
          ) : (
            <>
              <Text style={[styles.sectionTitle, { marginTop: 10 }]}>Lançamentos</Text>
              <DebitosTable debitos={debitos} codigoEmpresa={empresa.codigo} />
            </>
          )}
        </>
      )}
    </View>
  );
}

export function EmpresaRelatorioPdfDocument({ empresa, competencia }: Props) {
  const analytics = buildEmpresaAnalytics(empresa);

  return (
    <Document
      title={`Relação de Débitos Mensal — ${empresa.nome} — ${formatCompetencia(competencia)}`}
      author="Relação de Débitos Mensal"
      subject={`Relação de Débitos Mensal — competência ${formatCompetencia(competencia)}`}
    >
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.header}>
          <Text style={styles.reportTitle}>RELAÇÃO DE DEBITOS MENSAL</Text>
          <Text style={styles.title}>{empresa.nome}</Text>
          <Text style={styles.subtitle}>CNPJ {formatCnpj(empresa.cnpj)}</Text>
          <Text style={styles.subtitle}>
            Competência {formatCompetencia(competencia)}
          </Text>
        </View>

        {analytics.porTitulo.length > 0 ? (
          <View>
            <Text style={[styles.sectionTitle, { marginTop: 0 }]}>Por título</Text>
            <TituloChartsPdf items={analytics.porTitulo} />
          </View>
        ) : null}

        {ESFERAS.map((esfera) => (
          <EsferaSection key={esfera} empresa={empresa} esfera={esfera} />
        ))}

        <View style={styles.footer} fixed>
          <Text>Relação de Débitos Mensal</Text>
          <Text
            render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
