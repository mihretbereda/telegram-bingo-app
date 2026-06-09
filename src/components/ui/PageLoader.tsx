import { LoadingSpinner } from "./LoadingSpinner";

export function PageLoader() {
  return (
    <div style={{ display: "flex", justifyContent: "center", paddingTop: "4rem" }}>
      <LoadingSpinner size="lg" />
    </div>
  );
}
