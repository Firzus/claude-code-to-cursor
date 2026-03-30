import { describe, it, expect } from "vitest";
import { loginFormSchema } from "../../schemas/login";

describe("loginFormSchema", () => {
  it("accepts a valid code", () => {
    const result = loginFormSchema.safeParse({ code: "abc123" });
    expect(result.success).toBe(true);
  });

  it("rejects empty code", () => {
    const result = loginFormSchema.safeParse({ code: "" });
    expect(result.success).toBe(false);
  });

  it("trims whitespace", () => {
    const result = loginFormSchema.safeParse({ code: "  abc123  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.code).toBe("abc123");
    }
  });

  it("rejects whitespace-only code", () => {
    const result = loginFormSchema.safeParse({ code: "   " });
    expect(result.success).toBe(false);
  });
});
