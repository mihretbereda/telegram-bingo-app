// Lightweight className merger — avoids pulling in clsx for now.
// Swap with `import { clsx } from "clsx"` + `import { twMerge } from "tailwind-merge"` if you add Tailwind.
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}
