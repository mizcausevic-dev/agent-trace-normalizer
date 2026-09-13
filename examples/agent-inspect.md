# Recipe: agent-trace-normalizer -> AgentInspect model-call node

Maps `agent-trace-normalizer@0.3.0`'s `normalize()` output onto the token-usage
shape [AgentInspect](https://github.com/rajudandigam/agent-inspect) attaches to
a model-call node. Written against `agent-inspect@6.29.1`, the version
published on npm as of this writing. AgentInspect's own OpenAI-Agents
adapter has a known field-mapping gap being tracked separately (see the
project's issue tracker); nothing below assumes or depends on how that fix
will look once it ships.

## Why this mapping exists

Both projects converge on the same idea from opposite ends: `normalize()`
turns a raw provider response into one canonical shape regardless of which
of the four providers sent it; AgentInspect's internal `normalizeTokenUsage()`
takes a token-usage-shaped object and produces the `PersistedTokenUsage`
record it writes onto a trace event. Feed the first into the second and you
get a provider-agnostic usage record on every model-call node without writing
per-provider extraction code in your own instrumentation.

## Field mapping

| `normalize()` output | AgentInspect `PersistedTokenUsage` | Notes |
|---|---|---|
| `inputTokens` | `input` | See "Inclusive vs. exclusive" below, this is not a 1:1 passthrough for every provider before 0.3.0. |
| `outputTokens` | `output` | |
| *(not emitted)* | `total` | AgentInspect derives `input + output` when `total` isn't supplied directly; don't compute or pass a separate total. |
| `cacheReadTokens` | `cached` | Omit the key entirely when absent, don't pass `0`. |
| `cacheWriteTokens` | `cacheWrite` | Anthropic and Bedrock only; OpenAI and Gemini never populate this. |
| `reasoningTokens` | `reasoning` | |
| `provider`, `model`, `source`, `operation` | *(not part of `PersistedTokenUsage`)* | These belong on the model-call node itself (model id, span attributes), not the token-usage sub-object. |

`cached`, `cacheWrite`, and `reasoning` are informational on the AgentInspect
side too, they're never added into `total`, matching the fact that they're
already counted inside `input`/`output` on the `agent-trace-normalizer` side
for every provider as of 0.3.0 (see next section for the one provider where
that wasn't true until this version).

## Inclusive vs. exclusive: the one fact that matters most

OpenAI's raw usage fields already include cached and reasoning tokens inside
`input_tokens`/`output_tokens`. **Anthropic and AWS Bedrock do not**: both
vendors document their `input_tokens`/`inputTokens` field as covering only
the *non-cached* portion of the request. `agent-trace-normalizer` versions
before 0.3.0 passed Anthropic's and Bedrock's `input_tokens` straight
through unmodified, which meant `inputTokens` undercounted the true input
total on any cache-heavy request from those two providers. 0.3.0 fixes this
by adding the cache fields back into `inputTokens` for those two adapters, so
the field means the same thing (the full input count) regardless of which
provider sent it.

Gemini is **not** covered by this fix. Google's public docs don't state
whether `candidatesTokenCount` already includes `thoughtsTokenCount`, so
`agent-trace-normalizer` leaves Gemini's numbers unchanged pending a live API
check. Don't assume Gemini behaves like Anthropic/Bedrock or like OpenAI
until that's confirmed, treat its `inputTokens`/`outputTokens` as
unverified-inclusive for now.

### Worked example: Anthropic, cache-heavy request

Raw Anthropic Messages API response:

```json
{
  "type": "message",
  "model": "claude-opus-4-7",
  "usage": {
    "input_tokens": 50,
    "output_tokens": 300,
    "cache_read_input_tokens": 100000,
    "cache_creation_input_tokens": 1500
  }
}
```

`normalize()` output on **0.3.0**:

```json
{
  "provider": "anthropic",
  "model": "claude-opus-4-7",
  "inputTokens": 101550,
  "outputTokens": 300,
  "operation": "chat",
  "source": "anthropic",
  "cacheReadTokens": 100000,
  "cacheWriteTokens": 1500
}
```

`inputTokens` is `50 + 100000 + 1500`, the full request, matching Anthropic's
own documented formula (`total_input_tokens = cache_read_input_tokens +
cache_creation_input_tokens + input_tokens`).

**Before 0.3.0**, the same raw response normalized to `inputTokens: 50`, the
raw `input_tokens` field passed through untouched, undercounting the true
input by more than 2000x on this request. Anyone who normalized cache-heavy
Anthropic traffic on 0.2.x and fed `inputTokens` into a cost calculation was
working from a number that excluded nearly all of the actual request.

Mapped onto AgentInspect's `PersistedTokenUsage` (0.3.0 output):

```json
{
  "input": 101550,
  "output": 300,
  "total": 101850,
  "cached": 100000,
  "cacheWrite": 1500
}
```

## Per-provider reference

Each of these is a real `normalize()` call, verified against the built
0.3.0 package, not a hand-typed example.

### OpenAI (Chat Completions)

```json
// raw
{
  "model": "gpt-5",
  "usage": {
    "prompt_tokens": 1200,
    "completion_tokens": 340,
    "prompt_tokens_details": { "cached_tokens": 200 },
    "completion_tokens_details": { "reasoning_tokens": 96 }
  }
}
```
```json
// normalize()
{
  "provider": "openai", "model": "gpt-5",
  "inputTokens": 1200, "outputTokens": 340,
  "operation": "chat", "source": "openai",
  "cacheReadTokens": 200, "reasoningTokens": 96
}
```
```json
// PersistedTokenUsage
{ "input": 1200, "output": 340, "total": 1540, "cached": 200, "reasoning": 96 }
```

### AWS Bedrock (Converse API)

```json
// raw
{
  "usage": {
    "inputTokens": 800, "outputTokens": 150,
    "cacheReadInputTokens": 400, "cacheWriteInputTokens": 0
  },
  "modelId": "anthropic.claude-3-5-sonnet-20241022-v2:0"
}
```
```json
// normalize()
{
  "provider": "aws.bedrock", "model": "anthropic.claude-3-5-sonnet-20241022-v2:0",
  "inputTokens": 1200, "outputTokens": 150,
  "operation": "chat", "source": "bedrock",
  "cacheReadTokens": 400, "cacheWriteTokens": 0
}
```

`inputTokens` is `800 + 400 + 0`, same inclusive rule as Anthropic, per AWS's
own Bedrock Converse prompt-caching docs. Bedrock has no top-level `model`
field, hence `--model` / `opts.model` or, as here, `modelId`.

```json
// PersistedTokenUsage
{ "input": 1200, "output": 150, "total": 1350, "cached": 400, "cacheWrite": 0 }
```

### Google Gemini

```json
// raw
{
  "modelVersion": "gemini-2.5-pro",
  "usageMetadata": {
    "promptTokenCount": 640, "candidatesTokenCount": 220,
    "cachedContentTokenCount": 128, "thoughtsTokenCount": 96
  }
}
```
```json
// normalize()
{
  "provider": "gcp.gemini", "model": "gemini-2.5-pro",
  "inputTokens": 640, "outputTokens": 220,
  "operation": "chat", "source": "gemini",
  "cacheReadTokens": 128, "reasoningTokens": 96
}
```

Unchanged in 0.3.0, see the caveat above: whether `outputTokens` already
includes `reasoningTokens` here is not confirmed.

```json
// PersistedTokenUsage
{ "input": 640, "output": 220, "total": 860, "cached": 128, "reasoning": 96 }
```

## Usage

```ts
import { normalize } from "agent-trace-normalizer";

function toPersistedTokenUsage(u: ReturnType<typeof normalize>) {
  const input = u.inputTokens;
  const output = u.outputTokens;
  return {
    input,
    output,
    total: input + output,
    ...(u.cacheReadTokens !== undefined ? { cached: u.cacheReadTokens } : {}),
    ...(u.cacheWriteTokens !== undefined ? { cacheWrite: u.cacheWriteTokens } : {}),
    ...(u.reasoningTokens !== undefined ? { reasoning: u.reasoningTokens } : {})
  };
}

const tokenUsage = toPersistedTokenUsage(normalize(rawProviderResponse));
// attach `tokenUsage` to the model-call node the same way you'd attach any
// other AgentInspect PersistedTokenUsage value
```
