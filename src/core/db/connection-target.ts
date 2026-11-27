import postgres from "postgres";

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/**
 * The hosts and user that postgres.js connects with. A `host` query
 * parameter overrides the host of the URL, so the URL alone is not proof.
 * Building the client opens no connection.
 */
export function connectionTarget(databaseUrl: string): {
  hosts: string[];
  user: string;
} {
  const { host, user } = postgres(databaseUrl, { max: 1 }).options;
  // A user given as a function cannot be checked, so it matches nothing.
  return { hosts: host, user: typeof user === "string" ? user : "" };
}

/** A database on this machine, judged by the hosts postgres.js would use. */
export function isLoopbackDatabase(databaseUrl: string): boolean {
  const { hosts } = connectionTarget(databaseUrl);
  return hosts.length > 0 && hosts.every((host) => LOOPBACK.has(host));
}
