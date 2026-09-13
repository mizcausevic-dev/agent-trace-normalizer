# agent-trace-normalizer

Normalize raw LLM provider responses — **OpenAI, Anthropic, AWS Bedrock, Google Gemini** — into one canonical usage record. It's the adapter front-end for GenAI cost and tracing: point it at whatever your providers return, get back a uniform `{ provider, model, inputTokens, outputTokens }` you can meter, bill, or trace.

Its output feeds [`llm-cost-span-exporter`](https://github.com/mizcausevic-dev/llm-cost-span-exporter) directly, which turns normalized usage records into cost-annotated OpenTelemetry GenAI spans.

## Why

Every provider reports token usage in a different shape: OpenAI uses `usage.prompt_tokens` / `completion_tokens`, Anthropic uses `usage.input_tokens` / `output_tokens`, Bedrock uses camelCase `usage.inputTokens` / `outputTokens`, Gemini buries it in `usageMetadata.promptTokenCount` / `candidatesTokenCount`. Any team running more than one model ends up writing the same brittle extraction code. This library does it once, auto-detecting the shape, and emits a record aligned to the OpenTelemetry GenAI `provider.name` convention — so the rest of your cost/observability pipeline is provider-agnostic.

## Install

```bash
npm install -g agent-trace-normalizer   # CLI
npm install agent-trace-normalizer      # library
```

Requires Node ≥ 20.

## CLI

```bash
# normalize a mixed batch (auto-detect each)
agent-normalize responses.jsonl

# Bedrock omits the model in the body — supply it
agent-normalize bedrock.jsonl --provider bedrock --model anthropic.claude-3-5-sonnet
```

Input is a JSON array, single object, or JSONL of raw provider responses. Exit codes: `0` all normalized, `1` some records failed (reported on stderr), `2` usage/IO error.

## Library

```ts
import { normalize, normalizeMany } from "agent-trace-normalizer";

const usage = normalize(openaiResponse); // { provider, model, inputTokens, outputTokens, ... }

const { usage: records, errors } = normalizeMany(mixedBatch, { model: "fallback" });
// records compose directly with llm-cost-span-exporter's exportSpans()
```

See [examples/agent-inspect.md](examples/agent-inspect.md) for a worked recipe mapping `normalize()` output onto [AgentInspect](https://github.com/rajudandigam/agent-inspect)'s token-usage shape, including the Anthropic cache-heavy example where inclusive-vs-exclusive input counting is visible in the numbers.

## Supported shapes

| Provider | Detected via | Tokens read from |
|---|---|---|
| OpenAI (Chat Completions) | `usage.prompt_tokens` / `completion_tokens` | same |
| OpenAI (Responses API / Agents SDK) | `object: "response"`, or `input_tokens_details` / `output_tokens_details` present, + `usage.input_tokens` / `output_tokens` | same |
| Anthropic | `type: "message"` / `"message_start"`, or `cache_read_input_tokens` / `cache_creation_input_tokens` present, + `usage.input_tokens` / `output_tokens` | same |
| AWS Bedrock | `usage.inputTokens` + `outputTokens` (camelCase) | same; model via `modelId` or `--model` |
| Google Gemini | `usageMetadata` | `promptTokenCount` / `candidatesTokenCount`; model via `modelVersion` |

Auto-detection tries the more specific shapes first. Force one with `--provider` / the `provider` option, and supply a fallback `model` when the response body omits it.

Anthropic's Messages API and OpenAI's Responses/Agents usage both report `input_tokens`/`output_tokens` under the same names. Since v0.3.0, disambiguating either one requires positive evidence, `object: "response"` or an OpenAI-only `*_tokens_details` field for OpenAI; `type: "message"`/`"message_start"` or a `cache_read_input_tokens`/`cache_creation_input_tokens` field for Anthropic. A bare `{ input_tokens, output_tokens }` with none of those throws rather than guessing, since versions before 0.3.0 silently defaulted every such shape to Anthropic. See [CHANGELOG](CHANGELOG.md).

### Cache and reasoning tokens

When a provider reports them, the normalized record also carries:

- `cacheReadTokens` — input tokens served from a prompt cache at a discounted rate (OpenAI, Anthropic, Bedrock, Gemini)
- `cacheWriteTokens` — input tokens written to a prompt cache, billed at a premium (Anthropic, Bedrock)
- `reasoningTokens` — output tokens spent on internal reasoning (OpenAI o-series/Responses API, Gemini thinking models)

All three are already included in `inputTokens`/`outputTokens`; they're broken out because they bill at different rates than plain input/output. Omitted entirely when the provider doesn't report them.

This is a real design point, not a formality: OpenAI's own `input_tokens`/`output_tokens` already include cached and reasoning tokens, but Anthropic's `input_tokens` and Bedrock's `inputTokens` do not, per each vendor's own docs (`total = cache_read + cache_creation + input_tokens`). This library adds the cache tokens back in for Anthropic and Bedrock so `inputTokens` means the same thing across every provider, matching the OpenTelemetry GenAI semantic convention this package targets. Versions before 0.3.0 passed Anthropic's and Bedrock's `input_tokens`/`inputTokens` straight through, undercounting total input on any cache-heavy request from those two providers, see [CHANGELOG](CHANGELOG.md).

## License

Apache-2.0 — see [LICENSE](LICENSE) and [NOTICE](NOTICE). Copyright Kinetic Gain LLC.

Versions through 0.2.2 were published under AGPL-3.0-or-later; that grant can't be retracted, so anyone already depending on one of those versions under AGPL terms keeps that license for that version. Every version from 0.3.0 onward is Apache-2.0.
