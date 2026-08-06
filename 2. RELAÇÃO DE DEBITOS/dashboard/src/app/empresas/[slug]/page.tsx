import { notFound } from "next/navigation";
import { EmpresaDetail } from "@/components/EmpresaDetail";
import {
  allEmpresaIds,
  findEmpresaNaCompetencia,
  getEmpresa,
  listCompetencias,
  resolveCompetencia,
} from "@/lib/data";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ competencia?: string; comparar?: string }>;
};

export function generateStaticParams() {
  try {
    return allEmpresaIds().map((id) => ({ slug: id }));
  } catch {
    return [];
  }
}

export default async function EmpresaPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const competencias = listCompetencias();
  const competencia = resolveCompetencia(sp.competencia);
  const comparar =
    sp.comparar && sp.comparar !== competencia && competencias.includes(sp.comparar)
      ? sp.comparar
      : null;

  const empresa =
    getEmpresa(slug, competencia) ??
    (() => {
      for (const c of competencias) {
        const ref = getEmpresa(slug, c);
        if (ref) return findEmpresaNaCompetencia(ref, competencia);
      }
      return undefined;
    })();

  if (!empresa) notFound();

  const empresaComparacao = comparar
    ? findEmpresaNaCompetencia(empresa, comparar) ?? null
    : null;

  return (
    <EmpresaDetail
      empresa={empresa}
      competencias={competencias}
      competencia={competencia}
      compararCompetencia={comparar}
      empresaComparacao={empresaComparacao}
    />
  );
}
