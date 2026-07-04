import { RouterProvider } from "react-router-dom";
import { QueryProvider } from "@/providers/QueryProvider";
import { router } from "@/router";
import DevGuard from "@/components/DevGuard";

export default function App() {
  return (
    <QueryProvider>
      <DevGuard>
        <RouterProvider router={router} />
      </DevGuard>
    </QueryProvider>
  );
}
