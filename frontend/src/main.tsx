import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createRouter } from "./router";
import "./styles/app.css";

const router = createRouter();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={router.options.context?.queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
