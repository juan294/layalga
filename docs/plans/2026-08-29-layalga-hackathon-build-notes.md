# L'Ayalga hackathon build deviations

Plan: `2026-08-29-layalga-hackathon-build.md`

## Deviations

### Phase 0: AgentCore packaging

- Plan said: bundle all dependencies into one ESM file, with CommonJS as the fallback.
- Found: Strands has an optional S3 import and AgentCore loads Fastify plugins with runtime `require`; neither fully bundled format starts with the pinned packages.
- Chose: bundle local TypeScript with `--packages=external` and vendor hoisted production dependencies in the ZIP.
- Why: this is the AWS-supported Node direct-code package shape and it started successfully in AgentCore.

### Phase 0: Strands session identifiers

- Plan said: use colon-prefixed session identifiers such as `spike:<uuid>`, `inv:<id>`, and `tick:<id>`.
- Found: Strands 1.15.0 rejects identifiers outside `^[a-z0-9_-]+$`.
- Chose: use `spike_<uuid>`, `inv_<id>`, and `tick_<id>`.
- Why: invalid identifiers fail before session persistence or restore runs.

### Phase 0: Runtime verdict

- Plan said: use AgentCore when every interrupt-and-resume assertion passes; otherwise use the local runtime and delete the failed AgentCore runtime.
- Found: AgentCore reached `READY` and started the application, but Bedrock rejected the first Sonnet 4.5 call because Anthropic use-case details were not active for the AWS account; a direct Bedrock CLI call returned the same error.
- Chose: accept the planned `local` verdict and delete runtime `layalga_agent-h3IZEMHONS`; keep the versioned S3 bucket and IAM role for a later retry.
- Why: the account-level model gate prevents the Phase 0 protocol and matches the plan's explicit fallback condition.
