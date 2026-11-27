import { expect, type Page } from "@playwright/test";

/* The mobile-webkit project runs this at the iPhone 13 profile (390px), so the
   measurements below are real WebKit layout rather than a harness estimate.
   That matters: a native menulist select reports the CSS min-height the sheet
   asked for while laying out at its own intrinsic height, so this class of
   defect is only visible once rendered. */
const minimumTarget = 44;

type Audit = {
  scrollWidth: number;
  clientWidth: number;
  undersized: {
    tag: string;
    testId: string;
    className: string;
    height: number;
    text: string;
  }[];
};

async function auditViewport(page: Page): Promise<Audit> {
  return page.evaluate((minimum) => {
    const root = document.documentElement;
    const interactive = document.querySelectorAll(
      "a, button, input, select, textarea, summary, [role=button]",
    );
    const undersized: Audit["undersized"] = [];

    interactive.forEach((element) => {
      const box = element.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) return;

      const input = element as HTMLInputElement;
      if (input.type === "hidden") return;

      // The locale switcher is a deliberate compact control on
      // --interactive-target-compact, not an oversight.
      if (element.closest(".locale-switcher")) return;

      // A native checkbox or radio cannot be resized without losing its
      // control rendering; it is tappable through its wrapping label, so the
      // label is the target that has to clear the minimum.
      if (input.type === "checkbox" || input.type === "radio") {
        const label = element.closest("label");
        if (label && label.getBoundingClientRect().height >= minimum) return;
      }

      if (box.height + 1 < minimum) {
        undersized.push({
          tag: element.tagName,
          testId: element.getAttribute("data-testid") ?? "",
          className: String((element as HTMLElement).className ?? "").slice(
            0,
            60,
          ),
          height: Math.round(box.height),
          text: (element.textContent ?? "").trim().slice(0, 40),
        });
      }
    });

    return {
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
      undersized,
    };
  }, minimumTarget);
}

export async function expectTouchSafe(page: Page, route: string) {
  const audit = await auditViewport(page);

  expect(
    audit.undersized,
    `${route}: controls under ${minimumTarget}px`,
  ).toEqual([]);

  expect(
    audit.scrollWidth,
    `${route}: page scrolls horizontally at ${audit.clientWidth}px`,
  ).toBeLessThanOrEqual(audit.clientWidth);
}
