/**
 * Extract readable text content from Claude Code internal tool calls
 * (CreatePlan, TodoWrite, etc.) so they can be emitted as text to Cursor
 * instead of being silently dropped.
 */

/**
 * Parse the JSON payload of an internal tool call and return human-readable text.
 * Returns null if nothing useful can be extracted.
 */
export function formatInternalToolContent(toolName: string, data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;

  // CreatePlan — fields: summary, plan, title, description, todos, steps
  if (toolName === "CreatePlan") {
    const parts: string[] = [];
    if (typeof obj.title === "string" && obj.title) parts.push(obj.title);
    if (typeof obj.summary === "string" && obj.summary) parts.push(obj.summary);
    if (typeof obj.description === "string" && obj.description) parts.push(obj.description);
    if (typeof obj.plan === "string" && obj.plan) parts.push(obj.plan);
    appendList(parts, obj.todos);
    appendList(parts, obj.steps);
    return parts.length > 0 ? parts.join("\n\n") : null;
  }

  // TodoWrite — fields: todos, items, tasks
  if (toolName === "TodoWrite") {
    const parts: string[] = [];
    appendList(parts, obj.todos);
    appendList(parts, obj.items);
    appendList(parts, obj.tasks);
    return parts.length > 0 ? parts.join("\n\n") : null;
  }

  // Generic fallback: concatenate string fields, format arrays as lists
  return genericExtract(obj);
}

function appendList(parts: string[], value: unknown): void {
  if (!Array.isArray(value)) return;
  for (const item of value) {
    if (typeof item === "string") {
      parts.push(`- ${item}`);
    } else if (item && typeof item === "object") {
      // Try common fields: content, text, title, description
      const o = item as Record<string, unknown>;
      const text = o.content || o.text || o.title || o.description;
      if (typeof text === "string" && text) {
        const status = typeof o.status === "string" ? `[${o.status}] ` : "";
        parts.push(`- ${status}${text}`);
      }
    }
  }
}

function genericExtract(obj: Record<string, unknown>): string | null {
  const parts: string[] = [];

  for (const [, value] of Object.entries(obj)) {
    if (typeof value === "string" && value.trim()) {
      parts.push(value);
    } else if (Array.isArray(value)) {
      appendList(parts, value);
    }
  }

  return parts.length > 0 ? parts.join("\n\n") : null;
}
