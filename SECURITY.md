# Security Policy

`agent-trace-normalizer` is an offline transformer. It reads provider response
JSON you supply and emits normalized usage records. It performs no network calls
and does not invoke any LLM or telemetry endpoint.

It reads only token-usage and model fields; it does not parse or retain prompt
or completion content. Still, avoid piping responses that embed sensitive
payloads through any tool without review.

## Supported versions

Only the latest tagged release is supported.

## Reporting a vulnerability

Please use GitHub Security Advisories for private disclosure:

- [Open a security advisory](https://github.com/mizcausevic-dev/agent-trace-normalizer/security/advisories/new)

Do not file public issues for security reports.
