import { pathToFileURL } from "node:url";

import { resetDemoHome } from "@/lib/demo/reset";

export { DEMO_SEED } from "@/lib/demo/reset";
export type { SeedDemoResult } from "@/lib/demo/reset";

export async function seedDemo(
  connectionString: string,
  tokenSecret: string,
) {
  return resetDemoHome(connectionString, tokenSecret);
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  const tokenSecret = process.env.LINK_TOKEN_SECRET;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  if (!tokenSecret) {
    throw new Error("LINK_TOKEN_SECRET is required");
  }

  const result = await resetDemoHome(connectionString, tokenSecret);
  console.log(JSON.stringify(result));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
