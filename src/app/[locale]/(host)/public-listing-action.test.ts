import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireHost: vi.fn(),
  write: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("@/lib/auth/current-host", () => ({ requireHost: mocks.requireHost }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/core/booking/public-listings", async (original) => ({
  ...(await original<object>()),
  setPublicListing: mocks.write,
}));
import { updatePublicListingAction } from "./public-listing-action";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireHost.mockResolvedValue({ homeId: "mine", id: "me" });
});

function form(mode = "publish", name = "La Casa") {
  const data = new FormData();
  data.set("locale", "es");
  data.set("mode", mode);
  data.set("displayName", name);
  data.set("homeId", "someone-else");
  return data;
}

it("publishes the explicitly chosen name only for the authenticated household", async () => {
  expect(await updatePublicListingAction("idle", form())).toBe("saved");
  expect(mocks.requireHost).toHaveBeenCalledWith("es");
  expect(mocks.write).toHaveBeenCalledWith(
    { id: "me", homeId: "mine" },
    { published: true, displayName: "La Casa" },
  );
  expect(mocks.revalidate).toHaveBeenCalledWith("/es/settings");
});

it("unpublishes without requiring a display name", async () => {
  expect(await updatePublicListingAction("idle", form("unpublish", ""))).toBe(
    "saved",
  );
  expect(mocks.write).toHaveBeenCalledWith(
    { id: "me", homeId: "mine" },
    { published: false },
  );
});

it.each([
  ["unknown", "House"],
  ["publish", " ’ "],
  ["publish", "🏡"],
  ["publish", "x".repeat(81)],
])("rejects malformed listing edits", async (mode, name) => {
  expect(await updatePublicListingAction("idle", form(mode, name))).toBe(
    "invalid",
  );
  expect(mocks.write).not.toHaveBeenCalled();
});

it("requires host authority", async () => {
  mocks.requireHost.mockRejectedValueOnce(new Error("sign in"));
  await expect(updatePublicListingAction("idle", form())).rejects.toThrow(
    "sign in",
  );
  expect(mocks.write).not.toHaveBeenCalled();
});
