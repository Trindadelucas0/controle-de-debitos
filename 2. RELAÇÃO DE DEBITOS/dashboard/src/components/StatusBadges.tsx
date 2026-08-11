import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Landmark,
  MapPin,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Esfera } from "@/lib/types";
import { cn } from "@/lib/utils";

const ESFERA_ICON: Record<Esfera, LucideIcon> = {
  federal: Landmark,
  estadual: Building2,
  municipal: MapPin,
};

type StatusBadgeProps = {
  status: "pendencia" | "regular" | string;
  className?: string;
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const isPendencia = status === "pendencia";
  const Icon = isPendencia ? AlertTriangle : CheckCircle2;
  return (
    <Badge
      variant={isPendencia ? "danger" : "success"}
      className={cn("normal-case tracking-normal", className)}
    >
      <Icon aria-hidden />
      {isPendencia ? "Pendência" : "Regular"}
    </Badge>
  );
}

type EsferaBadgeProps = {
  esfera: Esfera;
  label?: string;
  className?: string;
  variant?: "federal" | "estadual" | "municipal" | "default" | "secondary" | "outline" | "danger" | "success" | "muted";
};

export function EsferaBadge({ esfera, label, className, variant }: EsferaBadgeProps) {
  const Icon = ESFERA_ICON[esfera];
  const resolvedVariant = variant ?? esfera;
  return (
    <Badge
      variant={resolvedVariant}
      className={cn("normal-case tracking-normal", className)}
    >
      <Icon aria-hidden />
      {label ?? esfera}
    </Badge>
  );
}

export { ESFERA_ICON };
