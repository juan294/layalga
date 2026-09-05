import { describe, expect, it } from "vitest";

import { requestsCancellationReview } from "./cancellation-intent";

describe("cancellation preparation", () => {
  it.each([
    "We can't come after all",
    "Please cancel our visit",
    "We can no longer make it",
    "No podemos ir",
    "Queremos cancelar la visita",
    "Ya no vamos a venir",
    "We won’t be there",
    "We have to pull out",
    "Al final no iremos",
    "Ya no podemos venir",
    "Can we cancel?",
    "Don't cancel; move it to Friday",
  ])("routes %s to human review without mutating a visit", (message) => {
    expect(requestsCancellationReview(message)).toBe(true);
  });

  it.each([
    "Please move our stay to October 4",
    "Llegaremos a las cinco",
    "Thanks!",
  ])("keeps an ordinary change on its existing path: %s", (message) => {
    expect(requestsCancellationReview(message)).toBe(false);
  });
});
