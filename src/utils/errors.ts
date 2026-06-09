import type { PostgrestError } from "@supabase/supabase-js";

// Normalise any thrown value into a human-readable message.
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (isPostgrestError(error)) return error.message;
  if (typeof error === "string") return error;
  return "An unexpected error occurred.";
}

function isPostgrestError(error: unknown): error is PostgrestError {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    "code" in error
  );
}

// Use in catch blocks to assert unknown is an Error before re-throwing.
export function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  return new Error(getErrorMessage(value));
}
