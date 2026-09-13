# Security Policy

`agent-trace-normalizer` is an offline transformer. It reads provider response
JSON you supply and emits normalized usage records. As of the current version,
it performs no network calls and does not invoke any LLM or telemetry endpoint
(`node:fs` and `node:url` are its only imports; CI greps for that on every run).

Normalizing a response does require parsing the whole JSON payload, prompt and
completion content included, since token counts live alongside it in the same
object. It does not copy prompt or completion content into its output (the
normalized record is a fixed set of token/model fields) or write raw payload
content to disk anywhere. The `--out` flag does write wherever you point it,
including outside the current directory; treat it the same as any other file
write you invoke yourself. Still, avoid piping responses that embed sensitive
payloads through any tool without review.

## Supported versions

Only the latest tagged release is supported.

## Reporting a vulnerability

Please use GitHub Security Advisories for private disclosure:

- [Open a security advisory](https://github.com/mizcausevic-dev/agent-trace-normalizer/security/advisories/new)

Do not file public issues for security reports.
