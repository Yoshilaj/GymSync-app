-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 014_profile_on_signup.sql — every new auth.users row gets a profile.     ║
-- ║ Applied via the Management API; kept here as the source of truth        ║
-- ║ (idempotent).                                                            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- WHY. The profiles row was seeded inside POST /api/auth/signup, which has two
-- holes:
--   1. Social sign-in never goes through that endpoint. Apple and Google mint the
--      user inside GoTrue, so those accounts would have arrived with no profile.
--   2. The seed's failure was caught and logged (routers/auth.py), so a blip left
--      an account with no profile and nothing retried it.
-- Moving it to a trigger closes both: the row is created in the same transaction
-- as the user, for every path that can ever create one.
--
-- The display name comes from whichever key the provider used — our own signup
-- sends display_name, Apple sends full_name, Google sends name. Apple only ever
-- returns a name on the FIRST authorization, so if we miss it there is no second
-- chance; the app is responsible for forwarding it on that first call.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (
    new.id,
    nullif(trim(coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      ''
    )), '')
  )
  on conflict (user_id) do nothing;
  return new;
exception when others then
  -- NEVER block account creation over this. A trigger that raises would abort the
  -- insert into auth.users, turning a cosmetic profile problem into "signup is
  -- down". The app already tolerates a missing profile: GET /api/profile
  -- synthesizes defaults and PUT upserts.
  raise warning 'handle_new_user failed for %: %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill anyone who slipped through the old path.
insert into public.profiles (user_id, display_name)
select u.id,
       nullif(trim(coalesce(
         u.raw_user_meta_data ->> 'display_name',
         u.raw_user_meta_data ->> 'full_name',
         u.raw_user_meta_data ->> 'name',
         ''
       )), '')
from auth.users u
left join public.profiles p on p.user_id = u.id
where p.user_id is null
on conflict (user_id) do nothing;
