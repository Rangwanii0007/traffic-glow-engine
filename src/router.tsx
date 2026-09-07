import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { PageLoader } from "./components/PageLoader";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // never show a blank screen while a page resolves
    defaultPendingComponent: PageLoader,
    defaultPendingMs: 150,
    defaultPendingMinMs: 300,
  });

  return router;
};
