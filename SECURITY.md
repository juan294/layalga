# Security Policy

## Supported Versions

Only the current release line receives security fixes.

| Version | Supported |
| ------- | --------- |
| 0.2.x   | Yes       |
| < 0.2   | No        |

## Reporting a Vulnerability

Do not report a security vulnerability through a public issue.

Send details to `juan294@gmail.com` with the subject `[layalga] Security vulnerability report`. Include the affected commit or version, steps to reproduce, impact, and a suggested fix if you have one. Do not send real guest data, invitation links, access tokens, or credentials.

You can expect an acknowledgment within 48 hours, an initial assessment within 7 days, and a coordinated disclosure after a fix is available.

## Security Boundaries

- PostgreSQL is authoritative for availability, holds, visits, and household policy.
- The model does not directly mutate booking state.
- Sensitive actions require deterministic policy checks and host approval.
- Guest links, calendar feed tokens, service-role keys, and runtime credentials are secrets.
- Runtime database roles must remain separate and least-privileged.
