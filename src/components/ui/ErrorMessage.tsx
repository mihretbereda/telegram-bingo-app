import { getErrorMessage } from "@/utils/errors";

interface ErrorMessageProps {
  error: unknown;
  onRetry?: () => void;
}

export function ErrorMessage({ error, onRetry }: ErrorMessageProps) {
  return (
    <div role="alert" style={{ padding: "1rem", textAlign: "center" }}>
      <p style={{ color: "var(--tg-theme-destructive-text-color, #ff3b30)" }}>
        {getErrorMessage(error)}
      </p>
      {onRetry && (
        <button onClick={onRetry} style={{ marginTop: "0.5rem" }}>
          Try again
        </button>
      )}
    </div>
  );
}
