import { NextResponse } from "next/server";
import {
  createEmpresa,
  deleteEmpresa,
  gerarCompetencia,
  loadParcelamentos,
  removeRegistroDaGrade,
  updateEmpresa,
  updateRegistro,
} from "@/lib/parcelamentos";
import type { EmpresaInput, RegistroInput } from "@/lib/parcelamentos-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const data = loadParcelamentos();
  if (data.error) {
    return NextResponse.json({ error: data.error }, { status: 500 });
  }

  const url = new URL(request.url);
  const competencia =
    url.searchParams.get("competencia") ||
    data.atual ||
    data.competencias[data.competencias.length - 1] ||
    "";

  return NextResponse.json({
    ok: true,
    gerado_em: data.gerado_em,
    origem: data.origem,
    empresas: data.empresas,
    competencias: data.competencias,
    atual: data.atual,
    competencia,
    registros: data.porCompetencia[competencia] ?? {},
  });
}

type PostBody = {
  action?: "empresa" | "gerarCompetencia";
  competencia?: string;
  empresa?: EmpresaInput;
  registro?: RegistroInput;
  de?: string;
  para?: string;
};

export async function POST(request: Request) {
  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const action = body.action ?? "empresa";

  try {
    if (action === "gerarCompetencia") {
      const data = gerarCompetencia(body.de || "", body.para || "");
      return NextResponse.json({
        ok: true,
        competencias: data.competencias,
        atual: data.atual,
        competencia: body.para,
        registros: data.porCompetencia[body.para || ""] ?? {},
        empresas: data.empresas,
      });
    }

    if (!body.empresa) {
      return NextResponse.json({ error: "Campo empresa é obrigatório." }, { status: 400 });
    }
    const result = createEmpresa(
      body.empresa,
      body.competencia || "",
      body.registro,
    );
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao processar.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

type PatchBody = {
  empresaId?: string;
  competencia?: string;
  empresa?: EmpresaInput;
  registro?: RegistroInput;
};

export async function PATCH(request: Request) {
  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const empresaId = typeof body.empresaId === "string" ? body.empresaId.trim() : "";
  if (!empresaId) {
    return NextResponse.json({ error: "Campo empresaId é obrigatório." }, { status: 400 });
  }

  try {
    let empresa = undefined as ReturnType<typeof updateEmpresa> | undefined;

    if (body.empresa) {
      empresa = updateEmpresa(empresaId, body.empresa);
    }
    if (body.registro) {
      const competencia = (body.competencia || "").trim();
      if (!competencia) {
        return NextResponse.json(
          { error: "Competência é obrigatória para salvar o registro." },
          { status: 400 },
        );
      }
      const result = updateRegistro(competencia, empresaId, body.registro);
      return NextResponse.json({
        ok: true,
        empresa,
        registro: result.registro,
        competencias: result.competencias,
        ultimaCompetencia: result.ultimaCompetencia,
        mesesCronograma: result.mesesCronograma,
      });
    }

    if (!empresa) {
      return NextResponse.json(
        { error: "Informe empresa e/ou registro para atualizar." },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true, empresa });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao atualizar.";
    const status = message.includes("não encontrad") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

type DeleteBody = {
  empresaId?: string;
  /** Se informado, remove só da grade deste mês (não apaga a empresa). */
  competencia?: string;
};

export async function DELETE(request: Request) {
  let body: DeleteBody;
  try {
    body = (await request.json()) as DeleteBody;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const empresaId = typeof body.empresaId === "string" ? body.empresaId.trim() : "";
  if (!empresaId) {
    return NextResponse.json({ error: "Campo empresaId é obrigatório." }, { status: 400 });
  }

  const competencia =
    typeof body.competencia === "string" ? body.competencia.trim() : "";

  try {
    if (competencia) {
      const result = removeRegistroDaGrade(competencia, empresaId);
      return NextResponse.json({ ok: true, ...result, modo: "grade" });
    }
    const result = deleteEmpresa(empresaId);
    return NextResponse.json({ ok: true, ...result, modo: "empresa" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao excluir.";
    const status = message.includes("não encontrad") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
