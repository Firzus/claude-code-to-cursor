export function handleModels(): Response {
  return Response.json({
    object: "list",
    data: [
      // Claude 4.5 models (Anthropic format)
      {
        id: "claude-sonnet-4-5",
        object: "model",
        created: 1700000000,
        owned_by: "anthropic",
        context_length: 200000,
        max_output_tokens: 64000,
      },
      {
        id: "claude-opus-4-5",
        object: "model",
        created: 1700000000,
        owned_by: "anthropic",
        context_length: 200000,
        max_output_tokens: 64000,
      },
      {
        id: "claude-haiku-4-5",
        object: "model",
        created: 1700000000,
        owned_by: "anthropic",
        context_length: 200000,
        max_output_tokens: 64000,
      },
      // Cursor format models (will be normalized)
      {
        id: "claude-4.5-opus-high",
        object: "model",
        created: 1700000000,
        owned_by: "anthropic",
        context_length: 200000,
        max_output_tokens: 64000,
      },
      {
        id: "claude-4.5-sonnet-high",
        object: "model",
        created: 1700000000,
        owned_by: "anthropic",
        context_length: 200000,
        max_output_tokens: 64000,
      },
      {
        id: "claude-4.5-haiku",
        object: "model",
        created: 1700000000,
        owned_by: "anthropic",
        context_length: 200000,
        max_output_tokens: 64000,
      },
      // Cursor format models with -thinking suffix
      {
        id: "claude-4.5-opus-high-thinking",
        object: "model",
        created: 1700000000,
        owned_by: "anthropic",
        context_length: 200000,
        max_output_tokens: 64000,
      },
      {
        id: "claude-4.5-sonnet-high-thinking",
        object: "model",
        created: 1700000000,
        owned_by: "anthropic",
        context_length: 200000,
        max_output_tokens: 64000,
      },
      {
        id: "claude-4.5-haiku-thinking",
        object: "model",
        created: 1700000000,
        owned_by: "anthropic",
        context_length: 200000,
        max_output_tokens: 64000,
      },
    ],
  });
}
