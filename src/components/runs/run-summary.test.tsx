import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { RunSummary, sanitizeRunSummary } from "./run-summary";

describe("RunSummary", () => {
  test("renders the model summary as safe structured content", () => {
    const html = renderToStaticMarkup(
      <RunSummary
        summary={`---
### ✅ What was done

| Step | Result |
|---|---|
| Policy evaluation | Stay allowed |
| Rooms allocated | **Guest Room** and \`Garage Room\` |

- Host approval was not required.`}
      />,
    );

    expect(html).toContain("<hr/>");
    expect(html).toContain("<h3>What was done</h3>");
    expect(html).toContain("<table>");
    expect(html).toContain('<th scope="col">Step</th>');
    expect(html).toContain("<td>Policy evaluation</td>");
    expect(html).toContain("<strong>Guest Room</strong>");
    expect(html).toContain("<code>Garage Room</code>");
    expect(html).toContain("<ul><li>Host approval was not required.</li></ul>");
    expect(html).not.toContain("✅");
    expect(html).not.toContain("###");
    expect(html).not.toContain("|---|");
  });

  test("removes emoji without removing ordinary numbers or punctuation", () => {
    expect(sanitizeRunSummary("✅ Step 1: 2 guests #confirmed")).toBe(
      "Step 1: 2 guests #confirmed",
    );
  });

  test("removes internal UUIDs from a public summary", () => {
    expect(
      sanitizeRunSummary(
        "A temporary hold was placed for visit `a4faa407-39c3-424e-8dd0-edc6a09d38d8`, securing the room.",
      ),
    ).toBe("A temporary hold was placed for visit, securing the room.");
  });
});
