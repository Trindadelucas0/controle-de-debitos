import { Suspense } from "react";
import { ParcelamentosPanel } from "@/components/ParcelamentosPanel";
import { getCompetenciaAtual, listCompetencias } from "@/lib/data";
import { loadParcelamentos } from "@/lib/parcelamentos";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ competencia?: string }>;
};

export default async function ParcelamentosPage({ searchParams }: Props) {
  const sp = await searchParams;
  const data = loadParcelamentos();

  const listDebitos = listCompetencias();
  const atualDebitos = getCompetenciaAtual();
  const fromUrl = sp.competencia?.trim() || "";

  const competencia =
    fromUrl ||
    data.atual ||
    (data.competencias.length ? data.competencias[data.competencias.length - 1] : "") ||
    (fromUrl && listDebitos.includes(fromUrl) ? fromUrl : "") ||
    atualDebitos ||
    listDebitos[listDebitos.length - 1] ||
    "08-2026";

  return (
    <Suspense
      fallback={
        <div className="px-4 py-5 text-sm text-muted-foreground">
          Carregando parcelamentos…
        </div>
      }
    >
      <ParcelamentosPanel
        key={competencia}
        initialEmpresas={data.empresas}
        initialRegistros={data.porCompetencia[competencia] ?? {}}
        competenciasParcelamento={data.competencias}
        competencia={competencia}
        loadError={data.error}
      />
    </Suspense>
  );
}
