import { describe, expect, it, mock } from "bun:test";

mock.module("./config", () => ({
  getConfig: () => ({
    port: 8082,
    allowedIPs: ["1.2.3.4", "5.6.7.8"],
    allowedOrigins: ["https://example.com", "http://localhost:3111"],
  }),
}));

mock.module("./logger", () => ({
  logger: { info: () => {}, verbose: () => {}, error: () => {} },
}));

const { checkIPWhitelist, corsHeaders, extractHeaders } = await import("./middleware");

describe("checkIPWhitelist", () => {
  it("allows IP present in the whitelist (cf-connecting-ip)", () => {
    const req = new Request("http://localhost/test", {
      headers: { "cf-connecting-ip": "1.2.3.4" },
    });
    const result = checkIPWhitelist(req);
    expect(result.allowed).toBe(true);
    expect(result.ip).toBe("1.2.3.4");
  });

  it("allows IP from x-forwarded-for when cf-connecting-ip is absent", () => {
    const req = new Request("http://localhost/test", {
      headers: { "x-forwarded-for": "5.6.7.8, 10.0.0.1" },
    });
    const result = checkIPWhitelist(req);
    expect(result.allowed).toBe(true);
    expect(result.ip).toBe("5.6.7.8");
  });

  it("blocks IP not in the whitelist", () => {
    const req = new Request("http://localhost/test", {
      headers: { "cf-connecting-ip": "9.9.9.9" },
    });
    const result = checkIPWhitelist(req);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("9.9.9.9");
  });

  it("blocks when no IP headers are present", () => {
    const req = new Request("http://localhost/test");
    const result = checkIPWhitelist(req);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("No IP found");
  });
});

describe("corsHeaders", () => {
  it("falls back to the first allowed origin when no request is provided", () => {
    const headers = corsHeaders();
    expect(headers["Access-Control-Allow-Origin"]).toBe("https://example.com");
  });

  it("echoes the request origin when it is in the allow-list", () => {
    const req = new Request("http://localhost/test", {
      headers: { origin: "http://localhost:3111" },
    });
    const headers = corsHeaders(req);
    expect(headers["Access-Control-Allow-Origin"]).toBe("http://localhost:3111");
  });

  it("falls back to the first allowed origin when request origin is not in the list", () => {
    const req = new Request("http://localhost/test", {
      headers: { origin: "https://evil.example" },
    });
    const headers = corsHeaders(req);
    expect(headers["Access-Control-Allow-Origin"]).toBe("https://example.com");
  });

  it("sets Vary: Origin so caches don't pollute responses across origins", () => {
    const headers = corsHeaders();
    expect(headers["Vary"]).toBe("Origin");
  });

  it("includes credentials header", () => {
    const headers = corsHeaders();
    expect(headers["Access-Control-Allow-Credentials"]).toBe("true");
  });

  it("allows POST, GET, OPTIONS methods", () => {
    const headers = corsHeaders();
    expect(headers["Access-Control-Allow-Methods"]).toContain("POST");
    expect(headers["Access-Control-Allow-Methods"]).toContain("GET");
    expect(headers["Access-Control-Allow-Methods"]).toContain("OPTIONS");
  });
});

describe("extractHeaders", () => {
  it("passes through anthropic-version when present", () => {
    const req = new Request("http://localhost/test", {
      headers: { "anthropic-version": "2024-01-01" },
    });
    const headers = extractHeaders(req);
    expect(headers["anthropic-version"]).toBe("2024-01-01");
  });

  it("defaults anthropic-version to 2023-06-01", () => {
    const req = new Request("http://localhost/test");
    const headers = extractHeaders(req);
    expect(headers["anthropic-version"]).toBe("2023-06-01");
  });

  it("passes through anthropic-beta when present", () => {
    const req = new Request("http://localhost/test", {
      headers: { "anthropic-beta": "some-beta-flag" },
    });
    const headers = extractHeaders(req);
    expect(headers["anthropic-beta"]).toBe("some-beta-flag");
  });
});
