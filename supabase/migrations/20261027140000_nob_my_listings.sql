-- The signed-in user's own listings with their review status (owners can see their own plot number).
create or replace function public.nob_my_listings()
returns table (id bigint, zone text, area numeric, price bigint, paid bigint, remaining bigint, ownership text,
  ready boolean, description text, status text, created_at timestamptz, reviewed_at timestamptz, plot_number text)
language sql stable security definer set search_path = ''
as $$
  select l.id, l.zone, l.area, l.price, l.paid, l.remaining, l.ownership, l.ready, l.description, l.status,
         l.created_at, l.reviewed_at, p.plot_number
  from public.nob_listings l
  left join public.nob_listing_private p on p.listing_id = l.id
  where l.owner_id = (select auth.uid())
  order by l.created_at desc;
$$;

revoke execute on function public.nob_my_listings() from public, anon;
grant execute on function public.nob_my_listings() to authenticated;
