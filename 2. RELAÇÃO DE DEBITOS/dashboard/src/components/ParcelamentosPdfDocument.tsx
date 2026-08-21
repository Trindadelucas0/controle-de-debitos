import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatCompetencia } from "@/lib/competencia";
import { formatCnpj } from "@/lib/format";
import {
  PARCELAMENTO_STATUS_LABELS,
  PARCELAMENTO_TIPO_LABELS,
  formatVencimentoBr,
  type CardView,
} from "@/lib/parcelamentos-utils";

type Props = {
  competencia: string;
  cards: CardView[];
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingBottom: 36,
    paddingHorizontal: 24,
    fontSize: 8,
    fontFamily: "Helvetica",
    color: "#0f172a",
  },
  title: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 9,
    color: "#64748b",
    marginBottom: 12,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#e2e8f0",
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#94a3b8",
  },
  row: {
    flexDirection: "row",
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e2e8f0",
  },
  rowOk: { backgroundColor: "#ecfdf5" },
  rowSaiu: { backgroundColor: "#f1f5f9" },
  rowCancelado: { backgroundColor: "#fef2f2" },
  rowAtencao: { backgroundColor: "#fffbeb" },
  cell: { paddingRight: 3 },
  th: { fontFamily: "Helvetica-Bold", fontSize: 7 },
  colStatus: { width: "8%" },
  colCod: { width: "6%" },
  colEmpresa: { width: "28%" },
  colCnpj: { width: "16%" },
  colNumero: { width: "14%" },
  colTotal: { width: "8%" },
  colAtual: { width: "8%" },
  colVenc: { width: "12%" },
});

function rowStyle(status: CardView["registro"]["status"]) {
  if (status === "ok") return styles.rowOk;
  if (status === "saiu") return styles.rowSaiu;
  if (status === "cancelado") return styles.rowCancelado;
  return styles.rowAtencao;
}

export function ParcelamentosPdfDocument({ competencia, cards }: Props) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.title}>Controle de Parcelamentos</Text>
        <Text style={styles.subtitle}>
          Competência {formatCompetencia(competencia)} · {cards.length} empresa(s)
        </Text>

        <View style={styles.tableHeader}>
          <Text style={[styles.cell, styles.th, styles.colStatus]}>Status</Text>
          <Text style={[styles.cell, styles.th, styles.colCod]}>Cód</Text>
          <Text style={[styles.cell, styles.th, styles.colEmpresa]}>Empresa</Text>
          <Text style={[styles.cell, styles.th, styles.colCnpj]}>CNPJ</Text>
          <Text style={[styles.cell, styles.th, styles.colNumero]}>Nº parc.</Text>
          <Text style={[styles.cell, styles.th, styles.colAtual]}>Atual</Text>
          <Text style={[styles.cell, styles.th, styles.colTotal]}>Total</Text>
          <Text style={[styles.cell, styles.th, styles.colVenc]}>Vencimento</Text>
        </View>

        {cards.map((card) => (
          <View
            key={card.empresa.id}
            style={[styles.row, rowStyle(card.registro.status)]}
            wrap={false}
          >
            <Text style={[styles.cell, styles.colStatus]}>
              {PARCELAMENTO_STATUS_LABELS[card.registro.status]}
            </Text>
            <Text style={[styles.cell, styles.colCod]}>{card.empresa.cod ?? "—"}</Text>
            <Text style={[styles.cell, styles.colEmpresa]}>
              {card.empresa.empresa}
              {card.registro.tipo
                ? `\n${PARCELAMENTO_TIPO_LABELS[card.registro.tipo]}`
                : ""}
            </Text>
            <Text style={[styles.cell, styles.colCnpj]}>
              {formatCnpj(card.empresa.cnpj)}
            </Text>
            <Text style={[styles.cell, styles.colNumero]}>
              {card.empresa.numeroParcelamento || "—"}
            </Text>
            <Text style={[styles.cell, styles.colAtual]}>
              {card.parcelaAtual ?? "—"}
            </Text>
            <Text style={[styles.cell, styles.colTotal]}>
              {card.registro.totalParcelas ?? "—"}
            </Text>
            <Text style={[styles.cell, styles.colVenc]}>
              {formatVencimentoBr(card.registro.vencimento)}
            </Text>
          </View>
        ))}
      </Page>
    </Document>
  );
}
