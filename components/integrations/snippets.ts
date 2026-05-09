interface SnippetSource {
  cursor: string;
}

/**
 * cctc only targets Cursor as a BYOK client. Other clients (VS Code/Continue,
 * aider, the OpenAI SDK, etc.) are intentionally not supported here — the
 * proxy is wired around Cursor's `claude` model picker and OAuth dance.
 */
export function buildSnippets(baseUrl: string): SnippetSource {
  const trimmed = baseUrl.replace(/\/+$/, "");
  return {
    cursor: `# Cursor → Settings → Models → Add custom OpenAI provider
Base URL : ${trimmed}/v1
API key  : <any non-empty string — proxy enforces auth via OAuth + IP allow-list>
Model    : claude

# In a Cursor chat, pick "claude" — your prompts will be routed
# through Claude Code's OAuth credentials.`,
  };
}
