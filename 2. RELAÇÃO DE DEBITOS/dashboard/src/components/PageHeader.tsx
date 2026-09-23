import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

type Props = {
  icon: IconName;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
  iconClassName?: string;
};

export function PageHeader({
  icon,
  title,
  description,
  actions,
  className,
  iconClassName,
}: Props) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={cn(
            "mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-ctl bg-success-bg text-green",
            iconClassName,
          )}
        >
          <Icon name={icon} size={20} />
        </span>
        <div className="min-w-0">
          <h2 className="t-title-lg text-ink">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm text-exito-muted">{description}</p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
