import { existsSync } from "fs";
import path from "path";
import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { listCompetencias } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

const COMPETENCIA_RE = /^(0[1-9]|1[0-2])-\d{4}$/;
const TIPOS = new Set(["ECAC", "AGENCIANET", "MUNICIPAL"]);
const MAX_FILES = 30;
const MAX_BYTES = 20 * 1024 * 1024;
/** Timeout total do lote (rebuild completo pode demorar). */
const BATCH_TIMEOUT_MS = 15 * 60 * 1000;

function resolveWorkspaceRoot(): string {
  if (process.env.DEBITOS_WORKSPACE && existsSync(process.env.DEBITOS_WORKSPACE)) {
    return process.env.DEBITOS_WORKSPACE;
  }
  const candidates = [
    path.resolve(process.cwd(), ".."),
    process.cwd(),
    path.resolve(process.cwd(), "..", ".."),
  ];
  for (const candidate of candidates) {
    const script = path.join(candidate, "scripts", "ingest_upload.py");
    if (existsSync(script)) return candidate;
  }
  return path.resolve(process.cwd(), "..");
}

function sanitizeFileName(name: string): string {
  const base = path.basename(name).replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
  const cleaned = base.replace(/\.\.+/g, ".");
  if (!cleaned.toLowerCase().endsWith(".pdf")) {
    return `${cleaned || "arquivo"}.pdf`;
  }
  return cleaned.slice(0, 180);
}

/** Aceita %PDF no início ou após BOM/espaços (mesmo tamanho dos buffers — equals exige length igual). */
function looksLikePdf(buffer: Buffer): boolean {
  if (!buffer.length) return false;
  const marker = Buffer.from("%PDF");
  const head = buffer.subarray(0, Math.min(buffer.length, 1024));
  const at = head.indexOf(marker);
  return at >= 0 && at < 32;
}

function spawnPython(workspace: string, args: string[]): ChildProcessWithoutNullStreams {
  const script = path.join(workspace, "scripts", "ingest_upload.py");
  // Preferir 3.14 (deps PDF); fallback py -3 / python do PATH.
  const attempts: { cmd: string; prefix: string[] }[] = [
    { cmd: "py", prefix: ["-3.14"] },
    { cmd: "py", prefix: ["-3"] },
    { cmd: "python", prefix: [] },
  ];
  let lastError: Error | null = null;
  for (const attempt of attempts) {
    try {
      const child = spawn(attempt.cmd, [...attempt.prefix, script, ...args], {
        cwd: workspace,
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUNBUFFERED: "1" },
      });
      return child;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastError || new Error("Python não encontrado");
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

    const workspace = resolveWorkspaceRoot();
    const inbox = path.join(workspace, "resultados", "inbox_upload", competencia);
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
      const dest = path.join(inbox, `${Date.now()}_${i}_${safe}`);
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
      "--competencia",
      competencia,
      "--files",
      ...savedPaths,
      "--tipos",
      ...tiposRaw,
    ];

    const child = spawnPython(workspace, pyArgs);
    const encoder = new TextEncoder();
    let settled = false;

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
              try {
                const parsed = JSON.parse(line) as { code?: string };
                if (parsed.code === "LOCKED") {
                  controller.enqueue(encoder.encode(`${line}\n`));
                } else {
                  controller.enqueue(encoder.encode(`${line}\n`));
                }
              } catch {
                controller.enqueue(encoder.encode(`${line}\n`));
              }
            }
            nl = buffer.indexOf("\n");
          }
        });

        child.stderr.on("data", (chunk: Buffer) => {
          // stderr não vai para o cliente; opcionalmente poderia logar
          void chunk;
        });

        child.on("close", () => {
          clearTimeout(timer);
          if (settled) return;
          settled = true;
          const rest = buffer.trim();
          if (rest) {
            try {
              controller.enqueue(encoder.encode(`${rest}\n`));
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
