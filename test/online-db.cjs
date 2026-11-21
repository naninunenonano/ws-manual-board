"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const {randomUUID}=require("node:crypto");
const {PGlite}=require("@electric-sql/pglite");

async function onlineTestDatabase() {
  const db=new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
      create table rooms(id uuid primary key default gen_random_uuid(),
        host_id uuid not null references auth.users, status text not null default 'waiting'
          check(status in ('waiting','playing','finished')), created_at timestamptz not null default now());
      create table room_players(room_id uuid not null references rooms on delete cascade,
        user_id uuid not null references auth.users, seat int not null check(seat in (0,1)),
        joined_at timestamptz not null default now(),primary key(room_id,user_id),unique(room_id,seat));
      create table room_states(room_id uuid primary key references rooms on delete cascade,
        state jsonb not null default '{}',revision bigint not null default 0,updated_at timestamptz not null default now());
      create table room_private_states(room_id uuid not null references rooms on delete cascade,
        user_id uuid not null references auth.users,state jsonb not null default '{}',
        updated_at timestamptz not null default now(),primary key(room_id,user_id));
      alter table rooms enable row level security;
      alter table room_players enable row level security;
      alter table room_states enable row level security;
      alter table room_private_states enable row level security;
      create policy "Read own membership" on room_players for select to authenticated using(user_id=auth.uid());
      create policy "Read own private state" on room_private_states for select to authenticated using(user_id=auth.uid());
      create publication supabase_realtime;
    `);
    const sql=fs.readFileSync(new URL("../supabase/052-online.sql","file://"+__filename),"utf8");
    for(let i=0;i<2;i++)await db.exec(sql);
    return db;
  } catch(error) {
    await db.close();
    throw error;
  }
}

async function main() {
  const db=await onlineTestDatabase();
  try {
    const [alice,bob,guest]=Array.from({length:3},()=>randomUUID());
    for(const id of [alice,bob,guest]) await db.query("insert into auth.users values ($1)",[id]);
    const as=async(user,work,role="authenticated")=>{
      await db.exec("set role "+role);
      try{
        await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
        return await work();
      }finally{await db.exec("reset role")}
    };
    const rpc=(user,action,room=null,rev=null,data={},op=randomUUID())=>as(user,async()=>
      (await db.query("select public.ws_online_room($1,$2,$3,$4,$5) as result",[action,room,rev,op,data])).rows[0].result);
    const deck=prefix=>({title:prefix,cards:Array.from({length:13},(_,n)=>({id:prefix+"-"+n,num:n===12?2:4,cx:n<2}))});
    assert.deepEqual(await rpc(guest,"join",null,null,{code:"bad"}),{error:"INVALID_CODE"});
    let a=await rpc(alice,"create");
    const room=a.room;
    assert.match(a.code,/^[A-F0-9]{12}$/);
    assert.equal((await rpc(alice,"create")).room,room);
    let b=await rpc(bob,"join",null,null,{code:a.code});
    assert.equal(b.seat,1);
    assert.equal((await rpc(bob,"join",null,null,{code:a.code})).seat,1);
    assert.equal((await rpc(guest,"join",null,null,{code:a.code})).error,"ROOM_FULL");
    assert.equal((await as(guest,()=>db.query("select * from room_states"))).rows.length,0);
    await assert.rejects(as(guest,()=>db.query("select * from room_private_states")),/permission denied/);
    await assert.rejects(as(bob,()=>db.query("select * from room_private_states")),/permission denied/);
    await assert.rejects(as(bob,()=>db.query("update room_private_states set state='{}'")),/permission denied/);
    await assert.rejects(as(alice,()=>db.query("update room_states set state='{}'")),/permission denied/);
    await assert.rejects(as("",()=>db.query("select ws_online_room('create')"),"anon"),/permission denied/);
    await assert.rejects(rpc(guest,"read",room),/ROOM_UNAVAILABLE/);
    await assert.rejects(rpc(guest,"board",room,0,{}),/ROOM_UNAVAILABLE/);
    a=await rpc(alice,"ready",room,b.revision,{deck:deck("ALICE")});
    assert.equal((await rpc(bob,"ready",room,b.revision,{deck:deck("BOB")})).error,"REVISION_CONFLICT");
    b=await rpc(bob,"ready",room,a.revision,{deck:deck("BOB")});
    assert.doesNotMatch(JSON.stringify(b),/ALICE/);
    await assert.rejects(rpc(bob,"start",room,b.revision),/NOT_READY/);
    const startOp=randomUUID();
    a=await rpc(alice,"start",room,b.revision,{},startOp);
    assert.equal((await rpc(alice,"start",room,b.revision,{},startOp)).revision,a.revision);
    assert.equal(a.own.board.hand.length,5);
    assert.equal(a.own.board.deck.length,45);
    b=await rpc(bob,"read",room);
    assert.doesNotMatch(JSON.stringify(b),/ALICE/);
    assert.equal((await rpc(guest,"join",null,null,{code:a.code})).error,"ALREADY_STARTED");
    assert.equal((await rpc(bob,"join",null,null,{code:a.code})).room,room);
    a=await rpc(alice,"mulligan",room,b.revision,{cards:[a.own.board.hand[0].uid]});
    b=await rpc(bob,"mulligan",room,a.revision,{cards:[]});
    assert.equal(b.state.stage,"active");
    a=await rpc(alice,"read",room);
    let own=a.own.board;
    let stageCard=own.hand.pop(), hiddenMarker=own.hand.pop(), stock=own.deck.pop();
    own.front0.push({...stageCard,markers:[{faceUp:false,card:hiddenMarker}]});
    own.stock.push(stock);
    await assert.rejects(rpc(bob,"board",room,b.revision,{board:own}),/INVALID_CARD/);
    a=await rpc(alice,"board",room,a.revision,{board:own,seat:1,user_id:bob});
    b=await rpc(bob,"read",room);
    assert.equal(b.own.board.front0.length,0);
    assert.equal(b.state.boards["0"].front0[0].id,stageCard.id);
    assert.deepEqual(b.state.boards["0"].front0[0].markers,[{faceUp:false,card:{}}]);
    for(const z of ["hand","deck","stock"])for(const c of b.state.boards["0"][z])
      assert.deepEqual(c,{faceUp:false,orientation:0});
    assert.doesNotMatch(JSON.stringify(b.state),/"uid"|"registry"/);
    const readTable=await as(bob,()=>db.query("select state from room_states where room_id=$1",[room]));
    assert.deepEqual(readTable.rows[0].state,b.state);
    a=await rpc(alice,"reveal",room,a.revision,{cards:[stock.uid]});
    b=await rpc(bob,"read",room);
    assert.deepEqual(b.state.reveals["0"],[{id:stock.id,cx:stock.cx}]);
    a=await rpc(alice,"reveal",room,a.revision,{cards:[]});
    assert.equal(a.state.reveals["0"].length,0);
    b=await rpc(bob,"request_deck",room,a.revision,{count:2});
    assert.deepEqual(b.state.deck_request,{from:1,count:2});
    await assert.rejects(rpc(bob,"answer_deck",room,b.revision),/INVALID_REQUEST/);
    a=await rpc(alice,"answer_deck",room,b.revision);
    assert.equal(a.state.deck_request,undefined);
    b=await rpc(bob,"read",room);
    const turn=a.state.turn;
    const active=turn.player===0?a:b, inactive=turn.player===0?b:a;
    const next={...turn,phase:"draw",drawPending:true};
    await assert.rejects(rpc(turn.player===0?bob:alice,"board",room,inactive.revision,{board:inactive.own.board,turn:next}),/INVALID_TURN/);
    const updated=await rpc(turn.player===0?alice:bob,"board",room,active.revision,{board:active.own.board,turn:next});
    assert.deepEqual(updated.state.turn,next);
    const actor=turn.player===0?alice:bob;
    const opponent=turn.player===0?bob:alice;
    let current=updated;
    for(const [phase,drawPending] of [["draw",false],["clock",false],["main",false],["climax",false],["attack",false],["end",false]]){
      current=await rpc(actor,"board",room,current.revision,{board:current.own.board,turn:{...turn,phase,drawPending}});
      assert.equal(current.state.turn.phase,phase);
    }
    let other=await rpc(opponent,"read",room);
    const otherBoard=other.own.board;
    if(!otherBoard.front1.length)otherBoard.front1.push(otherBoard.hand.pop());
    otherBoard.front1[0].orientation=90;
    other=await rpc(opponent,"board",room,other.revision,{board:otherBoard});
    current=await rpc(actor,"board",room,other.revision,{board:current.own.board,
      turn:{number:2,phase:"stand",player:1-turn.player,drawPending:false}});
    assert.equal(current.state.boards[1-turn.player].front1[0].orientation,0);
    const ended=await rpc(bob,"surrender",room,current.revision);
    assert.deepEqual(ended.state.result,{reason:"surrender",winner:0});
    for(let i=0;i<5;i++)assert.equal((await rpc(guest,"join",null,null,{code:"bad"})).error,"INVALID_CODE");
    assert.equal((await rpc(guest,"join",null,null,{code:"bad"})).error,"JOIN_RATE_LIMIT");
    const pubs=await db.query("select tablename from pg_publication_tables where pubname='supabase_realtime'");
    assert.deepEqual(pubs.rows,[{tablename:"room_states"}]);
    console.log("PostgreSQL: migration reapplication, room lifecycle, revision, private state, reveal, turn, RLS and publication passed");
  } finally { await db.close(); }
}
module.exports={onlineTestDatabase};
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1});
