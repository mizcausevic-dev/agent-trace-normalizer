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
    if (Object.hasOwn(u, "prompt_tokens") || Object.hasOwn(u, "completion_tokens")) return true; // Chat Completions
    // Responses API / Agents SDK usage: usage.input_tokens/output_tokens —
    // the same key names Anthropic uses. Two independent ways to positively
    // identify this as OpenAI rather than Anthropic, either is sufficient:
    //  - r.object === "response": the unambiguous Responses API envelope.
    //  - input_tokens_details / output_tokens_details present: Anthropic
    //    never emits these key names, so their presence alone is a hard
    //    OpenAI signal even without the envelope (e.g. an OpenAI Agents SDK
    //    usage object, which carries no top-level object field at all).
    if (!Object.hasOwn(u, "input_tokens") || !Object.hasOwn(u, "output_tokens")) return false;
    return r.object === "response" || Object.hasOwn(u, "input_tokens_details") || Object.hasOwn(u, "output_tokens_details");
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
    if (!u || !Object.hasOwn(u, "input_tokens") || !Object.hasOwn(u, "output_tokens")) return false;
    // input_tokens_details / output_tokens_details are OpenAI-only key names
    // (Anthropic never emits them) -- a hard veto, even over an explicit
    // type: "message" on a malformed or mixed-shape capture.
    if (Object.hasOwn(u, "input_tokens_details") || Object.hasOwn(u, "output_tokens_details")) return false;
    // Anthropic's Messages API uses the same usage.input_tokens/output_tokens
    // names as OpenAI's Responses/Agents usage, so this requires positive
    // Anthropic evidence rather than falling back to "not the OpenAI
    // marker" for anything left over. A bare {input_tokens, output_tokens}
    // with no marker on either side is genuinely ambiguous and now throws
    // instead of silently guessing a price table (v0.3.0, see CHANGELOG).
    return (
      r.type === "message" ||
      r.type === "message_start" ||
      Object.hasOwn(u, "cache_read_input_tokens") ||
      Object.hasOwn(u, "cache_creation_input_tokens")
    );
  },
  extract: (r, opts) => {
    const u = obj(r.usage) ?? {};
    const rawInput = num(u.input_tokens);
    const cacheRead = num(u.cache_read_input_tokens);
    const cacheWrite = num(u.cache_creation_input_tokens);
    // Anthropic's input_tokens excludes cache tokens:
    // total_input_tokens = cache_read_input_tokens + cache_creation_input_tokens + input_tokens.
    // https://platform.claude.com/docs/en/build-with-claude/prompt-caching
    const input = rawInput === undefined ? undefined : rawInput + (cacheRead ?? 0) + (cacheWrite ?? 0);
    return build("anthropic", "anthropic", str(r.model), input, num(u.output_tokens), opts, {
      cacheReadTokens: cacheRead,
      cacheWriteTokens: cacheWrite
    });
  }
};

export const bedrock: Adapter = {
  id: "bedrock",
  detect: (r) => {
    const u = obj(r.usage);
    return !!u && Object.hasOwn(u, "inputTokens") && Object.hasOwn(u, "outputTokens");
  },
  extract: (r, opts) => {
    const u = obj(r.usage) ?? {};
    const rawInput = num(u.inputTokens);
    const cacheRead = num(u.cacheReadInputTokens);
    const cacheWrite = num(u.cacheWriteInputTokens);
    // Bedrock Converse's inputTokens excludes cache tokens:
    // total input tokens = inputTokens + cacheReadInputTokens + cacheWriteInputTokens.
    // https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-caching.html
    const input = rawInput === undefined ? undefined : rawInput + (cacheRead ?? 0) + (cacheWrite ?? 0);
    return build(
      "bedrock",
      "aws.bedrock",
      str(r.modelId) ?? str(r.model),
      input,
      num(u.outputTokens),
      opts,
      {
        // Converse API prompt caching (camelCase, matching the rest of this shape).
        cacheReadTokens: cacheRead,
        cacheWriteTokens: cacheWrite
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
