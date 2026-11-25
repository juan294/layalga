<!-- rpi-overlay: skill=rpi-release; written-against=034673a9ed50 -->
# Project overlay for rpi-release

## Procedure

- Before acting, read `docs/release/e2e-pro-playbook.md` completely. It is this project's adapted release playbook: read it instead of the generic `references/e2e-pro-playbook.md` template named in the stock skill, and follow it as the single project-specific release procedure. It may declare release blocked.
- The gates in the stock skill still apply. Where `docs/release/e2e-pro-playbook.md` is less strict than a stock gate, the stock gate applies; report the difference to the owner.
- This skill remains the only tagging and publication authority, but invoking it does not itself authorize deployment, push, tag creation or publication. Obtain each authorization the playbook requires at the named gate.

Moved from the managed `.claude` and `.agents` copies of this skill on 2026-11-14 (layalga commit fa796ce).
