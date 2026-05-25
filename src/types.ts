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
}

export type ProviderId =
  | "openai"
  | "anthropic"
  | "bedrock"
  | "gemini"
  | "generic";

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
