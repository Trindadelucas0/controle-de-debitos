"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  Eraser,
  FileUp,
  Landmark,
  MapPin,
  Trash2,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState, type DragEvent } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatCompetencia } from "@/lib/competencia";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";

type DocTipo = "ECAC" | "AGENCIANET" | "MUNICIPAL";

type ZoneFile = {
  id: string;
  file: File;
  tipo: DocTipo;
  status: "ready" | "queued" | "uploading" | "ok" | "error";
  result?: IngestItem;
  error?: string;
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
  totais?: { saldo?: number; consolidado?: number };
  avisos?: string[];
  erro?: string | null;
  layout_municipal?: string | null;
  competencia?: string;
  competencia_selecionada?: string;
  index?: number;
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

export function UploadPanel({ competencias, competenciaInicial }: Props) {
  const router = useRouter();
  const [competencia, setCompetencia] = useState(competenciaInicial || competencias[0] || "");
  const [novaMes, setNovaMes] = useState("");
  const [novaAno, setNovaAno] = useState("");
  const [criarNova, setCriarNova] = useState(false);
  const [files, setFiles] = useState<ZoneFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
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

  const doneCount = files.filter((f) => f.status === "ok" || f.status === "error").length;
  const okCount = files.filter((f) => f.status === "ok").length;
  const errorCount = files.filter((f) => f.status === "error").length;

  const importadosOk = useMemo(
    () =>
      files.filter(
        (f) =>
          f.status === "ok" &&
          Boolean(f.result?.destino || f.result?.arquivo_final) &&
          !deletedIds.includes(f.id) &&
          !(f.result?.avisos || []).some((a) => /já importado \(mesmo hash\)/i.test(a)),
      ),
    [files, deletedIds],
  );

  const addFiles = (tipo: DocTipo, list: FileList | File[] | null) => {
    if (!list) return;
    const arr = Array.from(list instanceof FileList ? list : list);
    const next: ZoneFile[] = [];
    for (const file of arr) {
      if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") continue;
      next.push({ id: makeId(), file, tipo, status: "ready" });
    }
    if (next.length === 0) return;
    setFiles((prev) => [...prev, ...next]);
    setDonePayload(null);
    setGlobalError(null);
    setDeletedIds([]);
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const onDropZone = (tipo: DocTipo, event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(null);
    if (submitting) return;
    addFiles(tipo, event.dataTransfer.files);
  };

  const applyItemResult = (index: number, item: IngestItem) => {
    setFiles((prev) =>
      prev.map((f, idx) => {
        if (idx !== index) return f;
        return {
          ...f,
          status: item.ok ? "ok" : "error",
          result: item,
          error: item.erro || undefined,
        };
      }),
    );
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
      // Agrupa por competência efetiva do item
      const byComp = new Map<string, { ids: string[]; destinos: string[] }>();
      for (const f of targets) {
        const comp = f.result?.competencia || competenciaEfetiva;
        const destino = f.result?.destino;
        if (!destino || !comp) continue;
        const bucket = byComp.get(comp) || { ids: [], destinos: [] };
        bucket.ids.push(f.id);
        bucket.destinos.push(destino);
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
            itens: bucket.destinos.map((destino) => ({ destino })),
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

  const onSubmit = async () => {
    if (submitting || files.length === 0) return;
    if (!/^(0[1-9]|1[0-2])-\d{4}$/.test(competenciaEfetiva)) {
      setGlobalError("Informe uma competência válida (MM-YYYY).");
      return;
    }
    setSubmitting(true);
    setGlobalError(null);
    setDonePayload(null);
    setProgress({ current: 0, total: files.length });
    setFiles((prev) => prev.map((f) => ({ ...f, status: "queued", error: undefined, result: undefined })));

    try {
      const body = new FormData();
      body.set("competencia", competenciaEfetiva);
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
        return;
      }

      if (!res.ok && !contentType.includes("ndjson")) {
        const payload = await res.json().catch(() => ({}));
        setGlobalError(payload?.erro || "Falha na importação");
        setFiles((prev) => prev.map((f) => ({ ...f, status: "error", error: payload?.erro })));
        return;
      }

      if (!res.body) {
        setGlobalError("Resposta sem stream do servidor");
        return;
      }

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
              if (ev.code === "LOCKED") {
                setGlobalError(ev.erro || "Outra importação em andamento");
                setFiles((prev) => prev.map((f) => ({ ...f, status: "ready" })));
                finalDone = { event: "done", ok: false, ...ev };
              } else if (ev.event === "start") {
                setProgress({ current: 0, total: ev.total || files.length });
              } else if (ev.event === "progress" && typeof ev.index === "number") {
                setProgress({ current: ev.index + 1, total: ev.total || files.length });
                setFiles((prev) =>
                  prev.map((f, idx) =>
                    idx === ev.index
                      ? { ...f, status: "uploading" }
                      : idx < (ev.index ?? 0) && f.status === "queued"
                        ? f
                        : f,
                  ),
                );
              } else if (
                (ev.event === "item" || ev.event === "item_final") &&
                typeof ev.index === "number"
              ) {
                applyItemResult(ev.index, ev);
                if (ev.event === "item") {
                  setProgress({
                    current: Math.min((ev.index ?? 0) + 1, ev.total || files.length),
                    total: ev.total || files.length,
                  });
                }
              } else if (ev.event === "done") {
                finalDone = ev;
                if (Array.isArray(ev.itens)) {
                  ev.itens.forEach((item, idx) => applyItemResult(idx, item));
                }
              }
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
          if (ev.event === "done") finalDone = ev;
          else if (typeof ev.index === "number") applyItemResult(ev.index, ev);
        } catch {
          /* ignore */
        }
      }

      setDonePayload({
        ok: Boolean(finalDone?.ok),
        competencia: finalDone?.competencia || competenciaEfetiva,
        aviso_global: finalDone?.aviso_global,
      });
      if (finalDone?.erro && !finalDone.ok) {
        setGlobalError(finalDone.erro);
      }
      router.refresh();
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : "Erro de rede");
      setFiles((prev) =>
        prev.map((f) =>
          f.status === "ok" ? f : { ...f, status: f.status === "error" ? "error" : "error" },
        ),
      );
    } finally {
      setSubmitting(false);
      setProgress(null);
    }
  };

  return (
    <div className="space-y-6 px-4 py-5 lg:px-6">
      <div>
        <Link
          href={competenciaEfetiva ? `/?competencia=${competenciaEfetiva}` : "/"}
          className="inline-flex items-center gap-1.5 text-sm text-primary underline-offset-2 hover:underline"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Voltar ao painel
        </Link>
        <div className="mt-3">
          <PageHeader
            icon={FileUp}
            title="IMPORTAR RELATORIOS"
          />
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
              <input type="radio" checked={!criarNova} onChange={() => setCriarNova(false)} />
              Existente
            </span>
            <select
              className="h-9 min-w-[160px] rounded-md border border-input bg-background px-2 text-sm"
              disabled={criarNova || submitting}
              value={competencia}
              onChange={(e) => setCompetencia(e.target.value)}
            >
              {competencias.length === 0 && <option value="">—</option>}
              {competencias.map((id) => (
                <option key={id} value={id}>
                  {formatCompetencia(id)}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-xs font-medium">
            <span className="flex items-center gap-2">
              <input type="radio" checked={criarNova} onChange={() => setCriarNova(true)} />
              Nova competência
            </span>
            <div className="flex gap-2">
              <Input
                disabled={!criarNova || submitting}
                placeholder="MM"
                className="w-16"
                value={novaMes}
                onChange={(e) => setNovaMes(e.target.value.replace(/\D/g, "").slice(0, 2))}
              />
              <Input
                disabled={!criarNova || submitting}
                placeholder="AAAA"
                className="w-24"
                value={novaAno}
                onChange={(e) => setNovaAno(e.target.value.replace(/\D/g, "").slice(0, 4))}
              />
            </div>
          </label>

          <p className="text-sm text-muted-foreground">
            Destino:{" "}
            <span className="font-semibold text-slate-800">
              {formatCompetencia(competenciaEfetiva || "—")}
            </span>
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {ZONES.map((zone) => {
          const ZoneIcon = zone.icon;
          return (
          <Card key={zone.tipo} className={cn("border shadow-none", zone.accent)}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <span className={cn("flex size-8 items-center justify-center rounded-md", zone.iconTone)}>
                  <ZoneIcon className="size-4" aria-hidden />
                </span>
                {zone.title}
              </CardTitle>
              <CardDescription>{zone.subtitle}</CardDescription>
            </CardHeader>
            <CardContent>
              <div
                onDragEnter={(e) => {
                  e.preventDefault();
                  if (!submitting) setDragOver(zone.tipo);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "copy";
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  if (e.currentTarget === e.target) setDragOver(null);
                }}
                onDrop={(e) => onDropZone(zone.tipo, e)}
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-3 py-8 text-center text-sm transition",
                  dragOver === zone.tipo
                    ? "border-primary bg-primary/5"
                    : "border-slate-300 bg-white/70 hover:border-primary/50",
                  submitting && "pointer-events-none opacity-60",
                )}
              >
                <label className="flex w-full cursor-pointer flex-col items-center">
                  <Upload className="mb-2 size-8 text-slate-400" aria-hidden />
                  <span className="font-medium text-slate-800">Arraste vários PDFs aqui</span>
                  <span className="mt-1 text-xs text-muted-foreground">ou clique para selecionar</span>
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    multiple
                    className="hidden"
                    disabled={submitting}
                    onChange={(e) => {
                      addFiles(zone.tipo, e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
              <ul className="mt-3 max-h-40 space-y-1 overflow-auto text-xs">
                {files
                  .filter((f) => f.tipo === zone.tipo)
                  .map((f) => (
                    <li
                      key={f.id}
                      className="flex items-center justify-between gap-2 rounded bg-white/80 px-2 py-1"
                    >
                      <span className="truncate">
                        {f.status === "uploading" ? "… " : ""}
                        {f.status === "ok" ? "✓ " : ""}
                        {f.status === "error" ? "✗ " : ""}
                        {f.file.name}
                      </span>
                      <button
                        type="button"
                        className="shrink-0 text-red-600 hover:underline"
                        disabled={submitting}
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

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" disabled={submitting || files.length === 0} onClick={onSubmit}>
          <Upload className="size-4" aria-hidden />
          {submitting
            ? progress
              ? `Processando ${progress.current}/${progress.total}…`
              : "Processando…"
            : `Importar ${files.length || ""} PDF(s)`}
        </Button>
        {files.length > 0 && !submitting && (
          <Button type="button" variant="ghost" onClick={() => setFiles([])}>
            <Eraser className="size-4" aria-hidden />
            Limpar lista
          </Button>
        )}
        {importadosOk.length > 0 && !submitting && (
          <Button
            type="button"
            variant="destructive"
            disabled={deleting}
            onClick={() => excluirImportados(importadosOk)}
          >
            <Trash2 className="size-4" aria-hidden />
            {deleting
              ? "Excluindo…"
              : `Excluir o que foi importado (${importadosOk.length})`}
          </Button>
        )}
        {submitting && (
          <span className="text-sm text-muted-foreground">
            Fila: {doneCount}/{files.length} concluídos · 1 PDF por vez
          </span>
        )}
        {donePayload?.competencia && !submitting && (
          <Link
            href={`/?competencia=${donePayload.competencia}`}
            className="text-sm font-medium text-primary underline-offset-2 hover:underline"
          >
            Ver painel · {formatCompetencia(donePayload.competencia)}
          </Link>
        )}
      </div>

      {globalError && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {globalError}
        </p>
      )}
      {donePayload && !submitting && !globalError && (
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
              ? "OK — Extração concluída"
              : donePayload.ok
                ? "Extração concluída com pendências"
                : "Extração finalizada com erro"}
          </p>
          <p className="mt-1">
            {okCount} OK
            {errorCount > 0 ? ` · ${errorCount} com erro` : ""}
            {donePayload.competencia
              ? ` · competência ${formatCompetencia(donePayload.competencia)}`
              : ""}
          </p>
          {donePayload.ok && donePayload.competencia ? (
            <p className="mt-2">
              <Link
                href={`/?competencia=${donePayload.competencia}`}
                className="font-medium underline underline-offset-2"
              >
                Abrir painel · {formatCompetencia(donePayload.competencia)}
              </Link>
            </p>
          ) : null}
        </div>
      )}
      {donePayload?.aviso_global && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {donePayload.aviso_global}
        </p>
      )}

      {files.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base">Fila de extração</CardTitle>
            <CardDescription>
              Empresa detectada automaticamente · destino e valores por arquivo
            </CardDescription>
          </CardHeader>
          <div className="overflow-auto">
            <table className="w-full min-w-[900px] border-collapse text-left text-sm">
              <thead className="border-b bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Arquivo</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Competência</th>
                  <th className="px-3 py-2">Empresa</th>
                  <th className="px-3 py-2">Destino</th>
                  <th className="px-3 py-2">Lanç.</th>
                  <th className="px-3 py-2">Saldo</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {files.map((f, idx) => {
                  const r = f.result;
                  const compItem = r?.competencia || competenciaEfetiva;
                  const wasDeleted = deletedIds.includes(f.id);
                  return (
                    <tr
                      key={f.id}
                      className={cn(
                        "border-b border-border/70",
                        f.status === "uploading" && "bg-sky-50/80",
                        wasDeleted && "bg-slate-50 opacity-60",
                      )}
                    >
                      <td className="px-3 py-2 tabular text-muted-foreground">{idx + 1}</td>
                      <td className="px-3 py-2 align-top">
                        <div className="font-medium">{r?.arquivo_final || f.file.name}</div>
                        {r?.avisos?.length ? (
                          <div className="mt-1 text-[11px] text-muted-foreground">
                            {r.avisos.slice(0, 3).join(" · ")}
                          </div>
                        ) : null}
                        {f.error ? (
                          <div className="mt-1 text-[11px] text-red-600">{f.error}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <Badge variant="outline">{r?.tipo || f.tipo}</Badge>
                        {r?.tipo && r.tipo !== f.tipo ? (
                          <div className="mt-1 text-[11px] text-amber-800">
                            zona {f.tipo} → {r.tipo}
                          </div>
                        ) : null}
                        <div className="mt-1 text-[11px] text-muted-foreground">{r?.esfera}</div>
                      </td>
                      <td className="px-3 py-2 align-top text-xs">
                        {r?.competencia ? formatCompetencia(r.competencia) : "—"}
                        {r?.competencia_selecionada &&
                        r.competencia &&
                        r.competencia_selecionada !== r.competencia ? (
                          <div className="mt-1 text-[11px] text-amber-700">
                            selecionada {formatCompetencia(r.competencia_selecionada)}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 align-top">
                        {r?.empresa_id ? (
                          <Link
                            href={`/empresas/${r.empresa_id}?competencia=${compItem}`}
                            className="font-medium text-teal-800 hover:underline"
                          >
                            {r.empresa || "Abrir empresa"}
                          </Link>
                        ) : (
                          <span>{r?.empresa || (f.status === "uploading" ? "identificando…" : "—")}</span>
                        )}
                        <div className="tabular text-[11px] text-muted-foreground">{r?.cnpj || ""}</div>
                      </td>
                      <td className="px-3 py-2 align-top text-xs">{r?.destino || "—"}</td>
                      <td className="px-3 py-2 align-top tabular">{r?.qtd_debitos ?? "—"}</td>
                      <td className="px-3 py-2 align-top tabular">
                        {r?.totais?.saldo != null ? formatBRL(r.totais.saldo) : "—"}
                      </td>
                      <td className="px-3 py-2 align-top">
                        {wasDeleted ? (
                          <Badge variant="outline">Excluído</Badge>
                        ) : f.status === "ok" ? (
                          r?.classe === "REVISAR" ||
                          (r?.destino || "").toLowerCase().includes("revisar") ||
                          (r?.avisos || []).some((a) => /revisar|layout municipal/i.test(a)) ? (
                            <div className="space-y-1">
                              <Badge variant="outline">Revisar</Badge>
                              <div className="text-[11px] text-amber-800">
                                Arquivo foi para revisão — aparece no painel com aviso; confira o PDF.
                              </div>
                            </div>
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
                      <td className="px-3 py-2 align-top">
                        {f.status === "ok" &&
                        r?.destino &&
                        !wasDeleted &&
                        !(r?.avisos || []).some((a) => /já importado \(mesmo hash\)/i.test(a)) ? (
                          <button
                            type="button"
                            className="text-xs font-medium text-red-700 hover:underline disabled:opacity-50"
                            disabled={deleting || submitting}
                            onClick={() => excluirImportados([f])}
                          >
                            Excluir
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
