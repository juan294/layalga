import type { AccountIdentity } from "@/lib/auth/account-identity";

export function AccountChip({
  identity,
  label,
}: {
  identity: AccountIdentity | null;
  label: string;
}) {
  if (!identity) return null;

  return (
    <span
      className="site-header__account"
      data-testid="account-chip"
      title={identity.email}
    >
      <span className="site-header__account-label">{label}</span>
      <span aria-hidden="true" className="site-header__account-avatar">
        <span className="site-header__account-initial">{identity.initial}</span>
        {identity.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- a remote Google picture; the monogram underneath covers a failed load
          <img
            alt=""
            className="site-header__account-photo"
            height={32}
            referrerPolicy="no-referrer"
            src={identity.avatarUrl}
            width={32}
          />
        ) : null}
      </span>
      <span className="site-header__account-email">{identity.email}</span>
    </span>
  );
}
