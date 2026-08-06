import { NextResponse } from "next/server";
import path from "path";
import {
  findEmpresaNaCompetencia,
  getEmpresa,
  listCompetencias,
  resolveCompetencia,
} from "@/lib/data";
import { resolveWorkspaceRoot, runPythonJson } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

const COMPETENCIA_RE = /^(0[1-9]|1[0-2])-\d{4}$/;
const MAX_ITENS = 50;

type DeleteItemInput = {
  destino?: string;
  arquivo?: string;
  empresaId?: string;
  competencia?: string;
};

type DeleteResult = {
  ok?: boolean;
  code?: string | null;
  erro?: string | null;
  competencia?: string;
  itens?: unknown[];
  excluidos?: number;
  aviso_global?: string | null;
};

function isSafeFileName(fileName: string): boolean {
  return Boolean(
    fileName &&
      !fileName.includes("..") &&
      !fileName.includes("/") &&
      !fileName.includes("\\") &&
      fileName.toLowerCase().endsWith(".pdf"),
  );
}

function resolveDestinoFromEmpresa(
  empresaId: string,
  arquivo: string,
  competencia: string,
): string | null {
  if (!isSafeFileName(arquivo)) return null;

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
  if (!empresa) return null;
  if (!empresa.arquivos.includes(arquivo)) return null;

  const pasta = empresa.pasta;
  if (!pasta) return null;

  // Preferir caminho relativo MM-YYYY/status/empresa/arquivo
  const parts = pasta.replace(/\\/g, "/").split("/").filter(Boolean);
  const idx = parts.findIndex((p) => COMPETENCIA_RE.test(p));
  if (idx >= 0 && parts.length > idx + 2) {
    const status = parts[idx + 1];
    const empresaDir = parts[idx + 2];
    if (["pendencias", "sem_pendencias", "revisar"].includes(status)) {
      return `${status}/${empresaDir}/${arquivo}`;
    }
  }

  return path.join(pasta, arquivo);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      competencia?: string;
      itens?: DeleteItemInput[];
      destino?: string;
      arquivo?: string;
      empresaId?: string;
    } | null;

    if (!body) {
      return NextResponse.json({ ok: false, erro: "JSON inválido" }, { status: 400 });
    }

    const competencia = String(body.competencia || "").trim();
    if (!COMPETENCIA_RE.test(competencia)) {
      return NextResponse.json(
        { ok: false, erro: "Competência inválida. Use MM-YYYY (ex.: 07-2026)." },
        { status: 400 },
      );
    }

    const rawItens: DeleteItemInput[] = Array.isArray(body.itens)
      ? body.itens
      : body.destino || body.arquivo
        ? [
            {
              destino: body.destino,
              arquivo: body.arquivo,
              empresaId: body.empresaId,
              competencia,
            },
          ]
        : [];

    if (rawItens.length === 0) {
      return NextResponse.json({ ok: false, erro: "Nenhum item para excluir." }, { status: 400 });
    }
    if (rawItens.length > MAX_ITENS) {
      return NextResponse.json(
        { ok: false, erro: `Máximo de ${MAX_ITENS} arquivos por exclusão.` },
        { status: 400 },
      );
    }

    const destinos: string[] = [];
    const erros: string[] = [];

    for (const item of rawItens) {
      const compItem = String(item.competencia || competencia).trim();
      if (item.destino && String(item.destino).trim()) {
        destinos.push(String(item.destino).trim());
        continue;
      }
      if (item.empresaId && item.arquivo) {
        const resolved = resolveDestinoFromEmpresa(
          String(item.empresaId),
          String(item.arquivo),
          resolveCompetencia(compItem),
        );
        if (resolved) {
          destinos.push(resolved);
        } else {
          erros.push(`${item.arquivo}: arquivo/empresa não encontrados`);
        }
        continue;
      }
      erros.push("item sem destino nem empresaId+arquivo");
    }

    if (destinos.length === 0) {
      return NextResponse.json(
        { ok: false, erro: erros[0] || "Nenhum destino válido para excluir." },
        { status: 404 },
      );
    }

    const workspace = resolveWorkspaceRoot();
    const { payload, code, stderr } = await runPythonJson<DeleteResult>(
      workspace,
      "delete_imported.py",
      ["--competencia", competencia, "--destinos", ...destinos],
    );

    if (!payload) {
      return NextResponse.json(
        {
          ok: false,
          erro: stderr.trim() || "Script de exclusão não retornou JSON",
          code: "NO_JSON",
          exitCode: code,
        },
        { status: 500 },
      );
    }

    if (payload.code === "LOCKED") {
      return NextResponse.json(payload, { status: 409 });
    }

    const status = payload.ok ? 200 : payload.code === "REBUILD_FAILED" ? 200 : 400;
    return NextResponse.json(
      {
        ...payload,
        avisos_resolucao: erros.length ? erros : undefined,
      },
      { status },
    );
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        erro: err instanceof Error ? err.message : "Erro interno na exclusão",
      },
      { status: 500 },
    );
  }
}
