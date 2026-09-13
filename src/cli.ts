#!/usr/bin/env node
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { normalizeMany } from "./normalize.js";
import type { NormalizeOptions, ProviderId, RawResponse } from "./types.js";

const PROVIDERS: ProviderId[] = ["openai", "anthropic", "bedrock", "gemini"];

// Comfortably above real provider capture logs, well under V8's ~512MB
// string ceiling. A capacity ceiling for the operator's own input file,
// not a defense against an attacker: this CLI has no untrusted-input
// trust boundary, the invoker already controls every flag including the
// file path.
const MAX_INPUT_BYTES = 256 * 1024 * 1024;

interface Args {
  source?: string;
  provider?: ProviderId;
  model?: string;
  out?: string;
  force: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { help: false, force: false };
  let positionalOnly = false;

  const nextValue = (i: number, flag: string): string => {
    const v = argv[i + 1];
    if (v === undefined || (v.startsWith("-") && v !== "-")) {
      throw new Error(`${flag} requires a value`);
    }
    return v;
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (positionalOnly) {
      args.source = a;
      continue;
    }
    if (a === "--") {
      positionalOnly = true;
      continue;
    }
    if (a === "-h" || a === "--help") args.help = true;
    else if (a === "--force") args.force = true;
    else if (a === "--provider") {
      const v = nextValue(i, "--provider");
      i++;
      if (!PROVIDERS.includes(v as ProviderId)) {
        throw new Error(`--provider must be one of: ${PROVIDERS.join(", ")}`);
      }
      args.provider = v as ProviderId;
    } else if (a === "--model") {
      args.model = nextValue(i, "--model");
      i++;
    } else if (a === "--out") {
      args.out = nextValue(i, "--out");
      i++;
    } else if (!a.startsWith("-")) args.source = a;
    else throw new Error(`Unknown option: ${a}`);
  }
  return args;
}

/** Parse a JSON array, single object, or JSONL of raw responses. */
export function parseResponses(raw: string): RawResponse[] {
  const t = raw.trim();
  try {
    const parsed: unknown = JSON.parse(t);
    return Array.isArray(parsed) ? (parsed as RawResponse[]) : [parsed as RawResponse];
  } catch {
    // Not a single valid JSON document (covers a pretty-printed object,
    // which used to be misrouted here by a newline check) -- fall back to
    // JSONL. The native parse error is intentionally discarded, not
    // surfaced: it can embed a fragment of the input around the syntax
    // error, which may include payload content.
  }
  return t
    .split("\n")
    .map((line, i) => ({ line: line.trim(), lineNo: i + 1 }))
    .filter(({ line }) => line.length > 0)
    .map(({ line, lineNo }) => {
      try {
        return JSON.parse(line) as RawResponse;
      } catch {
        throw new Error(`invalid JSON on line ${lineNo}`);
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
  --force           Allow --out to overwrite an existing file
  --                Treat everything after this as the input file, not flags
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
    const size = statSync(args.source).size;
    if (size > MAX_INPUT_BYTES) {
      process.stderr.write(`error: ${args.source} is ${size} bytes, exceeds the ${MAX_INPUT_BYTES}-byte cap\n`);
      return 2;
    }
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
    try {
      writeFileSync(args.out, `${json}\n`, { encoding: "utf8", flag: args.force ? "w" : "wx" });
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      const detail = code === "EEXIST" ? `${args.out} already exists (use --force to overwrite)` : (e as Error).message;
      process.stderr.write(`error: could not write ${args.out}: ${detail}\n`);
      return 2;
    }
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
