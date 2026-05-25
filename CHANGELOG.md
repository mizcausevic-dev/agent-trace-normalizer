# Changelog

## v0.1.0 — 2026-05-25

- Initial release: normalize raw LLM provider responses into a canonical usage record.
- Adapters for OpenAI, Anthropic, AWS Bedrock, and Google Gemini, with shape auto-detection (specific shapes tried before generic) and a forced-`--provider` override.
- Canonical output aligns to the OTel GenAI `provider.name` convention and composes directly with `llm-cost-span-exporter`.
- Library API (`normalize`, `normalizeMany`) + CLI (`agent-normalize`) accepting JSON array / object / JSONL, with per-record error collection.
- Node 20/22 CI (lint, typecheck, coverage, build, demo, `npm audit`), AGPL-3.0-or-later, Dependabot.
