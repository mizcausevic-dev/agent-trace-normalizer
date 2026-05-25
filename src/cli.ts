#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { normalizeMany } from "./normalize.js";
import type { NormalizeOptions, ProviderId, RawResponse } from "./types.js";

const PROVIDERS: ProviderId[] = ["openai", "anthropic", "bedrock", "gemini", "generic"];

interface Args {
  source?: string;
  provider?: ProviderId;
  model?: string;
  out?: string;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") args.help = true;
    else if (a === "--provider") {
      const v = argv[++i] as ProviderId;
      if (!PROVIDERS.includes(v)) throw new Error(`--provider must be one of: ${PROVIDERS.join(", ")}`);
      args.provider = v;
    } else if (a === "--model") args.model = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (!a.startsWith("-")) args.source = a;
    else throw new Error(`Unknown option: ${a}`);
  }
  return args;
}

/** Parse a JSON array, single object, or JSONL of raw responses. */
export function parseResponses(raw: string): RawResponse[] {
  const t = raw.trim();
  if (t.startsWith("[")) return JSON.parse(t) as RawResponse[];
  if (t.startsWith("{") && !t.includes("\n")) return [JSON.parse(t) as RawResponse];
  return t
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l, i) => {
      try {
        return JSON.parse(l) as RawResponse;
      } catch {
        throw new Error(`invalid JSON on line ${i + 1}`);
      }
    });
}

const HELP = `agent-trace-normalizer — normalize LLM provider responses into canonical usage records

Usage:
  agent-normalize <responses.json|.jsonl> [options]

Input: a JSON array, single object, or JSONL of raw provider responses
(OpenAI / Anthropic / AWS Bedrock / Google Gemini).

Options:
  --provider <id>   Force an adapter: openai | anthropic | bedrock | gemini
  --model <id>      Fallback model id when the response omits it (e.g. Bedrock)
  --out <file>      Write normalized usage JSON to a file (default: stdout)
  -h, --help        Show this help.

Output composes with llm-cost-span-exporter. Exit codes: 0 all ok, 1 some
records failed to normalize, 2 usage/IO error.`;

export function run(argv: string[]): number {
  let args: Args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    process.stderr.write(`${(e as Error).message}\n`);
    return 2;
  }
  if (args.help || !args.source) {
    process.stdout.write(`${HELP}\n`);
    return args.help ? 0 : 2;
  }
  let responses: RawResponse[];
  try {
    responses = parseResponses(readFileSync(args.source, "utf8"));
  } catch (e) {
    process.stderr.write(`error: ${(e as Error).message}\n`);
    return 2;
  }
  const opts: NormalizeOptions = {};
  if (args.provider) opts.provider = args.provider;
  if (args.model) opts.model = args.model;
  const { usage, errors } = normalizeMany(responses, opts);
  const json = JSON.stringify(usage, null, 2);
  if (args.out) {
    writeFileSync(args.out, `${json}\n`, "utf8");
    process.stdout.write(`wrote ${usage.length} usage record(s) to ${args.out}\n`);
  } else {
    process.stdout.write(`${json}\n`);
  }
  for (const e of errors) {
    process.stderr.write(`record ${e.index}: ${e.message}\n`);
  }
  return errors.length > 0 ? 1 : 0;
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  process.exit(run(process.argv.slice(2)));
}
