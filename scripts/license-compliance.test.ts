import { execFileSync } from "node:child_process";

import { expect, it } from "vitest";

interface LicensePackage {
  name: string;
  versions: string[];
}

type LicenseInventory = Record<string, LicensePackage[]>;

it("has declared license metadata for every production package", () => {
  const output = execFileSync(
    "pnpm",
    ["licenses", "list", "--prod", "--json"],
    { encoding: "utf8" },
  );
  const inventory = JSON.parse(output) as LicenseInventory;
  const unknownPackages = (inventory.Unknown ?? []).map(
    ({ name, versions }) => `${name}@${versions.join(",")}`,
  );

  expect(unknownPackages).toEqual([]);
});
