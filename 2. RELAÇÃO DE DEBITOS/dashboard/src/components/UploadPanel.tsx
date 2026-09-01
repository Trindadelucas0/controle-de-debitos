"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  CheckCircle2,
  Eraser,
  FileUp,
  Landmark,
  MapPin,
  Trash2,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, type DragEvent } from "react";
import { PageHeader } from "@/components/PageHeader";
import { BlockingOverlay } from "@/components/BlockingOverlay";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatCompetencia } from "@/lib/competencia";
import { toRelativePdfDestino } from "@/lib/delete-destino";
import { formatBRL, formatTituloPendencia } from "@/lib/format";
import { cn } from "@/lib/utils";

type DocTipo = "ECAC" | "AGENCIANET" | "MUNICIPAL";
type Phase = "idle" | "previewing" | "review" | "committing" | "done";

type ZoneFile = {
  id: string;
  file: File;
  tipo: DocTipo;
  status: "ready" | "queued" | "uploading" | "ok" | "error";
  result?: IngestItem;
  error?: string;
  selected?: boolean;
};

type IngestItem = {
  ok?: boolean;
  arquivo?: string;
  arquivo_final?: string;
  tipo?: string;
  esfera?: string;
  classe?: string;
  empresa?: string | null;
  cnpj?: string | null;
  destino?: string | null;
  empresa_id?: string | null;
  qtd_debitos?: number;
  titulos?: string[];
  totais?: { saldo?: number; consolidado?: number };
  avisos?: string[];
  erro?: string | null;
  layout_municipal?: string | null;
  competencia?: string;
  competencia_selecionada?: string;
  index?: number;
  duplicado?: boolean;
  inbox_path?: string | null;
  inbox_rel?: string | null;
  dry_run?: boolean;
};

type StreamEvent = {
  event?: string;
  index?: number;
  total?: number;
  arquivo?: string;
  tipo?: string;
  ok?: boolean;
  code?: string;
  erro?: string | null;
  competencia?: string;
  aviso_global?: string | null;
  itens?: IngestItem[];
  dry_run?: boolean;
  fase?: string;
  nome?: string;
} & IngestItem;

type Props = {
  competencias: string[];
  competenciaInicial: string;
};

const ZONES: {
  tipo: DocTipo;
  title: string;
  subtitle: string;
  accent: string;
  icon: LucideIcon;
  iconTone: string;
}[] = [
  {
    tipo: "ECAC",
    title: "Receita Federal (ECAC)",
    subtitle: "Esfera Federal · identifica empresa sozinho",
    accent: "border-blue-200 bg-blue-50/40",
    icon: Landmark,
    iconTone: "bg-blue-600 text-white",
  },
  {
    tipo: "AGENCIANET",
    title: "Agenci@Net (SEFAZ)",
    subtitle: "Esfera Estadual · identifica empresa sozinho",
    accent: "border-teal-200 bg-teal-50/40",
    icon: Building2,
    iconTone: "bg-teal-600 text-white",
  },
  {
    tipo: "MUNICIPAL",
    title: "Prefeitura (Municipal)",
    subtitle: "Esfera Municipal · identifica empresa sozinho",
    accent: "border-orange-200 bg-orange-50/40",
    icon: MapPin,
    iconTone: "bg-orange-600 text-white",
  },
];

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function hasRealExtract(item?: IngestItem): boolean {
  if (!item?.ok) return false;
  const qtd = item.qtd_debitos ?? 0;
  if (qtd > 0) return true;
  return item.classe === "SEM_PENDENCIA";
}

function esferaUiLabel(item?: IngestItem): string {
  const tipo = (item?.tipo || "").toUpperCase();
  if (tipo === "AGENCIANET") return "Estadual";
  if (tipo === "ECAC") return "Federal";
  if (tipo === "MUNICIPAL") return "Municipal";
  const esfera = (item?.esfera || "").toLowerCase();
  if (esfera === "estadual") return "Estadual";
  if (esfera === "federal") return "Federal";
  if (esfera === "municipal") return "Municipal";
  return "painel";
}

function isSameHashAviso(avisos?: string[]): boolean {
  return (avisos || []).some((a) => /já importado \(mesmo hash\)/i.test(a));
}

/** Referência estável para reabrir o PDF no inbox na confirmação. */
function inboxRefForCommit(item?: IngestItem): string | null {
  if (!item) return null;
  const rel = (item.inbox_rel || "").trim();
  if (rel) return rel;
  const abs = (item.inbox_path || "").trim();
  return abs || null;
}

async function readNdjsonStream(
  res: Response,
  onEvent: (ev: StreamEvent) => void,
): Promise<StreamEvent | null> {
  if (!res.body) throw new Error("Resposta sem stream do servidor");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalDone: StreamEvent | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl = buffer.indexOf("\n");
    while (nl >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) {
        try {
          const ev = JSON.parse(line) as StreamEvent;
          onEvent(ev);
          if (ev.event === "done") finalDone = ev;
        } catch {
          /* linha inválida */
        }
      }
      nl = buffer.indexOf("\n");
    }
  }

  if (buffer.trim()) {
    try {
      const ev = JSON.parse(buffer.trim()) as StreamEvent;
      onEvent(ev);
      if (ev.event === "done") finalDone = ev;
    } catch {
      /* ignore */
    }
  }
  return finalDone;
}

export function UploadPanel({ competencias, competenciaInicial }: Props) {
  const router = useRouter();
  const [competencia, setCompetencia] = useState(competenciaInicial || competencias[0] || "");
  const [novaMes, setNovaMes] = useState("");
  const [novaAno, setNovaAno] = useState("");
  const [criarNova, setCriarNova] = useState(false);
  const [files, setFiles] = useState<ZoneFile[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [rebuildProgress, setRebuildProgress] = useState<{
    current: number;
    total: number;
    nome?: string;
  } | null>(null);
  const [dragOver, setDragOver] = useState<DocTipo | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [donePayload, setDonePayload] = useState<{
    ok?: boolean;
    competencia?: string;
    aviso_global?: string | null;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);

  const competenciaEfetiva = useMemo(() => {
    if (criarNova && novaMes && novaAno) {
      return `${novaMes.padStart(2, "0")}-${novaAno}`;
    }
    return competencia;
  }, [criarNova, novaMes, novaAno, competencia]);

  const busy = phase === "previewing" || phase === "committing" || deleting;
  const okCount = files.filter((f) => f.status === "ok").length;
  const errorCount = files.filter((f) => f.status === "error").length;
  const selectedForCommit = files.filter((f) => {
    const r = f.result;
    if (!r) return false;
    return (
      f.selected &&
      f.status === "ok" &&
      hasRealExtract(r) &&
      Boolean(inboxRefForCommit(r))
    );
  });

  const importadosOk = useMemo(
    () =>
      files.filter(
        (f) =>
          phase === "done" &&
          f.status === "ok" &&
          Boolean(f.result?.destino || f.result?.arquivo_final) &&
          !deletedIds.includes(f.id),
      ),
    [files, deletedIds, phase],
  );

  useEffect(() => {
    if (!busy) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [busy]);

  const addFiles = (tipo: DocTipo, list: FileList | File[] | null) => {
    if (!list || busy || phase === "review") return;
    const arr = Array.from(list instanceof FileList ? list : list);
    const next: ZoneFile[] = [];
    for (const file of arr) {
      if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") continue;
      next.push({ id: makeId(), file, tipo, status: "ready", selected: true });
    }
    if (next.length === 0) return;
    setFiles((prev) => [...prev, ...next]);
    setDonePayload(null);
    setGlobalError(null);
    setDeletedIds([]);
    setPhase("idle");
  };

  const removeFile = (id: string) => {
    if (busy) return;
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const onDropZone = (tipo: DocTipo, event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(null);
    if (busy || phase === "review") return;
    addFiles(tipo, event.dataTransfer.files);
  };

  const applyItemResult = (index: number, item: IngestItem, selectDefault = true) => {
    setFiles((prev) =>
      prev.map((f, idx) => {
        if (idx !== index) return f;
        const duplicado = Boolean(item.duplicado) || isSameHashAviso(item.avisos);
        return {
          ...f,
          status: item.ok ? "ok" : "error",
          result: { ...item, duplicado },
          error: item.erro || undefined,
          selected: selectDefault
            ? Boolean(item.ok && hasRealExtract({ ...item, duplicado }))
            : f.selected,
        };
      }),
    );
  };

  const limparInbox = async (paths: string[]) => {
    if (paths.length === 0) return;
    try {
      await fetch("/api/ingest", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competencia: competenciaEfetiva, paths }),
      });
    } catch {
      /* ignore */
    }
  };

  const cancelarRevisao = async () => {
    const paths = files
      .map((f) => f.result?.inbox_path)
      .filter((p): p is string => Boolean(p));
    await limparInbox(paths);
    setFiles((prev) =>
      prev.map((f) => ({
        ...f,
        status: "ready",
        result: undefined,
        error: undefined,
        selected: true,
      })),
    );
    setPhase("idle");
    setProgress(null);
    setGlobalError(null);
    setDonePayload(null);
  };

  const excluirImportados = async (targets: ZoneFile[]) => {
    if (deleting || targets.length === 0) return;
    const label =
      targets.length === 1
        ? targets[0].result?.arquivo_final || targets[0].file.name
        : `${targets.length} PDFs importados`;
    const confirmado = window.confirm(
      `Excluir ${label}?\n\nOs arquivos saem da pasta da competência e o painel é regenerado.`,
    );
    if (!confirmado) return;

    setDeleting(true);
    setGlobalError(null);
    try {
      const byComp = new Map<
        string,
        { ids: string[]; itens: { destino?: string; empresaId?: string; arquivo?: string }[] }
      >();
      for (const f of targets) {
        const comp = f.result?.competencia || competenciaEfetiva;
        const destino = f.result?.destino;
        if (!comp) continue;
        const normalized = destino ? toRelativePdfDestino(destino) : null;
        const arquivo = f.result?.arquivo_final || f.result?.arquivo || undefined;
        const empresaId = f.result?.empresa_id || undefined;
        if (!normalized && !(empresaId && arquivo)) continue;
        const bucket = byComp.get(comp) || { ids: [], itens: [] };
        bucket.ids.push(f.id);
        bucket.itens.push({
          destino: normalized || undefined,
          empresaId,
          arquivo,
        });
        byComp.set(comp, bucket);
      }

      if (byComp.size === 0) {
        setGlobalError("Nenhum destino válido para exclusão.");
        return;
      }

      const removedIds: string[] = [];
      for (const [comp, bucket] of byComp) {
        const res = await fetch("/api/delete-imported", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            competencia: comp,
            itens: bucket.itens,
          }),
        });
        const payload = await res.json().catch(() => ({}));
        if (res.status === 409) {
          setGlobalError(
            payload?.erro ||
              "Outra importação/exclusão ainda está em andamento. Aguarde e tente de novo.",
          );
          return;
        }
        const removed =
          Boolean(payload?.ok) ||
          Number(payload?.excluidos || 0) > 0 ||
          payload?.code === "REBUILD_FAILED";
        if (!removed) {
          setGlobalError(payload?.erro || "Falha ao excluir o que foi importado");
          return;
        }
        if (payload?.code === "REBUILD_FAILED" || payload?.aviso_global) {
          setGlobalError(
            payload?.aviso_global ||
              "Arquivo(s) removido(s), mas o painel pode estar desatualizado.",
          );
        }
        removedIds.push(...bucket.ids);
      }

      setDeletedIds((prev) => [...prev, ...removedIds]);
      setDonePayload((prev) =>
        prev
          ? { ...prev, aviso_global: `Excluído(s) ${removedIds.length} arquivo(s) importado(s).` }
          : {
              ok: true,
              competencia: competenciaEfetiva,
              aviso_global: `Excluído(s) ${removedIds.length} arquivo(s) importado(s).`,
            },
      );
      router.refresh();
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : "Erro de rede na exclusão");
    } finally {
      setDeleting(false);
    }
  };

  const onAnalisar = async () => {
    if (busy || files.length === 0) return;
    if (!/^(0[1-9]|1[0-2])-\d{4}$/.test(competenciaEfetiva)) {
      setGlobalError("Informe uma competência válida (MM-YYYY).");
      return;
    }
    setPhase("previewing");
    setGlobalError(null);
    setDonePayload(null);
    setProgress({ current: 0, total: files.length });
    setFiles((prev) =>
      prev.map((f) => ({
        ...f,
        status: "queued",
        error: undefined,
        result: undefined,
        selected: true,
      })),
    );

    try {
      const body = new FormData();
      body.set("competencia", competenciaEfetiva);
      body.set("mode", "preview");
      for (const item of files) {
        body.append("files", item.file, item.file.name);
        body.append("tipos", item.tipo);
      }

      const res = await fetch("/api/ingest", { method: "POST", body });
      const contentType = res.headers.get("content-type") || "";

      if (res.status === 409) {
        const payload = await res.json().catch(() => ({}));
        setGlobalError(payload?.erro || "Outra importação está em andamento.");
        setFiles((prev) => prev.map((f) => ({ ...f, status: "ready" })));
        setPhase("idle");
        return;
      }

      if (!res.ok && !contentType.includes("ndjson")) {
        const payload = await res.json().catch(() => ({}));
        setGlobalError(payload?.erro || "Falha na análise");
        setFiles((prev) => prev.map((f) => ({ ...f, status: "error", error: payload?.erro })));
        setPhase("idle");
        return;
      }

      const finalDone = await readNdjsonStream(res, (ev) => {
        if (ev.code === "LOCKED") {
          setGlobalError(ev.erro || "Outra importação em andamento");
          setFiles((prev) => prev.map((f) => ({ ...f, status: "ready" })));
        } else if (ev.event === "start") {
          setProgress({ current: 0, total: ev.total || files.length });
        } else if (ev.event === "progress" && typeof ev.index === "number") {
          setProgress({ current: ev.index + 1, total: ev.total || files.length });
          setFiles((prev) =>
            prev.map((f, idx) => (idx === ev.index ? { ...f, status: "uploading" } : f)),
          );
        } else if (
          (ev.event === "item" || ev.event === "item_final") &&
          typeof ev.index === "number"
        ) {
          applyItemResult(ev.index, ev, true);
          if (ev.event === "item") {
            setProgress({
              current: Math.min((ev.index ?? 0) + 1, ev.total || files.length),
              total: ev.total || files.length,
            });
          }
        } else if (ev.event === "done" && Array.isArray(ev.itens)) {
          ev.itens.forEach((item, idx) => applyItemResult(idx, item, true));
        }
      });

      if (!finalDone) {
        setGlobalError("A extração não terminou. O carregamento não pode ser concluído.");
        setFiles((prev) =>
          prev.map((f) => ({
            ...f,
            status: f.status === "ok" ? f.status : "error",
            error: f.error || "Extração incompleta",
          })),
        );
        setPhase("idle");
        return;
      }
      if (finalDone.erro && !finalDone.ok) {
        setGlobalError(finalDone.erro);
        setPhase("idle");
        return;
      }
      setPhase("review");
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : "Erro de rede");
      setPhase("idle");
    } finally {
      setProgress(null);
    }
  };

  const onConfirmar = async () => {
    if (busy || selectedForCommit.length === 0) return;
    setPhase("committing");
    setGlobalError(null);
    setRebuildProgress(null);
    setProgress({ current: 0, total: selectedForCommit.length });

    // Marca os confirmados como queued; o restante permanece na revisão
    setFiles((prev) =>
      prev.map((f) => {
        if (selectedForCommit.some((s) => s.id === f.id)) {
          return { ...f, status: "queued" };
        }
        return f;
      }),
    );

    try {
      const body = new FormData();
      body.set("competencia", competenciaEfetiva);
      body.set("mode", "commit");
      for (const item of selectedForCommit) {
        const ref = inboxRefForCommit(item.result);
        if (!ref) continue;
        body.append("paths", ref);
        body.append("tipos", (item.result?.tipo as DocTipo) || item.tipo);
      }

      const indexMap = new Map(selectedForCommit.map((f, i) => [i, f.id]));

      const res = await fetch("/api/ingest", { method: "POST", body });
      const contentType = res.headers.get("content-type") || "";

      if (res.status === 409) {
        const payload = await res.json().catch(() => ({}));
        setGlobalError(payload?.erro || "Outra importação está em andamento.");
        setPhase("review");
        return;
      }

      if (!res.ok && !contentType.includes("ndjson")) {
        const payload = await res.json().catch(() => ({}));
        setGlobalError(payload?.erro || "Falha na importação");
        setFiles((prev) =>
          prev.map((f) =>
            f.status === "queued" && selectedForCommit.some((s) => s.id === f.id)
              ? { ...f, status: "ok" }
              : f,
          ),
        );
        setPhase("review");
        return;
      }

      const applyByCommitIndex = (commitIndex: number, item: IngestItem) => {
        const fileId = indexMap.get(commitIndex);
        if (!fileId) return;
        setFiles((prev) =>
          prev.map((f) => {
            if (f.id !== fileId) return f;
            return {
              ...f,
              status: item.ok ? "ok" : "error",
              result: { ...f.result, ...item, duplicado: Boolean(item.duplicado) },
              error: item.erro || undefined,
            };
          }),
        );
      };

      const finalDone = await readNdjsonStream(res, (ev) => {
        if (ev.code === "LOCKED") {
          setGlobalError(ev.erro || "Outra importação em andamento");
        } else if (ev.event === "start") {
          setProgress({ current: 0, total: ev.total || selectedForCommit.length });
        } else if (ev.event === "progress" && typeof ev.index === "number") {
          setProgress({
            current: ev.index + 1,
            total: ev.total || selectedForCommit.length,
          });
          const fileId = indexMap.get(ev.index);
          if (fileId) {
            setFiles((prev) =>
              prev.map((f) => (f.id === fileId ? { ...f, status: "uploading" } : f)),
            );
          }
        } else if (
          (ev.event === "item" || ev.event === "item_final") &&
          typeof ev.index === "number"
        ) {
          applyByCommitIndex(ev.index, ev);
        } else if (ev.event === "done" && Array.isArray(ev.itens)) {
          ev.itens.forEach((item, idx) => applyByCommitIndex(idx, item));
        } else if (ev.event === "rebuild") {
          setRebuildProgress({
            current: (ev.index ?? 0) + 1,
            total: ev.total || 1,
            nome: ev.nome,
          });
        }
      });

      if (!finalDone) {
        setGlobalError(
          "A gravação pode ter terminado, mas o painel não confirmou. Atualize a página e confira a competência.",
        );
        setPhase("review");
        return;
      }

      const selectedIds = new Set(selectedForCommit.map((s) => s.id));
      const leftoverUnselected = files
        .filter((f) => !selectedIds.has(f.id) && f.result?.inbox_path)
        .map((f) => f.result!.inbox_path!);
      const committedInbox = (finalDone.itens || [])
        .filter((item) => item.ok && item.inbox_path)
        .map((item) => item.inbox_path as string);
      await limparInbox([...leftoverUnselected, ...committedInbox]);

      setDonePayload({
        ok: Boolean(finalDone.ok),
        competencia: finalDone.competencia || competenciaEfetiva,
        aviso_global: finalDone.aviso_global,
      });
      if (finalDone.erro && !finalDone.ok) {
        setGlobalError(finalDone.erro);
      }
      setPhase("done");
      router.refresh();
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : "Erro de rede");
      setPhase("review");
    } finally {
      setProgress(null);
      setRebuildProgress(null);
    }
  };

  const overlayProgress = rebuildProgress ?? progress;
  const overlayTitle = rebuildProgress
    ? `Atualizando o painel (${rebuildProgress.current}/${rebuildProgress.total})`
    : phase === "previewing"
      ? "Analisando PDFs…"
      : phase === "committing"
        ? "Importando PDFs…"
        : deleting
          ? "Excluindo PDF…"
          : "";
  const overlayDesc = rebuildProgress
    ? `Só a empresa ${rebuildProgress.nome || "do lote"} está sendo relida. As demais não entram nesta atualização.`
    : phase === "previewing"
      ? "Extraindo lançamentos de verdade. A tela só libera quando cada PDF terminar."
      : phase === "committing"
        ? "Gravando arquivos. Em seguida o painel atualiza só a empresa do lote."
        : "Aguarde a exclusão terminar. Não feche a página nem clique em outra ação.";

  return (
    <div className="space-y-6 px-4 py-5 lg:px-6">
      <BlockingOverlay
        open={busy}
        title={overlayTitle}
        description={overlayDesc}
        progress={overlayProgress}
      />
      <div>
        {busy ? (
          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <ArrowLeft className="size-3.5" aria-hidden />
            Aguarde o fim da operação para voltar
          </span>
        ) : (
          <Link
            href={competenciaEfetiva ? `/?competencia=${competenciaEfetiva}` : "/"}
            className="inline-flex items-center gap-1.5 text-sm text-primary underline-offset-2 hover:underline"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            Voltar ao painel
          </Link>
        )}
        <div className="mt-3">
          <PageHeader icon={FileUp} title="IMPORTAR RELATORIOS" />
        </div>
      </div>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="size-4 text-primary" aria-hidden />
            Competência
          </CardTitle>
          <CardDescription>Obrigatório — define a pasta MM-YYYY do arquivo</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <label className="grid gap-1 text-xs font-medium">
            <span className="flex items-center gap-2">
              Competência existente
              <input
                type="checkbox"
                className="size-3.5"
                checked={!criarNova}
                disabled={busy || phase === "review"}
                onChange={() => setCriarNova(false)}
              />
            </span>
            <select
              className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
              value={competencia}
              disabled={criarNova || busy || phase === "review"}
              onChange={(e) => setCompetencia(e.target.value)}
            >
              {competencias.map((c) => (
                <option key={c} value={c}>
                  {formatCompetencia(c)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-medium">
            <span className="flex items-center gap-2">
              Nova competência
              <input
                type="checkbox"
                className="size-3.5"
                checked={criarNova}
                disabled={busy || phase === "review"}
                onChange={() => setCriarNova(true)}
              />
            </span>
            <div className="flex gap-2">
              <Input
                className="w-16"
                placeholder="MM"
                maxLength={2}
                value={novaMes}
                disabled={!criarNova || busy || phase === "review"}
                onChange={(e) => setNovaMes(e.target.value.replace(/\D/g, "").slice(0, 2))}
              />
              <Input
                className="w-20"
                placeholder="YYYY"
                maxLength={4}
                value={novaAno}
                disabled={!criarNova || busy || phase === "review"}
                onChange={(e) => setNovaAno(e.target.value.replace(/\D/g, "").slice(0, 4))}
              />
            </div>
          </label>
          <p className="text-sm text-muted-foreground">
            Efetiva: <span className="font-medium text-foreground">{competenciaEfetiva || "—"}</span>
          </p>
        </CardContent>
      </Card>

      {phase !== "review" && phase !== "done" ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {ZONES.map((zone) => {
            const ZoneIcon = zone.icon;
            const zoneFiles = files.filter((f) => f.tipo === zone.tipo);
            return (
              <Card
                key={zone.tipo}
                className={cn(
                  "border-dashed shadow-none transition-colors",
                  zone.accent,
                  dragOver === zone.tipo && "ring-2 ring-primary",
                )}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!busy) setDragOver(zone.tipo);
                }}
                onDragLeave={() => setDragOver(null)}
                onDrop={(e) => onDropZone(zone.tipo, e)}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <span className={cn("inline-flex size-7 items-center justify-center rounded-md", zone.iconTone)}>
                      <ZoneIcon className="size-4" aria-hidden />
                    </span>
                    {zone.title}
                  </CardTitle>
                  <CardDescription>{zone.subtitle}</CardDescription>
                </CardHeader>
                <CardContent>
                  <label
                    className={cn(
                      "flex cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-slate-300 bg-white/70 px-3 py-6 text-center text-sm",
                      busy && "pointer-events-none opacity-60",
                    )}
                  >
                    <Upload className="mb-2 size-8 text-slate-400" aria-hidden />
                    <span className="font-medium text-slate-800">Arraste vários PDFs aqui</span>
                    <span className="mt-1 text-xs text-muted-foreground">ou clique para escolher</span>
                    <input
                      type="file"
                      className="sr-only"
                      accept="application/pdf,.pdf"
                      multiple
                      disabled={busy}
                      onChange={(e) => {
                        addFiles(zone.tipo, e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <ul className="mt-3 max-h-40 space-y-1 overflow-auto text-xs">
                    {zoneFiles.map((f) => (
                      <li
                        key={f.id}
                        className="flex items-center justify-between gap-2 rounded bg-white/80 px-2 py-1"
                      >
                        <span className="truncate">{f.file.name}</span>
                        <button
                          type="button"
                          className="shrink-0 text-red-600 hover:underline"
                          disabled={busy}
                          onClick={() => removeFile(f.id)}
                        >
                          remover
                        </button>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        {phase === "idle" || phase === "previewing" ? (
          <Button type="button" disabled={busy || files.length === 0} onClick={() => void onAnalisar()}>
            <Upload className="size-4" aria-hidden />
            {phase === "previewing"
              ? progress
                ? `Analisando ${progress.current}/${progress.total}…`
                : "Analisando…"
              : `Analisar ${files.length || ""} PDF(s)`}
          </Button>
        ) : null}

        {phase === "review" ? (
          <>
            <Button
              type="button"
              disabled={busy || selectedForCommit.length === 0}
              onClick={() => void onConfirmar()}
            >
              <CheckCircle2 className="size-4" aria-hidden />
              {selectedForCommit.length === 0
                ? "Nada para gravar"
                : `Confirmar e gravar no painel (${selectedForCommit.length})`}
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => void cancelarRevisao()}>
              Cancelar revisão
            </Button>
          </>
        ) : null}

        {(phase === "idle" || phase === "done") && files.length > 0 && !busy ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setFiles([]);
              setPhase("idle");
              setDonePayload(null);
              setGlobalError(null);
              setDeletedIds([]);
            }}
          >
            <Eraser className="size-4" aria-hidden />
            Limpar lista
          </Button>
        ) : null}

        {importadosOk.length > 0 && phase === "done" && !busy ? (
          <Button
            type="button"
            variant="destructive"
            disabled={deleting}
            onClick={() => void excluirImportados(importadosOk)}
          >
            <Trash2 className="size-4" aria-hidden />
            {deleting ? "Excluindo…" : `Excluir o que foi importado (${importadosOk.length})`}
          </Button>
        ) : null}

        {donePayload?.competencia && phase === "done" && !busy ? (
          <Link
            href={`/?competencia=${donePayload.competencia}`}
            className="text-sm font-medium text-primary underline-offset-2 hover:underline"
          >
            Ver painel · {formatCompetencia(donePayload.competencia)}
          </Link>
        ) : null}
      </div>

      {phase === "review" ? (
        selectedForCommit.length === 0 ? (
          <p
            role="status"
            className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950"
          >
            A extração terminou, mas nada será gravado: os PDFs vieram com erro
            ou sem extração válida. Corrija o arquivo e analise de novo. PDFs já
            existentes na pasta podem ser marcados e confirmados para atualizar o painel.
          </p>
        ) : (
          <p className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950">
            Extração ok. Os dados ainda <strong>não</strong> estão no painel. Marque o que quiser e
            clique em <strong>Confirmar e gravar no painel</strong>.
          </p>
        )
      ) : null}

      {globalError && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {globalError}
        </p>
      )}
      {donePayload && phase === "done" && !busy && !globalError && (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "rounded-md border px-4 py-3 text-sm",
            donePayload.ok && errorCount === 0
              ? "border-emerald-300 bg-emerald-50 text-emerald-950"
              : donePayload.ok
                ? "border-amber-300 bg-amber-50 text-amber-950"
                : "border-red-200 bg-red-50 text-red-900",
          )}
        >
          <p className="text-base font-semibold tracking-tight">
            {donePayload.ok && errorCount === 0
              ? "OK — Importação concluída"
              : donePayload.ok
                ? "Importação concluída com pendências"
                : "Importação finalizada com erro"}
          </p>
          <p className="mt-1">
            {okCount} OK
            {errorCount > 0 ? ` · ${errorCount} com erro` : ""}
            {donePayload.competencia
              ? ` · competência ${formatCompetencia(donePayload.competencia)}`
              : ""}
          </p>
        </div>
      )}
      {donePayload?.aviso_global && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {donePayload.aviso_global}
        </p>
      )}

      {files.length > 0 && (phase === "review" || phase === "done" || phase === "committing") && (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base">
              {phase === "review" ? "Revisão antes de gravar" : "Resultado da importação"}
            </CardTitle>
            <CardDescription>
              Só confirme PDFs com extração válida (débitos ou certidão sem pendência).
              Se aparecer Duplicado, o arquivo já está na pasta: marque e confirme para
              atualizar o painel.
            </CardDescription>
          </CardHeader>
          <div className="overflow-auto">
            <table className="w-full min-w-[960px] border-collapse text-left text-sm">
              <thead className="border-b bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  {phase === "review" ? <th className="px-3 py-2">Incluir</th> : null}
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Arquivo</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Competência</th>
                  <th className="px-3 py-2">Empresa</th>
                  <th className="px-3 py-2">Destino</th>
                  <th className="px-3 py-2">Lanç.</th>
                  <th className="px-3 py-2">Seções</th>
                  <th className="px-3 py-2">Saldo</th>
                  <th className="px-3 py-2">Status</th>
                  {phase === "done" ? <th className="px-3 py-2">Ações</th> : null}
                </tr>
              </thead>
              <tbody>
                {files.map((f, idx) => {
                  const r = f.result;
                  const duplicadoPreview =
                    Boolean(r?.duplicado) || isSameHashAviso(r?.avisos);
                  const duplicado = phase === "done" ? Boolean(r?.duplicado) : duplicadoPreview;
                  const wasDeleted = deletedIds.includes(f.id);
                  const canSelect =
                    phase === "review" &&
                    f.status === "ok" &&
                    Boolean(inboxRefForCommit(r)) &&
                    hasRealExtract(r);
                  return (
                    <tr
                      key={f.id}
                      className={cn(
                        "border-b border-border/70",
                        f.status === "uploading" && "bg-sky-50/80",
                        duplicado && "bg-amber-50/70",
                        wasDeleted && "bg-slate-50 opacity-60",
                      )}
                    >
                      {phase === "review" ? (
                        <td className="px-3 py-2 align-top">
                          <input
                            type="checkbox"
                            className="size-4"
                            checked={Boolean(f.selected) && canSelect}
                            disabled={!canSelect || busy}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setFiles((prev) =>
                                prev.map((row) =>
                                  row.id === f.id ? { ...row, selected: checked } : row,
                                ),
                              );
                            }}
                            aria-label={`Incluir ${f.file.name}`}
                          />
                        </td>
                      ) : null}
                      <td className="px-3 py-2 tabular text-muted-foreground">{idx + 1}</td>
                      <td className="px-3 py-2 align-top">
                        <div className="font-medium">{r?.arquivo_final || f.file.name}</div>
                        {r?.avisos?.length ? (
                          <div className="mt-1 text-[11px] text-muted-foreground">
                            {r.avisos.slice(0, 4).join(" · ")}
                          </div>
                        ) : null}
                        {f.error ? (
                          <div className="mt-1 text-[11px] text-red-600">{f.error}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <Badge variant="outline">{r?.tipo || f.tipo}</Badge>
                        <div className="mt-1 text-[11px] text-muted-foreground">{r?.esfera}</div>
                      </td>
                      <td className="px-3 py-2 align-top text-xs">
                        {r?.competencia ? formatCompetencia(r.competencia) : "—"}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <span>{r?.empresa || "—"}</span>
                        <div className="tabular text-[11px] text-muted-foreground">{r?.cnpj || ""}</div>
                      </td>
                      <td className="px-3 py-2 align-top text-xs">{r?.destino || "—"}</td>
                      <td className="px-3 py-2 align-top tabular">{r?.qtd_debitos ?? "—"}</td>
                      <td className="px-3 py-2 align-top text-[11px] text-muted-foreground">
                        {r?.titulos?.length
                          ? r.titulos.map((titulo) => formatTituloPendencia(titulo)).join(" · ")
                          : r?.classe === "SEM_PENDENCIA"
                            ? "Sem pendência"
                            : "—"}
                      </td>
                      <td className="px-3 py-2 align-top tabular">
                        {r?.totais?.saldo != null ? formatBRL(r.totais.saldo) : "—"}
                      </td>
                      <td className="px-3 py-2 align-top">
                        {wasDeleted ? (
                          <Badge variant="outline">Excluído</Badge>
                        ) : duplicado ? (
                          <div className="space-y-1">
                            <Badge variant="outline">Duplicado</Badge>
                            <div className="text-[11px] text-amber-900">
                              Já importado — marque e confirme para atualizar o{" "}
                              {esferaUiLabel(r)}.
                            </div>
                          </div>
                        ) : f.status === "ok" ? (
                          r?.classe === "REVISAR" ||
                          (r?.destino || "").toLowerCase().includes("revisar") ? (
                            <Badge variant="outline">Revisar</Badge>
                          ) : (
                            <Badge variant="success">{r?.classe || "OK"}</Badge>
                          )
                        ) : f.status === "error" ? (
                          <Badge variant="danger">Erro</Badge>
                        ) : f.status === "uploading" ? (
                          <Badge variant="federal">Extraindo</Badge>
                        ) : f.status === "queued" ? (
                          <Badge variant="outline">Na fila</Badge>
                        ) : (
                          <Badge variant="outline">Pronto</Badge>
                        )}
                      </td>
                      {phase === "done" ? (
                        <td className="px-3 py-2 align-top">
                          {f.status === "ok" &&
                          r?.destino &&
                          !wasDeleted ? (
                            <button
                              type="button"
                              className="text-xs font-medium text-red-700 hover:underline disabled:opacity-50"
                              disabled={deleting || busy}
                              onClick={() => void excluirImportados([f])}
                            >
                              Excluir
                            </button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
