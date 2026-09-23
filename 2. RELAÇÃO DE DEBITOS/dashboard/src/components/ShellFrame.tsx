"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AppTopBar } from "@/components/AppTopBar";
import { SidebarNav } from "@/components/SidebarNav";

type Props = {
  children: ReactNode;
  competencias: string[];
  competenciaAtual: string;
};

export function ShellFrame({ children, competencias, competenciaAtual }: Props) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDrawer();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen, closeDrawer]);

  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <AppTopBar
        competencias={competencias}
        competenciaAtual={competenciaAtual}
        onOpenMenu={openDrawer}
      />

      <div className="flex min-h-0 flex-1">
        {/* Desktop sidebar */}
        <aside
          className="hidden w-[var(--sidebar-w)] shrink-0 border-r border-line bg-card lg:block"
          style={{ minHeight: "calc(100vh - var(--topbar-h))" }}
        >
          <SidebarNav competencias={competencias} competenciaAtual={competenciaAtual} />
        </aside>

        {/* Mobile drawer */}
        {drawerOpen ? (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-[var(--overlay)]"
              aria-label="Fechar menu"
              onClick={closeDrawer}
            />
            <aside
              className="absolute inset-y-0 left-0 flex w-[var(--sidebar-w)] max-w-[85vw] flex-col bg-card shadow-[var(--shadow-md)]"
              role="dialog"
              aria-modal="true"
              aria-label="Menu de navegação"
            >
              <SidebarNav
                competencias={competencias}
                competenciaAtual={competenciaAtual}
                onNavigate={closeDrawer}
              />
            </aside>
          </div>
        ) : null}

        <main className="min-w-0 flex-1 bg-surface">{children}</main>
      </div>
    </div>
  );
}
