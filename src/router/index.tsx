import { lazy, Suspense } from "react";
import { createBrowserRouter } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageLoader } from "@/components/ui";
import NotFound from "@/pages/NotFound";

const Home    = lazy(() => import("@/pages/Home"));
const History = lazy(() => import("@/pages/History"));
const Wallet  = lazy(() => import("@/pages/Wallet"));
const Profile = lazy(() => import("@/pages/Profile"));
const Play    = lazy(() => import("@/pages/Play"));
const Game    = lazy(() => import("@/pages/Game"));

const withSuspense = (Page: React.ComponentType) => (
  <Suspense fallback={<PageLoader />}>
    <Page />
  </Suspense>
);

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true,      element: withSuspense(Home)    },
      { path: "history",  element: withSuspense(History) },
      { path: "wallet",   element: withSuspense(Wallet)  },
      { path: "profile",  element: withSuspense(Profile) },
      { path: "play",     element: withSuspense(Play)    },
    ],
  },
  // Game is full-screen — outside AppLayout so the bottom nav is hidden
  { path: "game", element: withSuspense(Game) },
  { path: "*", element: <NotFound /> },
]);
