import { existsSync } from "fs";
import path from "path";
import {
  execFileSync,
  spawn,
  type ChildProcessWithoutNullStreams,
} from "child_process";

export function resolveWorkspaceRoot(): string {
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

type PythonCmd = { cmd: string; prefix: string[] };

let cachedPython: PythonCmd | null = null;

function probePython(cmd: string, probeArgs: string[]): boolean {
  try {
    execFileSync(cmd, probeArgs, {
      stdio: "ignore",
      windowsHide: true,
      timeout: 8000,
      env: process.env,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Descobre um interpretador Python usable.
 * `spawn` não falha de forma síncrona no Windows (ENOENT vem no event `error`),
 * então é preciso probear antes — senão o primeiro `py` quebra e nunca cai no fallback.
 */
export function resolvePythonCommand(): PythonCmd {
  if (cachedPython) return cachedPython;

  const fromEnv = (process.env.PYTHON_PATH || process.env.PYTHON || "").trim();
  if (fromEnv && (existsSync(fromEnv) || probePython(fromEnv, ["-c", "print(1)"]))) {
    cachedPython = { cmd: fromEnv, prefix: [] };
    return cachedPython;
  }

  const pdfProbe =
    "import importlib.util as u; assert u.find_spec('pypdf') or u.find_spec('fitz')";
  const attempts: { cmd: string; prefix: string[]; probe: string[] }[] =
    process.platform === "win32"
      ? [
          { cmd: "py", prefix: ["-3.14"], probe: ["-3.14", "-c", pdfProbe] },
          { cmd: "py", prefix: ["-3"], probe: ["-3", "-c", pdfProbe] },
          { cmd: "python", prefix: [], probe: ["-c", pdfProbe] },
          { cmd: "python3", prefix: [], probe: ["-c", pdfProbe] },
          { cmd: "py", prefix: ["-3.14"], probe: ["-3.14", "-c", "print(1)"] },
          { cmd: "py", prefix: ["-3"], probe: ["-3", "-c", "print(1)"] },
          { cmd: "python", prefix: [], probe: ["-c", "print(1)"] },
        ]
      : [
          { cmd: "python3", prefix: [], probe: ["-c", pdfProbe] },
          { cmd: "python", prefix: [], probe: ["-c", pdfProbe] },
          { cmd: "py", prefix: ["-3"], probe: ["-3", "-c", pdfProbe] },
          { cmd: "python3", prefix: [], probe: ["-c", "print(1)"] },
          { cmd: "python", prefix: [], probe: ["-c", "print(1)"] },
        ];

  for (const attempt of attempts) {
    if (probePython(attempt.cmd, attempt.probe)) {
      cachedPython = { cmd: attempt.cmd, prefix: attempt.prefix };
      return cachedPython;
    }
  }

  throw new Error(
    "Python 3 não encontrado no PATH. Instale Python ou defina PYTHON_PATH / PYTHON.",
  );
}

/** Limpa cache (útil em testes). */
export function invalidatePythonCommandCache(): void {
  cachedPython = null;
}

export function spawnPythonScript(
  workspace: string,
  scriptName: string,
  args: string[],
): ChildProcessWithoutNullStreams {
  const script = path.join(workspace, "scripts", scriptName);
  if (!existsSync(script)) {
    throw new Error(`Script não encontrado: ${script}`);
  }
  const py = resolvePythonCommand();
  return spawn(py.cmd, [...py.prefix, script, ...args], {
    cwd: workspace,
    windowsHide: true,
    env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUNBUFFERED: "1" },
  });
}

export function runPythonJson<T = unknown>(
  workspace: string,
  scriptName: string,
  args: string[],
  timeoutMs = 10 * 60 * 1000,
): Promise<{ code: number | null; payload: T | null; stderr: string; raw: string }> {
  return new Promise((resolve, reject) => {
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawnPythonScript(workspace, scriptName, args);
    } catch (err) {
      reject(err);
      return;
    }

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error("Timeout ao executar script Python"));
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf-8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf-8");
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Se o binário sumiu depois do probe, limpa cache para a próxima tentativa.
      invalidatePythonCommandCache();
      const msg =
        err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT"
          ? `Python não encontrado (${err.message}). Defina PYTHON_PATH ou instale Python 3.`
          : err instanceof Error
            ? err.message
            : String(err);
      reject(new Error(msg));
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const lines = stdout
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      let payload: T | null = null;
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          payload = JSON.parse(lines[i]) as T;
          break;
        } catch {
          /* tenta linha anterior */
        }
      }
      resolve({ code, payload, stderr, raw: stdout });
    });
  });
}
