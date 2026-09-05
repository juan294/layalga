import { expect, it } from "vitest";
import { cancellationReviewInput } from "./cancellation-input";

it("requires explicit confirmation and matching review identifiers", () => {
  const form = new FormData();
  form.set("expectedVisitId", "");
  form.set("expectedStay", "");
  expect(() => cancellationReviewInput(form)).toThrow("confirm");
  form.set("confirmed", "yes");
  expect(cancellationReviewInput(form)).toEqual({
    expectedVisitId: null,
    expectedStay: null,
  });
  form.set("expectedVisitId", "10000000-0000-4000-8000-000000000001");
  expect(() => cancellationReviewInput(form)).toThrow();
  form.set("expectedStay", "2026-10-02|2026-10-04");
  expect(cancellationReviewInput(form).expectedStay).toEqual([
    "2026-10-02",
    "2026-10-04",
  ]);
});
