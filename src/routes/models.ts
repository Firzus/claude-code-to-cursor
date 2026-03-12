export function handleModels(): Response {
  return Response.json({
    object: "list",
    data: [
      // Claude 4.6 Opus models (Cursor format)
      // thinking activé via reasoning_effort dans le body de la requête
      {
        id: "claude-4.6-opus-high",
        object: "model",
        created: 1700000000,
        owned_by: "anthropic",
        context_length: 200000,
        max_output_tokens: 128000,
      },
      {
        id: "claude-4.6-opus-high-thinking",
        object: "model",
        created: 1700000000,
        owned_by: "anthropic",
        context_length: 200000,
        max_output_tokens: 128000,
      },
      // Claude 4.6 Sonnet models (Cursor format)
      {
        id: "claude-4.6-sonnet-high",
        object: "model",
        created: 1700000000,
        owned_by: "anthropic",
        context_length: 200000,
        max_output_tokens: 64000,
      },
      {
        id: "claude-4.6-sonnet-high-thinking",
        object: "model",
        created: 1700000000,
        owned_by: "anthropic",
        context_length: 200000,
        max_output_tokens: 64000,
      },
    ],
  });
}
