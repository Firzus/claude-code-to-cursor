import { useCallback, useSyncExternalStore } from "react";
import { useHealth } from "./use-health";

const STORAGE_KEY = "cctc:onboarding-complete";

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
}

function getSnapshot() {
  return localStorage.getItem(STORAGE_KEY) === "true";
}

export function useOnboardingComplete() {
  const complete = useSyncExternalStore(subscribe, getSnapshot, () => false);

  const markComplete = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "true");
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
  }, []);

  const reset = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
  }, []);

  return { complete, markComplete, reset };
}

export function useNeedsOnboarding() {
  const { complete } = useOnboardingComplete();
  const health = useHealth();

  const isNew = !complete && health.data !== undefined && !health.data.claudeCode.authenticated;

  return { needsOnboarding: isNew, isLoading: health.isLoading };
}
