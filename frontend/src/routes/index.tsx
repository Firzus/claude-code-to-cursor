import { createFileRoute, redirect } from "@tanstack/react-router";

const STORAGE_KEY = "cctc:onboarding-complete";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    const done = typeof window !== "undefined" && localStorage.getItem(STORAGE_KEY) === "true";
    throw redirect({ to: done ? "/analytics" : "/setup" });
  },
});
