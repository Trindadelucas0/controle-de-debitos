"use client";

import { Icon } from "@/components/ui/icon";

type Props = {
  open: boolean;
  title: string;
  description?: string;
  progress?: { current: number; total: number } | null;
};

/** Overlay em tela cheia que bloqueia cliques enquanto uma operação termina. */
export function BlockingOverlay({ open, title, description, progress }: Props) {
  if (!open) return null;

  const pct =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.current / progress.total) * 100))
      : null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--overlay)] px-4"
      role="alertdialog"
      aria-modal="true"
      aria-busy="true"
      aria-live="assertive"
      aria-labelledby="blocking-overlay-title"
      aria-describedby={description ? "blocking-overlay-desc" : undefined}
    >
      <div className="w-full max-w-sm rounded-card border border-line bg-card px-6 py-7 text-center shadow-[var(--shadow-md)]">
        <Icon name="progress_activity" className="mx-auto animate-spin text-green" size={32} />
        <p id="blocking-overlay-title" className="mt-4 t-title-sm text-ink">
          {title}
        </p>
        {description ? (
          <p id="blocking-overlay-desc" className="mt-2 text-sm text-exito-muted">
            {description}
          </p>
        ) : null}
        {progress && progress.total > 0 ? (
          <div className="mt-4 space-y-2">
            <div className="h-2 overflow-hidden rounded-full bg-surface-low">
              <div
                className="h-full rounded-full bg-green transition-[width] duration-300"
                style={{ width: `${pct ?? 0}%` }}
              />
            </div>
            <p className="text-xs tabular-nums text-exito-muted">
              {progress.current}/{progress.total}
              {pct != null ? ` · ${pct}%` : ""}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
