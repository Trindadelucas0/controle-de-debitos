import { NextResponse } from "next/server";
import {
  saveCadastroOverlayItem,
  type CadastroMatchKey,
} from "@/lib/cadastro";
import { updateEmpresaIdentity } from "@/lib/data";
import type { CadastroConsulta } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PatchBody = {
  item?: Partial<CadastroConsulta>;
  match?: CadastroMatchKey;
};

function digits(value: string | null | undefined): string {
  return (value || "").replace(/\D/g, "");
}

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
    const saved = saveCadastroOverlayItem(body.item, body.match);

    // Propaga identidade (nome/CNPJ/Nº) para empresas.json em todas as competências.
    const sync = updateEmpresaIdentity(
      {
        matchId: body.match?.id,
        matchCnpj: body.match?.cnpj ?? saved.cnpj,
        matchCodigo: body.match?.numero ?? saved.numero,
      },
      {
        nome: saved.empresa,
        cnpj: saved.cnpj,
        codigo: saved.numero && saved.numero !== "—" ? saved.numero : undefined,
      },
    );

    return NextResponse.json({
      ok: true,
      item: saved,
      sync: {
        updated: sync.updated,
        ids: sync.ids,
        cnpjDigits: digits(saved.cnpj),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao salvar.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
