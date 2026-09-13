import { adapters, openai, anthropic, bedrock, gemini } from "./adapters.js";
import type {
  NormalizedUsage,
  NormalizeOptions,
  ProviderId,
  RawResponse
} from "./types.js";

// Object.create(null): no prototype, so a caller passing an untyped
// opts.provider (bypassing the ProviderId union at runtime, e.g. from
// plain JS) can't reach Object.prototype via byId["__proto__"].
const byId: Record<ProviderId, (typeof adapters)[number]> = Object.assign(Object.create(null), {
  openai,
  anthropic,
  bedrock,
  gemini
});

/**
 * Normalize one raw provider response into a canonical usage record.
 * Auto-detects the provider unless `opts.provider` forces an adapter.
 * Throws if no adapter recognizes the shape or required fields are missing.
 */
export function normalize(
  response: RawResponse,
  opts: NormalizeOptions = {}
): NormalizedUsage {
  if (typeof response !== "object" || response === null) {
    throw new Error("response must be an object");
  }
  if (opts.provider) {
    const adapter = byId[opts.provider];
    if (!adapter) {
      throw new Error(`forced provider "${opts.provider}" is not a supported adapter`);
    }
    const out = adapter.extract(response, opts);
    if (!out) {
      throw new Error(
        `forced provider "${opts.provider}" could not extract usage (missing tokens/model?)`
      );
    }
    return out;
  }
  for (const adapter of adapters) {
    if (adapter.detect(response)) {
      const out = adapter.extract(response, opts);
      if (out) return out;
    }
  }
  throw new Error(
    "no adapter recognized this response shape (supported: openai, anthropic, bedrock, gemini)"
  );
}

export interface NormalizeManyResult {
  usage: NormalizedUsage[];
  errors: Array<{ index: number; message: string }>;
}

/** Normalize an array of responses, collecting per-item errors. */
export function normalizeMany(
  responses: RawResponse[],
  opts: NormalizeOptions = {}
): NormalizeManyResult {
  if (!Array.isArray(responses)) {
    throw new Error("expected an array of responses");
  }
  const usage: NormalizedUsage[] = [];
  const errors: Array<{ index: number; message: string }> = [];
  responses.forEach((r, index) => {
    try {
      usage.push(normalize(r, opts));
    } catch (e) {
      errors.push({ index, message: (e as Error).message });
    }
  });
  return { usage, errors };
}
