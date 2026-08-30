import { seedDemo } from "../../scripts/seed-demo";

export default async function globalSetup(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  const tokenSecret = process.env.LINK_TOKEN_SECRET;
  if (!databaseUrl || !tokenSecret) {
    throw new Error("E2E database settings are missing");
  }
  await seedDemo(databaseUrl, tokenSecret);
}
