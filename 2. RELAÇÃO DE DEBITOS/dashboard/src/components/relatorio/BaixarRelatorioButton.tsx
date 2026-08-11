"use client";

import { FileDown, Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Empresa } from "@/lib/types";

type Props = {
  empresa: Empresa;
  competencia: string;
};

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function BaixarRelatorioButton({ empresa, competencia }: Props) {
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const baixar = async () => {
    if (gerando) return;
    setGerando(true);
    setErro(null);
    try {
      const [{ pdf }, { EmpresaRelatorioPdfDocument }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/components/relatorio/EmpresaRelatorioPdfDocument"),
      ]);

      const blob = await pdf(
        <EmpresaRelatorioPdfDocument empresa={empresa} competencia={competencia} />,
      ).toBlob();

      const slug = slugify(empresa.nome || empresa.id || "empresa") || empresa.id;
      const fileName = `relatorio-${slug}-${competencia}.pdf`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao gerar o relatório PDF");
    } finally {
      setGerando(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={baixar}
        disabled={gerando}
        className="gap-1.5"
      >
        {gerando ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
        ) : (
          <FileDown className="size-3.5" aria-hidden />
        )}
        {gerando ? "Gerando…" : "Baixar relatório PDF"}
      </Button>
      {erro ? <p className="max-w-[220px] text-right text-xs text-red-600">{erro}</p> : null}
    </div>
  );
}
