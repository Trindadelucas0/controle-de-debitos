import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { formatCompetencia } from "@/lib/competencia";
import { formatCnpj } from "@/lib/format";
import { loadParcelamentos } from "@/lib/parcelamentos";
import {
  PARCELAMENTO_STATUS_LABELS,
  PARCELAMENTO_TIPO_LABELS,
  STATUS_EXCEL_COLORS,
  buildCardView,
  empresaTemParcelamentoNoMes,
  formatVencimentoBr,
  isValidCompetencia,
  resolveSiteEmissao,
} from "@/lib/parcelamentos-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const formato = (url.searchParams.get("formato") || "xlsx").toLowerCase();
  if (formato !== "xlsx") {
    return NextResponse.json(
      { error: "Formato não suportado nesta rota. Use formato=xlsx." },
      { status: 400 },
    );
  }

  const data = loadParcelamentos();
  if (data.error) {
    return NextResponse.json({ error: data.error }, { status: 500 });
  }

  const competencia =
    url.searchParams.get("competencia") ||
    data.atual ||
    data.competencias[data.competencias.length - 1] ||
    "";

  if (!isValidCompetencia(competencia)) {
    return NextResponse.json({ error: "Competência inválida." }, { status: 400 });
  }

  try {
    const registros = data.porCompetencia[competencia] ?? {};
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Controle de Parcelamentos";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet(`Parcelamentos ${competencia}`, {
      views: [{ state: "frozen", ySplit: 1 }],
    });

    sheet.columns = [
      { header: "SITUAÇÃO", key: "status", width: 36 },
      { header: "COD", key: "cod", width: 8 },
      { header: "EMPRESA", key: "empresa", width: 48 },
      { header: "GRUPO", key: "grupo", width: 14 },
      { header: "CNPJ", key: "cnpj", width: 20 },
      { header: "PARCELAMENTO", key: "tipo", width: 28 },
      { header: "Nº PARCELAMENTO", key: "numero", width: 22 },
      {
        header: `PARCELA ATUAL ${formatCompetencia(competencia)}`,
        key: "parcelaAtual",
        width: 18,
      },
      { header: "TOTAL PARCELAS", key: "total", width: 14 },
      { header: "PARCELAS EM ABERTO", key: "aberto", width: 18 },
      { header: "ÚLTIMO MÊS", key: "ultimoMes", width: 12 },
      { header: "VENCIMENTO", key: "vencimento", width: 14 },
      { header: "SITE EMISSÃO", key: "site", width: 48 },
      { header: "OBSERVAÇÃO", key: "obs", width: 28 },
    ];

    const header = sheet.getRow(1);
    header.font = { bold: true };
    header.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    header.height = 28;

    for (const empresa of data.empresas) {
      const view = buildCardView(empresa, registros[empresa.id], competencia);
      if (!empresaTemParcelamentoNoMes(view.registro, competencia)) continue;
      const siteUrl =
        resolveSiteEmissao(empresa.siteEmissao, view.registro.tipo) ?? "";
      const row = sheet.addRow({
        status: PARCELAMENTO_STATUS_LABELS[view.registro.status] ?? "Ativo",
        cod: empresa.cod ?? "",
        empresa: empresa.empresa,
        grupo: empresa.grupo ?? "",
        cnpj: formatCnpj(empresa.cnpj),
        tipo: view.registro.tipo
          ? PARCELAMENTO_TIPO_LABELS[view.registro.tipo]
          : "",
        numero: empresa.numeroParcelamento ?? "",
        parcelaAtual: view.parcelaAtual ?? "",
        total: view.registro.totalParcelas ?? "",
        aberto: view.parcelasEmAberto ?? "",
        ultimoMes: view.ultimaCompetencia
          ? formatCompetencia(view.ultimaCompetencia)
          : "",
        vencimento: formatVencimentoBr(view.registro.vencimento),
        site: siteUrl,
        obs: view.registro.observacao ?? "",
      });

      if (siteUrl) {
        const siteCell = row.getCell("site");
        siteCell.value = {
          text: siteUrl,
          hyperlink: siteUrl,
        };
        siteCell.font = {
          color: { argb: "FF0563C1" },
          underline: true,
        };
      }

      const colors =
        STATUS_EXCEL_COLORS[view.registro.status] ?? STATUS_EXCEL_COLORS.ativo;
      row.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: colors.argb },
        };
        // Preserva hiperlink azul na coluna SITE EMISSÃO.
        if (cell !== row.getCell("site") || !siteUrl) {
          cell.font = { color: { argb: colors.fontArgb } };
        } else {
          cell.font = {
            color: { argb: "FF0563C1" },
            underline: true,
          };
        }
        cell.border = {
          top: { style: "thin", color: { argb: "FFB0B0B0" } },
          left: { style: "thin", color: { argb: "FFB0B0B0" } },
          bottom: { style: "thin", color: { argb: "FFB0B0B0" } },
          right: { style: "thin", color: { argb: "FFB0B0B0" } },
        };
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `parcelamentos_${competencia}.xlsx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao gerar Excel.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
