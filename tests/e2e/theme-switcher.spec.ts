import { expect, test } from "@playwright/test";

for (const failure of ["all", "read", "write"] as const) {
  test(`theme selection works when browser storage ${failure} operations fail`, async ({ page }) => {
    await page.addInitScript((failure) => {
      // A failed write must not let the old persisted preference win.
      if (failure === "write") localStorage.setItem("layalga-theme", "dark");
      for (const method of ["getItem", "setItem", "removeItem"] as const) {
        if (failure === "read" && method !== "getItem") continue;
        if (failure === "write" && method === "getItem") continue;
        const original = Storage.prototype[method];
        Object.defineProperty(Storage.prototype, method, {
          value(key: string, value?: string) {
            if (key === "layalga-theme") throw new DOMException("Storage denied", "SecurityError");
            return Reflect.apply(original, this, value === undefined ? [key] : [key, value]);
          },
          configurable: true,
        });
      }
    }, failure);
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/en/privacy");
    const button = page.locator(".theme-switcher button");
    await expect(page.locator("html")).toHaveAttribute("data-theme", failure === "write" ? "dark" : "auto");
    await expect(button).toHaveAttribute("aria-label", failure === "write" ? /dark/i : /auto/i);
    const choices = failure === "write" ? ["auto", "light", "dark"] : ["light", "dark", "auto"];
    for (const choice of choices) {
      await button.click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", choice);
      await expect(button).toHaveAttribute("aria-label", new RegExp(choice, "i"));
      if (choice === "auto") {
        await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
        await page.emulateMedia({ colorScheme: "light" });
        await expect(page.locator("html")).not.toHaveCSS("color-scheme", "dark");
        await page.emulateMedia({ colorScheme: "dark" });
      }
    }
  });
}

test("theme persists across reloads and follows changes from another tab", async ({ page, context }) => {
  await page.goto("/en/privacy");
  const button = page.locator(".theme-switcher button");
  await button.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(button).toHaveAttribute("aria-label", /light/i);

  // Leave an in-page selection before another tab changes storage.
  await button.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const other = await context.newPage();
  await other.goto("/en/privacy");
  await expect(other.locator("html")).toHaveAttribute("data-theme", "dark");
  await other.locator(".theme-switcher button").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "auto");
  await expect(button).toHaveAttribute("aria-label", /auto/i);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("layalga-theme"))).toBeNull();
});
