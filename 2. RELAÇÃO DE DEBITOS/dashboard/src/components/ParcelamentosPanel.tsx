"use client";

import { useCallback, useMemo, useState } from "react";
import {
  CalendarClock,
  FileDown,
  FileSpreadsheet,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { BlockingOverlay } from "@/components/BlockingOverlay";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCompetencia } from "@/lib/competencia";
import { formatCnpj } from "@/lib/format";
import {
  PARCELAMENTO_STATUS_LABELS,
  PARCELAMENTO_STATUS_OPTIONS,
  PARCELAMENTO_TIPO_LABELS,
  PARCELAMENTO_TIPO_OPTIONS,
  buildCardView,
  digitsCnpj,
  isValidCompetencia,
} from "@/lib/parcelamentos-utils";
import type {
  CompetenciaRegistro,
  EmpresaParcelamento,
  ParcelamentoStatus,
  ParcelamentoTipo,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  initialEmpresas: EmpresaParcelamento[];
  initialRegistros: Record<string, CompetenciaRegistro>;
  competenciasParcelamento: string[];
  competencia: string;
  loadError?: string | null;
};

type DraftRegistro = {
  status: ParcelamentoStatus;
  tipo: string;
  totalParcelas: string;
  vencimento: string;
  observacao: string;
};

type NovaEmpresaForm = {
  cod: string;
  empresa: string;
  grupo: string;
  cnpj: string;
  numeroParcelamento: string;
  status: ParcelamentoStatus;
};

type EditEmpresaForm = {
  id: string;
  cod: string;
  empresa: string;
  grupo: string;
  cnpj: string;
  numeroParcelamento: string;
};

function toDraft(reg: CompetenciaRegistro | undefined): DraftRegistro {
  return {
    status: reg?.status ?? "ok",
    tipo: reg?.tipo ?? "",
    totalParcelas:
      reg?.totalParcelas != null && reg.totalParcelas > 0
        ? String(reg.totalParcelas)
        : "",
    vencimento: reg?.vencimento ?? "",
    observacao: reg?.observacao ?? "",
  };
}

function emptyNova(): NovaEmpresaForm {
  return {
    cod: "",
    empresa: "",
    grupo: "",
    cnpj: "",
    numeroParcelamento: "",
    status: "ok",
  };
}

function fold(value: string | null | undefined): string {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function rowTone(status: ParcelamentoStatus): string {
  if (status === "ok") return "bg-emerald-100/90 hover:bg-emerald-100";
  if (status === "saiu") return "bg-slate-200/80 hover:bg-slate-200";
  if (status === "cancelado") return "bg-red-100/90 hover:bg-red-100";
  return "bg-amber-100/90 hover:bg-amber-100";
}

const selectClass =
  "h-8 w-full min-w-[7rem] rounded border border-black/10 bg-white/80 px-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring";
const cellInputClass =
  "h-8 w-full min-w-[5rem] rounded border border-black/10 bg-white/80 px-1.5 text-xs shadow-none";

export function ParcelamentosPanel({
  initialEmpresas,
  initialRegistros,
  competenciasParcelamento,
  competencia,
  loadError,
}: Props) {
  const [empresas, setEmpresas] = useState(initialEmpresas);
  const [registros, setRegistros] = useState(initialRegistros);
  const [comps, setComps] = useState(competenciasParcelamento);
  const [drafts, setDrafts] = useState<Record<string, DraftRegistro>>(() => {
    const map: Record<string, DraftRegistro> = {};
    for (const e of initialEmpresas) {
      map[e.id] = toDraft(initialRegistros[e.id]);
    }
    return map;
  });
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ParcelamentoStatus | "todos">(
    "todos",
  );
  const [grupoFilter, setGrupoFilter] = useState("todos");
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("Salvando…");
  const [error, setError] = useState<string | null>(null);
  const [showNova, setShowNova] = useState(false);
  const [nova, setNova] = useState<NovaEmpresaForm>(emptyNova);
  const [editEmpresa, setEditEmpresa] = useState<EditEmpresaForm | null>(null);
  const [showGerar, setShowGerar] = useState(false);
  const [novaComp, setNovaComp] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  const competenciaExiste = comps.includes(competencia);

  const grupos = useMemo(() => {
    const set = new Set<string>();
    for (const item of empresas) {
      const g = (item.grupo || "").trim();
      if (g) set.add(g);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [empresas]);

  const cards = useMemo(() => {
    return empresas.map((e) => buildCardView(e, registros[e.id], competencia));
  }, [empresas, registros, competencia]);

  const kpis = useMemo(() => {
    let ok = 0;
    let atencao = 0;
    let canceladosSaiu = 0;
    for (const c of cards) {
      const status = drafts[c.empresa.id]?.status ?? c.registro.status;
      if (status === "ok") ok += 1;
      else if (status === "atencao") atencao += 1;
      else canceladosSaiu += 1;
    }
    return { total: cards.length, ok, atencao, canceladosSaiu };
  }, [cards, drafts]);

  const filtered = useMemo(() => {
    const q = fold(query);
    const qDigits = digitsCnpj(query);
    return cards.filter((card) => {
      const status = drafts[card.empresa.id]?.status ?? card.registro.status;
      if (statusFilter !== "todos" && status !== statusFilter) return false;
      if (
        grupoFilter !== "todos" &&
        (card.empresa.grupo || "").trim() !== grupoFilter
      ) {
        return false;
      }
      if (!q && !qDigits) return true;
      const hay = [
        fold(card.empresa.empresa),
        fold(card.empresa.grupo),
        fold(card.empresa.cod),
        fold(card.empresa.numeroParcelamento),
      ];
      if (q && hay.some((h) => h.includes(q))) return true;
      if (qDigits && card.empresa.cnpj.includes(qDigits)) return true;
      return false;
    });
  }, [cards, drafts, query, statusFilter, grupoFilter]);

  const updateDraft = useCallback(
    (id: string, patch: Partial<DraftRegistro>) => {
      setDrafts((prev) => ({
        ...prev,
        [id]: { ...(prev[id] ?? toDraft(registros[id])), ...patch },
      }));
    },
    [registros],
  );

  const saveCard = useCallback(
    async (id: string) => {
      const draft = drafts[id];
      if (!draft) return;
      if (!competenciaExiste) {
        setError("Gere a competência atual antes de salvar preenchimentos.");
        return;
      }
      setSavingId(id);
      setError(null);
      try {
        const res = await fetch("/api/parcelamentos", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            empresaId: id,
            competencia,
            registro: {
              status: draft.status,
              tipo: draft.tipo || undefined,
              totalParcelas: draft.totalParcelas,
              vencimento: draft.vencimento,
              observacao: draft.observacao,
              inicioCompetencia: competencia,
            },
          }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          registro?: CompetenciaRegistro;
          error?: string;
        };
        if (!res.ok || !data.registro) {
          throw new Error(data.error || "Falha ao salvar.");
        }
        setRegistros((prev) => ({ ...prev, [id]: data.registro! }));
        setDrafts((prev) => ({ ...prev, [id]: toDraft(data.registro) }));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao salvar.");
      } finally {
        setSavingId(null);
      }
    },
    [drafts, competencia, competenciaExiste],
  );

  const createEmpresa = useCallback(async () => {
    setBusy(true);
    setBusyLabel("Cadastrando empresa…");
    setError(null);
    try {
      const targetComp = competenciaExiste
        ? competencia
        : comps[comps.length - 1] || competencia;
      const res = await fetch("/api/parcelamentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "empresa",
          competencia: targetComp,
          empresa: {
            cod: nova.cod,
            empresa: nova.empresa,
            grupo: nova.grupo,
            cnpj: nova.cnpj,
            numeroParcelamento: nova.numeroParcelamento,
          },
          registro: { status: nova.status },
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        empresa?: EmpresaParcelamento;
        registro?: CompetenciaRegistro;
        error?: string;
      };
      if (!res.ok || !data.empresa || !data.registro) {
        throw new Error(data.error || "Falha ao criar empresa.");
      }
      setEmpresas((prev) => [...prev, data.empresa!]);
      if (targetComp === competencia) {
        setRegistros((prev) => ({ ...prev, [data.empresa!.id]: data.registro! }));
      }
      setDrafts((prev) => ({
        ...prev,
        [data.empresa!.id]: toDraft(data.registro),
      }));
      setNova(emptyNova());
      setShowNova(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar.");
    } finally {
      setBusy(false);
    }
  }, [nova, competencia, competenciaExiste, comps]);

  const saveEditEmpresa = useCallback(async () => {
    if (!editEmpresa) return;
    setBusy(true);
    setBusyLabel("Atualizando empresa…");
    setError(null);
    try {
      const res = await fetch("/api/parcelamentos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresaId: editEmpresa.id,
          empresa: {
            cod: editEmpresa.cod,
            empresa: editEmpresa.empresa,
            grupo: editEmpresa.grupo,
            cnpj: editEmpresa.cnpj,
            numeroParcelamento: editEmpresa.numeroParcelamento,
          },
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        empresa?: EmpresaParcelamento;
        error?: string;
      };
      if (!res.ok || !data.empresa) {
        throw new Error(data.error || "Falha ao atualizar empresa.");
      }
      setEmpresas((prev) =>
        prev.map((e) => (e.id === data.empresa!.id ? data.empresa! : e)),
      );
      setEditEmpresa(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar.");
    } finally {
      setBusy(false);
    }
  }, [editEmpresa]);

  const removeEmpresa = useCallback(async (item: EmpresaParcelamento) => {
    const ok = window.confirm(
      `Excluir "${item.empresa}" do controle de parcelamentos?`,
    );
    if (!ok) return;
    setBusy(true);
    setBusyLabel("Excluindo…");
    setError(null);
    try {
      const res = await fetch("/api/parcelamentos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresaId: item.id }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "Falha ao excluir.");
      setEmpresas((prev) => prev.filter((e) => e.id !== item.id));
      setRegistros((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao excluir.");
    } finally {
      setBusy(false);
    }
  }, []);

  const gerar = useCallback(async () => {
    const para = novaComp.trim();
    if (!isValidCompetencia(para)) {
      setError("Informe a nova competência no formato MM-YYYY (ex.: 09-2026).");
      return;
    }
    const de = comps.includes(competencia)
      ? competencia
      : comps[comps.length - 1] || "";
    if (!de) {
      setError("Não há competência de origem para copiar.");
      return;
    }
    setBusy(true);
    setBusyLabel("Gerando competência…");
    setError(null);
    try {
      const res = await fetch("/api/parcelamentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "gerarCompetencia", de, para }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        competencias?: string[];
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error || "Falha ao gerar.");
      setComps(data.competencias ?? [...comps, para]);
      setShowGerar(false);
      setNovaComp("");
      window.location.href = `/parcelamentos?competencia=${encodeURIComponent(para)}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao gerar.");
      setBusy(false);
    }
  }, [novaComp, competencia, comps]);

  const exportExcel = useCallback(() => {
    const url = `/api/parcelamentos/export?formato=xlsx&competencia=${encodeURIComponent(competencia)}`;
    window.location.href = url;
  }, [competencia]);

  const exportPdf = useCallback(async () => {
    setBusy(true);
    setBusyLabel("Gerando PDF…");
    setError(null);
    try {
      const [{ pdf }, { ParcelamentosPdfDocument }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/components/ParcelamentosPdfDocument"),
      ]);
      const blob = await pdf(
        <ParcelamentosPdfDocument competencia={competencia} cards={filtered} />,
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `parcelamentos_${competencia}.pdf`;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao gerar PDF.");
    } finally {
      setBusy(false);
    }
  }, [competencia, filtered]);

  return (
    <div className="space-y-5 px-4 py-5 lg:px-6">
      <BlockingOverlay open={busy} title={busyLabel} />

      <PageHeader
        icon={CalendarClock}
        title="Parcelamentos"
        description={`Grade estilo planilha · competência ${formatCompetencia(competencia)}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={exportExcel}>
              <FileSpreadsheet aria-hidden />
              Excel
            </Button>
            <Button type="button" variant="outline" onClick={() => void exportPdf()}>
              <FileDown aria-hidden />
              PDF
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowGerar((v) => !v)}
            >
              Gerar competência
            </Button>
            <Button type="button" onClick={() => setShowNova((v) => !v)}>
              <Plus aria-hidden />
              Nova empresa
            </Button>
          </div>
        }
      />

      {loadError ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Dados indisponíveis: {loadError}
        </p>
      ) : null}

      {!competenciaExiste ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
          A competência <strong>{formatCompetencia(competencia)}</strong> ainda não
          existe no controle de parcelamentos.
          {comps.length > 0 ? (
            <>
              {" "}
              Use <strong>Gerar competência</strong> a partir de{" "}
              {formatCompetencia(comps[comps.length - 1])} para trazer as mesmas
              empresas (Nº fixo da empresa; total/vencimento em branco).
            </>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {showGerar ? (
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-slate-900">
            Gerar nova competência
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Copia status/tipo. Nº parcelamento permanece o da empresa. Total e
            vencimento ficam em branco.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="space-y-1">
              <span className="text-sm font-medium">Nova competência (MM-YYYY)</span>
              <Input
                value={novaComp}
                onChange={(e) => setNovaComp(e.target.value)}
                placeholder="09-2026"
                className="w-40"
              />
            </label>
            <Button type="button" onClick={() => void gerar()}>
              Gerar
            </Button>
            <Button type="button" variant="ghost" onClick={() => setShowGerar(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}

      {showNova ? (
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-slate-900">Nova empresa</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="space-y-1 sm:col-span-2">
              <span className="text-sm font-medium">Empresa *</span>
              <Input
                value={nova.empresa}
                onChange={(e) => setNova((f) => ({ ...f, empresa: e.target.value }))}
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium">CNPJ *</span>
              <Input
                value={nova.cnpj}
                onChange={(e) => setNova((f) => ({ ...f, cnpj: e.target.value }))}
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium">Nº parcelamento</span>
              <Input
                value={nova.numeroParcelamento}
                onChange={(e) =>
                  setNova((f) => ({ ...f, numeroParcelamento: e.target.value }))
                }
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium">Código</span>
              <Input
                value={nova.cod}
                onChange={(e) => setNova((f) => ({ ...f, cod: e.target.value }))}
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium">Grupo</span>
              <Input
                value={nova.grupo}
                onChange={(e) => setNova((f) => ({ ...f, grupo: e.target.value }))}
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium">Status inicial</span>
              <select
                className={cn(selectClass, "h-9")}
                value={nova.status}
                onChange={(e) =>
                  setNova((f) => ({
                    ...f,
                    status: e.target.value as ParcelamentoStatus,
                  }))
                }
              >
                {PARCELAMENTO_STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {PARCELAMENTO_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-3 flex gap-2">
            <Button type="button" onClick={() => void createEmpresa()}>
              Cadastrar empresa
            </Button>
            <Button type="button" variant="ghost" onClick={() => setShowNova(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}

      {editEmpresa ? (
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-slate-900">
            Editar empresa (identidade / Nº fixo)
          </h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="space-y-1 sm:col-span-2">
              <span className="text-sm font-medium">Empresa *</span>
              <Input
                value={editEmpresa.empresa}
                onChange={(e) =>
                  setEditEmpresa((f) =>
                    f ? { ...f, empresa: e.target.value } : f,
                  )
                }
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium">CNPJ *</span>
              <Input
                value={editEmpresa.cnpj}
                onChange={(e) =>
                  setEditEmpresa((f) => (f ? { ...f, cnpj: e.target.value } : f))
                }
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium">Nº parcelamento</span>
              <Input
                value={editEmpresa.numeroParcelamento}
                onChange={(e) =>
                  setEditEmpresa((f) =>
                    f ? { ...f, numeroParcelamento: e.target.value } : f,
                  )
                }
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium">Código</span>
              <Input
                value={editEmpresa.cod}
                onChange={(e) =>
                  setEditEmpresa((f) => (f ? { ...f, cod: e.target.value } : f))
                }
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium">Grupo</span>
              <Input
                value={editEmpresa.grupo}
                onChange={(e) =>
                  setEditEmpresa((f) => (f ? { ...f, grupo: e.target.value } : f))
                }
              />
            </label>
          </div>
          <div className="mt-3 flex gap-2">
            <Button type="button" onClick={() => void saveEditEmpresa()}>
              Salvar empresa
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditEmpresa(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Total" value={kpis.total} />
        <Kpi label="OK" value={kpis.ok} tone="ok" />
        <Kpi label="Atenção" value={kpis.atencao} tone="warn" />
        <Kpi label="Cancelados / Saiu" value={kpis.canceladosSaiu} tone="muted" />
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 sm:flex-row sm:flex-wrap sm:items-center">
        <label className="relative min-w-[220px] flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar empresa, CNPJ, cód. ou nº"
            className="pl-8"
          />
        </label>
        <select
          className={cn(selectClass, "h-9 w-auto min-w-[140px]")}
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as ParcelamentoStatus | "todos")
          }
        >
          <option value="todos">Status: todos</option>
          {PARCELAMENTO_STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {PARCELAMENTO_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          className={cn(selectClass, "h-9 w-auto min-w-[140px]")}
          value={grupoFilter}
          onChange={(e) => setGrupoFilter(e.target.value)}
        >
          <option value="todos">Grupo: todos</option>
          {grupos.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border shadow-sm">
        <table className="w-full min-w-[1100px] border-collapse text-left text-xs">
          <thead>
            <tr className="bg-emerald-200/90 text-[11px] font-semibold uppercase tracking-wide text-slate-800">
              <th className="border border-emerald-300/80 px-2 py-2">Status</th>
              <th className="border border-emerald-300/80 px-2 py-2">COD</th>
              <th className="border border-emerald-300/80 px-2 py-2">Empresa</th>
              <th className="border border-emerald-300/80 px-2 py-2">Grupo</th>
              <th className="border border-emerald-300/80 px-2 py-2">CNPJ</th>
              <th className="border border-emerald-300/80 px-2 py-2">Tipo</th>
              <th className="border border-emerald-300/80 px-2 py-2">
                Nº parcelamento
              </th>
              <th className="border border-emerald-300/80 px-2 py-2">
                Parcela atual
              </th>
              <th className="border border-emerald-300/80 px-2 py-2">Total</th>
              <th className="border border-emerald-300/80 px-2 py-2">Em aberto</th>
              <th className="border border-emerald-300/80 px-2 py-2">Vencimento</th>
              <th className="border border-emerald-300/80 px-2 py-2">Obs</th>
              <th className="border border-emerald-300/80 px-2 py-2">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((card) => {
              const id = card.empresa.id;
              const draft = drafts[id] ?? toDraft(card.registro);
              const preview = buildCardView(
                card.empresa,
                {
                  ...card.registro,
                  status: draft.status,
                  tipo: (draft.tipo as ParcelamentoTipo) || undefined,
                  totalParcelas: draft.totalParcelas
                    ? Number(draft.totalParcelas)
                    : null,
                  vencimento: draft.vencimento || null,
                },
                competencia,
              );
              return (
                <tr key={id} className={cn(rowTone(draft.status))}>
                  <td className="border border-black/10 px-1.5 py-1 align-middle">
                    <select
                      className={selectClass}
                      value={draft.status}
                      onChange={(e) =>
                        updateDraft(id, {
                          status: e.target.value as ParcelamentoStatus,
                        })
                      }
                    >
                      {PARCELAMENTO_STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {PARCELAMENTO_STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="border border-black/10 px-2 py-1 align-middle font-medium tabular-nums">
                    {card.empresa.cod ?? "—"}
                  </td>
                  <td className="border border-black/10 px-2 py-1 align-middle font-medium">
                    {card.empresa.empresa}
                  </td>
                  <td className="border border-black/10 px-2 py-1 align-middle">
                    {card.empresa.grupo ?? ""}
                  </td>
                  <td className="border border-black/10 px-2 py-1 align-middle whitespace-nowrap tabular-nums">
                    {formatCnpj(card.empresa.cnpj)}
                  </td>
                  <td className="border border-black/10 px-1.5 py-1 align-middle">
                    <select
                      className={selectClass}
                      value={draft.tipo}
                      onChange={(e) => updateDraft(id, { tipo: e.target.value })}
                    >
                      <option value="">—</option>
                      {PARCELAMENTO_TIPO_OPTIONS.map((t) => (
                        <option key={t} value={t}>
                          {PARCELAMENTO_TIPO_LABELS[t]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="border border-black/10 px-2 py-1 align-middle font-mono text-[11px]">
                    {card.empresa.numeroParcelamento || "—"}
                  </td>
                  <td className="border border-black/10 px-2 py-1 align-middle text-center tabular-nums text-muted-foreground">
                    {preview.parcelaAtual ?? "—"}
                  </td>
                  <td className="border border-black/10 px-1.5 py-1 align-middle">
                    <Input
                      type="number"
                      min={1}
                      className={cellInputClass}
                      value={draft.totalParcelas}
                      onChange={(e) =>
                        updateDraft(id, { totalParcelas: e.target.value })
                      }
                    />
                  </td>
                  <td className="border border-black/10 px-2 py-1 align-middle text-center tabular-nums text-muted-foreground">
                    {preview.parcelasEmAberto ?? "—"}
                  </td>
                  <td className="border border-black/10 px-1.5 py-1 align-middle">
                    <Input
                      type="date"
                      className={cellInputClass}
                      value={draft.vencimento}
                      onChange={(e) =>
                        updateDraft(id, { vencimento: e.target.value })
                      }
                    />
                  </td>
                  <td className="border border-black/10 px-1.5 py-1 align-middle">
                    <Input
                      className={cn(cellInputClass, "min-w-[8rem]")}
                      value={draft.observacao}
                      onChange={(e) =>
                        updateDraft(id, { observacao: e.target.value })
                      }
                    />
                  </td>
                  <td className="border border-black/10 px-1.5 py-1 align-middle">
                    <div className="flex flex-nowrap gap-1">
                      <Button
                        type="button"
                        size="sm"
                        className="h-7 px-2 text-[11px]"
                        disabled={savingId === id || !competenciaExiste}
                        onClick={() => void saveCard(id)}
                      >
                        {savingId === id ? "…" : "Salvar"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-2"
                        title="Editar identidade / Nº"
                        onClick={() =>
                          setEditEmpresa({
                            id: card.empresa.id,
                            cod: card.empresa.cod ?? "",
                            empresa: card.empresa.empresa,
                            grupo: card.empresa.grupo ?? "",
                            cnpj: formatCnpj(card.empresa.cnpj),
                            numeroParcelamento:
                              card.empresa.numeroParcelamento ?? "",
                          })
                        }
                      >
                        <Pencil className="size-3.5" aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-red-700"
                        title="Excluir"
                        onClick={() => void removeEmpresa(card.empresa)}
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            Nenhuma empresa encontrada com os filtros atuais.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "ok" | "warn" | "muted";
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-2xl font-bold tabular-nums",
          tone === "ok" && "text-emerald-700",
          tone === "warn" && "text-amber-700",
          tone === "muted" && "text-slate-500",
          !tone && "text-slate-900",
        )}
      >
        {value}
      </p>
    </div>
  );
}
