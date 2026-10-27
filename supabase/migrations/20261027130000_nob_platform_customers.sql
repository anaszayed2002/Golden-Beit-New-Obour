-- Accounts are shared across Golden Beit platforms; this table records which ones have used New Obour.
create table public.nob_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
alter table public.nob_customers enable row level security;
revoke all on public.nob_customers from anon, authenticated;

-- Backfill everyone who already posted or requested a plot here.
insert into public.nob_customers (user_id, first_seen, last_seen)
select owner_id, min(created_at), max(created_at) from public.nob_listings group by owner_id
on conflict (user_id) do nothing;
insert into public.nob_customers (user_id, first_seen, last_seen)
select user_id, min(created_at), max(created_at) from public.nob_plot_requests group by user_id
on conflict (user_id) do nothing;

-- Called by the site whenever a signed-in user opens it.
create or replace function public.nob_touch()
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null then return; end if;
  insert into public.nob_customers (user_id) values ((select auth.uid()))
  on conflict (user_id) do update set last_seen = now();
end $$;

-- Listing or requesting also marks the account as a customer of this platform.
create or replace function public.nob_mark_customer()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.nob_customers (user_id) values (new.owner_id)
  on conflict (user_id) do update set last_seen = now();
  return new;
end $$;
create or replace function public.nob_mark_requester()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.nob_customers (user_id) values (new.user_id)
  on conflict (user_id) do update set last_seen = now();
  return new;
end $$;
create trigger nob_listings_mark_customer after insert on public.nob_listings
  for each row execute function public.nob_mark_customer();
create trigger nob_requests_mark_customer after insert on public.nob_plot_requests
  for each row execute function public.nob_mark_requester();
revoke execute on function public.nob_mark_customer(), public.nob_mark_requester() from public, anon, authenticated;

-- Customers list: only accounts that used this platform, excluding the admins themselves.
drop function public.nob_admin_customers();
create function public.nob_admin_customers()
returns table (id uuid, name text, phone text, created_at timestamptz, last_sign_in_at timestamptz,
  listing_count bigint, request_count bigint)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.nob_is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  return query
    select u.id,
           btrim(coalesce(u.raw_user_meta_data ->> 'full_name', '')),
           '0' || substring(lower(u.email) from '^p20([0-9]{10})@phone\.goldenbeit\.com$'),
           c.first_seen, c.last_seen,
           (select count(*) from public.nob_listings l where l.owner_id = u.id),
           (select count(*) from public.nob_plot_requests r where r.user_id = u.id)
    from public.nob_customers c
    join auth.users u on u.id = c.user_id
    where not exists (
      select 1 from public.nob_admin_phones a
      where a.phone = substring(lower(u.email) from '^p(20[0-9]{10})@phone\.goldenbeit\.com$'))
    order by c.first_seen desc;
end $$;

revoke execute on function public.nob_touch(), public.nob_admin_customers() from public, anon;
grant execute on function public.nob_touch(), public.nob_admin_customers() to authenticated;
