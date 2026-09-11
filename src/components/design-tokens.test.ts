import { glob, readFile } from "node:fs/promises";

import { describe, expect, test } from "vitest";

const ALLOWED_SCOPED_TOKENS = new Set([
  // Injected at runtime by next/font on a wrapper element.
  "--font-fraunces",
  // Injected at runtime by next/font on a wrapper element.
  "--font-inter",
  // Injected at runtime by next/font on a wrapper element.
  "--font-jetbrains-mono",
  // Value varies per room and is declared and read on the same door element.
  "--door-state",
]);

interface CssRule {
  body: string;
  selector: string;
}

describe("CSS module design tokens", () => {
  test("keeps every shared token rooted on the document", async () => {
    expect(ALLOWED_SCOPED_TOKENS.size).toBe(4);

    const rootTokens = declarationsInDocumentRules(
      cssWithoutComments(await readFile("src/app/globals.css", "utf8")),
    );
    const moduleFiles: string[] = [];
    for await (const file of glob("src/**/*.module.css")) {
      moduleFiles.push(file);
    }

    const problems: string[] = [];
    for (const file of moduleFiles.sort()) {
      const css = cssWithoutComments(await readFile(file, "utf8"));
      const rules = parseCssRules(css);
      const declared = new Set<string>();
      const scopedDeclarations = new Map<string, Set<string>>();

      for (const rule of rules) {
        for (const token of collectMatches(rule.body, /(--[\w-]+)\s*:/g)) {
          declared.add(token);
          if (!isDocumentSelector(rule.selector)) {
            const selectors =
              scopedDeclarations.get(token) ?? new Set<string>();
            selectors.add(rule.selector);
            scopedDeclarations.set(token, selectors);
          }
        }
      }

      const read = new Set(collectMatches(css, /var\(\s*(--[\w-]+)/g));
      for (const token of [...read].sort()) {
        if (ALLOWED_SCOPED_TOKENS.has(token)) continue;

        const selectors = scopedDeclarations.get(token);
        if (selectors) {
          problems.push(
            `${file} reads ${token} but declares it on ${[...selectors].join(", ")}. ` +
              "A wrapper-scoped token resolves to an invalid var() wherever that wrapper is absent, " +
              "and CSS then falls back to the property's initial value silently. " +
              "Fix: declare it on :root in globals.css.",
          );
        } else if (!declared.has(token) && !rootTokens.has(token)) {
          problems.push(
            `${file} reads ${token}, which nothing declares at :root.`,
          );
        }
      }
    }

    expect(problems, problems.join("\n")).toEqual([]);
  });

  test("recognizes declarations on the document element only", () => {
    expect(isDocumentSelector(":root")).toBe(true);
    expect(isDocumentSelector(':root[data-theme="dark"]')).toBe(true);
    expect(isDocumentSelector('html[data-season="winter"]')).toBe(true);
    expect(isDocumentSelector(":root, html.contrast")).toBe(true);
    expect(isDocumentSelector(":root .card")).toBe(false);
    expect(isDocumentSelector("html > body")).toBe(false);
  });
});

function declarationsInDocumentRules(css: string): Set<string> {
  const tokens = new Set<string>();
  for (const rule of parseCssRules(css)) {
    if (!isDocumentSelector(rule.selector)) continue;
    for (const token of collectMatches(rule.body, /(--[\w-]+)\s*:/g)) {
      tokens.add(token);
    }
  }
  return tokens;
}

function isDocumentSelector(selector: string): boolean {
  return selector.split(",").some((part) => {
    const compound = part.trim().replace(/\[[^\]]*\]/g, "");
    return /^(?::root|html)(?:[.#:][\w-]+)*$/.test(compound);
  });
}

function collectMatches(input: string, pattern: RegExp): string[] {
  return [...input.matchAll(pattern)].map((match) => match[1]);
}

function cssWithoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function parseCssRules(css: string): CssRule[] {
  const rules: CssRule[] = [];
  walkCssBlocks(css, rules);
  return rules;
}

function walkCssBlocks(css: string, rules: CssRule[]): void {
  let cursor = 0;
  while (cursor < css.length) {
    const open = css.indexOf("{", cursor);
    if (open === -1) return;

    const selector = css.slice(cursor, open).trim();
    const close = matchingBrace(css, open);
    const body = css.slice(open + 1, close);

    if (selector.startsWith("@")) {
      if (!selector.startsWith("@keyframes")) walkCssBlocks(body, rules);
    } else if (selector) {
      rules.push({ body, selector });
    }
    cursor = close + 1;
  }
}

function matchingBrace(css: string, open: number): number {
  let depth = 1;
  for (let index = open + 1; index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    if (css[index] === "}") depth -= 1;
    if (depth === 0) return index;
  }
  throw new Error(`Unclosed CSS block at offset ${open}`);
}
