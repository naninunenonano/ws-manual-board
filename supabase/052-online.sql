begin;

create schema if not exists ws_online;
revoke all on schema ws_online from public, anon, authenticated;

alter table public.rooms add column if not exists join_code text;
alter table public.rooms add column if not exists join_expires_at timestamptz;
create unique index if not exists ws_rooms_join_code_unique on public.rooms (join_code);
alter table public.room_players add column if not exists last_seen_at timestamptz;

create table if not exists ws_online.join_attempts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null,
  attempts integer not null
);
alter table ws_online.join_attempts enable row level security;

revoke all on public.rooms, public.room_players, public.room_states, public.room_private_states
  from public, anon, authenticated;
grant select on public.room_states to authenticated;

create or replace function public.ws_online_can_read(p_room uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.room_players p join public.rooms r on r.id = p.room_id
    where p.room_id = p_room and p.user_id = auth.uid()
      and r.join_code is not null and r.created_at > now() - interval '7 days'
  );
$$;
revoke all on function public.ws_online_can_read(uuid) from public, anon, authenticated;
grant execute on function public.ws_online_can_read(uuid) to authenticated;
drop policy if exists ws_online_read_board on public.room_states;
create policy ws_online_read_board on public.room_states
  for select to authenticated using (public.ws_online_can_read(room_id));

create or replace function ws_online.zones()
returns text[] language sql immutable set search_path = '' as $$
  select array['deck','hand','waiting','stock','clock','level','memory','cx','front0','front1','front2','back0','back1'];
$$;

create or replace function ws_online.card(p_card jsonb, p_registry jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  token text := p_card->>'uid';
  definition jsonb := p_registry->token;
begin
  if definition is null or jsonb_typeof(p_card->'faceUp') is distinct from 'boolean'
       or coalesce(p_card->>'orientation','') not in ('0','90','180','270') then
    raise exception 'INVALID_CARD';
  end if;
  return definition || jsonb_build_object('uid',token,'faceUp',p_card->'faceUp','orientation',(p_card->>'orientation')::integer);
end;
$$;

create or replace function ws_online.checked_board(p_board jsonb, p_registry jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  result jsonb := '{}';
  seen text[] := '{}';
  zone text;
  cards jsonb;
  item jsonb;
  card jsonb;
  marker jsonb;
  marker_card jsonb;
  markers jsonb;
begin
  if jsonb_typeof(p_board) is distinct from 'object' or octet_length(p_board::text) > 55000 then
    raise exception 'INVALID_BOARD';
  end if;
  foreach zone in array ws_online.zones() loop
    if jsonb_typeof(p_board->zone) is distinct from 'array' then raise exception 'INVALID_ZONE'; end if;
    if jsonb_array_length(p_board->zone) > (case when zone in ('front0','front1','front2','back0','back1','cx') then 1 else 50 end)
      then raise exception 'INVALID_ZONE_SIZE'; end if;
    cards := '[]';
    for item in select value from jsonb_array_elements(p_board->zone) loop
      card := ws_online.card(item,p_registry);
      if card->>'uid' = any(seen) then raise exception 'DUPLICATE_CARD'; end if;
      seen := array_append(seen,card->>'uid');
      markers := '[]';
      if item ? 'markers' then
        if jsonb_typeof(item->'markers') is distinct from 'array' then raise exception 'INVALID_MARKER'; end if;
        if jsonb_array_length(item->'markers') > 49
           or (zone not in ('front0','front1','front2','back0','back1') and item->'markers' <> '[]'::jsonb) then
          raise exception 'INVALID_MARKER';
        end if;
        for marker in select value from jsonb_array_elements(item->'markers') loop
          if jsonb_typeof(marker->'faceUp') is distinct from 'boolean' then raise exception 'INVALID_MARKER'; end if;
          marker_card := ws_online.card(marker->'card',p_registry);
          if marker_card->>'uid' = any(seen) then raise exception 'DUPLICATE_CARD'; end if;
          seen := array_append(seen,marker_card->>'uid');
          markers := markers || jsonb_build_array(jsonb_build_object('faceUp',marker->'faceUp','card',marker_card));
        end loop;
      end if;
      if markers <> '[]'::jsonb then card := card || jsonb_build_object('markers',markers); end if;
      cards := cards || jsonb_build_array(card);
    end loop;
    result := result || jsonb_build_object(zone,cards);
  end loop;
  if cardinality(seen) <> 50 then raise exception 'INCOMPLETE_BOARD'; end if;
  return result;
end;
$$;

create or replace function ws_online.public_board(p_board jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  result jsonb := '{}';
  zone text;
  cards jsonb;
  item jsonb;
  card jsonb;
  markers jsonb;
  marker jsonb;
begin
  foreach zone in array ws_online.zones() loop
    cards := '[]';
    for item in select value from jsonb_array_elements(p_board->zone) loop
      card := '{"faceUp":false,"orientation":0}'::jsonb;
      if zone not in ('deck','hand','stock') then
        if zone in ('waiting','clock','level','cx') or item->'faceUp' = 'true'::jsonb then
          card := jsonb_build_object('id',item->'id','cx',item->'cx','faceUp',true,'orientation',item->'orientation');
        end if;
        markers := '[]';
        for marker in select value from jsonb_array_elements(item->'markers') loop
          markers := markers || jsonb_build_array(case when marker->'faceUp' = 'true'::jsonb
             then jsonb_build_object('faceUp',true,'card',jsonb_build_object('id',marker->'card'->'id','cx',marker->'card'->'cx'))
             else '{"faceUp":false,"card":{}}'::jsonb end);
        end loop;
        if markers <> '[]'::jsonb then card := card || jsonb_build_object('markers',markers); end if;
      end if;
      cards := cards || jsonb_build_array(card);
    end loop;
    result := result || jsonb_build_object(zone,cards);
  end loop;
  return result;
end;
$$;

create or replace function ws_online.checked_deck(p_deck jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  deck_name text := btrim(p_deck->>'title');
  cards jsonb := '[]';
  item jsonb;
  card_id text;
  count_cards integer;
  total integer := 0;
  climax integer := 0;
  seen text[] := '{}';
begin
  if jsonb_typeof(p_deck->'title') is distinct from 'string' or coalesce(length(deck_name),0) not between 1 and 160 or jsonb_typeof(p_deck->'cards') is distinct from 'array' then
    raise exception 'INVALID_DECK';
  end if;
  if jsonb_array_length(p_deck->'cards') not between 13 and 50 then raise exception 'INVALID_DECK'; end if;
  for item in select value from jsonb_array_elements(p_deck->'cards') loop
    card_id := btrim(item->>'id');
    if jsonb_typeof(item->'id') is distinct from 'string' or coalesce(length(card_id),0) not between 1 and 80
      or card_id ~ '[[:cntrl:]]' or card_id = any(seen)
      or coalesce(item->>'num','') not in ('1','2','3','4')
      or jsonb_typeof(item->'cx') is distinct from 'boolean' then raise exception 'INVALID_DECK'; end if;
    count_cards := (item->>'num')::integer;
    seen := array_append(seen,card_id);
    total := total + count_cards;
    if (item->>'cx')::boolean then climax := climax + count_cards; end if;
    cards := cards || jsonb_build_array(jsonb_build_object('id',card_id,'cx',item->'cx','num',count_cards));
  end loop;
  if total <> 50 or climax <> 8 then raise exception 'INVALID_DECK'; end if;
  return jsonb_build_object('title',deck_name,'cards',cards);
end;
$$;

create or replace function ws_online.opening(p_deck jsonb)
returns jsonb language plpgsql volatile set search_path = '' as $$
declare
  card jsonb;
  registry jsonb := '{}';
  board jsonb := '{}';
  hand jsonb := '[]';
  pile jsonb := '[]';
  zone text;
  token text;
  dealt integer := 0;
begin
  foreach zone in array ws_online.zones() loop board := board || jsonb_build_object(zone,'[]'::jsonb); end loop;
  for card in
    select item.value from jsonb_array_elements(p_deck->'cards') item
    cross join lateral generate_series(1,(item.value->>'num')::int)
    order by gen_random_uuid()
  loop
    token := gen_random_uuid()::text;
    registry := registry || jsonb_build_object(token,jsonb_build_object('id',card->'id','cx',card->'cx','level','?'));
    card := registry->token || jsonb_build_object('uid',token,'orientation',0,'faceUp',dealt < 5);
    if dealt < 5 then hand := hand || jsonb_build_array(card); else pile := pile || jsonb_build_array(card); end if;
    dealt := dealt + 1;
  end loop;
  return jsonb_build_object('deck',p_deck,'registry',registry,'board',board || jsonb_build_object('hand',hand,'deck',pile));
end;
$$;

create or replace function ws_online.view_room(p_room uuid,p_user uuid)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('room',r.id,'code',r.join_code,'expires',r.join_expires_at,
    'status',r.status,'seat',me.seat,'revision',s.revision,'state',s.state,
    'own',case when mine.state is null then null else jsonb_build_object('deck',mine.state->'deck','board',mine.state->'board') end,
    'online',coalesce((select jsonb_object_agg(p.seat::text,coalesce(p.last_seen_at > now()-interval '20 seconds',false))
      from public.room_players p where p.room_id=r.id),'{}'::jsonb))
  from public.rooms r join public.room_players me on me.room_id=r.id and me.user_id=p_user
  join public.room_states s on s.room_id=r.id
  left join public.room_private_states mine on mine.room_id=r.id and mine.user_id=p_user
  where r.id=p_room;
$$;

create or replace function public.ws_online_room(
  p_action text, p_room uuid default null, p_revision bigint default null,
  p_operation uuid default null, p_data jsonb default '{}'::jsonb
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  room_row public.rooms%rowtype;
  seat integer;
  seat_key text;
  private_state jsonb;
  public_state jsonb;
  version bigint;
  board jsonb;
  phase text;
  turn jsonb;
  current_turn jsonb;
  code text;
  attempts integer;
  other record;
  chosen jsonb;
  visible jsonb;
  token text;
  phases text[] := array['stand','draw','clock','main','climax','attack','end'];
begin
  if caller is null then raise exception 'AUTH_REQUIRED'; end if;
  if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text) > 65000 then raise exception 'INVALID_INPUT'; end if;

  if p_action='create' then
    perform pg_advisory_xact_lock(hashtextextended(caller::text,52));
    select r.* into room_row from public.rooms r
      where r.host_id=caller and r.status='waiting' and r.join_expires_at>now()
      order by r.created_at desc limit 1;
    if found then return ws_online.view_room(room_row.id,caller); end if;
    for i in 1..8 loop
      code := upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
      insert into public.rooms(host_id,join_code,join_expires_at)
        values(caller,code,now()+interval '30 minutes') on conflict(join_code) do nothing returning * into room_row;
      exit when found;
    end loop;
    if room_row.id is null then raise exception 'CODE_UNAVAILABLE'; end if;
    insert into public.room_players(room_id,user_id,seat,last_seen_at) values(room_row.id,caller,0,now());
    insert into public.room_states(room_id,state) values(room_row.id,'{"ready":{},"mulligan":{},"boards":{},"reveals":{},"stage":"waiting"}');
    return ws_online.view_room(room_row.id,caller);
  end if;

  if p_action='join' then
    insert into ws_online.join_attempts(user_id,window_start,attempts) values(caller,now(),1)
      on conflict(user_id) do update set
        attempts=case when ws_online.join_attempts.window_start < now()-interval '1 minute' then 1 else least(100,ws_online.join_attempts.attempts+1) end,
        window_start=case when ws_online.join_attempts.window_start < now()-interval '1 minute' then now() else ws_online.join_attempts.window_start end
      returning ws_online.join_attempts.attempts into attempts;
    if attempts>8 then return '{"error":"JOIN_RATE_LIMIT"}'; end if;
    code := upper(btrim(p_data->>'code'));
    if coalesce(code,'') !~ '^[A-F0-9]{12}$' then return '{"error":"INVALID_CODE"}'; end if;
    select * into room_row from public.rooms r where r.join_code=code for update;
    if not found or room_row.created_at <= now()-interval '7 days' then return '{"error":"INVALID_CODE"}'; end if;
    if exists(select 1 from public.room_players p where p.room_id=room_row.id and p.user_id=caller) then
      update public.room_players p set last_seen_at=now() where p.room_id=room_row.id and p.user_id=caller;
      return ws_online.view_room(room_row.id,caller);
    end if;
    if room_row.status<>'waiting' then return '{"error":"ALREADY_STARTED"}'; end if;
    if room_row.join_expires_at<=now() then return '{"error":"INVALID_CODE"}'; end if;
    if exists(select 1 from public.room_players p where p.room_id=room_row.id and p.seat=1) then
      return '{"error":"ROOM_FULL"}';
    end if;
    insert into public.room_players(room_id,user_id,seat,last_seen_at) values(room_row.id,caller,1,now());
    update public.room_states s set revision=s.revision+1,updated_at=now() where s.room_id=room_row.id;
    return ws_online.view_room(room_row.id,caller);
  end if;

  select r.* into room_row from public.rooms r
    where r.id=p_room and r.join_code is not null and r.created_at>now()-interval '7 days'
    and exists(select 1 from public.room_players p where p.room_id=r.id and p.user_id=caller)
    for update;
  if not found then raise exception 'ROOM_UNAVAILABLE'; end if;
  select p.seat into seat from public.room_players p where p.room_id=p_room and p.user_id=caller;
  if seat is null then raise exception 'ROOM_UNAVAILABLE'; end if;
  seat_key := seat::text;
  update public.room_players p set last_seen_at=now() where p.room_id=p_room and p.user_id=caller
    and (p.last_seen_at is null or p.last_seen_at<now()-interval '3 seconds');
  if p_action='read' then return ws_online.view_room(p_room,caller); end if;

  select s.state,s.revision into strict public_state,version from public.room_states s where s.room_id=p_room;
  select s.state into private_state from public.room_private_states s where s.room_id=p_room and s.user_id=caller;
  if p_operation is null then raise exception 'OPERATION_REQUIRED'; end if;
  if private_state->>'last_operation'=p_operation::text then
    return ws_online.view_room(p_room,caller);
  end if;
  if p_revision is distinct from version then return '{"error":"REVISION_CONFLICT"}'; end if;

  case p_action
  when 'ready' then
    if room_row.status<>'waiting' then raise exception 'INVALID_PHASE'; end if;
    private_state := jsonb_build_object('deck',ws_online.checked_deck(p_data->'deck'));
    public_state := jsonb_set(public_state,array['ready',seat_key],'true');
  when 'start' then
    if seat<>0 or room_row.status<>'waiting' or public_state->'ready'<>'{"0":true,"1":true}'::jsonb then
      raise exception 'NOT_READY';
    end if;
    for other in select p.user_id,p.seat,s.state from public.room_players p
      join public.room_private_states s on s.room_id=p.room_id and s.user_id=p.user_id where p.room_id=p_room
    loop
      chosen := ws_online.opening(other.state->'deck');
      update public.room_private_states s set state=chosen,updated_at=now()
        where s.room_id=p_room and s.user_id=other.user_id;
      public_state := jsonb_set(public_state,array['boards',other.seat::text],ws_online.public_board(chosen->'board'));
      if other.user_id=caller then private_state := chosen; end if;
    end loop;
    if (select count(*) from jsonb_object_keys(public_state->'boards')) <> 2 then raise exception 'NOT_READY'; end if;
    update public.rooms r set status='playing' where r.id=p_room;
    public_state := public_state || jsonb_build_object('stage','mulligan','first',floor(random()*2)::int);
  when 'mulligan' then
    if room_row.status<>'playing' or public_state->>'stage'<>'mulligan' or public_state->'mulligan' ? seat_key then
      raise exception 'INVALID_PHASE';
    end if;
    chosen := p_data->'cards';
    if jsonb_typeof(chosen) is distinct from 'array' then raise exception 'INVALID_MULLIGAN'; end if;
    if jsonb_array_length(chosen)>5 or exists (
      select 1 from jsonb_array_elements_text(chosen) x
      where not exists(select 1 from jsonb_array_elements(private_state->'board'->'hand') h where h->>'uid'=x.value)
    ) then raise exception 'INVALID_MULLIGAN'; end if;
    board := private_state->'board';
    visible := (select coalesce(jsonb_agg(h.value order by h.ord),'[]')
      from jsonb_array_elements(board->'hand') with ordinality h(value,ord) where chosen ? (h.value->>'uid'));
    attempts := jsonb_array_length(visible);
    if attempts<>jsonb_array_length(chosen) then raise exception 'INVALID_MULLIGAN'; end if;
    board := board || jsonb_build_object(
      'waiting',visible,
      'hand',(select coalesce(jsonb_agg(h.value order by h.ord),'[]')
        from jsonb_array_elements(board->'hand') with ordinality h(value,ord) where not chosen ? (h.value->>'uid'))
        || (select coalesce(jsonb_agg(jsonb_set(d.value,'{faceUp}','true') order by d.ord),'[]')
        from jsonb_array_elements(board->'deck') with ordinality d(value,ord) where d.ord>45-attempts),
      'deck',(select coalesce(jsonb_agg(d.value order by gen_random_uuid()),'[]')
        from jsonb_array_elements(board->'deck') with ordinality d(value,ord) where d.ord<=45-attempts)
    );
    private_state := jsonb_set(private_state,'{board}',board);
    public_state := jsonb_set(public_state,array['boards',seat_key],ws_online.public_board(board));
    public_state := jsonb_set(public_state,array['mulligan',seat_key],'true');
    if public_state->'mulligan'='{"0":true,"1":true}'::jsonb then
      public_state := public_state || jsonb_build_object('stage','active','turn',
        jsonb_build_object('number',1,'player',public_state->'first','phase','stand','drawPending',false));
    end if;
  when 'board' then
    if room_row.status<>'playing' or public_state->>'stage'<>'active' then raise exception 'INVALID_PHASE'; end if;
    board := ws_online.checked_board(p_data->'board', private_state->'registry');
    current_turn := public_state->'turn';
    if p_data ? 'turn' then
      turn := p_data->'turn';
      phase := turn->>'phase';
      if jsonb_typeof(turn->'drawPending') is distinct from 'boolean'
        or jsonb_typeof(turn->'player') is distinct from 'number'
        or jsonb_typeof(turn->'number') is distinct from 'number'
        or (current_turn->>'player')::int <> seat
        or not coalesce((
          (turn->'number'=current_turn->'number' and turn->'player'=current_turn->'player'
           and (
             (phase=phases[array_position(phases,current_turn->>'phase')+1] and not (current_turn->>'drawPending')::boolean
               and (turn->>'drawPending')::boolean=(phase='draw'))
             or (phase='draw' and current_turn->>'phase'='draw' and current_turn->'drawPending'='true'
               and turn->'drawPending'='false')
           ))
          or (current_turn->>'phase'='end' and phase='stand' and turn->'player'=to_jsonb(1-seat)
             and turn->'number'=to_jsonb((current_turn->>'number')::int+1) and turn->'drawPending'='false')
        ),false) then raise exception 'INVALID_TURN'; end if;
      if turn->'player' is distinct from current_turn->'player' then
        select p.user_id,s.state into strict other from public.room_players p
        join public.room_private_states s on s.room_id=p.room_id and s.user_id=p.user_id
        where p.room_id=p_room and p.seat=1-seat_key::int;
        chosen := other.state->'board';
        foreach token in array array['front0','front1','front2','back0','back1'] loop
          if chosen->token->0->>'orientation'='90' then
            chosen := jsonb_set(chosen,array[token,'0','orientation'],'0');
          end if;
        end loop;
        update public.room_private_states s set state=jsonb_set(s.state,'{board}',chosen),updated_at=now()
          where s.room_id=p_room and s.user_id=other.user_id;
        public_state := jsonb_set(public_state,array['boards',(1-seat)::text],ws_online.public_board(chosen));
      end if;
      public_state := jsonb_set(public_state,'{turn}',jsonb_build_object('phase',phase,'player',turn->'player','number',turn->'number','drawPending',turn->'drawPending'));
    end if;
    if board is distinct from private_state->'board' or p_data->'clearReveal'='true'::jsonb then
      public_state := jsonb_set(public_state,'{reveals}',(public_state->'reveals')-seat_key);
    end if;
    private_state := jsonb_set(private_state,'{board}',board);
    public_state := jsonb_set(public_state,array['boards',seat_key],ws_online.public_board(board));
  when 'reveal' then
    if room_row.status<>'playing' or public_state->>'stage'<>'active' then raise exception 'INVALID_PHASE'; end if;
    chosen := p_data->'cards';
    if jsonb_typeof(chosen) is distinct from 'array' then raise exception 'INVALID_REVEAL'; end if;
    if jsonb_array_length(chosen)>10 then raise exception 'INVALID_REVEAL'; end if;
    visible := '[]';
    for token in select value from jsonb_array_elements_text(chosen) loop
      if private_state->'registry'->token is null then raise exception 'INVALID_REVEAL'; end if;
      visible := visible || jsonb_build_array(jsonb_build_object('id',private_state->'registry'->token->'id',
        'cx',private_state->'registry'->token->'cx'));
    end loop;
    public_state := jsonb_set(public_state,array['reveals',seat_key],visible);
  when 'request_deck' then
    if room_row.status<>'playing' or public_state->>'stage'<>'active' then raise exception 'INVALID_PHASE'; end if;
    if coalesce(p_data->>'count','') !~ '^([1-9]|10)$' then raise exception 'INVALID_COUNT'; end if;
    if public_state ? 'deck_request' then raise exception 'REQUEST_PENDING'; end if;
    public_state := public_state || jsonb_build_object('deck_request',jsonb_build_object('from',seat,'count',(p_data->>'count')::int));
  when 'answer_deck' then
    if room_row.status<>'playing' or not public_state ? 'deck_request'
        or (public_state->'deck_request'->>'from')::int=seat then raise exception 'INVALID_REQUEST'; end if;
    if p_data->'reveal'='true'::jsonb then
      visible := (select coalesce(jsonb_agg(jsonb_build_object('id',d.value->'id','cx',d.value->'cx') order by d.ord desc),'[]')
        from jsonb_array_elements(private_state->'board'->'deck') with ordinality d(value,ord)
        where d.ord > jsonb_array_length(private_state->'board'->'deck')-(public_state->'deck_request'->>'count')::int);
      public_state := jsonb_set(public_state,array['reveals',seat_key],visible);
    end if;
    public_state := public_state-'deck_request';
  when 'leave', 'surrender' then
    if room_row.status='finished' or (p_action='surrender' and room_row.status<>'playing') then raise exception 'INVALID_PHASE'; end if;
    update public.rooms r set status='finished' where r.id=p_room;
    public_state := (public_state-'deck_request') || jsonb_build_object('stage','finished','reveals','{}'::jsonb,
      'result',jsonb_build_object('reason',p_action,'winner',case when p_action='surrender' then 1-seat else null end));
  else raise exception 'INVALID_ACTION';
  end case;

  if private_state is not null then
    insert into public.room_private_states(room_id,user_id,state) values(p_room,caller,
      private_state || jsonb_build_object('last_operation',p_operation))
    on conflict(room_id,user_id) do update set state=excluded.state,updated_at=now();
  end if;
  update public.room_states s set state=public_state,revision=s.revision+1,updated_at=now() where s.room_id=p_room;
  return ws_online.view_room(p_room,caller);
end;
$$;

revoke all on function public.ws_online_room(text,uuid,bigint,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.ws_online_room(text,uuid,bigint,uuid,jsonb) to authenticated;
revoke all on all functions in schema ws_online from public, anon, authenticated;

do $$
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime' and puballtables) then
    raise exception 'supabase_realtime publishes all tables; restrict it before applying this migration';
  end if;
  if exists(select 1 from pg_publication_tables where pubname='supabase_realtime'
       and schemaname='public' and tablename in ('rooms','room_players','room_private_states')) then
    raise exception 'Private online tables must be excluded from supabase_realtime';
  end if;
  if exists(select 1 from pg_publication where pubname='supabase_realtime')
     and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime'
       and schemaname='public' and tablename='room_states') then
    alter publication supabase_realtime add table public.room_states;
  end if;
end;
$$;
notify pgrst, 'reload schema';
commit;
