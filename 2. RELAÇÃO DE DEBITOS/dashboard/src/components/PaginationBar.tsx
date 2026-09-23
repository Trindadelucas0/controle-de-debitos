"use client";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

type Props = {
  pageIndex: number;
  pageCount: number;
  pageSize: number;
  totalRows: number;
  canPreviousPage: boolean;
  canNextPage: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onPageSizeChange: (size: number) => void;
};

export function PaginationBar({
  pageIndex,
  pageCount,
  pageSize,
  totalRows,
  canPreviousPage,
  canNextPage,
  onPrevious,
  onNext,
  onPageSizeChange,
}: Props) {
  const from = totalRows === 0 ? 0 : pageIndex * pageSize + 1;
  const to = Math.min(totalRows, (pageIndex + 1) * pageSize);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-exito-muted">Linhas</span>
        <select
          className="h-8 rounded-ctl border-0 bg-surface-low px-2 text-xs text-ink outline-none focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2"
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
        >
          {[10, 25, 50].map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
        <span className="tabular text-exito-muted">
          {from}–{to} de {totalRows}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canPreviousPage}
          onClick={onPrevious}
        >
          Anterior
        </Button>
        <span className="tabular text-xs text-exito-muted">
          Página {pageCount === 0 ? 0 : pageIndex + 1} de {Math.max(pageCount, 1)}
        </span>
        <Button type="button" variant="outline" size="sm" disabled={!canNextPage} onClick={onNext}>
          Próxima
        </Button>
      </div>
    </div>
  );
}
