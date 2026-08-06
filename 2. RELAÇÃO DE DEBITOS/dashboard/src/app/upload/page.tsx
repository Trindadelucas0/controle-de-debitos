import { UploadPanel } from "@/components/UploadPanel";
import { listCompetencias, resolveCompetencia } from "@/lib/data";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ competencia?: string }>;
};

export default async function UploadPage({ searchParams }: Props) {
  const sp = await searchParams;
  const competencias = listCompetencias();
  const competencia = resolveCompetencia(sp.competencia);

  return (
    <UploadPanel competencias={competencias} competenciaInicial={competencia || competencias[0] || "07-2026"} />
  );
}
