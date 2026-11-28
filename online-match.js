"use strict";

const onlineRoomKey = "ws-manual-online-room-v1";

function onlineBoardWire(board, zoneNames) {
  const cardWire = card => ({uid:card.uid,faceUp:card.faceUp,orientation:card.orientation});
  return Object.fromEntries(zoneNames.map(zone => [zone,board[zone].map(card => ({
    ...cardWire(card),
    markers:(card.markers ?? []).map(marker => ({faceUp:marker.faceUp,card:cardWire(marker.card)}))
  }))]));
}

function onlineTurnWire(turn) {
  return {number:turn.number,player:turn.player,phase:turn.phase,drawPending:turn.drawPending===true};
}

function initializeOnlineMatch({authenticate,getDecks}) {
  const el = id => document.getElementById(id);
  const controls = el("onlineControls");
  let client, channel, snapshot, timer;
  let roomId = null, sending = false, reading = false, online = false;
  let recheck = false, lastBoard = "", lastTurn = "", temporary = false, clearReveal = false;
  let shownReveals = "";
  const errors = {
    INVALID_CODE:"参加コードを確認してください（12文字、期限30分）",
    ALREADY_STARTED:"対戦はすでに開始しています",
    ROOM_FULL:"ルームの参加枠が埋まっています",
    JOIN_RATE_LIMIT:"入力回数の上限です。1分後にお試しください",
    REVISION_CONFLICT:"相手側で盤面が更新されました。最新の盤面から操作し直してください",
    ROOM_UNAVAILABLE:"ルームを開けません。参加者または有効期限を確認してください",
    INVALID_DECK:"デッキは50枚・CX8枚にしてください",
    NOT_READY:"両プレイヤーの準備が完了してから開始してください",
    INVALID_TURN:"現在のターンとフェイズを確認してください",
    REQUEST_PENDING:"相手の山札操作依頼がすでに送信されています",
    INVALID_COUNT:"指定できる枚数を確認してください",
    INVALID_ATTACK_STEP:"相手の操作または最新の対戦状態を確認してください",
    INVALID_ENCORE:"アンコールの順番、対象またはコストを確認してください"
  };

  function status(text) {
    for(const id of ["onlineStatus","onlineBattleStatus","onlineMulliganStatus"]) el(id).textContent=text;
  }

  function lockBoard() {
    const blocked=!!roomId && (sending || !online);
    el("boards").inert=blocked;
    el("autoAttack").disabled=blocked;
    el("attackExchange").disabled=blocked || ruleBusy;
    el("encoreAction").disabled=blocked || ruleBusy;
    el("playerActions").inert=blocked;
    el("confirmMulligan").disabled=blocked || !!snapshot?.state.mulligan?.[snapshot.seat];
    for(const id of ["surrender","leaveBattle","onlineRevealDeckTop","onlineReveal","onlineEndReveal","onlineDeckRequest","onlineAnswerDeck","onlineAcceptDeck","onlineOpponentReveal"]) {
      el(id).disabled=blocked;
    }
  }

  function problem(error) {
    if(error.roomError) return errors[error.roomError] || "オンライン操作に失敗しました（"+error.roomError+"）";
    if(error.code==="PGRST202") return "オンライン対戦を準備中です";
    return "接続を確認できません。「再接続」で最新の盤面を取得してください";
  }

  async function request(action, args={}) {
    client ??= await authenticate();
    const phaseRpc={attack_exchange:"ws_attack_exchange",encore:"ws_encore"};
    const {data,error}=await client.rpc(phaseRpc[action]??"ws_online_room",
      {p_action:phaseRpc[action]?args.p_data.step:action,...args});
    if(error){
      if(errors[error.message] || /^INVALID_[A-Z_]+$/.test(error.message)) throw Object.assign(Error(error.message),{roomError:error.message});
      throw error;
    }
    if(data?.error)throw Object.assign(Error(data.error),{roomError:data.error});
    if(!data?.room)throw Error("Invalid online state");
    return data;
  }

  function reconnectLoop() {
    if(timer)clearInterval(timer);
    timer=setInterval(()=>poll(),6500);
  }

  function observeRoom(data) {
    if(roomId===data.room && channel)return;
    if(channel)client.removeChannel(channel);
    roomId=data.room;
    try{localStorage.setItem(onlineRoomKey,roomId)}catch{}
    channel=client.channel("ws-room:"+roomId).on("postgres_changes",
      {event:"UPDATE",schema:"public",table:"room_states",filter:"room_id=eq."+roomId},()=>poll());
    channel.subscribe(state=>{if(state==="SUBSCRIBED")poll()});
    reconnectLoop();
  }

  function renderLobby() {
    if(!snapshot){
      el("onlineCreate").hidden=false;
      el("onlineJoinFields").hidden=false;
      el("onlineRoomFields").hidden=true;
      return;
    }
    const {seat,state,code}=snapshot;
    el("onlineCreate").hidden=true;
    el("onlineJoinFields").hidden=true;
    el("onlineRoomFields").hidden=false;
    el("onlineCodeOutput").textContent=code;
    el("onlineReadyState").textContent="自分 "+(state.ready[seat]?"準備済み":"準備中")+
      " ／ 相手 "+(state.ready[1-seat]?"準備済み":String(1-seat) in snapshot.online?"準備中":"参加待ち");
    el("onlineStart").hidden=seat!==0;
    el("onlineStart").disabled=sending||!online||!state.ready[0]||!state.ready[1];
    el("onlineReady").disabled=sending||!online;
    el("onlineLobbyLeave").disabled=sending||!online;
  }

  function renderDeckChoices(){
    const select=el("onlineDeck"),previous=select.value;
    select.replaceChildren();
    for(const {id,title} of getDecks()){
      const option=document.createElement("option");
      option.value=id;option.textContent=title;select.append(option);
    }
    if(Array.from(select.options).some(option=>option.value===previous))select.value=previous;
  }

  function closeBoardDialog(){
    temporary=false;clearReveal=false;ruleBusy=false;setRuleModal(false);
    pendingMarkerChoices=[];drawConfirmationPending=false;reopenDrawReminder=null;
    const dialog=el("dialog");
    if(dialog.open)dialog.close();
  }

  function updateView(data, force=false) {
    if(snapshot && data.room===snapshot.room && data.revision<snapshot.revision)return;
    const previous=snapshot;
    if(previous?.state.reveals?.[1-data.seat]?.length && !data.state.reveals?.[1-data.seat]?.length &&
        el("dialog").open && el("dialogTitle").textContent==="相手が一時公開したカード")el("dialog").close();
    snapshot=data;
    online=true;
    renderLobby();
    const {stage,boards,turn,first,mulligan,result,reveals,attack_exchange:attackExchange,encore,deck_request:deckRequest}=data.state;
    const ownBoard=data.own?.board;
    el("onlineBattle").hidden=!roomId;
    el("onlineMulligan").hidden=!roomId;
    status("接続済み ／ プレイヤー"+(data.seat+1)+" ／ 相手 "+
      (data.online[1-data.seat]?"接続中":1-data.seat in data.online?"接続を確認中":"参加待ち"));
    lockBoard();
    if(stage==="waiting")return;
    if(previous?.revision===data.revision && !force)return;
    const me=data.seat;
    const oldPhase=match?.phase;
    const oldTurn=match?.turn;
    const readyForBattle=stage==="active";
    const viewWasOnline=match?.online===true;
    const ownWire=ownBoard?JSON.stringify(onlineBoardWire(ownBoard,zones)):"";
    const serverChangedOwn=viewWasOnline && readyForBattle && ownWire!==lastBoard;
    const preserveOwn=serverChangedOwn && sending && players[me]
      && JSON.stringify(onlineBoardWire(players[me],zones))===ownWire;
    if((serverChangedOwn && !preserveOwn) || force || stage==="finished")closeBoardDialog();
    if(ownBoard){
      const newOwn=viewWasOnline && readyForBattle && !force && (!serverChangedOwn || preserveOwn) ? players[me] : ownBoard;
      players=me===0?[newOwn,boards[1]]:[boards[0],newOwn];
    }
    if(oldPhase!=="mulligan" || mulligan?.[me])mulliganSelection=new Set();
    side=me;
    match={
      online:true,side:me,phase:stage==="finished"?"ended":stage==="mulligan"?"mulligan":"active",
      screen:stage==="finished"?"result":stage==="mulligan"?"mulligan":"battle",
      firstPlayer:first,players,decks:me===0?[data.own?.deck,null]:[null,data.own?.deck],
      mulliganPlayer:me,result:result?.reason==="leave"?{...result,reason:"left"}:result ?? null,
      turn:turn?{...turn}:undefined,attackExchange:readyForBattle && turn?.phase==="attack"?attackExchange??null:null,
      encore:readyForBattle && turn?.phase==="encore"?encore??null:null,
      encorePrivate:{[me]:data.own?.encore}
    };
    lastBoard=ownWire;
    if(turn)lastTurn=JSON.stringify(onlineTurnWire(turn));
    const requestNotice=deckRequest ? (deckRequest.from===me?"相手の山札操作を依頼中（"+deckRequest.count+"枚）":"相手から山札操作の依頼（"+deckRequest.count+"枚）") : "";
    el("onlineDeckRequestStatus").textContent=requestNotice;
    el("onlineAnswerDeck").hidden=!deckRequest || deckRequest.from===me;
    el("onlineAcceptDeck").hidden=el("onlineAnswerDeck").hidden;
    el("onlineOpponentReveal").hidden=!reveals?.[1-me]?.length;
    el("onlineEndReveal").hidden=!reveals?.[me]?.length;
    renderPublicReveals(reveals,me);
    el("battleSide").disabled=true;
    if(!viewWasOnline || oldPhase!==match.phase || force){
      closeBoardDialog();
      showMatchScreen();
    }else if(stage==="mulligan"){
      renderMulligan();
    }else if(readyForBattle){
      if(!el("dialog").open && turn?.player===me && turn?.phase==="draw" && turn.drawPending &&
          (!oldTurn?.drawPending || oldTurn.player!==me)) beforeDrawConfirmation();
      render();
      renderTurnControls();
      checkMandatoryLevel();
    }
    if(stage==="mulligan" && mulligan[me])el("mulliganProgress").textContent="確定しました。相手のマリガンを待っています";
    lockBoard();
  }

  async function poll(force=false) {
    if(!roomId)return;
    const recovering=!online;
    if(sending || reading || (!recovering && (ruleBusy || temporary))){recheck=true;return}
    reading=true;
    try{
      const data=await request("read",{p_room:roomId});
      if(roomId===data.room && !sending && (recovering || (!ruleBusy && !temporary))){
        observeRoom(data);
        updateView(data,force || recovering);
      }
      else recheck=true;
    }catch(error){
      if(error.roomError==="ROOM_UNAVAILABLE" && !match?.online)reset();
      online=false;status(problem(error));lockBoard();renderLobby();
    }finally{
      reading=false;
      if(recheck && !sending && !ruleBusy && !temporary){recheck=false;queueMicrotask(()=>poll())}
    }
  }

  async function send(action, data={}, {recover=false}={}) {
    if(sending || (roomId && !online && action!=="read") || (["board","attack_exchange","encore"].includes(action) && !snapshot))return false;
    sending=true;lockBoard();renderLobby();
    try{
      const args=["create","join"].includes(action)?{p_data:data}:{
        p_room:roomId,p_revision:snapshot?.revision,p_operation:crypto.randomUUID(),p_data:data
      };
      const updated=await request(action,args);
      observeRoom(updated);
      updateView(updated,action==="read");
      return true;
    }catch(error){
      if(!error.roomError)online=false;
      status(problem(error));
      if(recover || error.roomError==="REVISION_CONFLICT"){
        closeBoardDialog();
        try{
          const latest=await request("read",{p_room:roomId});
          updateView(latest,true);
          status(error.roomError?problem(error):"最新の盤面を取得しました。直前の操作結果を盤面で確認してください");
        }catch{
          online=false;
          status("操作結果を確認できません。再接続して最新盤面を取得してください");
        }
      }
      return false;
    }finally{
      sending=false;lockBoard();renderLobby();
      if(match?.online && match.phase==="active")renderTurnControls();
      if(recheck){recheck=false;poll()}
      if(online && !temporary && match?.online)checkMandatoryLevel();
    }
  }

  function commit() {
    if(!roomId || !online || sending || !match?.online || match.phase!=="active")return;
    const board=onlineBoardWire(players[side],zones);
    const turn=onlineTurnWire(match.turn);
    const boardKey=JSON.stringify(board),turnKey=JSON.stringify(turn);
    if(boardKey===lastBoard && turnKey===lastTurn && !clearReveal)return;
    const data={board,clearReveal};
    clearReveal=false;
    if(turnKey!==lastTurn)data.turn=turn;
    return send("board",data,{recover:true});
  }

  function reset() {
    if(channel)client.removeChannel(channel);
    clearInterval(timer);
    roomId=null;snapshot=null;online=false;channel=null;
    try{localStorage.removeItem(onlineRoomKey)}catch{}
    el("onlineBattle").hidden=true;
    el("onlineMulligan").hidden=true;
    renderPublicReveals();
    el("battleSide").disabled=false;
    renderLobby();
    lockBoard();
  }

  function renderPublicReveals(reveals, me) {
    const panel=el("onlinePublicReveals");
    const groups=[reveals?.[me]??[],reveals?.[1-me]??[]];
    const key=JSON.stringify(groups);
    if(shownReveals===key)return;
    shownReveals=key;
    panel.hidden=!groups.some(cards=>cards.length);
    panel.replaceChildren();
    for(const [index,cards] of groups.entries()){
      if(!cards.length)continue;
      const title=document.createElement("p");
      title.textContent=index===0?"自分の公開カード":"相手の公開カード";
      const list=document.createElement("div");
      list.className="modalcards";
      for(const card of cards){
        const button=document.createElement("button");
        button.type="button";
        button.className="modal-card";
        addCardImage(button,card,card.id);
        const label=document.createElement("span");
        label.textContent=card.id;
        button.append(label);
        button.onclick=()=>showCardDetail(card);
        list.append(button);
      }
      panel.append(title,list);
    }
  }

  function showReveals() {
    const dialog=el("dialog"),body=el("dialogBody");
    dialog.classList.remove("zoom-mode");
    el("dialogTitle").textContent="相手が一時公開したカード";
    body.replaceChildren();
    const list=document.createElement("div");
    list.className="modalcards";
    for(const card of snapshot?.state.reveals?.[1-side] ?? []){
      const image=document.createElement("img");
      setCardImage(image,card.id);image.alt=card.id;
      image.style.cssText="width:86px;height:120px;object-fit:contain";
      list.append(image);
    }
    body.append(list);
    dialog.showModal();
  }

  function selectReveal() {
    const dialog=el("dialog"),body=el("dialogBody");
    dialog.classList.remove("zoom-mode");
    el("dialogTitle").textContent="相手に一時公開するカードを選ぶ（10枚まで）";
    body.replaceChildren();
    const pick=document.createElement("select");
    pick.multiple=true;pick.size=8;
    for(const zone of ["hand","deck","stock","memory"]){
      for(const [index,card] of [...players[side][zone]].reverse().entries()){
        const option=document.createElement("option");
        option.value=card.uid;option.textContent=labels[zone]+" "+(index+1)+" ／ "+card.id;
        pick.append(option);
      }
    }
    body.append(pick);
    deckButton(body,"選んだカードを公開",()=>{
      const cards=Array.from(pick.selectedOptions,o=>o.value);
      if(!cards.length||cards.length>10)return;
      dialog.close();
      send("reveal",{cards});
    });
    dialog.showModal();
  }

  controls.addEventListener("toggle",()=>{if(controls.open)renderDeckChoices()});
  el("onlineCreate").onclick=()=>{if(!match)send("create")};
  el("onlineJoin").onclick=()=>{if(!match)send("join",{code:el("onlineCode").value})};
  el("onlineCopy").onclick=async()=>{
    try{await navigator.clipboard.writeText(snapshot.code);status("参加コードをコピーしました")}
    catch{status("表示された参加コードを選択してコピーしてください")}
  };
  el("onlineReady").onclick=()=>{
    const deck=getDecks().find(item=>item.id===el("onlineDeck").value)?.deck;
    if(!deck){status("登録済みデッキを選んでください");return}
    send("ready",{deck});
  };
  el("onlineStart").onclick=()=>send("start");
  el("onlineLobbyLeave").onclick=async()=>{
    if(confirm("ルームを終了しますか？") && await send("leave") && !match?.online)reset();
  };
  for(const id of ["onlineReconnect","onlineBattleReconnect","onlineMulliganReconnect"])el(id).onclick=()=>{
    if(sending)return;
    if(ruleBusy || temporary)closeBoardDialog();
    poll(true);
  };
  el("dialogBody").addEventListener("click",event=>{
    if(roomId && (!online || sending)){
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  },true);
  el("onlineRevealDeckTop").onclick=()=>{
    const top=players[side].deck.at(-1);
    if(!top){message("山札に公開できるカードがありません");return;}
    send("reveal",{cards:[top.uid]});
  };
  el("onlineReveal").onclick=selectReveal;
  el("onlineEndReveal").onclick=()=>send("reveal",{cards:[]});
  el("onlineOpponentReveal").onclick=showReveals;
  el("onlineDeckRequest").onclick=()=>{
    const value=prompt("相手に操作を依頼する山札の枚数（1〜10）","2");
    if(value===null)return;
    if(!/^([1-9]|10)$/.test(value)){status(errors.INVALID_COUNT);return}
    send("request_deck",{count:Number(value)});
  };
  el("onlineAcceptDeck").onclick=async()=>{
    const count=snapshot?.state.deck_request?.count;
    if(!count || !players[side].deck.length)return;
    temporary=true;
    if(await send("answer_deck",{reveal:true})){
      openDeckTemporary(side,"inspect",Math.min(count,players[side].deck.length));
    }else temporary=false;
  };
  el("onlineAnswerDeck").onclick=()=>send("answer_deck");
  window.addEventListener("online",()=>poll());
  window.addEventListener("offline",()=>{
    if(!roomId)return;
    online=false;status("通信が切断されました。再接続後に最新の盤面を取得します");lockBoard();renderLobby();
  });

  const controller={
    active:()=>!!roomId,
    interactive:()=>!!roomId && online && !sending,
    commit,
    commitEncore(step,options){
      const board=onlineBoardWire(players[side],zones);
      return send("encore",{...options,step,board},{recover:true});
    },
    commitAttack(step,count){
      const board=onlineBoardWire(players[side],zones);
      const data={board,step,count,clearReveal};
      clearReveal=false;
      return send("attack_exchange",data,{recover:true});
    },
    reset,refreshDecks:()=>{if(controls.open)renderDeckChoices()},
    mulligan:()=>send("mulligan",{cards:[...mulliganSelection].map(i=>players[side].hand[i].uid)}),
    finish:reason=>send(reason==="surrender"?"surrender":"leave"),
    async temporaryReveal(cards,options){
      temporary=true;
      const ok=await send("reveal",{cards:cards.map(card=>card.uid)},options);
      if(!ok)temporary=false;
      return ok;
    },
    closeTemporary(){if(!temporary)return;temporary=false;clearReveal=true;recheck=true}
  };
  if(!match){
    try{roomId=localStorage.getItem(onlineRoomKey)}catch{}
    if(roomId){
      const saved=roomId;
      roomId=null;
      controls.open=true;
      request("read",{p_room:saved}).then(data=>{if(match || roomId)return;observeRoom(data);updateView(data,true)})
        .catch(error=>{
          if(error.roomError==="ROOM_UNAVAILABLE")reset();
          else{roomId=saved;reconnectLoop()}
          status(problem(error));
        });
    }
  }
  return controller;
}
