type UserResult = { data: { user: { id: string } | null } };

/** A Supabase client double; the session is a direct web sign-in by default. */
export function webSession(
  getUser: () => Promise<unknown>,
  claims: Record<string, unknown> = {},
) {
  let last: UserResult | undefined;
  return {
    auth: {
      getUser: async () => (last = (await getUser()) as UserResult),
      getClaims: async () => ({
        data: last?.data.user
          ? {
              claims: {
                sub: last.data.user.id,
                aud: "authenticated",
                ...claims,
              },
            }
          : null,
      }),
    },
  };
}
