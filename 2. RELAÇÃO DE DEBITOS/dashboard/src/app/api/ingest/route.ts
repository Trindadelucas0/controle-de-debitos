import path from "path";
import { NextResponse } from "next/server";
import { mkdir, unlink, writeFile } from "fs/promises";
import { invalidateDashboardCache, listCompetencias } from "@/lib/data";
import { resolveInboxFile, sanitizeFileName } from "@/lib/inbox-file";
import { resolveWorkspaceRoot, spawnPythonScript } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

const COMPETENCIA_RE = /^(0[1-9]|1[0-2])-\d{4}$/;
const TIPOS = new Set(["ECAC", "AGENCIANET", "MUNICIPAL"]);
const MAX_FILES = 30;
const MAX_BYTES = 20 * 1024 * 1024;
/** Timeout total do lote (rebuild completo pode demorar). */
const BATCH_TIMEOUT_MS = 15 * 60 * 1000;

/** Aceita %PDF no início ou após BOM/espaços. */
function looksLikePdf(buffer: Buffer): boolean {
  if (!buffer.length) return false;
  const marker = Buffer.from("%PDF");
  const head = buffer.subarray(0, Math.min(buffer.length, 1024));
  const at = head.indexOf(marker);
  return at >= 0 && at < 32;
}

function streamPython(
  workspace: string,
  pyArgs: string[],
  competencia: string,
): Response {
  const child = spawnPythonScript(workspace, "ingest_upload.py", pyArgs);
  const encoder = new TextEncoder();
  let settled = false;
  let sawDone = false;
  const shouldInvalidate = !pyArgs.includes("--dry-run");

  const stream = new ReadableStream({
    start(controller) {
      let buffer = "";
      const timer = setTimeout(() => {
        if (!settled) {
          child.kill();
          try {
            controller.enqueue(
              encoder.encode(
                `${JSON.stringify({
                  event: "done",
                  ok: false,
                  erro: "Timeout na extração do lote",
                  competencia,
                })}\n`,
              ),
            );
            controller.close();
          } catch {
            /* already closed */
          }
          settled = true;
        }
      }, BATCH_TIMEOUT_MS);

      child.stdout.on("data", (chunk: Buffer) => {
        buffer += chunk.toString("utf-8");
        let nl = buffer.indexOf("\n");
        while (nl >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (line) {
            if (/"event"\s*:\s*"done"/.test(line)) sawDone = true;
            try {
              controller.enqueue(encoder.encode(`${line}\n`));
            } catch {
              /* ignore */
            }
          }
          nl = buffer.indexOf("\n");
        }
      });

      child.stderr.on("data", (chunk: Buffer) => {
        void chunk;
      });

      child.on("close", () => {
        clearTimeout(timer);
        if (settled) return;
        settled = true;
        const rest = buffer.trim();
        if (rest) {
          if (/"event"\s*:\s*"done"/.test(rest)) sawDone = true;
          try {
            controller.enqueue(encoder.encode(`${rest}\n`));
          } catch {
            /* ignore */
          }
        }
        if (shouldInvalidate) {
          invalidateDashboardCache();
        }
        if (!sawDone) {
          try {
            controller.enqueue(
              encoder.encode(
                `${JSON.stringify({
                  event: "done",
                  ok: false,
                  erro: "A extração terminou sem resultado. Tente novamente.",
                  competencia,
                })}\n`,
              ),
            );
          } catch {
            /* ignore */
          }
        }
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        if (settled) return;
        settled = true;
        try {
          controller.enqueue(
            encoder.encode(
              `${JSON.stringify({
                event: "done",
                ok: false,
                erro: err.message,
                competencia,
              })}\n`,
            ),
          );
          controller.close();
        } catch {
          /* ignore */
        }
      });
    },
    cancel() {
      child.kill();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function GET() {
  return NextResponse.json({
    competencias: listCompetencias(),
    tipos: ["ECAC", "AGENCIANET", "MUNICIPAL"],
  });
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const competencia = String(form.get("competencia") || "").trim();
    if (!COMPETENCIA_RE.test(competencia)) {
      return NextResponse.json(
        { ok: false, erro: "Competência inválida. Use MM-YYYY (ex.: 07-2026)." },
        { status: 400 },
      );
    }

    const modeRaw = String(form.get("mode") || "preview").toLowerCase();
    const mode = modeRaw === "commit" ? "commit" : "preview";
    const workspace = resolveWorkspaceRoot();

    if (mode === "commit") {
      const pathsRaw = form.getAll("paths").map((p) => String(p));
      const tiposRaw = form.getAll("tipos").map((t) => String(t).toUpperCase());

      if (pathsRaw.length === 0) {
        return NextResponse.json({ ok: false, erro: "Nenhum arquivo selecionado para confirmar." }, { status: 400 });
      }
      if (pathsRaw.length > MAX_FILES) {
        return NextResponse.json(
          { ok: false, erro: `Máximo de ${MAX_FILES} arquivos por vez.` },
          { status: 400 },
        );
      }
      if (tiposRaw.length !== pathsRaw.length) {
        return NextResponse.json(
          { ok: false, erro: "Envie um tipo (ECAC/AGENCIANET/MUNICIPAL) por arquivo." },
          { status: 400 },
        );
      }
      for (const tipo of tiposRaw) {
        if (!TIPOS.has(tipo)) {
          return NextResponse.json({ ok: false, erro: `Tipo inválido: ${tipo}` }, { status: 400 });
        }
      }

      const savedPaths: string[] = [];
      for (const raw of pathsRaw) {
        const safe = resolveInboxFile(workspace, raw, competencia);
        if (!safe) {
          return NextResponse.json(
            {
              ok: false,
              erro:
                `Arquivo temporário não encontrado no inbox (${path.basename(raw)}). ` +
                "Analise os PDFs de novo antes de confirmar.",
            },
            { status: 400 },
          );
        }
        savedPaths.push(safe);
      }

      const pyArgs = [
        "--stream",
        "--competencia",
        competencia,
        "--files",
        ...savedPaths,
        "--tipos",
        ...tiposRaw,
      ];
      return streamPython(workspace, pyArgs, competencia);
    }

    // preview
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    const tiposRaw = form.getAll("tipos").map((t) => String(t).toUpperCase());

    if (files.length === 0) {
      return NextResponse.json({ ok: false, erro: "Nenhum PDF enviado." }, { status: 400 });
    }
    if (files.length > MAX_FILES) {
      return NextResponse.json(
        { ok: false, erro: `Máximo de ${MAX_FILES} arquivos por vez.` },
        { status: 400 },
      );
    }
    if (tiposRaw.length !== files.length) {
      return NextResponse.json(
        { ok: false, erro: "Envie um tipo (ECAC/AGENCIANET/MUNICIPAL) por arquivo." },
        { status: 400 },
      );
    }
    for (const tipo of tiposRaw) {
      if (!TIPOS.has(tipo)) {
        return NextResponse.json({ ok: false, erro: `Tipo inválido: ${tipo}` }, { status: 400 });
      }
    }

    const batchId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const inbox = path.join(workspace, "resultados", "inbox_upload", competencia, batchId);
    await mkdir(inbox, { recursive: true });

    const savedPaths: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > MAX_BYTES) {
        return NextResponse.json(
          { ok: false, erro: `${file.name} excede 20 MB.` },
          { status: 400 },
        );
      }
      const safe = sanitizeFileName(file.name);
      const dest = path.join(inbox, `${i}_${safe}`);
      const buffer = Buffer.from(await file.arrayBuffer());
      if (!looksLikePdf(buffer)) {
        return NextResponse.json(
          {
            ok: false,
            erro: `${file.name} não é um PDF válido (assinatura %PDF não encontrada).`,
          },
          { status: 400 },
        );
      }
      await writeFile(dest, buffer);
      savedPaths.push(dest);
    }

    const pyArgs = [
      "--stream",
      "--dry-run",
      "--competencia",
      competencia,
      "--files",
      ...savedPaths,
      "--tipos",
      ...tiposRaw,
    ];

    return streamPython(workspace, pyArgs, competencia);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        erro: err instanceof Error ? err.message : "Erro interno no ingest",
      },
      { status: 500 },
    );
  }
}

/** Limpa PDFs do inbox após cancelar a revisão. */
export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as { paths?: string[]; competencia?: string };
    const competencia = String(body.competencia || "").trim();
    if (!COMPETENCIA_RE.test(competencia)) {
      return NextResponse.json({ ok: false, erro: "Competência inválida." }, { status: 400 });
    }
    const paths = Array.isArray(body.paths) ? body.paths.map(String) : [];
    if (paths.length === 0) {
      return NextResponse.json({ ok: true, removidos: 0 });
    }

    const workspace = resolveWorkspaceRoot();
    let removidos = 0;
    for (const raw of paths) {
      const safe = resolveInboxFile(workspace, raw, competencia);
      if (!safe) continue;
      try {
        await unlink(safe);
        removidos += 1;
      } catch {
        /* ignore */
      }
    }
    return NextResponse.json({ ok: true, removidos });
  } catch (err) {
    return NextResponse.json(
      { ok: false, erro: err instanceof Error ? err.message : "Falha ao limpar inbox" },
      { status: 500 },
    );
  }
}
