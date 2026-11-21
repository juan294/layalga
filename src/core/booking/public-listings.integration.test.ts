import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { closeDatabase, getDatabaseConnection } from "../db/client";
import {
  discoverPublicListings,
  getHostPublicListing,
  resolvePublicListing,
  setPublicListing,
} from "./public-listings";

const homes: string[] = [];
const sql = () => getDatabaseConnection().sql;
afterEach(async () => {
  if (homes.length)
    await sql()`delete from public.homes where id in ${sql()(homes.splice(0))}`;
});
afterAll(closeDatabase);

async function household() {
  const homeId = randomUUID();
  const id = randomUUID();
  await sql()`insert into public.homes (id, name, timezone) values (${homeId}, ${homeId}, 'Europe/Madrid')`;
  homes.push(homeId);
  await sql()`insert into public.hosts (id, home_id, display_name, locale) values (${id}, ${homeId}, 'Fixture host', 'en')`;
  return { homeId, id };
}

describe("public listings", () => {
  it("hides both homes by default and resolves only published handles", async () => {
    const [a, b] = [await household(), await household()];
    const unique = randomUUID().slice(0, 8);
    const label = `L’Ayálga del ${unique}`;
    const query = `   l'ayAlGa    DEL    ${unique}   `;
    expect(await getHostPublicListing(a)).toBeNull();
    expect(await discoverPublicListings(a.homeId)).toEqual({
      listings: [],
      truncated: false,
    });
    await setPublicListing(a, { published: true, displayName: label });
    const {
      listings: [listing],
    } = await discoverPublicListings(query);
    expect(listing).toEqual({ displayName: label, handle: expect.any(String) });
    expect(listing!.handle).not.toBe(a.homeId);
    expect(await resolvePublicListing(listing!.handle)).toEqual({
      ...listing,
      homeId: a.homeId,
      timezone: "Europe/Madrid",
    });
    await expect(
      setPublicListing({ id: b.id, homeId: a.homeId }, { published: false }),
    ).rejects.toThrow();
    await expect(
      getHostPublicListing({ id: b.id, homeId: a.homeId }),
    ).resolves.toBeNull();
    await setPublicListing(b, { published: true, displayName: label });
    expect((await discoverPublicListings(query)).listings).toHaveLength(2);
    await setPublicListing(a, { published: false });
    expect(await resolvePublicListing(listing!.handle)).toBeNull();
    expect((await discoverPublicListings(query)).listings).toHaveLength(1);
    await setPublicListing(a, {
      published: true,
      displayName: label + " Norte",
    });
    expect((await discoverPublicListings("Norte")).listings).toContainEqual({
      handle: listing!.handle,
      displayName: label + " Norte",
    });
    expect(await resolvePublicListing("broken")).toBeNull();
  });

  it("bounds results, treats pattern characters as literal and rejects empty or excessive input", async () => {
    const prefix = randomUUID().slice(0, 12);
    for (let n = 0; n < 11; n++)
      await setPublicListing(await household(), {
        published: true,
        displayName: prefix + n,
      });
    const result = await discoverPublicListings(prefix);
    expect(result.listings).toHaveLength(10);
    expect(result.truncated).toBe(true);
    for (const query of [
      "",
      " ",
      "x",
      "%_",
      "house\u0000name",
      "x".repeat(81),
    ]) {
      expect(await discoverPublicListings(query)).toEqual({
        listings: [],
        truncated: false,
      });
    }
  });

  it("limits direct table access to the web runtime", async () => {
    const roles = [
      "anon",
      "authenticated",
      "service_role",
      "layalga_agent_runtime",
      "layalga_web_runtime",
    ];
    for (const role of roles) {
      const [row] =
        await sql()`select has_table_privilege(${role}, 'public.household_public_listings', 'SELECT') as readable,
        has_column_privilege(${role}, 'public.household_public_listings', 'published', 'UPDATE') as writable`;
      expect(row).toMatchObject({
        readable: role === "layalga_web_runtime",
        writable: role === "layalga_web_runtime",
      });
    }
    const owner = await household();
    await setPublicListing(owner, {
      published: true,
      displayName: "Synthetic fixture",
    });
    await sql().begin(async (tx) => {
      // Role membership is temporary even when the fixture owner can only
      // administer the runtime role. Roll it back with the test write.
      await tx`savepoint listing_role_test`;
      await tx`grant layalga_web_runtime to current_user`;
      await tx`set local role layalga_web_runtime`;
      expect(
        await tx`select published from public.household_public_listings where home_id = ${owner.homeId}`,
      ).toEqual([{ published: true }]);
      expect(
        await tx`update public.household_public_listings set published = false where home_id = ${owner.homeId} returning published`,
      ).toEqual([{ published: false }]);
      await tx`rollback to savepoint listing_role_test`;
    });
  });
});
