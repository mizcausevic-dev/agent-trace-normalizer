# Changelog

## v0.2.2 — 2026-09-11

- CI fix: pin a current npm CLI (`npm install -g npm@latest`) in the publish workflow. Node 22's bundled npm predates OIDC trusted-publishing support; the v0.2.1 attempt signed provenance successfully but 404'd on the actual publish PUT.

## v0.2.1 — 2026-09-11 (never published)

- No functional change. Attempted first release via the npm Trusted Publisher (GitHub Actions OIDC) — failed at the publish step; see v0.2.2.

## v0.2.0 — 2026-09-11

- Add `cacheReadTokens` / `cacheWriteTokens` / `reasoningTokens` to `NormalizedUsage`, populated from OpenAI (`prompt_tokens_details`/`completion_tokens_details`, `input_tokens_details`/`output_tokens_details`), Anthropic (`cache_read_input_tokens`/`cache_creation_input_tokens`), Bedrock (`cacheReadInputTokens`/`cacheWriteInputTokens`), and Gemini (`cachedContentTokenCount`/`thoughtsTokenCount`), when the provider reports them. Already included in `inputTokens`/`outputTokens`; broken out because they bill at different rates.
- Remove `"generic"` from `ProviderId` and the CLI's `--provider` values — it was accepted but silently treated as "auto-detect," not a real adapter. Forcing an unsupported value now errors instead of behaving unpredictably.
- Fix: `package.json` `repository.url` normalized to the canonical `git+https://...git` form (npm was silently auto-correcting it on every publish); added `homepage` and `bugs` fields.

## v0.1.1 — 2026-09-11

- Fix: OpenAI Responses API payloads (`usage.input_tokens`/`output_tokens`, `object: "response"`) were misdetected as Anthropic, since Anthropic's Messages API uses the same usage field names. The openai adapter now recognizes both shapes; the anthropic adapter checks for the OpenAI Responses marker before claiming a match.
- Test: regression coverage for both the Responses API shape and a genuine Anthropic response carrying `type: "message"`.

## v0.1.0 — 2026-05-25

- Initial release: normalize raw LLM provider responses into a canonical usage record.
- Adapters for OpenAI, Anthropic, AWS Bedrock, and Google Gemini, with shape auto-detection (specific shapes tried before generic) and a forced-`--provider` override.
- Canonical output aligns to the OTel GenAI `provider.name` convention and composes directly with `llm-cost-span-exporter`.
- Library API (`normalize`, `normalizeMany`) + CLI (`agent-normalize`) accepting JSON array / object / JSONL, with per-record error collection.
- Node 20/22 CI (lint, typecheck, coverage, build, demo, `npm audit`), AGPL-3.0-or-later, Dependabot.
