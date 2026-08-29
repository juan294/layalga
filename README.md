# L’Ayalga — From invitation to arrival

[![CI](https://github.com/juan294/layalga/actions/workflows/ci.yml/badge.svg)](https://github.com/juan294/layalga/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0.3-3178C6.svg)](https://www.typescriptlang.org/)
[![Strands Agents](https://img.shields.io/badge/Strands_Agents-planned-232F3E.svg)](https://strandsagents.com/)

L’Ayalga is an AI hospitality coordinator for shared homes. It captures informal invitations, converts flexible plans into confirmed visits, checks partial overlaps, follows up before arrival, and asks hosts only when a social exception needs a decision.

---

## Status

The repository contains the application scaffold for Phase 1, including the Next.js skeleton, pinned dependencies, health route, and CI verification.

## Product identity

- Product: L’Ayalga
- Repository: `layalga`
- Intended public URL: `https://layalga.thecreativetoken.com`
- Hackathon: AWS Agents for Humans
- Track: Everyday Agents

## Product contract

The calendar is an output of the coordination work, not the product itself. A deterministic booking engine owns availability and state. The Strands agent handles natural-language intake, negotiation, proactive reconfirmation, and human approval at social exceptions.

The first demo will use synthetic guests, three overlap rules, and an explicitly labeled controllable clock. It will not integrate with WhatsApp or use real guest data.

## Project workflow

Read [CLAUDE.md](CLAUDE.md) and [AGENTS.md](AGENTS.md) before making changes. The current product and delivery assessment is [docs/research/2026-08-29-agents-for-humans-hackathon-assessment.md](docs/research/2026-08-29-agents-for-humans-hackathon-assessment.md).

Run the scaffold verification with:

```bash
bash scripts/verify-bootstrap.sh
```

The active workflow is Phase 1 of the approved hackathon build plan.

## Blueprint disclosure

This project was created during the hackathon submission period. It uses the pre-existing cc-rpi repository as development-process scaffolding. Product code and the submitted implementation will be created in this repository and disclosed according to the hackathon rules.
