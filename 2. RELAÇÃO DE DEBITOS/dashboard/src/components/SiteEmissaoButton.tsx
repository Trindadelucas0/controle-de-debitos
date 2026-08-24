"use client";

import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  labelSiteEmissao,
  resolveSiteEmissao,
} from "@/lib/parcelamentos-utils";
import type { ParcelamentoTipo } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  siteEmissao?: string | null;
  tipo?: ParcelamentoTipo | "" | null;
  /** Quando true, mostra "—" se não houver URL (grade de parcelamentos). */
  showPlaceholder?: boolean;
  className?: string;
  /** Impede que o clique suba para um Link pai (ex.: linha da tabela). */
  stopPropagation?: boolean;
};

export function SiteEmissaoButton({
  siteEmissao,
  tipo,
  showPlaceholder = false,
  className,
  stopPropagation = false,
}: Props) {
  const href = resolveSiteEmissao(siteEmissao, tipo);
  const label = labelSiteEmissao(tipo);

  if (!href) {
    if (!showPlaceholder) return null;
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <Button
      asChild
      size="sm"
      variant="outline"
      className={cn("h-7 gap-1 px-2 text-[11px]", className)}
      title={`Abrir site de emissão (${label})`}
    >
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => {
          if (stopPropagation) e.stopPropagation();
        }}
      >
        <ExternalLink className="size-3" aria-hidden />
        {label}
      </a>
    </Button>
  );
}
