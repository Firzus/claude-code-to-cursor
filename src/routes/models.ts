export function handleModels(): Response {
  return Response.json({
    object: "list",
    data: [
      {
        id: "Claude Code",
        object: "model",
        created: 1700000000,
        owned_by: "anthropic",
        context_length: 200000,
        max_output_tokens: 128000,
      },
    ],
  });
}
