#!/usr/bin/env node
// Backs the SECURITY.md claim that this package performs no network calls.
// Fails CI if src/ ever imports a networking builtin, so the claim can't
// silently rot the next time someone adds a dependency or a feature.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const BANNED = ["node:http", "node:https", "node:net", "node:dgram", "node:tls", "node:dns"];
const SRC_DIR = new URL("../src", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith(".ts")) out.push(full);
  }
  return out;
}

const offenders = [];
for (const file of walk(SRC_DIR)) {
  const content = readFileSync(file, "utf8");
  for (const mod of BANNED) {
    if (content.includes(mod)) offenders.push(`${file}: imports ${mod}`);
  }
}

if (offenders.length > 0) {
  console.error("check:no-network failed, src/ imports a networking builtin:");
  for (const o of offenders) console.error(`  ${o}`);
  process.exit(1);
}
console.log("check:no-network passed, no networking builtins imported in src/");
