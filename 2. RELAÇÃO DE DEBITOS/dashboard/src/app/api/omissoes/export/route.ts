import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { collectOmissoesDetalhe } from "@/lib/omissoes-export";

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

  const { rows, error } = collectOmissoesDetalhe();
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Controle de Débitos";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("Detalhe", {
      views: [{ state: "frozen", ySplit: 1 }],
    });

    sheet.columns = [
      { header: "Competência", key: "competencia", width: 14 },
      { header: "Código", key: "codigo", width: 12 },
      { header: "Empresa", key: "empresa", width: 42 },
      { header: "CNPJ", key: "cnpj", width: 20 },
      { header: "PA", key: "pa", width: 12 },
      { header: "Receita", key: "receita", width: 28 },
      { header: "Situação", key: "situacao", width: 12 },
      { header: "Título", key: "titulo", width: 28 },
      { header: "Origem", key: "origem", width: 12 },
      { header: "Arquivo", key: "arquivo", width: 28 },
    ];

    const header = sheet.getRow(1);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1F4E79" },
    };
    header.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    header.height = 28;

    for (const row of rows) {
      sheet.addRow({
        competencia: row.competencia,
        codigo: row.codigo,
        empresa: row.empresa,
        cnpj: row.cnpj,
        pa: row.pa,
        receita: row.receita,
        situacao: row.situacao,
        titulo: row.titulo,
        origem: row.origem,
        arquivo: row.arquivo,
      });
    }

    if (rows.length > 0) {
      sheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: rows.length + 1, column: 10 },
      };
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const today = new Date().toISOString().slice(0, 10);
    const filename = `omissoes_detalhe_${today}.xlsx`;

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
