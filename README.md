# agent-trace-normalizer

Normalize raw LLM provider responses — **OpenAI, Anthropic, AWS Bedrock, Google Gemini** — into one canonical usage record. It's the adapter front-end for GenAI cost and tracing: point it at whatever your providers return, get back a uniform `{ provider, model, inputTokens, outputTokens }` you can meter, bill, or trace.

Part of the [Kinetic Gain](https://suite.kineticgain.com) GenAI observability lane. Its output feeds [`llm-cost-span-exporter`](https://github.com/mizcausevic-dev/llm-cost-span-exporter) directly.

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

## Supported shapes

| Provider | Detected via | Tokens read from |
|---|---|---|
| OpenAI | `usage.prompt_tokens` / `completion_tokens` | same |
| Anthropic | `usage.input_tokens` + `output_tokens` | same |
| AWS Bedrock | `usage.inputTokens` + `outputTokens` (camelCase) | same; model via `modelId` or `--model` |
| Google Gemini | `usageMetadata` | `promptTokenCount` / `candidatesTokenCount`; model via `modelVersion` |

Auto-detection tries the more specific shapes first. Force one with `--provider` / the `provider` option, and supply a fallback `model` when the response body omits it.

## License

AGPL-3.0-or-later — see [LICENSE](LICENSE).
