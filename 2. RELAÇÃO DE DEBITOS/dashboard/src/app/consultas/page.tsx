import { Suspense } from "react";
import { ConsultasTable } from "@/components/ConsultasTable";
import { loadCadastroConsultas } from "@/lib/cadastro";

export const dynamic = "force-dynamic";

export default async function ConsultasPage() {
  const cadastro = loadCadastroConsultas();

  return (
    <Suspense
      fallback={<div className="px-4 py-5 text-sm text-muted-foreground">Carregando consultas…</div>}
    >
      {cadastro.error ? (
        <p className="mx-4 mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Cadastro indisponível: {cadastro.error}
        </p>
      ) : null}
      <ConsultasTable empresas={cadastro.empresas} />
    </Suspense>
  );
}
