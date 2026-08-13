import { NextResponse } from "next/server";
import {
  removeCadastroItem,
  saveCadastroOverlayItem,
  type CadastroMatchKey,
} from "@/lib/cadastro";
import type { CadastroConsulta } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PatchBody = {
  item?: Partial<CadastroConsulta>;
  match?: CadastroMatchKey;
};

type DeleteBody = {
  match?: CadastroMatchKey;
};

export async function PATCH(request: Request) {
  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  if (!body.item || typeof body.item !== "object") {
    return NextResponse.json({ error: "Campo item é obrigatório." }, { status: 400 });
  }

  try {
    // Somente overlay de consultas — sem sync com empresas.json / painel de débitos.
    const saved = saveCadastroOverlayItem(body.item, body.match);
    return NextResponse.json({ ok: true, item: saved });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao salvar.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  let body: DeleteBody;
  try {
    body = (await request.json()) as DeleteBody;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  if (!body.match || typeof body.match !== "object") {
    return NextResponse.json({ error: "Campo match é obrigatório." }, { status: 400 });
  }

  try {
    const result = removeCadastroItem(body.match);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao excluir.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
