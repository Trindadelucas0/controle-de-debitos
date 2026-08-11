import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide transition-colors duration-200 [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        outline: "border-border text-foreground",
        danger:
          "border-transparent bg-amber-100 text-amber-900 ring-1 ring-amber-200",
        success:
          "border-transparent bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200",
        muted: "border-transparent bg-slate-100 text-slate-500",
        federal:
          "border-transparent bg-blue-100 text-blue-800 ring-1 ring-blue-200",
        estadual:
          "border-transparent bg-teal-100 text-teal-800 ring-1 ring-teal-200",
        municipal:
          "border-transparent bg-orange-100 text-orange-800 ring-1 ring-orange-200",
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
