"use client";

import { Button } from "@/components/ui/button";

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
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">Linhas</span>
        <select
          className="h-8 rounded-md border border-input bg-card px-2 text-xs transition-colors"
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
        >
          {[10, 25, 50].map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
        <span className="tabular text-muted-foreground">
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
        <span className="tabular text-xs text-muted-foreground">
          Página {pageCount === 0 ? 0 : pageIndex + 1} de {Math.max(pageCount, 1)}
        </span>
        <Button type="button" variant="outline" size="sm" disabled={!canNextPage} onClick={onNext}>
          Próxima
        </Button>
      </div>
    </div>
  );
}
