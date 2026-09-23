import { EXITO } from "@/lib/exito-palette";
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
    color: EXITO.ink,
  },
  title: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 9,
    color: EXITO.muted,
    marginBottom: 12,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: EXITO.line,
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: EXITO.outline,
  },
  row: {
    flexDirection: "row",
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: EXITO.line,
  },
  rowAtivo: { backgroundColor: EXITO.greenSoft },
  rowEncerrado: { backgroundColor: EXITO.surfaceContainer },
  rowSaiu: { backgroundColor: EXITO.surfaceLow },
  rowCancelado: { backgroundColor: EXITO.dangerBg },
  rowErro: { backgroundColor: EXITO.dangerBg },
  cell: { paddingRight: 3 },
  th: { fontFamily: "Helvetica-Bold", fontSize: 7 },
  colStatus: { width: "16%" },
  colCod: { width: "5%" },
  colEmpresa: { width: "18%" },
  colCnpj: { width: "13%" },
  colNumero: { width: "11%" },
  colTotal: { width: "6%" },
  colAtual: { width: "6%" },
  colUltimo: { width: "10%" },
  colVenc: { width: "15%" },
});

function rowStyle(status: CardView["registro"]["status"]) {
  if (status === "ativo") return styles.rowAtivo;
  if (status === "encerrado") return styles.rowEncerrado;
  if (status === "saiu") return styles.rowSaiu;
  if (status === "cancelado") return styles.rowCancelado;
  return styles.rowErro;
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
          <Text style={[styles.cell, styles.th, styles.colStatus]}>Situação</Text>
          <Text style={[styles.cell, styles.th, styles.colCod]}>Cód</Text>
          <Text style={[styles.cell, styles.th, styles.colEmpresa]}>Empresa</Text>
          <Text style={[styles.cell, styles.th, styles.colCnpj]}>CNPJ</Text>
          <Text style={[styles.cell, styles.th, styles.colNumero]}>Nº parc.</Text>
          <Text style={[styles.cell, styles.th, styles.colAtual]}>Atual</Text>
          <Text style={[styles.cell, styles.th, styles.colTotal]}>Total</Text>
          <Text style={[styles.cell, styles.th, styles.colUltimo]}>Último mês</Text>
          <Text style={[styles.cell, styles.th, styles.colVenc]}>Vencimento</Text>
        </View>

        {cards.map((card) => (
          <View
            key={card.empresa.id}
            style={[styles.row, rowStyle(card.registro.status)]}
            wrap={false}
          >
            <Text style={[styles.cell, styles.colStatus]}>
              {PARCELAMENTO_STATUS_LABELS[card.registro.status] ??
                card.registro.status}
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
            <Text style={[styles.cell, styles.colUltimo]}>
              {card.ultimaCompetencia
                ? formatCompetencia(card.ultimaCompetencia)
                : "—"}
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
