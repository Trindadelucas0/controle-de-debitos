import { existsSync } from "fs";
import path from "path";
import { spawn, type ChildProcessWithoutNullStreams } from "child_process";

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

export function spawnPythonScript(
  workspace: string,
  scriptName: string,
  args: string[],
): ChildProcessWithoutNullStreams {
  const script = path.join(workspace, "scripts", scriptName);
  if (!existsSync(script)) {
    throw new Error(`Script não encontrado: ${script}`);
  }
  const attempts: { cmd: string; prefix: string[] }[] = [
    { cmd: "py", prefix: ["-3.14"] },
    { cmd: "py", prefix: ["-3"] },
    { cmd: "python", prefix: [] },
  ];
  let lastError: Error | null = null;
  for (const attempt of attempts) {
    try {
      return spawn(attempt.cmd, [...attempt.prefix, script, ...args], {
        cwd: workspace,
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUNBUFFERED: "1" },
      });
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastError || new Error("Python não encontrado");
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
      reject(err);
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
