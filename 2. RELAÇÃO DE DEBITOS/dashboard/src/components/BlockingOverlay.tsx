"use client";

import { Loader2 } from "lucide-react";

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
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-[2px]"
      role="alertdialog"
      aria-modal="true"
      aria-busy="true"
      aria-live="assertive"
      aria-labelledby="blocking-overlay-title"
      aria-describedby={description ? "blocking-overlay-desc" : undefined}
    >
      <div className="w-full max-w-sm rounded-lg border border-white/10 bg-white px-6 py-7 text-center shadow-xl">
        <Loader2 className="mx-auto size-8 animate-spin text-teal-700" aria-hidden />
        <p id="blocking-overlay-title" className="mt-4 text-base font-semibold text-slate-900">
          {title}
        </p>
        {description ? (
          <p id="blocking-overlay-desc" className="mt-2 text-sm text-slate-600">
            {description}
          </p>
        ) : null}
        {progress && progress.total > 0 ? (
          <div className="mt-4 space-y-2">
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-teal-600 transition-[width] duration-300"
                style={{ width: `${pct ?? 0}%` }}
              />
            </div>
            <p className="text-xs tabular-nums text-slate-500">
              {progress.current}/{progress.total}
              {pct != null ? ` · ${pct}%` : ""}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
