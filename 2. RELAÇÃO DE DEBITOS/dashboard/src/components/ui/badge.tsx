import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide transition-colors duration-200 [&_.material-symbols-outlined]:text-[14px]",
  {
    variants: {
      variant: {
        default: "border-transparent bg-green text-on-primary",
        secondary: "border-transparent bg-surface-low text-ink",
        outline: "border-transparent bg-neutral-pill text-exito-muted",
        danger: "border-danger-border bg-danger-bg text-danger",
        success: "border-success-border bg-success-bg text-green",
        muted: "border-transparent bg-neutral-pill text-exito-muted",
        federal: "border-transparent bg-success-bg text-green",
        estadual: "border-transparent bg-green-fixed/40 text-green",
        municipal: "border-transparent bg-surface-container text-on-surface-variant",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
