-- Admin-only list of registered accounts (shared Golden Beit phone accounts) with their activity on this platform.
create or replace function public.nob_admin_customers()
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
           u.created_at, u.last_sign_in_at,
           (select count(*) from public.nob_listings l where l.owner_id = u.id),
           (select count(*) from public.nob_plot_requests r where r.user_id = u.id)
    from auth.users u
    where lower(u.email) ~ '^p20[0-9]{10}@phone\.goldenbeit\.com$'
    order by u.created_at desc;
end $$;

revoke execute on function public.nob_admin_customers() from public, anon;
grant execute on function public.nob_admin_customers() to authenticated;
