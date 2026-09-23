import { cn } from "@/lib/utils";

export type IconName = string;

type Props = {
  name: IconName;
  className?: string;
  size?: number;
  filled?: boolean;
  "aria-hidden"?: boolean | "true" | "false";
};

export function Icon({
  name,
  className,
  size = 20,
  filled = false,
  "aria-hidden": ariaHidden = true,
}: Props) {
  return (
    <span
      className={cn("material-symbols-outlined", className)}
      style={{
        fontSize: size,
        fontVariationSettings: filled
          ? '"FILL" 1, "wght" 400, "GRAD" 0, "opsz" 24'
          : '"FILL" 0, "wght" 400, "GRAD" 0, "opsz" 24',
      }}
      aria-hidden={ariaHidden}
    >
      {name}
    </span>
  );
}
