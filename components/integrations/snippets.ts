interface SnippetSource {
  cursor: string;
  vscode: string;
  cli: string;
  openai: string;
}

export function buildSnippets(baseUrl: string): SnippetSource {
  const trimmed = baseUrl.replace(/\/+$/, "");
  return {
    cursor: `# Cursor → Settings → Models → Add custom OpenAI provider
Base URL : ${trimmed}/v1
API key  : <any non-empty string — proxy enforces auth via OAuth + IP allow-list>
Model    : Claude

# In a Cursor chat, pick "Claude" — your prompts will be routed
# through Claude Code's OAuth credentials.`,
    vscode: `// .vscode/settings.json
{
  "continue.models": [
    {
      "title": "Claude (via cctc)",
      "provider": "openai",
      "model": "Claude",
      "apiBase": "${trimmed}/v1",
      "apiKey": "ignored"
    }
  ]
}`,
    cli: `# OpenAI-compatible CLI tools (e.g. aider, llm)
export OPENAI_API_BASE="${trimmed}/v1"
export OPENAI_API_KEY="ignored"
aider --model Claude

# Anthropic-native clients can target /v1/messages too:
export ANTHROPIC_BASE_URL="${trimmed}"
export ANTHROPIC_API_KEY="ignored"`,
    openai: `import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "${trimmed}/v1",
  apiKey: "ignored",
});

const stream = await openai.chat.completions.create({
  model: "Claude",
  stream: true,
  messages: [{ role: "user", content: "Hello, Claude" }],
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
}`,
  };
}
