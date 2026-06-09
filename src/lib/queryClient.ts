import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't refetch on window focus inside Telegram (focus events are unreliable)
      refetchOnWindowFocus: false,
      // Retry once before surfacing an error to the UI
      retry: 1,
      // Keep data fresh for 30 seconds
      staleTime: 30_000,
    },
    mutations: {
      retry: 0,
    },
  },
});
