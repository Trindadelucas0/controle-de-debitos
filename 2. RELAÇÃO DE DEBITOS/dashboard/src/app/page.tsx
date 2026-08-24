import { Suspense } from "react";
import { EmpresasTable } from "@/components/EmpresasTable";
import { getDataError, getSnapshot, resolveCompetencia } from "@/lib/data";
import { loadParcelamentos } from "@/lib/parcelamentos";
import { buildSiteEmissaoByCnpj } from "@/lib/parcelamentos-utils";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ competencia?: string; esfera?: string; status?: string }>;
};

export default async function HomePage({ searchParams }: Props) {
  const sp = await searchParams;
  const competencia = resolveCompetencia(sp.competencia);
  const snapshot = getSnapshot(competencia);
  const dataError = getDataError();

  const parcelamentos = loadParcelamentos();
  const parcComp =
    (parcelamentos.competencias.includes(competencia) && competencia) ||
    parcelamentos.atual ||
    parcelamentos.competencias[parcelamentos.competencias.length - 1] ||
    "";
  const siteEmissaoByCnpj = buildSiteEmissaoByCnpj(
    parcelamentos.empresas,
    parcComp ? (parcelamentos.porCompetencia[parcComp] ?? {}) : {},
  );

  return (
    <Suspense fallback={<div className="px-4 py-5 text-sm text-muted-foreground">Carregando painel…</div>}>
      {dataError ? (
        <p className="mx-4 mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Dados indisponíveis: {dataError}
        </p>
      ) : null}
      <EmpresasTable
        empresas={snapshot.empresas}
        totais={snapshot.totais_gerais}
        geradoEm={snapshot.gerado_em}
        competencia={competencia}
        siteEmissaoByCnpj={siteEmissaoByCnpj}
      />
    </Suspense>
  );
}
