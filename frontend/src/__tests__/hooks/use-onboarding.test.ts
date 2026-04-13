import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useOnboardingComplete } from "~/hooks/use-onboarding";

const STORAGE_KEY = "cctc:onboarding-complete";

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe("useOnboardingComplete", () => {
  it("returns false when no value in localStorage", () => {
    const { result } = renderHook(() => useOnboardingComplete());
    expect(result.current.complete).toBe(false);
  });

  it("returns true when localStorage has the key", () => {
    localStorage.setItem(STORAGE_KEY, "true");
    const { result } = renderHook(() => useOnboardingComplete());
    expect(result.current.complete).toBe(true);
  });

  it("markComplete sets localStorage and updates state", () => {
    const { result } = renderHook(() => useOnboardingComplete());

    act(() => {
      result.current.markComplete();
    });

    expect(localStorage.getItem(STORAGE_KEY)).toBe("true");
    expect(result.current.complete).toBe(true);
  });

  it("reset removes localStorage and updates state", () => {
    localStorage.setItem(STORAGE_KEY, "true");
    const { result } = renderHook(() => useOnboardingComplete());

    expect(result.current.complete).toBe(true);

    act(() => {
      result.current.reset();
    });

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(result.current.complete).toBe(false);
  });
});
