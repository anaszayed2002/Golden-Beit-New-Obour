-- Admin-only notes per listing (e.g. the original ad text and sales info for imported rows).
alter table public.nob_listing_private add column notes text check (char_length(notes) <= 8000);

create or replace function public.nob_admin_listings()
returns setof jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.nob_is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  return query
    select to_jsonb(l) - 'owner_id' || jsonb_build_object(
      'plot_number', p.plot_number, 'block', p.block, 'owner_name', p.owner_name, 'contact_phone', p.contact_phone,
      'notes', p.notes,
      'request_count', (select count(*) from public.nob_plot_requests r where r.listing_id = l.id))
    from public.nob_listings l left join public.nob_listing_private p on p.listing_id = l.id
    order by l.created_at desc;
end $$;

-- 2026-11-04: the first 100 rows of the sales sheet were imported once (70 complete rows, GB-109..GB-178)
-- through a temporary single-use function that was dropped right after.
