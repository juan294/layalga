# Third-party license compliance

Run the production dependency check with:

```bash
pnpm licenses list --prod --json
```

`scripts/license-compliance.test.ts` fails when that inventory contains an
`Unknown` license group. This keeps packages without declared license metadata
out of the production dependency graph.

## Reviewed exception removed on 2026-08-30

`next-intl` 4.14.1 introduced these production dependencies:

- `@eloqnt/config` 0.0.2
- `@eloqnt/format-json` 0.0.3
- `@eloqnt/format-po` 0.0.3

Their published npm manifests contain no `license` field, and their published
tarballs contain no license file. The repository therefore pins `next-intl`
4.13.7, the last compatible patch before that dependency change. The current
production inventory has no packages in the `Unknown` license group.

Authoritative records:

- [next-intl 4.13.7 package manifest](https://registry.npmjs.org/next-intl/4.13.7)
- [next-intl 4.14.1 package manifest](https://registry.npmjs.org/next-intl/4.14.1)
- [@eloqnt/config 0.0.2 package manifest](https://registry.npmjs.org/@eloqnt/config/0.0.2)
- [@eloqnt/format-json 0.0.3 package manifest](https://registry.npmjs.org/@eloqnt/format-json/0.0.3)
- [@eloqnt/format-po 0.0.3 package manifest](https://registry.npmjs.org/@eloqnt/format-po/0.0.3)
