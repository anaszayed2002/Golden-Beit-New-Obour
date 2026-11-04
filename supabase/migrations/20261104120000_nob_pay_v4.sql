-- Payment model v4: installments carry the number left (left_count); المتبقي is the remaining installments total.
create or replace function public.nob_clean_pay(p jsonb)
returns jsonb
language sql immutable set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'check',      nullif(greatest(coalesce(nullif(p->>'check','')::bigint, 0), 0), 0),
    'completion', nullif(greatest(coalesce(nullif(p->>'completion','')::bigint, 0), 0), 0),
    'waiver',     nullif(greatest(coalesce(nullif(p->>'waiver','')::bigint, 0), 0), 0),
    'inst', case when jsonb_typeof(p->'inst') = 'object' then jsonb_strip_nulls(jsonb_build_object(
        'value', nullif(greatest(coalesce(nullif(p->'inst'->>'value','')::bigint, 0), 0), 0),
        'count', nullif(greatest(coalesce(nullif(p->'inst'->>'count','')::int, 0), 0), 0),
        'left_count', nullif(greatest(coalesce(nullif(p->'inst'->>'left_count','')::int, 0), 0), 0),
        'left',  nullif(greatest(coalesce(nullif(p->'inst'->>'left','')::bigint, 0), 0), 0),
        'first', nullif(substring(p->'inst'->>'first' from '^[0-9]{4}-[0-9]{2}$'), ''),
        'last',  nullif(substring(p->'inst'->>'last' from '^[0-9]{4}-[0-9]{2}$'), ''))) end))
$$;
revoke execute on function public.nob_clean_pay(jsonb) from public, anon, authenticated;
