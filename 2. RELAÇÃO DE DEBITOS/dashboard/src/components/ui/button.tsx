import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-ctl text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 [&_.material-symbols-outlined]:text-[20px] [&_.material-symbols-outlined]:leading-none",
  {
    variants: {
      variant: {
        default: "bg-green text-on-primary shadow-[var(--shadow)] hover:bg-green-hover",
        destructive: "bg-danger text-on-primary shadow-[var(--shadow)] hover:bg-danger/90",
        outline:
          "border border-secondary-border bg-card text-ink shadow-[var(--shadow)] hover:bg-surface-low",
        secondary: "bg-surface-low text-ink hover:bg-surface-container",
        ghost: "bg-transparent text-ink hover:bg-surface-low",
        link: "text-green underline-offset-4 hover:underline",
        success: "bg-green text-on-primary shadow-[var(--shadow)] hover:bg-green-hover",
      },
      size: {
        default: "h-12 px-4 py-2",
        sm: "h-9 rounded-ctl px-3 text-xs",
        lg: "h-12 rounded-ctl px-6",
        icon: "size-12",
        "icon-sm": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
