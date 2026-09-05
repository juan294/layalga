-- Keep already-issued, nonrevoked links usable through their booked stays.
-- Normal unbooked invitations retain their existing bounded expiry. Revocation
-- and cancellation remain authoritative; this never rotates a bearer token.
update public.invitations invitation
set link_token_expires_at = greatest(invitation.link_token_expires_at, booked.expires_at)
from (
  select invitation_id,
         (max(upper(stay)) + 7)::timestamp at time zone 'UTC' as expires_at
  from public.visits
  where status in ('confirmed', 'reconfirm_pending', 'reconfirmed', 'escalated')
    and not upper_inf(stay)
    and isfinite(upper(stay))
  group by invitation_id
) booked
where invitation.id = booked.invitation_id
  and invitation.link_token is not null
  and invitation.status <> 'cancelled'
  and invitation.link_token_revoked_at is null
  and booked.expires_at > now();
