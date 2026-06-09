import { cn } from "@/utils/cn";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeMap = {
  sm: "24px",
  md: "40px",
  lg: "64px",
};

export function LoadingSpinner({ size = "md", className }: LoadingSpinnerProps) {
  const px = sizeMap[size];

  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn("loading-spinner", className)}
      style={{ width: px, height: px }}
    >
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .loading-spinner {
          border: 3px solid rgba(255,255,255,0.15);
          border-top-color: var(--tg-theme-button-color, #2481cc);
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }
      `}</style>
    </div>
  );
}
