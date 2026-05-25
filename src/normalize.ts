import { adapters, openai, anthropic, bedrock, gemini } from "./adapters.js";
import type {
  NormalizedUsage,
  NormalizeOptions,
  ProviderId,
  RawResponse
} from "./types.js";

const byId: Record<ProviderId, (typeof adapters)[number] | undefined> = {
  openai,
  anthropic,
  bedrock,
  gemini,
  generic: undefined
};

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
  if (opts.provider && opts.provider !== "generic") {
    const adapter = byId[opts.provider];
    const out = adapter?.extract(response, opts);
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
