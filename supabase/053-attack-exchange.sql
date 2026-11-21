-- Apply after 052-online.sql. The room row lock and existing board RPC keep the
-- exchange and the acting player's private/public board in one transaction.
begin;

create or replace function public.ws_attack_exchange(
  p_action text, p_room uuid, p_revision bigint, p_operation uuid, p_data jsonb
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  seat integer;
  attacker integer;
  current_state jsonb;
  current_exchange jsonb;
  next_stage text;
  damage integer;
  current_revision bigint;
  result jsonb;
begin
  if caller is null then raise exception 'AUTH_REQUIRED'; end if;
  select p.seat into seat
    from public.rooms r join public.room_players p on p.room_id=r.id
    where r.id=p_room and r.status='playing' and r.created_at>now()-interval '7 days'
      and r.join_code is not null and p.user_id=caller
    for update of r;
  if not found then raise exception 'ROOM_UNAVAILABLE'; end if;

  select s.state,s.revision into strict current_state,current_revision
    from public.room_states s where s.room_id=p_room;
  if p_revision is distinct from current_revision then return '{"error":"REVISION_CONFLICT"}'; end if;
  if current_state->>'stage' is distinct from 'active'
    or current_state->'turn'->>'phase' is distinct from 'attack' then
    raise exception 'INVALID_ATTACK_STEP';
  end if;
  if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>65000 then
    raise exception 'INVALID_INPUT';
  end if;

  attacker := (current_state->'turn'->>'player')::int;
  current_exchange := current_state->'attack_exchange';
  if current_exchange is not null and current_exchange->'attacker' is distinct from to_jsonb(attacker) then
    raise exception 'INVALID_ATTACK_STEP';
  end if;
  case p_action
    when 'counter' then
      if seat<>attacker or current_exchange is not null then raise exception 'INVALID_ATTACK_STEP'; end if;
      next_stage := 'counter';
    when 'use_counter', 'skip_counter' then
      if seat=attacker or current_exchange->>'stage' is distinct from 'counter' then raise exception 'INVALID_ATTACK_STEP'; end if;
      next_stage := case when p_action='use_counter' then 'counter_effect' else 'damage_input' end;
    when 'counter_done' then
      if seat=attacker or current_exchange->>'stage' is distinct from 'counter_effect' then raise exception 'INVALID_ATTACK_STEP'; end if;
      next_stage := 'damage_input';
    when 'damage' then
      if seat<>attacker or current_exchange->>'stage' is distinct from 'damage_input' then raise exception 'INVALID_ATTACK_STEP'; end if;
      if jsonb_typeof(p_data->'count') is distinct from 'number'
         or coalesce(p_data->>'count','') !~ '^(0|[1-9]|[1-4][0-9]|50)$' then
        raise exception 'INVALID_COUNT';
      end if;
      damage := (p_data->>'count')::int;
      if damage>0 then next_stage := 'damage'; end if;
    when 'damage_done' then
      if seat=attacker or current_exchange->>'stage' is distinct from 'damage' then raise exception 'INVALID_ATTACK_STEP'; end if;
    else raise exception 'INVALID_ATTACK_STEP';
  end case;

  result := public.ws_online_room('board',p_room,p_revision,p_operation,
    jsonb_build_object('board',p_data->'board','clearReveal',p_data->'clearReveal'));
  if result ? 'error' then return result; end if;
  if (result->>'revision')::bigint is distinct from current_revision+1 then
    raise exception 'INVALID_ATTACK_STEP';
  end if;
  update public.room_states s set state=case when next_stage is null then s.state-'attack_exchange'
    else s.state || jsonb_build_object('attack_exchange',
      jsonb_build_object('attacker',attacker,'stage',next_stage,'count',damage)) end
    where s.room_id=p_room;
  return ws_online.view_room(p_room,caller);
end;
$$;

revoke all on function public.ws_attack_exchange(text,uuid,bigint,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.ws_attack_exchange(text,uuid,bigint,uuid,jsonb) to authenticated;

create or replace function ws_online.guard_attack_exchange()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.state ? 'attack_exchange' then
    if new.state->>'stage'='finished' then
      new.state := new.state-'attack_exchange';
    elsif new.state->'turn' is distinct from old.state->'turn' then
      raise exception 'INVALID_ATTACK_STEP';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function ws_online.guard_attack_exchange() from public, anon, authenticated;
drop trigger if exists guard_attack_exchange on public.room_states;
create trigger guard_attack_exchange before update on public.room_states
for each row execute function ws_online.guard_attack_exchange();

notify pgrst, 'reload schema';

commit;
