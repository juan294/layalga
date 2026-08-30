# Architecture diagram

`layalga-architecture.mmd` is the source. `mermaid-config.json` fixes the render settings. The committed SVG and PNG were generated with Mermaid CLI 11.12.0:

```bash
pnpm dlx @mermaid-js/mermaid-cli@11.12.0 \
  -i docs/architecture/layalga-architecture.mmd \
  -o docs/architecture/layalga-architecture.svg \
  -c docs/architecture/mermaid-config.json \
  -t neutral -b '#f7f1e5' -w 1600

pnpm dlx @mermaid-js/mermaid-cli@11.12.0 \
  -i docs/architecture/layalga-architecture.mmd \
  -o docs/architecture/layalga-architecture.png \
  -c docs/architecture/mermaid-config.json \
  -t neutral -b '#f7f1e5' -w 1600 -s 1
```

If Puppeteer cannot find a browser, set `PUPPETEER_EXECUTABLE_PATH` to a local Chrome or Chromium executable before running the commands.
