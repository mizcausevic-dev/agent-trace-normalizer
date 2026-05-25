import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, it, expect } from "vitest";

import { normalize, normalizeMany } from "../src/normalize.js";
import { parseResponses } from "../src/cli.js";
import * as api from "../src/index.js";
import type { RawResponse } from "../src/types.js";

const here = dirname(fileURLToPath(import.meta.url));
const responses = (): RawResponse[] =>
  parseResponses(readFileSync(join(here, "..", "fixtures", "responses.jsonl"), "utf8"));

describe("auto-detection", () => {
  it("normalizes an OpenAI response", () => {
    const u = normalize({ model: "gpt-4o", usage: { prompt_tokens: 10, completion_tokens: 5 } });
    expect(u).toMatchObject({ provider: "openai", model: "gpt-4o", inputTokens: 10, outputTokens: 5, source: "openai" });
  });

  it("normalizes an Anthropic response", () => {
    const u = normalize({ model: "claude-opus-4-7", usage: { input_tokens: 20, output_tokens: 8 } });
    expect(u).toMatchObject({ provider: "anthropic", inputTokens: 20, outputTokens: 8, source: "anthropic" });
  });

  it("normalizes a Bedrock response using the --model fallback", () => {
    const u = normalize({ usage: { inputTokens: 30, outputTokens: 9 } }, { model: "anthropic.claude-3" });
    expect(u).toMatchObject({ provider: "aws.bedrock", model: "anthropic.claude-3", inputTokens: 30, source: "bedrock" });
  });

  it("normalizes a Gemini response", () => {
    const u = normalize({ modelVersion: "gemini-2.5-pro", usageMetadata: { promptTokenCount: 40, candidatesTokenCount: 12 } });
    expect(u).toMatchObject({ provider: "gcp.gemini", model: "gemini-2.5-pro", inputTokens: 40, outputTokens: 12, source: "gemini" });
  });

  it("stamps operation default chat and honours an override", () => {
    expect(normalize({ model: "m", usage: { prompt_tokens: 1, completion_tokens: 1 } }).operation).toBe("chat");
    expect(
      normalize({ model: "m", usage: { prompt_tokens: 1, completion_tokens: 1 } }, { operation: "embeddings" }).operation
    ).toBe("embeddings");
  });
});

describe("errors", () => {
  it("throws on a non-object response", () => {
    expect(() => normalize(null as unknown as RawResponse)).toThrow(/must be an object/);
  });

  it("throws when no adapter recognizes the shape", () => {
    expect(() => normalize({ foo: "bar" })).toThrow(/no adapter recognized/);
  });

  it("throws when Bedrock has no model and no fallback", () => {
    expect(() => normalize({ usage: { inputTokens: 1, outputTokens: 1 } })).toThrow(/no adapter|extract/);
  });

  it("forced provider that can't extract throws", () => {
    expect(() => normalize({ foo: 1 }, { provider: "openai" })).toThrow(/could not extract/);
  });

  it("forced provider overrides detection", () => {
    // openai usage shape, but force anthropic -> anthropic adapter can't read it
    expect(() => normalize({ usage: { prompt_tokens: 1, completion_tokens: 1 } }, { provider: "anthropic" })).toThrow();
  });
});

describe("normalizeMany", () => {
  const result = normalizeMany(responses(), { model: "fallback-model" });

  it("normalizes a mixed batch across providers", () => {
    expect(result.usage).toHaveLength(4);
    expect(result.usage.map((u) => u.source).sort()).toEqual(["anthropic", "bedrock", "gemini", "openai"]);
    expect(result.errors).toHaveLength(0);
  });

  it("collects per-item errors without throwing", () => {
    const r = normalizeMany([{ ok: 1 }, { model: "m", usage: { prompt_tokens: 1, completion_tokens: 1 } }]);
    expect(r.usage).toHaveLength(1);
    expect(r.errors).toEqual([{ index: 0, message: expect.stringContaining("no adapter") }]);
  });

  it("throws on non-array input", () => {
    expect(() => normalizeMany({} as unknown as RawResponse[])).toThrow(/array/);
  });
});

describe("parseResponses", () => {
  it("parses array / object / jsonl", () => {
    expect(parseResponses('[{"a":1}]')).toHaveLength(1);
    expect(parseResponses('{"a":1}')).toHaveLength(1);
    expect(parseResponses('{"a":1}\n{"b":2}')).toHaveLength(2);
  });
  it("throws on a bad jsonl line", () => {
    expect(() => parseResponses('{"a":1}\n{oops')).toThrow(/line 2/);
  });
});

describe("public API", () => {
  it("re-exports the surface", () => {
    expect(typeof api.normalize).toBe("function");
    expect(typeof api.normalizeMany).toBe("function");
    expect(api.adapters.map((a) => a.id)).toContain("anthropic");
  });
});
