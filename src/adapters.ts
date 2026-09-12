import type {
  NormalizedUsage,
  NormalizeOptions,
  ProviderId,
  RawResponse
} from "./types.js";

const obj = (v: unknown): Record<string, unknown> | undefined =>
  typeof v === "object" && v !== null ? (v as Record<string, unknown>) : undefined;

const num = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

export interface Adapter {
  id: ProviderId;
  /** True when this adapter recognizes the response shape. */
  detect(r: RawResponse): boolean;
  /** Extract usage; returns undefined if required fields are missing. */
  extract(r: RawResponse, opts: NormalizeOptions): NormalizedUsage | undefined;
}

type Extras = Partial<Pick<NormalizedUsage, "cacheReadTokens" | "cacheWriteTokens" | "reasoningTokens">>;

function build(
  id: ProviderId,
  provider: string,
  model: string | undefined,
  input: number | undefined,
  output: number | undefined,
  opts: NormalizeOptions,
  extras: Extras = {}
): NormalizedUsage | undefined {
  const m = model ?? opts.model;
  if (m === undefined || input === undefined || output === undefined) return undefined;
  const usage: NormalizedUsage = {
    provider,
    model: m,
    inputTokens: input,
    outputTokens: output,
    operation: opts.operation ?? "chat",
    source: id
  };
  if (extras.cacheReadTokens !== undefined) usage.cacheReadTokens = extras.cacheReadTokens;
  if (extras.cacheWriteTokens !== undefined) usage.cacheWriteTokens = extras.cacheWriteTokens;
  if (extras.reasoningTokens !== undefined) usage.reasoningTokens = extras.reasoningTokens;
  return usage;
}

export const openai: Adapter = {
  id: "openai",
  detect: (r) => {
    const u = obj(r.usage);
    if (!u) return false;
    if ("prompt_tokens" in u || "completion_tokens" in u) return true; // Chat Completions
    // Responses API (POST /v1/responses): usage.input_tokens/output_tokens —
    // the same key names Anthropic uses. r.object === "response" is the
    // unambiguous OpenAI-only marker; see the anthropic adapter below.
    return r.object === "response" && "input_tokens" in u && "output_tokens" in u;
  },
  extract: (r, opts) => {
    const u = obj(r.usage) ?? {};
    const input = num(u.prompt_tokens) ?? num(u.input_tokens);
    const output = num(u.completion_tokens) ?? num(u.output_tokens);
    // Chat Completions nests these under prompt/completion_tokens_details;
    // the Responses API nests them under input/output_tokens_details.
    const inputDetails = obj(u.prompt_tokens_details) ?? obj(u.input_tokens_details);
    const outputDetails = obj(u.completion_tokens_details) ?? obj(u.output_tokens_details);
    return build("openai", "openai", str(r.model), input, output, opts, {
      cacheReadTokens: num(inputDetails?.cached_tokens),
      reasoningTokens: num(outputDetails?.reasoning_tokens)
    });
  }
};

export const anthropic: Adapter = {
  id: "anthropic",
  detect: (r) => {
    const u = obj(r.usage);
    if (!u || !("input_tokens" in u) || !("output_tokens" in u)) return false;
    // Anthropic's Messages API uses the same usage.input_tokens/output_tokens
    // names as OpenAI's Responses API. Anthropic responses carry
    // type: "message"; OpenAI's carry object: "response". Trust an explicit
    // Anthropic marker when present, otherwise fall back to "not the OpenAI
    // marker" so older/looser captures without either field still match.
    return r.type === "message" || r.object !== "response";
  },
  extract: (r, opts) => {
    const u = obj(r.usage) ?? {};
    return build("anthropic", "anthropic", str(r.model), num(u.input_tokens), num(u.output_tokens), opts, {
      cacheReadTokens: num(u.cache_read_input_tokens),
      cacheWriteTokens: num(u.cache_creation_input_tokens)
    });
  }
};

export const bedrock: Adapter = {
  id: "bedrock",
  detect: (r) => {
    const u = obj(r.usage);
    return !!u && "inputTokens" in u && "outputTokens" in u;
  },
  extract: (r, opts) => {
    const u = obj(r.usage) ?? {};
    return build(
      "bedrock",
      "aws.bedrock",
      str(r.modelId) ?? str(r.model),
      num(u.inputTokens),
      num(u.outputTokens),
      opts,
      {
        // Converse API prompt caching (camelCase, matching the rest of this shape).
        cacheReadTokens: num(u.cacheReadInputTokens),
        cacheWriteTokens: num(u.cacheWriteInputTokens)
      }
    );
  }
};

export const gemini: Adapter = {
  id: "gemini",
  detect: (r) => !!obj(r.usageMetadata),
  extract: (r, opts) => {
    const u = obj(r.usageMetadata) ?? {};
    return build(
      "gemini",
      "gcp.gemini",
      str(r.modelVersion) ?? str(r.model),
      num(u.promptTokenCount),
      num(u.candidatesTokenCount),
      opts,
      {
        cacheReadTokens: num(u.cachedContentTokenCount),
        // Thinking-model internal reasoning tokens.
        reasoningTokens: num(u.thoughtsTokenCount)
      }
    );
  }
};

// Order matters: more specific shapes (anthropic/bedrock require both keys)
// are tried before openai (which matches on either prompt/completion key).
export const adapters: Adapter[] = [anthropic, bedrock, gemini, openai];
