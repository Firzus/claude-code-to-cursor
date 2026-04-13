import { z } from "zod";

export const loginFormSchema = z.object({
  code: z.string().trim().min(1, "Authorization code is required"),
});

export type LoginFormValues = z.infer<typeof loginFormSchema>;
