"use client";

import { Loader2 } from "lucide-react";

type Props = {
  open: boolean;
  title: string;
  description?: string;
};

/** Overlay em tela cheia que bloqueia cliques enquanto uma operação termina. */
export function BlockingOverlay({ open, title, description }: Props) {
  if (!open) return null;

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
      </div>
    </div>
  );
}
