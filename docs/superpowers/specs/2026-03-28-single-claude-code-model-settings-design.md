# Single Claude Code Model With Local Backend Settings

## Summary

ccproxy should go back to exposing a single public model, `Claude Code`, to OpenAI-compatible clients such as Cursor. The actual Anthropic backend model used for requests should become a local proxy setting, configurable through a small built-in web UI.

This keeps the client-side model picker simple while preserving operator control over which Anthropic model is used and whether thinking is enabled.

## Goals

- Expose only `Claude Code` from `GET /v1/models`
- Accept only `Claude Code` as the public model identifier on OpenAI-compatible requests
- Reject any other public model identifier with `400 invalid_request_error`
- Let the operator configure the internal backend model via a local `/settings` page
- Persist the selected backend configuration across restarts
- Support separate settings for:
  - backend model
  - thinking enabled or disabled
  - thinking effort

## Non-Goals

- Forward unsupported public model names back to the Cursor backend
- Keep legacy public model aliases such as `claude-4.6-sonnet`
- Expose multiple model choices to Cursor
- Add external frontend dependencies or a full SPA

## User-Facing Behavior

### Public model contract

`GET /v1/models` returns a single entry:

- `Claude Code`

For OpenAI-compatible requests:

- `model: "Claude Code"` is accepted
- any other `model` value is rejected with HTTP `400`
- the error shape remains `invalid_request_error`

Example error message:

`Unsupported model: "<value>". Only "Claude Code" is allowed.`

### Backend configuration UI

The proxy exposes a local settings page at `GET /settings`.

The page allows selecting:

- backend model:
  - `claude-opus-4-6`
  - `claude-sonnet-4-6`
  - `claude-haiku-4-5`
- thinking enabled:
  - `on`
  - `off`
- thinking effort:
  - `low`
  - `medium`
  - `high`

The thinking effort control remains visible but should be visually disabled when thinking is off.

The page should show the current active configuration and provide a simple `Save` action.

## Defaults

If no saved settings exist yet, ccproxy uses:

- backend model: `claude-opus-4-6`
- thinking enabled: `on`
- thinking effort: `high`

## Architecture Changes

### Model resolution

The current public model parsing is replaced with a stricter contract:

- the only accepted public model is `Claude Code`
- the public alias no longer encodes model family or thinking effort
- the backend Anthropic request is built from saved proxy settings instead

This means the request path changes from:

- public model name determines backend model and thinking budget

to:

- public model must equal `Claude Code`
- saved proxy settings determine backend model and thinking budget

### Settings persistence

Settings are stored in SQLite, consistent with the rest of the project.

A small key/value settings table is sufficient. Example keys:

- `selected_model`
- `thinking_enabled`
- `thinking_effort`

Reads should apply defaults when keys are missing. Writes should validate all incoming values against an allowlist before persisting.

### Route additions

Add routes for:

- `GET /settings`
- `POST /settings/model`

`GET /settings` serves a lightweight HTML page rendered by the server.

`POST /settings/model` accepts form data, validates it, persists the new settings, and redirects back to `/settings` with a success or error state.

### Request handling changes

### OpenAI-compatible route

For `POST /v1/chat/completions`:

- if `request.model !== "Claude Code"`, reject with `400 invalid_request_error`
- otherwise, load the saved backend settings
- map `Claude Code` to the saved backend model
- include or omit the Anthropic `thinking` block based on settings
- when thinking is enabled, use the saved effort to derive the budget

### Native Anthropic route

To keep the public proxy contract coherent, native Anthropic requests should follow the same external rule:

- only `Claude Code` is accepted as the incoming public model alias
- the request is normalized to the saved backend model internally
- explicit per-request public selection of another backend model is no longer supported

This keeps both public API surfaces aligned around the same operator-selected backend configuration.

## Validation Rules

Accepted setting values are limited to:

- model: `claude-opus-4-6`, `claude-sonnet-4-6`, `claude-haiku-4-5`
- thinking enabled: `true`, `false`
- thinking effort: `low`, `medium`, `high`

Invalid settings submissions should not partially persist. The handler should reject the submission cleanly and return the settings page with an error message.

## UI Notes

The settings page should reuse the existing project style of server-rendered HTML with inline CSS and minimal client-side JavaScript.

Suggested content:

- page title and short explanation
- current saved configuration summary
- model select control
- thinking enabled checkbox or toggle
- effort radio group
- save button
- optional link back to `/health`

No external assets or frontend libraries are needed.

## Logging

Request logs should continue to show:

- incoming public model
- resolved backend model
- whether thinking is enabled
- selected thinking budget when enabled

Settings changes should be logged with the newly selected backend configuration.

## Testing Strategy

Add or update tests to cover:

- `GET /v1/models` returns only `Claude Code`
- public model parsing accepts `Claude Code`
- public model parsing rejects legacy and multi-model identifiers
- backend settings default correctly when nothing is stored
- settings validation rejects unsupported values
- thinking block is omitted when thinking is off
- thinking budget matches the saved effort when thinking is on

Manual verification should include:

- opening `/settings`
- saving each supported backend model
- toggling thinking on and off
- verifying Cursor only sees `Claude Code`
- verifying non-`Claude Code` requests fail with the expected `400` error

## Risks And Mitigations

### Risk: existing clients still send legacy model IDs

Impact:

- requests that previously worked will now fail explicitly

Mitigation:

- make the error message precise and actionable
- expose only `Claude Code` from `/v1/models` so compliant clients stop offering old choices

### Risk: settings and runtime behavior drift

Impact:

- operator confusion about which backend model is active

Mitigation:

- show the active configuration clearly on `/settings`
- optionally surface the active configuration on `/health`
- log settings updates and resolved backend routing

## Implementation Notes

Likely touch points:

- `src/model-parser.ts`
- `src/openai-adapter.ts`
- `src/routes/anthropic.ts`
- `src/routes/models.ts`
- `src/db.ts`
- `src/html-templates.ts`
- `index.ts`
- new route file for settings if needed

The implementation should preserve zero external runtime dependencies and stay consistent with the existing Bun + server-rendered architecture.
