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

function build(
  id: ProviderId,
  provider: string,
  model: string | undefined,
  input: number | undefined,
  output: number | undefined,
  opts: NormalizeOptions
): NormalizedUsage | undefined {
  const m = model ?? opts.model;
  if (m === undefined || input === undefined || output === undefined) return undefined;
  return {
    provider,
    model: m,
    inputTokens: input,
    outputTokens: output,
    operation: opts.operation ?? "chat",
    source: id
  };
}

export const openai: Adapter = {
  id: "openai",
  detect: (r) => {
    const u = obj(r.usage);
    return !!u && ("prompt_tokens" in u || "completion_tokens" in u);
  },
  extract: (r, opts) => {
    const u = obj(r.usage) ?? {};
    return build("openai", "openai", str(r.model), num(u.prompt_tokens), num(u.completion_tokens), opts);
  }
};

export const anthropic: Adapter = {
  id: "anthropic",
  detect: (r) => {
    const u = obj(r.usage);
    return !!u && "input_tokens" in u && "output_tokens" in u;
  },
  extract: (r, opts) => {
    const u = obj(r.usage) ?? {};
    return build("anthropic", "anthropic", str(r.model), num(u.input_tokens), num(u.output_tokens), opts);
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
      opts
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
      opts
    );
  }
};

// Order matters: more specific shapes (anthropic/bedrock require both keys)
// are tried before openai (which matches on either prompt/completion key).
export const adapters: Adapter[] = [anthropic, bedrock, gemini, openai];
