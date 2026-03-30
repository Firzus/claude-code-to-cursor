import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "~/lib/api-client";
import { queryKeys } from "~/lib/query-keys";
import type { SettingsResponse } from "~/schemas/api-responses";
import type { SettingsFormValues } from "~/schemas/settings";

export function useSettings() {
  return useQuery({
    queryKey: queryKeys.settings,
    queryFn: () => apiFetch<SettingsResponse>("/settings"),
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (settings: SettingsFormValues) =>
      apiFetch<{ success: boolean; settings: SettingsFormValues }>(
        "/settings/model",
        {
          method: "POST",
          body: JSON.stringify(settings),
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings });
    },
  });
}
