// Normalizes raw LLM provider API responses into a canonical usage record.
// The output shape is intentionally compatible with llm-cost-span-exporter's
// UsageRecord, so normalize -> export composes without a hard dependency.

export interface NormalizedUsage {
  /** OTel gen_ai.provider.name, e.g. "openai", "anthropic", "aws.bedrock", "gcp.gemini". */
  provider: string;
  /** Requested/served model id. */
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** OTel gen_ai.operation.name. Default "chat". */
  operation?: string;
  /** Source adapter that produced this record. */
  source: ProviderId;
  /**
   * Input tokens served from a prompt cache at a discounted rate, when the
   * provider reports it. Already included in inputTokens; broken out for
   * cost detail since cache reads bill at a different rate than fresh input.
   */
  cacheReadTokens?: number;
  /**
   * Input tokens written to a prompt cache (Anthropic, Bedrock; billed at a
   * premium over normal input). Already included in inputTokens.
   */
  cacheWriteTokens?: number;
  /**
   * Output tokens spent on internal reasoning (OpenAI o-series/Responses API
   * reasoning_tokens; Gemini thinking-model thoughtsTokenCount). Already
   * included in outputTokens; broken out for cost detail.
   */
  reasoningTokens?: number;
}

export type ProviderId = "openai" | "anthropic" | "bedrock" | "gemini";

/** A raw provider response, shape unknown until an adapter claims it. */
export type RawResponse = Record<string, unknown>;

/** Optional hints when a shape is ambiguous or the model isn't in the body. */
export interface NormalizeOptions {
  /** Force a specific adapter instead of auto-detecting. */
  provider?: ProviderId;
  /** Fallback model id when the response body omits it. */
  model?: string;
  /** Operation name to stamp (default "chat"). */
  operation?: string;
}
