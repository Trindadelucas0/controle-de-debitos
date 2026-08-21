"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  CalendarDays,
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
import { formatCompetencia, sortCompetencias } from "@/lib/competencia";
import { formatCnpj } from "@/lib/format";
import {
  PARCELAMENTO_STATUS_DEFAULT,
  PARCELAMENTO_STATUS_LABELS,
  PARCELAMENTO_STATUS_OPTIONS,
  PARCELAMENTO_TIPO_CHECKBOX_OPTIONS,
  PARCELAMENTO_TIPO_LABELS,
  PARCELAMENTO_TIPO_OPTIONS,
  addMesesCompetencia,
  buildCardView,
  calcParcelaAtual,
  currentCompetenciaId,
  digitsCnpj,
  empresaTemParcelamentoNoMes,
  isTipoVencimentoAutomatico,
  isValidCompetencia,
  parseParcelaPositiva,
  parseParcelamentoStatus,
  vencimentoAutomaticoPorTipo,
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
  parcelaAtual: string;
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
  tipo: ParcelamentoTipo | "";
  vencimento: string;
  totalParcelas: string;
  parcelaAtual: string;
};

type EditEmpresaForm = {
  id: string;
  cod: string;
  empresa: string;
  grupo: string;
  cnpj: string;
  numeroParcelamento: string;
};

function toDraft(
  reg: CompetenciaRegistro | undefined,
  competencia?: string,
): DraftRegistro {
  let parcelaAtual = "";
  if (
    reg?.totalParcelas != null &&
    reg.totalParcelas > 0 &&
    competencia &&
    isValidCompetencia(competencia)
  ) {
    const inicio = reg.inicioCompetencia || competencia;
    parcelaAtual = String(calcParcelaAtual(inicio, competencia, reg.totalParcelas));
  }
  return {
    status: parseParcelamentoStatus(reg?.status) ?? PARCELAMENTO_STATUS_DEFAULT,
    tipo: reg?.tipo ?? "",
    totalParcelas:
      reg?.totalParcelas != null && reg.totalParcelas > 0
        ? String(reg.totalParcelas)
        : "",
    parcelaAtual,
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
    status: PARCELAMENTO_STATUS_DEFAULT,
    tipo: "",
    vencimento: "",
    totalParcelas: "",
    parcelaAtual: "1",
  };
}

function fold(value: string | null | undefined): string {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function rowTone(status: ParcelamentoStatus): string {
  if (status === "ativo") return "bg-emerald-100/90 hover:bg-emerald-100";
  if (status === "encerrado") return "bg-sky-100/90 hover:bg-sky-100";
  if (status === "saiu") return "bg-slate-200/80 hover:bg-slate-200";
  if (status === "cancelado") return "bg-red-100/90 hover:bg-red-100";
  return "bg-amber-100/90 hover:bg-amber-100";
}

const selectClass =
  "h-8 w-full min-w-[9rem] rounded border border-black/10 bg-white/80 px-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring";
const situacaoSelectClass =
  "h-8 w-full min-w-[13rem] rounded border border-black/10 bg-white/80 px-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring";
const cellInputClass =
  "h-8 w-full min-w-[5rem] rounded border border-black/10 bg-white/80 px-1.5 text-xs shadow-none";

export function ParcelamentosPanel({
  initialEmpresas,
  initialRegistros,
  competenciasParcelamento,
  competencia,
  loadError,
}: Props) {
  const router = useRouter();
  const [empresas, setEmpresas] = useState(initialEmpresas);
  const [registros, setRegistros] = useState(initialRegistros);
  const [comps, setComps] = useState(competenciasParcelamento);
  const [drafts, setDrafts] = useState<Record<string, DraftRegistro>>(() => {
    const map: Record<string, DraftRegistro> = {};
    for (const e of initialEmpresas) {
      map[e.id] = toDraft(initialRegistros[e.id], competencia);
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
  const [compsGeradasInfo, setCompsGeradasInfo] = useState<string[] | null>(null);
  const [addParcId, setAddParcId] = useState("");
  const [addParcTotal, setAddParcTotal] = useState("");
  const [addParcAtual, setAddParcAtual] = useState("1");

  const competenciaExiste = comps.includes(competencia);
  /** Mês de calendário + 2 à frente (a janela sobe sozinha quando vira o mês). */
  const compsJanela = useMemo(() => {
    const hoje = currentCompetenciaId();
    return [0, 1, 2]
      .map((delta) => addMesesCompetencia(hoje, delta))
      .filter((id): id is string => Boolean(id));
  }, []);
  const competenciaLabel = formatCompetencia(competencia);

  const irParaCompetencia = useCallback(
    (next: string) => {
      if (!next || next === competencia) return;
      router.push(`/parcelamentos?competencia=${encodeURIComponent(next)}`);
    },
    [router, competencia],
  );

  const grupos = useMemo(() => {
    const set = new Set<string>();
    for (const item of empresas) {
      const g = (item.grupo || "").trim();
      if (g) set.add(g);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [empresas]);

  const cards = useMemo(() => {
    return empresas
      .map((e) => buildCardView(e, registros[e.id], competencia))
      .filter((card) => {
        const draft = drafts[card.empresa.id];
        const totalDraft = parseParcelaPositiva(draft?.totalParcelas);
        const regForFilter: CompetenciaRegistro = {
          ...card.registro,
          status:
            parseParcelamentoStatus(draft?.status ?? card.registro.status) ??
            PARCELAMENTO_STATUS_DEFAULT,
          totalParcelas: totalDraft ?? card.registro.totalParcelas ?? null,
          inicioCompetencia:
            card.registro.inicioCompetencia ||
            (totalDraft != null ? competencia : undefined),
        };
        return empresaTemParcelamentoNoMes(regForFilter, competencia);
      });
  }, [empresas, registros, competencia, drafts]);

  const empresasSemParcelamentoNoMes = useMemo(() => {
    const visible = new Set(cards.map((c) => c.empresa.id));
    return empresas.filter((e) => !visible.has(e.id));
  }, [empresas, cards]);

  const kpis = useMemo(() => {
    const counts: Record<ParcelamentoStatus, number> = {
      ativo: 0,
      encerrado: 0,
      saiu: 0,
      erro_emissao: 0,
      cancelado: 0,
    };
    for (const c of cards) {
      const raw = drafts[c.empresa.id]?.status ?? c.registro.status;
      const status = parseParcelamentoStatus(raw) ?? PARCELAMENTO_STATUS_DEFAULT;
      counts[status] += 1;
    }
    return { total: cards.length, ...counts };
  }, [cards, drafts]);

  const filtered = useMemo(() => {
    const q = fold(query);
    const qDigits = digitsCnpj(query);
    return cards.filter((card) => {
      const status =
        parseParcelamentoStatus(
          drafts[card.empresa.id]?.status ?? card.registro.status,
        ) ?? PARCELAMENTO_STATUS_DEFAULT;
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
        [id]: { ...(prev[id] ?? toDraft(registros[id], competencia)), ...patch },
      }));
    },
    [registros, competencia],
  );

  const saveCard = useCallback(
    async (id: string) => {
      const draft = drafts[id];
      if (!draft) return;
      if (!competenciaExiste) {
        setError("Gere a competência atual antes de salvar preenchimentos.");
        return;
      }
      const totalN = parseParcelaPositiva(draft.totalParcelas);
      let parcelaN = parseParcelaPositiva(draft.parcelaAtual);
      // Total sem parcela → assume 1ª parcela no mês aberto.
      if (totalN != null && parcelaN == null) {
        parcelaN = 1;
      }
      if (totalN == null && parcelaN != null) {
        setError("Informe também o Total de parcelas para montar o cronograma.");
        return;
      }
      if (totalN != null && parcelaN != null && parcelaN > totalN) {
        setError("Parcela atual não pode ser maior que o total.");
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
              parcelaAtual: parcelaN ?? undefined,
              vencimento: draft.vencimento,
              observacao: draft.observacao,
            },
          }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          registro?: CompetenciaRegistro;
          competencias?: string[];
          ultimaCompetencia?: string | null;
          mesesCronograma?: string[];
          error?: string;
        };
        if (!res.ok || !data.registro) {
          throw new Error(data.error || "Falha ao salvar.");
        }
        setRegistros((prev) => ({ ...prev, [id]: data.registro! }));
        setDrafts((prev) => ({
          ...prev,
          [id]: toDraft(data.registro, competencia),
        }));
        if (data.competencias?.length) {
          setComps(sortCompetencias(data.competencias));
        }
        if (data.mesesCronograma && data.mesesCronograma.length > 0) {
          setCompsGeradasInfo(data.mesesCronograma);
        } else {
          setCompsGeradasInfo(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao salvar.");
      } finally {
        setSavingId(null);
      }
    },
    [drafts, competencia, competenciaExiste],
  );

  const createEmpresa = useCallback(async () => {
    const totalN = parseParcelaPositiva(nova.totalParcelas);
    let parcelaN = parseParcelaPositiva(nova.parcelaAtual);
    if (totalN == null) {
      setError("Informe o Total de parcelas para a empresa entrar na grade.");
      return;
    }
    if (parcelaN == null) parcelaN = 1;
    if (parcelaN > totalN) {
      setError("Parcela atual não pode ser maior que o total.");
      return;
    }

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
          registro: {
            status: nova.status,
            tipo: nova.tipo || undefined,
            vencimento: nova.vencimento || null,
          },
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

      // Gera o cronograma conforme o total (só entra na grade por causa disso).
      const patch = await fetch("/api/parcelamentos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresaId: data.empresa.id,
          competencia: targetComp,
          registro: {
            status: nova.status,
            tipo: nova.tipo || undefined,
            vencimento: nova.vencimento || null,
            totalParcelas: totalN,
            parcelaAtual: parcelaN,
          },
        }),
      });
      const patchData = (await patch.json()) as {
        ok?: boolean;
        registro?: CompetenciaRegistro;
        competencias?: string[];
        mesesCronograma?: string[];
        error?: string;
      };
      if (!patch.ok || !patchData.registro) {
        throw new Error(patchData.error || "Empresa criada, mas falhou o cronograma.");
      }

      setEmpresas((prev) => [...prev, data.empresa!]);
      if (targetComp === competencia) {
        setRegistros((prev) => ({
          ...prev,
          [data.empresa!.id]: patchData.registro!,
        }));
      }
      setDrafts((prev) => ({
        ...prev,
        [data.empresa!.id]: toDraft(patchData.registro, targetComp),
      }));
      if (patchData.competencias?.length) {
        setComps(sortCompetencias(patchData.competencias));
      }
      if (patchData.mesesCronograma?.length) {
        setCompsGeradasInfo(patchData.mesesCronograma);
      }
      setNova(emptyNova());
      setShowNova(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar.");
    } finally {
      setBusy(false);
    }
  }, [nova, competencia, competenciaExiste, comps]);

  const adicionarParcelamento = useCallback(async () => {
    if (!addParcId) {
      setError("Selecione a empresa do cadastro.");
      return;
    }
    const totalN = parseParcelaPositiva(addParcTotal);
    let parcelaN = parseParcelaPositiva(addParcAtual);
    if (totalN == null) {
      setError("Informe o Total de parcelas para incluir na grade.");
      return;
    }
    if (parcelaN == null) parcelaN = 1;
    if (parcelaN > totalN) {
      setError("Parcela atual não pode ser maior que o total.");
      return;
    }
    if (!competenciaExiste) {
      setError("Gere a competência atual antes de adicionar parcelamento.");
      return;
    }

    setBusy(true);
    setBusyLabel("Adicionando parcelamento…");
    setError(null);
    try {
      const res = await fetch("/api/parcelamentos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresaId: addParcId,
          competencia,
          registro: {
            status: PARCELAMENTO_STATUS_DEFAULT,
            totalParcelas: totalN,
            parcelaAtual: parcelaN,
          },
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        registro?: CompetenciaRegistro;
        competencias?: string[];
        mesesCronograma?: string[];
        error?: string;
      };
      if (!res.ok || !data.registro) {
        throw new Error(data.error || "Falha ao adicionar parcelamento.");
      }
      setRegistros((prev) => ({ ...prev, [addParcId]: data.registro! }));
      setDrafts((prev) => ({
        ...prev,
        [addParcId]: toDraft(data.registro, competencia),
      }));
      if (data.competencias?.length) {
        setComps(sortCompetencias(data.competencias));
      }
      if (data.mesesCronograma?.length) {
        setCompsGeradasInfo(data.mesesCronograma);
      }
      setAddParcId("");
      setAddParcTotal("");
      setAddParcAtual("1");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao adicionar.");
    } finally {
      setBusy(false);
    }
  }, [addParcId, addParcTotal, addParcAtual, competencia, competenciaExiste]);

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

  const removerDaGrade = useCallback(
    async (item: EmpresaParcelamento) => {
      const ok = window.confirm(
        `Remover "${item.empresa}" só desta grade (${formatCompetencia(competencia)})?\nA empresa continua no cadastro.`,
      );
      if (!ok) return;
      setBusy(true);
      setBusyLabel("Removendo da grade…");
      setError(null);
      try {
        const res = await fetch("/api/parcelamentos", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ empresaId: item.id, competencia }),
        });
        const data = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !data.ok) throw new Error(data.error || "Falha ao remover.");
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
        setError(err instanceof Error ? err.message : "Falha ao remover da grade.");
      } finally {
        setBusy(false);
      }
    },
    [competencia],
  );

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
        description={`Tabela da competência ${competenciaLabel} · mesmas colunas em todos os meses`}
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

      <div className="rounded-lg border border-border bg-card p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <label className="grid gap-1 text-xs font-medium text-slate-700">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-3.5 text-primary" aria-hidden />
              Competência do parcelamento
            </span>
            <select
              className="h-9 min-w-[160px] rounded-md border border-input bg-white px-2 text-sm font-semibold tabular-nums"
              value={compsJanela.includes(competencia) ? competencia : compsJanela[0] || ""}
              onChange={(e) => irParaCompetencia(e.target.value)}
              disabled={compsJanela.length === 0}
              aria-label="Competência do parcelamento"
            >
              {compsJanela.map((id) => (
                <option key={id} value={id}>
                  {formatCompetencia(id)}
                  {id === currentCompetenciaId() ? " (mês atual)" : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-1.5">
            {compsJanela.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => irParaCompetencia(id)}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-xs font-semibold tabular-nums transition-colors",
                  id === competencia
                    ? "border-emerald-600 bg-emerald-600 text-white"
                    : "border-border bg-white text-slate-700 hover:border-emerald-400 hover:bg-emerald-50",
                )}
              >
                {formatCompetencia(id)}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Mostra só o mês atual e os 2 seguintes. Quando virar o mês, a janela
          avança sozinha. Cada competência abre a mesma tabela (Situação, COD,
          Empresa, Grupo, CNPJ, Tipo, Nº, Parcela atual, Total, Em aberto, Último
          mês, Vencimento, Obs e Ações).
        </p>
        {competencia && !compsJanela.includes(competencia) ? (
          <p className="mt-2 text-xs text-amber-800">
            Você está em {competenciaLabel}, fora da janela de 3 meses.{" "}
            <button
              type="button"
              className="font-semibold underline"
              onClick={() => irParaCompetencia(compsJanela[0] || currentCompetenciaId())}
            >
              Ir para o mês atual
            </button>
          </p>
        ) : null}
      </div>

      {compsGeradasInfo && compsGeradasInfo.length > 0 ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-950">
          <p className="font-medium">
            Cronograma desta empresa:{" "}
            {compsGeradasInfo.length === 1
              ? `só o mês seguinte (${formatCompetencia(compsGeradasInfo[0])})`
              : `${compsGeradasInfo.length} meses até ${formatCompetencia(compsGeradasInfo[compsGeradasInfo.length - 1])}`}
          </p>
          <p className="mt-1 text-xs text-emerald-900/80">
            Total 2 e parcela 1 → apenas 1 mês à frente. Total maior → cria
            automaticamente todos os meses restantes. Abra o mês para ver a
            tabela com os mesmos títulos.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {compsGeradasInfo.map((id) => (
              <Button
                key={id}
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setCompsGeradasInfo(null);
                  irParaCompetencia(id);
                }}
              >
                Abrir {formatCompetencia(id)}
              </Button>
            ))}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setCompsGeradasInfo(null)}
            >
              Fechar
            </Button>
          </div>
        </div>
      ) : null}

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
              empresas (Nº fixo da empresa; total em branco; vencimento automático
              conforme o tipo).
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
            Cria o mês novo vazio. Só entram empresas com parcelamento quando você
            salva Total + Parcela atual (o cronograma preenche os meses à frente).
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
              <span className="text-sm font-medium">Situação inicial</span>
              <select
                className={cn(situacaoSelectClass, "h-9")}
                aria-label="Situação inicial"
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
            <fieldset className="space-y-2 sm:col-span-2 lg:col-span-3">
              <legend className="text-sm font-medium">Tipo de parcelamento</legend>
              <p className="text-xs text-muted-foreground">
                PGFN, SN e SN PERT preenchem o vencimento com o último dia útil
                do mês. Municipal e estadual pedem data manual.
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {PARCELAMENTO_TIPO_CHECKBOX_OPTIONS.map((t) => (
                  <label
                    key={t}
                    className="flex cursor-pointer items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      className="size-4 rounded border-black/20"
                      checked={nova.tipo === t}
                      onChange={() => {
                        const nextTipo = nova.tipo === t ? "" : t;
                        setNova((f) => ({
                          ...f,
                          tipo: nextTipo,
                          vencimento: vencimentoAutomaticoPorTipo(
                            nextTipo,
                            competencia,
                          ),
                        }));
                      }}
                    />
                    <span>{PARCELAMENTO_TIPO_LABELS[t]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="space-y-1">
              <span className="text-sm font-medium">Vencimento</span>
              <Input
                type="date"
                value={nova.vencimento}
                onChange={(e) =>
                  setNova((f) => ({ ...f, vencimento: e.target.value }))
                }
              />
              {isTipoVencimentoAutomatico(nova.tipo) ? (
                <span className="block text-xs text-muted-foreground">
                  Preenchido automaticamente (último dia útil). Você pode
                  ajustar.
                </span>
              ) : nova.tipo === "municipal" || nova.tipo === "estadual" ? (
                <span className="block text-xs text-muted-foreground">
                  Preenchimento manual.
                </span>
              ) : null}
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium">Total de parcelas *</span>
              <Input
                type="number"
                min={1}
                value={nova.totalParcelas}
                placeholder="ex. 4"
                onChange={(e) =>
                  setNova((f) => ({ ...f, totalParcelas: e.target.value }))
                }
              />
              <span className="block text-xs text-muted-foreground">
                Obrigatório: a empresa só entra nas grades pelo total.
              </span>
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium">Parcela atual</span>
              <Input
                type="number"
                min={1}
                value={nova.parcelaAtual}
                onChange={(e) =>
                  setNova((f) => ({ ...f, parcelaAtual: e.target.value }))
                }
              />
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Total" value={kpis.total} />
        <Kpi label="Ativo" value={kpis.ativo} tone="ok" />
        <Kpi label="Encerrado" value={kpis.encerrado} tone="info" />
        <Kpi label="Erro na emissão" value={kpis.erro_emissao} tone="warn" />
        <Kpi label="Saiu da contabilidade" value={kpis.saiu} tone="muted" />
        <Kpi label="Cancelado por falta de pagamento" value={kpis.cancelado} tone="danger" />
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
          className={cn(situacaoSelectClass, "h-9 w-auto")}
          aria-label="Filtrar por situação"
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as ParcelamentoStatus | "todos")
          }
        >
          <option value="todos">Situação: todas</option>
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
        {empresasSemParcelamentoNoMes.length > 0 ? (
          <div className="flex w-full flex-wrap items-end gap-2 border-t border-border pt-3 sm:w-auto sm:border-t-0 sm:pt-0">
            <label className="grid gap-1 text-xs font-medium">
              Adicionar parcelamento
              <select
                className={cn(selectClass, "h-9 w-auto min-w-[200px]")}
                value={addParcId}
                onChange={(e) => setAddParcId(e.target.value)}
                aria-label="Empresa do cadastro"
              >
                <option value="">Empresa do cadastro…</option>
                {empresasSemParcelamentoNoMes.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.empresa}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-medium">
              Total *
              <Input
                type="number"
                min={1}
                className="h-9 w-24"
                value={addParcTotal}
                onChange={(e) => setAddParcTotal(e.target.value)}
                placeholder="4"
              />
            </label>
            <label className="grid gap-1 text-xs font-medium">
              Parcela
              <Input
                type="number"
                min={1}
                className="h-9 w-20"
                value={addParcAtual}
                onChange={(e) => setAddParcAtual(e.target.value)}
              />
            </label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!addParcId || !addParcTotal}
              onClick={() => void adicionarParcelamento()}
            >
              Incluir pelo total
            </Button>
          </div>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border shadow-sm">
        <div className="border-b border-emerald-300/80 bg-emerald-100/80 px-3 py-2 text-sm font-semibold text-slate-800">
          Tabela de parcelamentos — competência {competenciaLabel}
        </div>
        <table className="w-full min-w-[1200px] border-collapse text-left text-xs">
          <thead>
            <tr className="bg-emerald-200/90 text-[11px] font-semibold uppercase tracking-wide text-slate-800">
              <th className="border border-emerald-300/80 px-2 py-2">Situação</th>
              <th className="border border-emerald-300/80 px-2 py-2">COD</th>
              <th className="border border-emerald-300/80 px-2 py-2">Empresa</th>
              <th className="border border-emerald-300/80 px-2 py-2">Grupo</th>
              <th className="border border-emerald-300/80 px-2 py-2">CNPJ</th>
              <th className="border border-emerald-300/80 px-2 py-2">Tipo</th>
              <th className="border border-emerald-300/80 px-2 py-2">
                Nº parcelamento
              </th>
              <th className="border border-emerald-300/80 px-2 py-2">
                Parcela atual {competenciaLabel}
              </th>
              <th className="border border-emerald-300/80 px-2 py-2">Total</th>
              <th className="border border-emerald-300/80 px-2 py-2">Em aberto</th>
              <th className="border border-emerald-300/80 px-2 py-2">Último mês</th>
              <th className="border border-emerald-300/80 px-2 py-2">Vencimento</th>
              <th className="border border-emerald-300/80 px-2 py-2">Obs</th>
              <th className="border border-emerald-300/80 px-2 py-2">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((card) => {
              const id = card.empresa.id;
              const draft = drafts[id] ?? toDraft(card.registro, competencia);
              const totalDraft = parseParcelaPositiva(draft.totalParcelas);
              const parcelaDraft = parseParcelaPositiva(draft.parcelaAtual);
              const inicioParaCalc =
                card.registro.inicioCompetencia || competencia;
              const parcelaEsperada =
                totalDraft != null
                  ? calcParcelaAtual(inicioParaCalc, competencia, totalDraft)
                  : null;
              // Só sobrescreve o cálculo do mês se o usuário editou a parcela.
              const parcelaAtualOverride =
                parcelaDraft != null &&
                parcelaEsperada != null &&
                parcelaDraft !== parcelaEsperada
                  ? parcelaDraft
                  : parcelaDraft != null && parcelaEsperada == null
                    ? parcelaDraft
                    : null;
              const preview = buildCardView(
                card.empresa,
                {
                  ...card.registro,
                  status: draft.status,
                  tipo: (draft.tipo as ParcelamentoTipo) || undefined,
                  totalParcelas: totalDraft,
                  vencimento: draft.vencimento || null,
                  inicioCompetencia: card.registro.inicioCompetencia,
                },
                competencia,
                parcelaAtualOverride != null
                  ? { parcelaAtualOverride }
                  : undefined,
              );
              return (
                <tr key={id} className={cn(rowTone(draft.status))}>
                  <td className="border border-black/10 px-1.5 py-1 align-middle">
                    <select
                      className={situacaoSelectClass}
                      aria-label="Situação"
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
                      onChange={(e) => {
                        const nextTipo = e.target.value;
                        updateDraft(id, {
                          tipo: nextTipo,
                          vencimento: vencimentoAutomaticoPorTipo(
                            nextTipo,
                            competencia,
                          ),
                        });
                      }}
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
                  <td className="border border-black/10 px-1.5 py-1 align-middle">
                    <Input
                      type="number"
                      min={1}
                      className={cellInputClass}
                      value={draft.parcelaAtual}
                      placeholder="1"
                      title="Deixe 1 (ou vazio) se esta for a primeira parcela"
                      onChange={(e) =>
                        updateDraft(id, { parcelaAtual: e.target.value })
                      }
                    />
                  </td>
                  <td className="border border-black/10 px-1.5 py-1 align-middle">
                    <Input
                      type="number"
                      min={1}
                      className={cellInputClass}
                      value={draft.totalParcelas}
                      placeholder="ex. 2"
                      title="Total 2 + parcela 1 → só o mês seguinte; total maior → cria todos os meses até o fim"
                      onChange={(e) =>
                        updateDraft(id, { totalParcelas: e.target.value })
                      }
                    />
                  </td>
                  <td className="border border-black/10 px-2 py-1 align-middle text-center tabular-nums text-muted-foreground">
                    {preview.parcelasEmAberto ?? "—"}
                  </td>
                  <td className="border border-black/10 px-2 py-1 align-middle text-center tabular-nums font-medium">
                    {preview.ultimaCompetencia
                      ? formatCompetencia(preview.ultimaCompetencia)
                      : "—"}
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
                        title="Remover só desta grade"
                        onClick={() => void removerDaGrade(card.empresa)}
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
            Nenhuma empresa com parcelamento nesta competência. Use{" "}
            <strong>Nova empresa</strong> (com Total de parcelas) ou{" "}
            <strong>Incluir pelo total</strong> a partir do cadastro.
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
  tone?: "ok" | "warn" | "muted" | "info" | "danger";
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
          tone === "info" && "text-sky-700",
          tone === "warn" && "text-amber-700",
          tone === "danger" && "text-red-700",
          tone === "muted" && "text-slate-500",
          !tone && "text-slate-900",
        )}
      >
        {value}
      </p>
    </div>
  );
}
