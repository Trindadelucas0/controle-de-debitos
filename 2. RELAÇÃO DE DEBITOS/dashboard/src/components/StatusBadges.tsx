import { Badge } from "@/components/ui/badge";
import { Icon, type IconName } from "@/components/ui/icon";
import type { Esfera } from "@/lib/types";
import { cn } from "@/lib/utils";

const ESFERA_ICON: Record<Esfera, IconName> = {
  federal: "account_balance",
  estadual: "apartment",
  municipal: "location_on",
};

type StatusBadgeProps = {
  status: "pendencia" | "regular" | string;
  className?: string;
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const isPendencia = status === "pendencia";
  return (
    <Badge
      variant={isPendencia ? "danger" : "success"}
      className={cn("normal-case tracking-normal", className)}
    >
      <Icon name={isPendencia ? "warning" : "check_circle"} size={14} />
      {isPendencia ? "Pendência" : "Regular"}
    </Badge>
  );
}

type EsferaBadgeProps = {
  esfera: Esfera;
  label?: string;
  className?: string;
  variant?:
    | "federal"
    | "estadual"
    | "municipal"
    | "default"
    | "secondary"
    | "outline"
    | "danger"
    | "success"
    | "muted";
};

export function EsferaBadge({ esfera, label, className, variant }: EsferaBadgeProps) {
  const resolvedVariant = variant ?? esfera;
  return (
    <Badge
      variant={resolvedVariant}
      className={cn("normal-case tracking-normal", className)}
    >
      <Icon name={ESFERA_ICON[esfera]} size={14} />
      {label ?? esfera}
    </Badge>
  );
}

export { ESFERA_ICON };
