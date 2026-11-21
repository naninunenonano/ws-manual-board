-- Apply after 052-online.sql and 053-attack-exchange.sql.
begin;

create or replace function ws_online.view_room(p_room uuid,p_user uuid)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('room',r.id,'code',r.join_code,'expires',r.join_expires_at,
    'status',r.status,'seat',me.seat,'revision',s.revision,'state',s.state,
    'own',case when mine.state is null then null else jsonb_build_object('deck',mine.state->'deck','board',mine.state->'board',
      'encore',case when s.state->'turn'->>'phase'='encore' and s.state->>'stage'='active' then mine.state->'encore' end) end,
    'online',coalesce((select jsonb_object_agg(p.seat::text,coalesce(p.last_seen_at > now()-interval '20 seconds',false))
      from public.room_players p where p.room_id=r.id),'{}'::jsonb))
  from public.rooms r join public.room_players me on me.room_id=r.id and me.user_id=p_user
  join public.room_states s on s.room_id=r.id
  left join public.room_private_states mine on mine.room_id=r.id and mine.user_id=p_user
  where r.id=p_room;
$$;

create or replace function ws_online.encore_targets(p_board jsonb,p_done jsonb)
returns table(zone text,card jsonb) language sql immutable set search_path = '' as $$
  select slots.zone, item.value
  from unnest(array['front0','front1','front2','back0','back1']) slots(zone)
  cross join lateral jsonb_array_elements(p_board->slots.zone) item
  where item.value->>'orientation'='180' and not coalesce(p_done ? (item.value->>'uid'),false);
$$;

create or replace function public.ws_encore(
  p_action text,p_room uuid,p_revision bigint,p_operation uuid,p_data jsonb
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  seat int;
  turn_seat int;
  actor int;
  current_state jsonb;
  context jsonb;
  private_state jsonb;
  private_encore jsonb;
  prior_board jsonb;
  new_board jsonb;
  target_uid text;
  target_zone text;
  target_card jsonb;
  method text;
  n int;
  next_phase text;
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
  select s.state,s.revision into strict current_state,current_revision from public.room_states s where s.room_id=p_room;
  if p_revision is distinct from current_revision then return '{"error":"REVISION_CONFLICT"}'; end if;
  if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>65000
     or current_state->>'stage' is distinct from 'active' then raise exception 'INVALID_ENCORE'; end if;

  turn_seat := (current_state->'turn'->>'player')::int;
  context := current_state->'encore';
  actor := (context->>'actor')::int;
  select s.state into strict private_state from public.room_private_states s where s.room_id=p_room and s.user_id=caller;
  prior_board := private_state->'board';
  private_encore := coalesce(private_state->'encore','{"done":[]}'::jsonb);
  target_uid := private_encore->>'selected';

  if p_action='enter' then
    if seat<>turn_seat or current_state->'turn'->>'phase' is distinct from 'attack'
       or current_state ? 'attack_exchange' then raise exception 'INVALID_ENCORE'; end if;
    context := jsonb_build_object('step','start','actor',turn_seat);
    next_phase := 'encore';
  else
    if seat is distinct from actor or current_state->'turn'->>'phase' is distinct from 'encore' then
      raise exception 'INVALID_ENCORE';
    end if;
    case p_action
    when 'start' then
      if context->>'step'<>'start' then raise exception 'INVALID_ENCORE'; end if;
      context := jsonb_build_object('step',case when actor=turn_seat then 'start' else 'choose' end,'actor',1-actor);
    when 'select' then
      if context->>'step'<>'choose' then raise exception 'INVALID_ENCORE'; end if;
      target_uid := p_data->>'uid';
      select t.zone,t.card into target_zone,target_card from ws_online.encore_targets(prior_board,private_encore->'done') t
        where t.card->>'uid'=target_uid;
      if not found then raise exception 'INVALID_ENCORE'; end if;
      private_encore := private_encore || jsonb_build_object('selected',target_uid);
      context := context || jsonb_build_object('step','cost','target',jsonb_build_object(
        'zone',target_zone,'id',case when target_card->>'faceUp'='true' then target_card->>'id' end));
    when 'other' then
      if context->>'step'<>'cost' then raise exception 'INVALID_ENCORE'; end if;
      context := jsonb_set(context,'{step}','"other"');
    when 'unselect', 'next' then
      if (p_action='unselect' and context->>'step' not in ('cost','other'))
        or (p_action='next' and context->>'step'<>'after') then raise exception 'INVALID_ENCORE'; end if;
      context := (context-'target') || '{"step":"choose"}'::jsonb;
      private_encore := private_encore-'selected';
    when 'resolve' then
      method := p_data->>'method';
      if method is null or method not in ('stock','hand','clock','other','decline')
        or context->>'step' is distinct from (case when method='other' then 'other' else 'cost' end) then
        raise exception 'INVALID_ENCORE';
      end if;
      select t.zone into target_zone from ws_online.encore_targets(prior_board,private_encore->'done') t
        where t.card->>'uid'=target_uid;
      if not found then raise exception 'INVALID_ENCORE'; end if;
      new_board := ws_online.checked_board(p_data->'board',private_state->'registry');
      if method='decline' then
        if not exists(select 1 from jsonb_array_elements(new_board->'waiting') c where c->>'uid'=target_uid)
          then raise exception 'INVALID_ENCORE'; end if;
      elsif new_board->target_zone->0->>'uid' is distinct from target_uid
        or new_board->target_zone->0->>'orientation' is distinct from '90' then raise exception 'INVALID_ENCORE';
      end if;
      if method='stock' then
        n := jsonb_array_length(prior_board->'stock');
        if n<3 or exists(
          select 1 from jsonb_array_elements(prior_board->'stock') with ordinality paid(c,i)
          where paid.i>n-3 and not exists(select 1 from jsonb_array_elements(new_board->'waiting') w where w->>'uid'=paid.c->>'uid')
        ) then raise exception 'INVALID_ENCORE'; end if;
      elsif method='hand' then
        if not exists(select 1 from jsonb_array_elements(prior_board->'hand') c where c->>'uid'=p_data->>'hand')
          or not exists(select 1 from jsonb_array_elements(new_board->'waiting') c where c->>'uid'=p_data->>'hand')
          then raise exception 'INVALID_ENCORE'; end if;
      elsif method='clock' then
        if (jsonb_array_length(prior_board->'deck')=0 and jsonb_array_length(prior_board->'waiting')<2)
          or (jsonb_array_length(prior_board->'deck')>1 and jsonb_array_length(prior_board->'clock')<6
            and new_board->'clock'->(-1)->>'uid' is distinct from prior_board->'deck'->(-1)->>'uid') then
          raise exception 'INVALID_ENCORE';
        end if;
      end if;
      private_encore := jsonb_set(private_encore,'{done}',(private_encore->'done') || jsonb_build_array(target_uid));
      context := jsonb_set(context,'{step}','"after"');
    when 'done' then
      if context->>'step'<>'choose'
        or exists(select 1 from ws_online.encore_targets(prior_board,private_encore->'done')) then raise exception 'INVALID_ENCORE'; end if;
      if actor=turn_seat or exists(
        select 1 from public.room_players p join public.room_private_states s using(room_id,user_id)
        cross join lateral ws_online.encore_targets(s.state->'board',s.state->'encore'->'done') t
        where p.room_id=p_room and p.seat=turn_seat
      ) then
        context := jsonb_build_object('actor',1-actor,'step','choose');
      else context := jsonb_build_object('actor',turn_seat,'step','complete');
      end if;
    when 'end' then
      if context->>'step'<>'complete' or seat<>turn_seat then raise exception 'INVALID_ENCORE'; end if;
      select p.seat into actor from public.room_players p join public.room_private_states s using(room_id,user_id)
        cross join lateral ws_online.encore_targets(s.state->'board',s.state->'encore'->'done') t
        where p.room_id=p_room order by p.seat<>turn_seat limit 1;
      if found then context := jsonb_build_object('actor',actor,'step','choose');
      else context := null; next_phase := 'end';
      end if;
    else raise exception 'INVALID_ENCORE';
    end case;
  end if;

  -- Only resolution includes new card positions. Stage commands must not hide
  -- unrelated board changes inside a confirmation or handover.
  if p_action='resolve' then
    result := public.ws_online_room('board',p_room,p_revision,p_operation,jsonb_build_object('board',p_data->'board'));
    if result ? 'error' then return result; end if;
    if (result->>'revision')::bigint is distinct from current_revision+1 then raise exception 'INVALID_ENCORE'; end if;
  end if;
  if p_action='enter' or next_phase='end' then
    update public.room_private_states s set state=s.state-'encore' where s.room_id=p_room;
  else
    update public.room_private_states s set state=jsonb_set(s.state,'{encore}',private_encore),updated_at=now()
      where s.room_id=p_room and s.user_id=caller;
  end if;
  update public.room_states s set state=
    (case when context is null then s.state-'encore'
          else s.state || jsonb_build_object('encore',context) end) ||
    (case when next_phase is null then '{}'::jsonb
          else jsonb_build_object('turn',jsonb_set(s.state->'turn','{phase}',to_jsonb(next_phase))) end),
    revision=current_revision+1,updated_at=now() where s.room_id=p_room;
  return ws_online.view_room(p_room,caller);
end;
$$;

revoke all on function ws_online.encore_targets(jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.ws_encore(text,uuid,bigint,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.ws_encore(text,uuid,bigint,uuid,jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;
