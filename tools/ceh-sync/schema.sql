-- Run once in the Supabase SQL editor. No quiz answers or vault key are stored here.
create table if not exists public.ceh_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  constraint ceh_payload_shape check (
    jsonb_typeof(payload) = 'object' and
    jsonb_typeof(payload -> 'progress') = 'object' and
    jsonb_typeof(payload -> 'stats') = 'object' and
    payload ? 'progress' and payload ? 'stats' and octet_length(payload::text) <= 4000000
  )
);
alter table public.ceh_progress enable row level security;
revoke all on public.ceh_progress from anon, authenticated;
grant select, insert, update on public.ceh_progress to authenticated;
drop policy if exists ceh_read_own on public.ceh_progress;
create policy ceh_read_own on public.ceh_progress for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists ceh_insert_own on public.ceh_progress;
create policy ceh_insert_own on public.ceh_progress for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists ceh_update_own on public.ceh_progress;
create policy ceh_update_own on public.ceh_progress for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Compare-and-swap: a stale device never silently overwrites a newer revision.
create or replace function public.save_ceh_progress(p_payload jsonb, p_expected_revision bigint)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_row public.ceh_progress;
begin
  if v_user is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'Invalid revision' using errcode = '22023';
  end if;
  if p_expected_revision = 0 then
    insert into public.ceh_progress(user_id, payload) values (v_user, p_payload)
      on conflict (user_id) do nothing returning * into v_row;
  else
    update public.ceh_progress set payload = p_payload, revision = revision + 1, updated_at = now()
      where user_id = v_user and revision = p_expected_revision returning * into v_row;
  end if;
  if v_row.user_id is not null then
    return jsonb_build_object('ok', true, 'revision', v_row.revision, 'updated_at', v_row.updated_at);
  end if;
  select * into v_row from public.ceh_progress where user_id = v_user;
  if v_row.user_id is null then raise exception 'Online save missing'; end if;
  return jsonb_build_object('ok', false, 'revision', v_row.revision, 'updated_at', v_row.updated_at, 'payload', v_row.payload);
end $$;
revoke all on function public.save_ceh_progress(jsonb, bigint) from public, anon;
grant execute on function public.save_ceh_progress(jsonb, bigint) to authenticated;
