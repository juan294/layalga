# Contributing to L’Ayalga

Thanks for helping improve L’Ayalga.

## Development Setup

1. Fork and clone the repository.
2. Create a branch from `develop`.
3. Install dependencies with `pnpm install`.
4. Copy `.env.example` to `.env.local` and use local or synthetic values only.

## Development Workflow

Use the repository's Research-Plan-Implement workflow for substantial changes. Keep implementation off `develop` and `main`, and open pull requests against `develop`.

Feature branches and `develop` must never trigger Vercel previews. Inspect remote triggers and run applicable checks locally before a reviewed push or pull request starts hosted CI. Production deployment requires separate owner authorization.

Run the deterministic checks sequentially before opening a pull request:

```bash
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build
```

Database-backed tests, browser tests, the demo driver, and release probes require the local Supabase stack and synthetic demo seed. Follow `CLAUDE.md` for the exact commands and safety contracts. The [synthetic benchmark](docs/submission/coordination-evidence.md) records automation measurements separately from the [human participant protocol](docs/submission/participant-protocol.md).

Use lowercase Conventional Commits:

```text
feat(scope): add a capability
fix(scope): correct a defect
docs(scope): clarify behavior
test(scope): add regression coverage
chore(scope): update tooling
```

Never commit secrets, personal data, real guest information, private invitation links, or production database values. Report security problems through [SECURITY.md](SECURITY.md), not a public issue.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
