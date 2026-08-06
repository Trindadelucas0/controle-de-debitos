import { Suspense } from "react";
import { ConsultasTable } from "@/components/ConsultasTable";
import { loadCadastroConsultas, listEmpresasSistema } from "@/lib/cadastro";
import { resolveCompetencia } from "@/lib/data";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ competencia?: string }>;
};

export default async function ConsultasPage({ searchParams }: Props) {
  const sp = await searchParams;
  const competencia = resolveCompetencia(sp.competencia);
  const cadastro = loadCadastroConsultas();
  const debitoLinks = listEmpresasSistema().map((empresa) => ({
    id: empresa.id,
    codigo: empresa.codigo,
    cnpj: empresa.cnpj,
  }));

  return (
    <Suspense
      fallback={<div className="px-4 py-5 text-sm text-muted-foreground">Carregando consultas…</div>}
    >
      {cadastro.error ? (
        <p className="mx-4 mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Cadastro indisponível: {cadastro.error}
        </p>
      ) : null}
      <ConsultasTable
        empresas={cadastro.empresas}
        competencia={competencia}
        debitoLinks={debitoLinks}
      />
    </Suspense>
  );
}
