import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { findEmpresaNaCompetencia, getEmpresa, listCompetencias, resolveCompetencia } from "@/lib/data";

type Params = {
  params: Promise<{ empresaId: string; arquivo: string }>;
};

export async function GET(request: Request, { params }: Params) {
  const { empresaId, arquivo } = await params;
  const fileName = decodeURIComponent(arquivo);
  const url = new URL(request.url);
  const competencia = resolveCompetencia(url.searchParams.get("competencia"));

  if (
    !fileName ||
    fileName.includes("..") ||
    fileName.includes("/") ||
    fileName.includes("\\") ||
    !fileName.toLowerCase().endsWith(".pdf")
  ) {
    return NextResponse.json({ error: "Arquivo inválido" }, { status: 400 });
  }

  let empresa = getEmpresa(empresaId, competencia);
  if (!empresa) {
    for (const c of listCompetencias()) {
      const ref = getEmpresa(empresaId, c);
      if (ref) {
        empresa = findEmpresaNaCompetencia(ref, competencia);
        break;
      }
    }
  }

  if (!empresa) {
    return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 });
  }

  if (!empresa.arquivos.includes(fileName)) {
    return NextResponse.json({ error: "Arquivo não vinculado à empresa" }, { status: 404 });
  }

  const fullPath = path.join(empresa.pasta, fileName);

  try {
    const bytes = await readFile(fullPath);
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Não foi possível ler o PDF no disco" },
      { status: 404 },
    );
  }
}
