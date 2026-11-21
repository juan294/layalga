import { expect, it, vi } from "vitest";
import { createPublicStayTools } from "./public-tools";

it("looks up homes and reads actual availability with no invitation", async () => {
  const discover = vi.fn().mockResolvedValue({
    listings: [{ handle: "home", displayName: "House" }],
    truncated: false,
  });
  const search = vi
    .fn()
    .mockResolvedValue({ status: "none", options: [], truncated: false });
  const [lookup, availability] = createPublicStayTools({ discover, search });
  expect(await lookup!.execute({ name: "House" })).toEqual(
    await discover.mock.results[0]!.value,
  );
  const input = {
    handle: "home",
    from: "2027-07-01",
    to: "2027-08-01",
    nights: 14,
    adults: 2,
    children: 0,
    pets: 0,
  };
  expect(await availability!.execute(input)).toMatchObject({ status: "none" });
  expect(search).toHaveBeenCalledWith(input);
  expect(
    lookup!.annotations.readOnlyHint && availability!.annotations.readOnlyHint,
  ).toBe(true);
});
