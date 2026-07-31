-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 015_mfa_flag.sql — profiles.mfa_enabled, the backend's aal2 gate.        ║
-- ║ Applied via the Management API; kept here as the source of truth        ║
-- ║ (idempotent).                                                            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- WHY A COLUMN AT ALL. The access token carries `aal`, so the backend can see
-- whether a second factor was verified *this session*. What it cannot see from the
-- token is whether one was REQUIRED — that lives in auth.mfa_factors, which is in
-- the auth schema and not reachable over PostgREST.
--
-- Supabase's usual answer is to enforce assurance level inside RLS, using
-- auth.jwt() and an EXISTS over auth.mfa_factors. That doesn't apply here: the
-- backend connects with the service-role key (BYPASSRLS), so RLS is defence in
-- depth only and the real boundary is the app layer (see 004_rls.sql). The gate
-- has to be code, and code needs a value it can actually read.
--
-- This column is a CACHE of auth.mfa_factors, not the authority. It's written by
-- POST /api/auth/mfa/state, which re-reads the factor list through the admin API
-- rather than trusting what the client claims. Worst case it drifts and a user is
-- asked for a code they no longer have a factor for — recoverable — rather than
-- being let in without one.

alter table public.profiles
  add column if not exists mfa_enabled boolean not null default false;

comment on column public.profiles.mfa_enabled is
  'Cache of "user has a verified MFA factor", synced from auth.mfa_factors by '
  'POST /api/auth/mfa/state. Read by the backend to decide whether an aal1 token '
  'is acceptable. Authority lives in auth.mfa_factors.';

-- Backfill from the real source so existing enrollments (if any) are honoured
-- immediately rather than on the user's next visit to the 2FA screen.
update public.profiles p
set mfa_enabled = true
where exists (
  select 1 from auth.mfa_factors f
  where f.user_id = p.user_id and f.status = 'verified'
) and p.mfa_enabled is distinct from true;
