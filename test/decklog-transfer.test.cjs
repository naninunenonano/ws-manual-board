const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const read = name => fs.readFileSync(path.join(__dirname, "..", name), "utf8");
const html = read("index.html");
const boardScript = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const importScript = read("decklog-import.js");
const matchScript = read("match-state.js");

// Card numbers and counts from the WS official tournament recipe (5856).
const decks = [
  {
    code:"1TK8A8", title:"勇者一行",
    rows:[
      ["SFN/S128-003",4], ["SFN/S128-009",1], ["SFN/S136-012",1], ["SFN/S128-017",4],
      ["SFN/S108-T04",4], ["SFN/S136-001",3], ["SFN/S136-005",3], ["SFN/S136-002",2],
      ["SFN/S136-006",4], ["SFN/S136-065",1], ["SFN/S136-076",3], ["SFN/S108-T13",4],
      ["SFN/S136-078",4], ["SFN/S128-021",4], ["SFN/S108-T09",4], ["SFN/S128-022",4]
    ]
  },
  {
    code:"U14QG", title:"Hey！カロリークイーン",
    rows:[
      ["IMC/WE51-40",1], ["IMC/WE51-42",4], ["IMC/WE51-43",1], ["IMC/WE51-39",4],
      ["IMC/WE51-38",1], ["IMC/WE51-37",1], ["IMC/WE51-61",1], ["IMC/W115-059",4],
      ["IMC/WE51-34",3], ["IMC/WE51-03",4], ["IMC/W115-067",1], ["IMC/WE51-17",2],
      ["IMC/W115-T09",1], ["IMC/W115-017",1], ["IMC/WE51-E11S",1], ["IMC/WE51-48",2],
      ["IMC/W115-T31",2], ["IMC/WE51-51",4], ["IMC/WE51-44",4], ["IMC/W43-076",4],
      ["IMC/WE51-45",4]
    ]
  },
]
  .map(({code,title,rows}) => ({code,title,list:rows.map(([card_number,num],index)=>({card_number,num,cx:index>=rows.length-2}))}));
const [frieren, idol] = decks;
const fragment = deck => "#decklog=" + encodeURIComponent(JSON.stringify(deck));
const key = p => "ws-manual-deck-v1-p" + p;

function launch(hash = "", storage = new Map(), replaceState = null, randomValue = 100, failingKey = null, botFixture = false) {
  const handlers = new Map();
  const settle = () => new Promise(resolve=>setImmediate(resolve));
  let randomCalls = 0;
  let allowConfirmation = true;
  let blockedWrite=failingKey;
  const element = () => ({
    value:"", isConnected:true, textContent:"", children:[], style:{setProperty(){}}, dataset:{}, classList:{add(){},remove(){}},
    append(...children){ this.children.push(...children); }, prepend(...children){ this.children.unshift(...children); },
    replaceChildren(...children){ this.children = children; },
    setAttribute(){}, insertBefore(){}, after(){}, addEventListener(){}, scrollIntoView(){}, querySelector(){ return null; },
    showModal(){ this.open = true; }, close(){ this.open = false; }
  });
  const elements = new Map(Array.from(html.matchAll(/ id="([^"]+)"/g), ([,id]) => [id,element()]));
  elements.get("applyDeck").disabled = true;
  const location = {hash,pathname:"/ws-manual-board/",search:""};
  const context = vm.createContext({
    document:{getElementById:id=>elements.get(id),createElement:element,createTextNode:text=>({textContent:text})},
    structuredClone,
    location, setTimeout, clearTimeout, prompt:(_,title)=>title,
    window:{
      history:{replaceState:replaceState ?? (()=>{location.hash = "";})},
      addEventListener:(type,callback)=>handlers.set(type,callback),
      scrollTo(){}
    },
    localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>{if(k===blockedWrite)throw Error("quota");storage.set(k,v)},removeItem:k=>storage.delete(k)},
    crypto:{getRandomValues(buffer){ randomCalls++; buffer[0] = randomValue; return buffer; }},
    confirm:()=>allowConfirmation, console:{warn(){}}
  });
  vm.runInContext(read("card-images.js"),context);
  vm.runInContext(boardScript,context);
  vm.runInContext(matchScript,context);
  vm.runInContext(read("card-catalog.js"),context);
  if(botFixture){
    vm.runInContext(read("effects/engine.js"),context);
    vm.runInContext(read("card-data/load.js"),context);
    context.fetch=async()=>({ok:true,text:async()=>read("card-data/catalog.json")});
  }
  vm.runInContext(read("auto-rules.js"),context);
  vm.runInContext(read("bot-match.js"),context);
  vm.runInContext(importScript,context);
  return {
    get:id=>elements.get(id), location, storage, settle,
    navigate(nextHash){ location.hash = nextHash; handlers.get("hashchange")?.(); },
    apply(p){ elements.get("side").onchange({target:{value:p}}); elements.get("applyDeck").onclick(); },
    click:id=>elements.get(id).onclick(),
    counts:p=>{
      const id=storage.get("ws-manual-deck-selected-v1-p"+p);
      const item=JSON.parse(storage.get(libraryKey)).find(entry=>entry.id===id);
      return expected(item.deck);
    },
    select(p,id){
      elements.get("side").onchange({target:{value:p}});
      elements.get("savedDeckSelect").value=id;
      elements.get("savedDeckSelect").onchange();
    },
    blockWrite:key=>{blockedWrite=key;},
    run:code=>vm.runInContext(code,context),
    confirm:value=>{allowConfirmation=value;},
    randomCalls:()=>randomCalls
  };
}

function startBattle(page) {
  page.click("startBattle");
  page.click("confirmMulligan");
  page.click("confirmMulligan");
}

function checkPreview(page,deck) {
  const [title,rows] = page.get("deckPreview").children;
  assert.equal(title?.textContent, deck.title+" / "+deck.list.length+"種類 / 50枚");
  assert.deepEqual(rows.children.map(row=>row.textContent), deck.list.map(row=>row.card_number+" × "+row.num));
  assert.equal(page.get("applyDeck").disabled,false);
  assert.equal(page.get("deckCode").value,"");
  assert.equal(page.get("registrationPanel").hidden,false);
}
const libraryKey = "ws-manual-deck-library-v1";
const expected = deck => Object.fromEntries(deck.list.map(row=>[row.card_number,row.num]));

test("initial transfer, same-tab transfer with a saved deck, and restored decks", async () => {
  const page = launch(fragment(frieren));
  await page.settle();
  checkPreview(page,frieren);
  assert.equal(page.location.hash,"");
  page.apply(0);
  assert.equal(page.storage.has("ws-manual-deck-selected-v1-p0"),false);
  page.select(0,JSON.parse(page.storage.get(libraryKey))[0].id);
  assert.deepEqual(page.counts(0),expected(frieren));
  page.navigate(fragment(idol));
  await page.settle();
  checkPreview(page,idol);
  assert.match(page.get("savedDeckStatus").textContent,/勇者一行/);
  assert.deepEqual(page.counts(0),expected(frieren));
  page.apply(1);
  page.select(1,JSON.parse(page.storage.get(libraryKey)).at(-1).id);
  assert.deepEqual(page.counts(1),expected(idol));
  const reopened = launch("",page.storage);
  assert.deepEqual(reopened.counts(0),expected(frieren));
  assert.deepEqual(reopened.counts(1),expected(idol));
});

test("legacy saved data and numeric-string quantities are accepted", async () => {
  const storage = new Map([[key(0),JSON.stringify({title:frieren.title,cards:frieren.list.map(row=>({id:row.card_number,num:row.num}))})]]);
  const page = launch(fragment({...idol,list:idol.list.map(row=>({...row,num:String(row.num)}))}),storage);
  await page.settle();
  checkPreview(page,idol);
  page.apply(1);
  page.select(1,JSON.parse(page.storage.get(libraryKey)).at(-1).id);
  page.click("startBattle");
  assert.deepEqual(snapshot(page).decks[0].cards, frieren.list.map(row=>({id:row.card_number,num:row.num,cx:null})));
});

test("malformed or invalid transfers clear the previous preview and explain the error", () => {
  const page = launch(fragment(frieren));
  for (const [hash,error] of [
    ["#decklog=%7B",/JSONが不正/],
    ["#decklog=%XY",/URLエンコードが不正/],
    ["#decklog=",/空です/],
    [fragment({...frieren,list:frieren.list.slice(1)}),/46枚です/],
    [fragment({...frieren,list:[null]}),/カード番号または採用枚数が不正/]
  ]) {
    page.navigate(hash);
    assert.equal(page.get("applyDeck").disabled,true);
    assert.equal(page.get("deckPreview").children.length,0);
    assert.match(page.get("deckTransferStatus").textContent,error);
  }
});

test("a browser history error does not block receiving a deck", async () => {
  const page = launch(fragment(frieren),new Map(),()=>{throw Error("history unavailable");});
  await page.settle();
  checkPreview(page,frieren);
});

const matchKey = "ws-manual-match-v1";
const deckStorage = () => new Map([[key(0),JSON.stringify(frieren)],[key(1),JSON.stringify(idol)]]);
const snapshot = page => JSON.parse(page.storage.get(matchKey));

test("start deals five once, then reload restores every zone, order, flags and player without randomness", () => {
  const page = launch("",deckStorage());
  startBattle(page);
  const initial = snapshot(page);
  assert.equal(initial.openingHandDealt,true);
  assert.deepEqual(initial.players.map(p=>[p.deck.length,p.hand.length]),[[45,5],[45,5]]);
  assert.equal(page.randomCalls(),187);
  startBattle(page);
  assert.deepEqual(snapshot(page),initial);
  page.run('move(0,"hand",0,"front0"); move(0,"hand",0,"stock"); move(0,"hand",0,"cx")');
  page.run('pullDeck(side,1,"hand")');
  page.click("shuffle");
  page.run("players[side].deck.slice(-7).forEach(card=>card.cx=false)");
  for(let i=0;i<7;i++){
    page.run("runDamage(side,1)");
    action(page,"キャンセルなしとしてクロック");
  }
  page.run("checkMandatoryLevel()");
  page.get("dialogBody").children[2].onclick();
  page.get("battleSide").onchange({target:{value:"1"}});
  page.run('pullDeck(side,1,"hand")');
  page.run('players[0].front0[0].orientation=90; updateBoard()');
  const before = snapshot(page);
  assert.equal(before.players[0].level.length,1);
  assert.equal(before.players[0].waiting.length,6);
  assert.equal(before.players[0].front0[0].orientation,90);
  assert.equal(before.players[0].stock[0].faceUp,false);
  const reopened = launch("",page.storage,null,101);
  assert.equal(reopened.randomCalls(),0);
  assert.equal(reopened.get("battleScreen").hidden,false);
  assert.equal(reopened.get("battleSide").value,"1");
  assert.match(reopened.get("firstPlayerResult").textContent,/先攻：プレイヤー1/);
  assert.equal(reopened.run("JSON.stringify(players)"),JSON.stringify(before.players));
  assert.deepEqual(snapshot(reopened),before);
});

test("deck inspection is read-only and a new transfer cannot leave or replace an active match", async () => {
  const page = launch("",deckStorage());
  startBattle(page);
  page.run('pullDeck(side,1,"hand")');
  const before = snapshot(page);
  page.click("viewDecks");
  assert.equal(page.get("dialog").open,true);
  const [title,rows,otherTitle] = page.get("dialogBody").children;
  assert.match(title.textContent,/勇者一行｜合計50枚/);
  assert.equal(otherTitle,undefined);
  assert.equal(rows.children.length,16);
  assert.ok(rows.children.some(row=>row.children[0].alt==="旅立ちのきっかけ ヒンメル" && row.children[1].textContent===" ×4"));
  assert.equal(page.get("backToSetup"),undefined);
  page.click("close");
  assert.equal(page.get("dialog").open,false);
  const incoming=fragment({...idol,title:"次の対戦用"});
  page.navigate(incoming);
  assert.equal(page.location.hash,incoming);
  assert.equal(page.get("setupScreen").hidden,true);
  page.click("applyDeck");
  page.click("clearSavedDeck");
  assert.deepEqual(snapshot(page),before);
  assert.deepEqual(page.counts(0),expected(frieren));
  page.click("leaveBattle");
  page.click("nextBattle");
  await page.settle();
  assert.match(page.get("deckPreview").children[0].textContent,/次の対戦用/);
});

test("cancel preserves the game, surrender restores the winner, and next match starts fresh", () => {
  const page = launch("",deckStorage());
  startBattle(page);
  const initial = snapshot(page);
  page.get("battleSide").onchange({target:{value:"1"}});
  page.run('pullDeck(side,1,"hand")');
  const before = snapshot(page);
  page.confirm(false);
  page.click("surrender");
  page.click("leaveBattle");
  assert.deepEqual(snapshot(page),before);
  page.confirm(true);
  page.click("surrender");
  assert.deepEqual(snapshot(page).result,{reason:"surrender",winner:0});
  const reopened = launch("",page.storage,null,101);
  assert.match(reopened.get("battleResult").textContent,/勝者：プレイヤー1/);
  assert.equal(reopened.get("resultScreen").hidden,false);
  assert.equal(reopened.randomCalls(),0);
  reopened.click("nextBattle");
  assert.equal(reopened.storage.has(matchKey),false);
  assert.equal(reopened.get("setupScreen").hidden,false);
  assert.deepEqual(reopened.counts(0),expected(frieren));
  assert.deepEqual(reopened.counts(1),expected(idol));
  startBattle(reopened);
  const next = snapshot(reopened);
  assert.equal(reopened.randomCalls(),187);
  assert.notEqual(next.firstPlayer,initial.firstPlayer);
  assert.notDeepEqual(next.players[0].deck,initial.players[0].deck);
  for(const player of next.players) {
    assert.equal(player.hand.length,5);
    assert.equal(player.deck.length,45);
    for(const [zone,cards] of Object.entries(player)) {
      if(zone!=="deck"&&zone!=="hand") assert.equal(cards.length,0);
    }
  }
  reopened.click("leaveBattle");
  assert.deepEqual(snapshot(reopened).result,{reason:"left",winner:null});
  assert.match(reopened.get("battleResult").textContent,/勝敗はありません/);
});

test("corrupt snapshots recover to setup and saved deck registration remains available", () => {
  const page = launch("",deckStorage());
  startBattle(page);
  const broken = snapshot(page);
  broken.players[0].deck[0] = broken.players[0].deck[1];
  for (const raw of ["{",JSON.stringify(broken)]) {
    page.storage.set(matchKey,raw);
    const reopened = launch("",page.storage);
    assert.equal(reopened.get("setupScreen").hidden,false);
    assert.equal(reopened.storage.has(matchKey),false);
    assert.match(reopened.get("storageWarning").textContent,/復元できなかった/);
    assert.deepEqual(reopened.counts(0),expected(frieren));
    startBattle(reopened);
    assert.equal(snapshot(reopened).phase,"active");
  }
  const unregistered = launch();
  unregistered.click("startBattle");
  assert.match(unregistered.get("setupNotice").textContent,/プレイヤー1の使用デッキを選択/);
  assert.equal(unregistered.randomCalls(),0);
});

function ruleGame(deck,clock,waiting,cx=false){
  const page=launch("",deckStorage());
  startBattle(page);
  page.run(`{
    const b=players[0], cards=[...b.deck,...b.hand];
    side=0;
    b.deck=cards.splice(0,${deck});
    b.clock=cards.splice(0,${clock});
    b.waiting=cards.splice(0,${waiting});
    b.hand=cards;
    for(const card of b.deck)card.cx=false;
    if(b.deck.length)b.deck.at(-1).cx=${cx};
    saveMatchProgress();
  }`);
  return page;
}
const state=page=>JSON.parse(page.run("JSON.stringify(players[0])"));
const panel=page=>page.get("dialogBody").children;
const action=(page,label)=>{
  const button=panel(page).find(item=>item.textContent===label);
  assert.ok(button,label);
  button.onclick();
};
const chooseLevel=page=>{
  assert.match(page.get("dialogTitle").textContent,/強制レベルアップ/);
  panel(page)[1].onclick();
};

test("refresh only moves one point to clock",()=>{
  const page=ruleGame(0,0,4);
  page.run("checkMandatoryLevel()");
  assert.deepEqual([state(page).deck.length,state(page).clock.length,state(page).waiting.length],[3,1,0]);
});

test("level-up only, with eight clock cards",()=>{
  const page=ruleGame(3,8,1);
  const latest=state(page).clock.at(-1).uid;
  page.run("checkMandatoryLevel()");
  chooseLevel(page);
  assert.deepEqual(state(page).clock.map(c=>c.uid),[latest]);
  assert.equal(state(page).waiting.length,7);
  assert.equal(state(page).level.length,1);
});

for(const refreshFirst of [true,false]){
  test("simultaneous rules: "+(refreshFirst?"refresh first":"level first"),()=>{
    const page=ruleGame(1,6,3);
    const before=state(page);
    page.run('pullDeck(0,1,"clock")');
    assert.match(page.get("dialogTitle").textContent,/順番を選択/);
    assert.equal(state(page).deck.length,0);
    page.click("close");
    page.run("checkMandatoryLevel()");
    assert.equal(page.get("dialog").open,true);
    panel(page)[refreshFirst?0:1].onclick();
    assert.equal(state(page).deck.length,refreshFirst?3:0);
    assert.equal(state(page).clock.length,7);
    chooseLevel(page);
    const board=state(page);
    assert.equal(board.level.length,1);
    assert.equal(board.deck.length,refreshFirst?2:8);
    assert.equal(board.waiting.length,refreshFirst?6:0);
    if(refreshFirst)assert.ok(before.waiting.some(c=>c.uid===board.clock[0].uid));
    else assert.ok(board.deck.concat(board.clock).some(c=>c.uid===before.clock[1].uid));
  });
}

for(const cancelled of [false,true]){
  test("damage refresh keeps revealed cards outside the refresh pool; CX="+cancelled,()=>{
    const page=ruleGame(1,0,4,cancelled);
    const first=state(page).deck[0].uid;
    page.run("runDamage(0,2)");
    assert.match(panel(page)[0].textContent,/1 \/ 2/);
    if(!cancelled)action(page,"次のカードを公開");
    action(page,cancelled?"キャンセルとして控え室":"キャンセルなしとしてクロック");
    const board=state(page);
    assert.equal(board.deck.length,cancelled?3:2);
    assert.equal(board.clock.length,cancelled?1:3);
    assert.equal(board.waiting.length,cancelled?1:0);
    assert.ok((cancelled?board.waiting:board.clock).some(c=>c.uid===first));
    assert.ok(!board.deck.some(c=>c.uid===first));
  });
}

test("the point is applied before its own level-up; a one-card refresh settles",()=>{
  const single=ruleGame(0,0,1);
  single.run("checkMandatoryLevel()");
  assert.equal(state(single).deck.length,0);
  assert.equal(state(single).clock.length,1);
  assert.equal(single.run("ruleBusy"),false);
  const chained=ruleGame(0,6,1);
  chained.run("checkMandatoryLevel()");
  assert.equal(state(chained).clock.length,7);
  chooseLevel(chained);
  assert.equal(state(chained).deck.length,5);
  assert.equal(state(chained).clock.length,1);
  assert.equal(chained.run("ruleBusy"),false);
});

test("multiple level-ups precede the point without duplicate choice dialogs",()=>{
  const page=ruleGame(0,15,4);
  page.run("checkMandatoryLevel()");
  panel(page)[0].onclick();
  chooseLevel(page);
  assert.equal(state(page).clock.length,8);
  chooseLevel(page);
  assert.equal(state(page).clock.length,2);
  assert.equal(state(page).deck.length,3);
  assert.equal(state(page).level.length,2);
});

test("temporary deck checks and bottom movement use the same resolution",()=>{
  const page=ruleGame(1,6,3);
  page.run('openDeckTemporary(0,"inspect",1,true)');
  assert.equal(state(page).deck.length,0);
  assert.equal(snapshot(page).players[0].deck.length,1);
  panel(page).at(-2).value="original";
  panel(page).at(-1).onclick();
  assert.equal(state(page).deck.length,1);
  page.run('pullDeck(0,1,"clock",true,true)');
  assert.match(page.get("dialogTitle").textContent,/順番を選択/);
  panel(page)[1].onclick();
  chooseLevel(page);
  assert.equal(state(page).deck.length,8);
});

test("draw and brainstorm-style multi-card move resume after refresh",()=>{
  const draw=ruleGame(1,0,4);
  const before=state(draw);
  draw.run('pullDeck(0,2,"hand")');
  assert.equal(state(draw).hand.length,before.hand.length+2);
  assert.equal(state(draw).clock.length,1);
  const mill=ruleGame(1,0,3);
  mill.run('pullDeck(0,2,"waiting")');
  assert.equal(state(mill).deck.length,2);
  assert.equal(state(mill).clock.length,1);
  assert.equal(state(mill).waiting.length,1);
});

test("failed migration keeps legacy decks; successful retry does not duplicate them",()=>{
  const storage=deckStorage();
  const page=launch("",storage,null,100,libraryKey);
  assert.match(page.get("setupNotice").textContent,/移行を完了できません/);
  assert.ok(storage.has(key(0)) && storage.has(key(1)));
  launch("",storage);
  assert.equal(JSON.parse(storage.get(libraryKey)).length,2);
  launch("",storage);
  assert.equal(JSON.parse(storage.get(libraryKey)).length,2);
});

test("deletion clears both references to the same deck and keeps other decks",()=>{
  const page=launch("",deckStorage());
  page.select(0,"legacy-1");
  page.select(1,"legacy-1");
  page.click("clearSavedDeck");
  assert.deepEqual(JSON.parse(page.storage.get(libraryKey)).map(item=>item.id),["legacy-0"]);
  for(const p of [0,1])assert.equal(page.storage.has("ws-manual-deck-selected-v1-p"+p),false);
  page.click("startBattle");
  assert.match(page.get("setupNotice").textContent,/使用デッキを選択/);
  page.select(0,"legacy-0");
  page.select(1,"legacy-0");
  startBattle(page);
  assert.deepEqual(snapshot(page).decks.map(deck=>deck.title),[frieren.title,frieren.title]);
});

test("corrupt library is reported and not overwritten by a new registration",async()=>{
  const page=launch(fragment(frieren),new Map([[libraryKey,"{"]]));
  await page.settle();
  assert.match(page.get("savedDeckStatus").textContent,/読み込めません/);
  page.click("applyDeck");
  assert.equal(page.storage.get(libraryKey),"{");
  assert.match(page.get("setupNotice").textContent,/保存できません/);
});

test("occupied stage rejects a move; stage movement and reload retain markers",()=>{
  const page=launch("",deckStorage());
  startBattle(page);
  page.run('manualTransfer(0,"hand",0,"front0"); manualTransfer(0,"hand",0,"front1")');
  const before=state(page);
  assert.equal(page.run('manualTransfer(0,"hand",0,"front0")'),false);
  assert.deepEqual(state(page),before);
  page.run('const materials=[players[0].hand.shift()]; moveTemporary(0,materials,0,"marker","top","front0","up"); manualTransfer(0,"front0",0,"back0")');
  const marked=state(page);
  const reopened=launch("",page.storage);
  assert.deepEqual(state(reopened),marked);
  reopened.run('manualTransfer(0,"back0",0,"memory")');
  assert.equal(state(reopened).waiting.at(-1).uid,marked.back0[0].markers[0].card.uid);
  assert.equal(state(reopened).waiting.at(-1).faceUp,true);
});

test("draw confirmation survives reload and draws exactly once",()=>{
  const page=launch("",deckStorage());
  startBattle(page);
  page.click("nextPhase");
  const reopened=launch("",page.storage);
  assert.match(reopened.get("dialogTitle").textContent,/ドロー前/);
  assert.equal(reopened.get("nextPhase").disabled,true);
  panel(reopened).find(button=>button.textContent==="確認完了・通常ドロー").onclick();
  assert.equal(state(reopened).hand.length,6);
  const again=launch("",page.storage);
  assert.equal(state(again).hand.length,6);
  assert.equal(again.get("nextPhase").disabled,false);
});

test("an individual clock card keeps the remaining order across every manual destination and reload",()=>{
  for(const [zone,position] of [
    ["hand","top"],["deck","top"],["deck","bottom"],["waiting","top"],
    ["stock","top"],["stock","bottom"],["memory","top"],["front1","top"],
    ["level","top"],["cx","top"],["marker","top"]
  ]){
    const page=launch("",deckStorage());
    startBattle(page);
    page.run('manualTransfer(0,"hand",0,"front0"); takeTop(0,"deck","clock",3);');
    const before=state(page);
    const chosen=before.clock[1];
    page.run('manualDestination(0,"clock",1)');
    assert.equal(page.get("dialog").open,true);
    const [destination,where,target,face]=panel(page);
    destination.value=zone;where.value=position;target.value="front0";face.value="up";
    panel(page).at(-1).onclick();
    const after=state(page);
    assert.deepEqual(after.clock,[before.clock[0],before.clock[2]],zone);
    const moved=zone==="marker"?after.front0[0].markers[0].card
      :position==="bottom"?after[zone][0]:after[zone].at(-1);
    assert.equal(moved.uid,chosen.uid,zone);
    assert.equal(after.clock.some(card=>card.uid===chosen.uid),false,zone);
    assert.deepEqual(snapshot(page).players[0],after,zone);
    assert.deepEqual(state(launch("",page.storage)),after,zone);
  }
});

test("clock cancellation, blocked destinations and stale selection preserve the board",()=>{
  const page=launch("",deckStorage());
  startBattle(page);
  page.run('manualTransfer(0,"hand",0,"front0"); takeTop(0,"deck","clock",1);');
  const before=state(page);
  const saved=snapshot(page);
  page.run('manualDestination(0,"clock",0)');
  panel(page)[0].value="front0";
  panel(page).at(-1).onclick();
  assert.match(panel(page).at(-2).textContent,/埋まっています/);
  assert.deepEqual(state(page),before);
  panel(page)[0].value="marker";
  panel(page)[2].value="front1";
  panel(page).at(-1).onclick();
  assert.match(panel(page).at(-2).textContent,/マーカーの配置先/);
  assert.deepEqual(state(page),before);
  page.get("close").onclick();
  assert.deepEqual(snapshot(page),saved);

  page.run('manualDestination(0,"clock",0); players[0].clock[0]={...players[0].clock[0]};');
  panel(page)[0].value="hand";
  panel(page).at(-1).onclick();
  assert.match(panel(page).at(-2).textContent,/選び直して/);
  assert.deepEqual(state(page),before);
  page.get("close").onclick();
  page.run('manualDestination(0,"clock",0)');
  panel(page)[0].value="waiting";
  panel(page).at(-1).onclick();
  assert.equal(state(page).clock.length,0);
  assert.equal(state(page).waiting.at(-1).uid,before.clock[0].uid);
});

test("auto attack rests a selected character, shows exactly one trigger, and stocks that copy on confirmation",()=>{
  const page=ruleGame(4,0,2);
  page.run('move(0,"hand",0,"front0"); match.turn.phase="main"; match.turn.player=0; zoneClick(0,"front0")');
  assert.equal(page.get("autoAttack").hidden,true);
  page.run('match.turn.phase="attack"; renderTurnControls()');
  assert.equal(page.get("autoAttack").hidden,false);
  const before=state(page),trigger=before.deck.at(-1);
  page.click("autoAttack");
  assert.equal(state(page).front0[0].orientation,90);
  assert.equal(page.get("dialogTitle").textContent,"トリガーチェック・解決領域");
  assert.equal(panel(page)[1].children[0].children.at(-1).textContent,"1．"+trigger.id);
  assert.deepEqual(state(page).deck,before.deck.slice(0,-1));
  assert.deepEqual(state(page).stock,before.stock);
  action(page,"ストックに置く");
  assert.equal(state(page).stock.at(-1).uid,trigger.uid);
  assert.equal(state(page).stock.at(-1).faceUp,false);
  assert.equal(state(page).deck.length,before.deck.length-1);
  assert.equal(page.run("side"),1);
  assert.equal(page.get("battleSide").value,"1");
  assert.equal(page.run("match.attackExchange.stage"),"counter");
  assert.equal(page.get("nextPhase").disabled,true);
  page.click("attackExchange");
  action(page,"カウンターなし");
  assert.equal(page.run("side"),0);
  page.click("attackExchange");
  panel(page)[0].value="2";
  action(page,"ダメージ枚数を確定");
  assert.equal(page.run("match.attackExchange.count"),2);
  page.run("players[1].deck.slice(-2).forEach(card=>card.cx=false)");
  page.click("attackExchange");
  action(page,"次のカードを公開");
  action(page,"キャンセルなしとしてクロック");
  assert.equal(page.run("players[1].clock.length"),2);
  assert.equal(page.run("match.attackExchange"),null);
  assert.equal(page.run("side"),0);
});

test("last deck card remains in trigger resolution through refresh and is then stocked",()=>{
  const page=ruleGame(1,0,4);
  page.run('move(0,"hand",0,"front0"); match.turn.phase="attack"; match.turn.player=0; zoneClick(0,"front0")');
  const uid=state(page).deck[0].uid;
  page.click("autoAttack");
  action(page,"ストックに置く");
  const board=state(page);
  assert.equal(board.stock.at(-1).uid,uid);
  assert.equal(board.deck.length,3);
  assert.ok(!board.deck.some(card=>card.uid===uid));
  assert.equal(board.clock.length,1);
});

test("effect damage checks one card at a time, with ordered clock placement",()=>{
  const page=ruleGame(5,0,1);
  const expected=state(page).deck.slice(-3).reverse().map(card=>card.uid);
  page.run('match.turn.phase="main"; runDamage(0,3)');
  assert.equal(state(page).deck.length,4);
  assert.equal(state(page).clock.length,0);
  action(page,"次のカードを公開");
  assert.equal(state(page).deck.length,3);
  action(page,"次のカードを公開");
  assert.equal(state(page).clock.length,0);
  action(page,"キャンセルなしとしてクロック");
  assert.deepEqual(state(page).clock.map(card=>card.uid),expected);
});

test("an unclassified reveal can be continued or manually cancelled",()=>{
  for(const resume of [true,false]){
    const page=ruleGame(4,0,2);
    page.run("delete players[0].deck.at(-1).cx; runDamage(0,2)");
    assert.match(page.get("dialogTitle").textContent,/CX判定未登録/);
    if(resume)action(page,"次のカードを公開");
    action(page,resume?"キャンセルなしとしてクロック":"キャンセルとして控え室");
    assert.equal(state(page).clock.length,resume?2:0);
    assert.equal(state(page).waiting.length,resume?2:3);
  }
});

test("trigger resolution keeps both checks queued and separates private look from the reveal",()=>{
  const page=ruleGame(9,0,2);
  page.run('move(0,"hand",0,"front0"); match.turn.phase="attack"; match.turn.player=0; zoneClick(0,"front0")');
  const ordered=state(page).deck.slice().reverse();
  const [first,second,lookFirst,lookSecond,draw,stock]=ordered;
  page.click("autoAttack");
  action(page,"追加トリガーチェック");
  assert.equal(panel(page)[1].children.length,2);
  action(page,"控え室に置き、山札の上から2枚を見る");
  assert.match(page.get("dialogTitle").textContent,/自分だけ/);
  action(page,"2．"+lookSecond.id+"を手札へ");
  assert.equal(state(page).waiting.at(-1).uid,first.uid);
  assert.equal(state(page).hand.at(-1).uid,lookSecond.uid);
  assert.equal(state(page).stock.at(-1).uid,lookFirst.uid);
  action(page,"山札の上から1枚を手札に加える");
  action(page,"山札の上から1枚をストックに置く");
  assert.equal(state(page).hand.at(-1).uid,draw.uid);
  assert.equal(state(page).stock.at(-1).uid,stock.uid);
  assert.equal(page.run("!!match.attackExchange"),false);
  action(page,"手札に加えて、山札の上から1枚をストック");
  assert.equal(state(page).hand.at(-1).uid,second.uid);
  assert.equal(state(page).stock.at(-1).uid,ordered[6].uid);
  assert.equal(page.run("match.attackExchange.stage"),"counter");
});

test("counter discards only the selected hand card, pays stock and waits for manual effect completion",()=>{
  const page=ruleGame(4,0,2);
  page.run(`{
    const board=players[1];
    board.stock.push(board.deck.pop(),board.deck.pop());
    move(0,"hand",0,"front0");
    match.turn.phase="attack"; match.turn.player=0;
    zoneClick(0,"front0");
  }`);
  page.click("autoAttack");
  action(page,"ストックに置く");
  page.click("attackExchange");
  const hand=panel(page)[0],cost=panel(page)[1];
  const uid=page.run("players[1].hand[1].uid");
  const paid=page.run("players[1].stock.at(-1).uid");
  hand.value=uid;hand.onchange();cost.value="1";
  action(page,"カウンターを使う");
  assert.equal(page.run("players[1].waiting.at(-2).uid"),uid);
  assert.equal(page.run("players[1].waiting.at(-1).uid"),paid);
  assert.equal(page.run("players[1].stock.length"),1);
  assert.equal(page.run("match.attackExchange.stage"),"counter_effect");
  assert.equal(page.run("side"),1);
  page.click("attackExchange");
  action(page,"効果の処理を確定");
  assert.equal(page.run("match.attackExchange.stage"),"damage_input");
  page.click("attackExchange");
  panel(page)[0].value="0";
  action(page,"ダメージ枚数を確定");
  assert.equal(page.run("match.attackExchange"),null);
  assert.equal(page.run("players[1].clock.length"),0);
});

function startEncore(page){
  page.run('side=0; match.turn={player:0,phase:"attack",number:1}; renderTurnControls()');
  page.click("nextPhase");
  assert.match(page.get("encoreStatus").textContent,/ターンプレイヤー.*開始時/);
  assert.equal(page.get("nextPhase").disabled,true);
  page.click("encoreAction");
  assert.match(page.get("encoreStatus").textContent,/非ターンプレイヤー.*開始時/);
  page.click("encoreAction");
  assert.equal(page.run("match.encore.step"),"choose");
  assert.equal(page.run("side"),0);
}

test("encore requires two start confirmations, pays three stock and waits for each card",()=>{
  const page=ruleGame(8,0,1);
  page.run(`{
    const b=players[0];
    for(const zone of ["front0","front1"]){
      move(0,"hand",0,zone);
      b[zone][0].orientation=180;
    }
    b.stock.push(...b.deck.splice(0,3));
  }`);
  startEncore(page);
  const before=state(page);
  page.click("encoreAction");
  assert.equal(panel(page)[0].children.length,2);
  panel(page)[0].children[1].onclick();
  action(page,"3ストック");
  assert.equal(state(page).front1[0].orientation,90);
  assert.equal(state(page).front0[0].orientation,180);
  assert.equal(state(page).stock.length,0);
  assert.deepEqual(state(page).waiting.slice(-3).map(c=>c.uid),before.stock.map(c=>c.uid).reverse());
  assert.equal(page.get("dialog").open,false);
  assert.equal(page.get("encoreAction").textContent,"次のキャラへ");
  page.run(`{
    move(0,"hand",0,"back0");
    players[0].back0[0].orientation=180;
    players[0].front1[0].orientation=180;
    updateBoard();
  }`);
  page.click("encoreAction");
  assert.equal(page.get("dialog").open,false);
  page.click("encoreAction");
  assert.equal(panel(page)[0].children.length,2);
  panel(page)[0].children[0].onclick();
  assert.equal(panel(page).find(b=>b.textContent==="3ストック").disabled,true);
  action(page,"アンコールしない");
  assert.equal(state(page).front0.length,0);
  assert.equal(state(page).waiting.at(-1).uid,before.front0[0].uid);
});

test("encore paid by hand requires explicit confirmation, and other costs allow manual board changes",()=>{
  const page=ruleGame(8,0,1);
  page.run(`{
    for(const zone of ["front0","front1"]){
      move(0,"hand",0,zone);
      players[0][zone][0].orientation=180;
    }
  }`);
  startEncore(page);
  page.run('zoneClick(0,"front0")');
  page.click("encoreAction");
  action(page,"手札1枚を選ぶ");
  const pay=panel(page).find(b=>b.textContent==="選んだ手札を控え室へ");
  const hand=state(page).hand[1].uid;
  assert.equal(pay.disabled,true);
  panel(page)[0].children[1].onclick();
  assert.equal(pay.disabled,false);
  pay.onclick();
  assert.equal(state(page).waiting.at(-1).uid,hand);
  assert.equal(state(page).front0[0].orientation,90);
  page.click("encoreAction");
  page.run('zoneClick(0,"front1")');
  page.click("encoreAction");
  action(page,"その他");
  assert.equal(page.get("dialog").open,false);
  assert.equal(page.run("match.encore.step"),"other");
  page.run('move(0,"hand",0,"waiting")');
  page.click("encoreAction");
  action(page,"支払い済みとしてレスト");
  assert.equal(state(page).front1[0].orientation,90);
  assert.equal(page.run("match.encore.step"),"after");
});

test("clock encore refreshes and both players finish before end; newly reversed card gets a turn",()=>{
  const page=ruleGame(1,0,4);
  page.run(`{
    move(0,"hand",0,"front0");
    players[0].front0[0].orientation=180;
  }`);
  const clock=state(page).deck.at(-1).uid;
  startEncore(page);
  page.run('chooseEncoreCard(0,"front0",0)');
  action(page,"山札の上から1枚をクロック");
  assert.equal(state(page).clock[0].uid,clock);
  assert.equal(state(page).clock.length,2);
  assert.equal(state(page).deck.length,3);
  assert.equal(state(page).front0[0].orientation,90);
  page.click("encoreAction");
  page.click("encoreAction");
  assert.equal(page.run("side"),1);
  page.run(`{
    move(1,"hand",0,"back0");
    players[1].back0[0].orientation=180;
  }`);
  page.run('chooseEncoreCard(1,"back0",0)');
  action(page,"アンコールしない");
  page.click("encoreAction");
  page.click("encoreAction");
  assert.equal(page.run("match.encore.step"),"complete");
  page.run('move(0,"hand",0,"back0"); players[0].back0[0].orientation=180');
  page.click("nextPhase");
  assert.equal(page.run("match.encore.step"),"choose");
  page.run('chooseEncoreCard(0,"back0",0)');
  action(page,"アンコールしない");
  page.click("encoreAction");
  page.click("encoreAction");
  page.click("encoreAction");
  page.click("nextPhase");
  assert.equal(page.run("match.turn.phase"),"end");
  assert.equal(page.run("match.encore"),undefined);
});


test("Bot scenarios accept interchangeable player decks and keep the selected setup on reload",async()=>{
  const page=launch("",new Map([[key(0),JSON.stringify(frieren)],[key(1),JSON.stringify(idol)]]));
  page.get("botScenario").value="front";
  page.click("startBotBattle");
  assert.equal(snapshot(page).bot.scenario,"front");
  assert.equal(snapshot(page).decks[0].title,frieren.title);
  assert.equal(snapshot(page).players[1].front0.length,1);
  assert.equal(snapshot(page).players[1].deck.at(-1).cx,true);
  assert.equal(page.get("battleSide").disabled,true);
  const resumed=launch("",page.storage);
  assert.deepEqual(snapshot(resumed),snapshot(page));
  resumed.run('finishMatch("left")');
  resumed.click("nextBattle");
  const library=JSON.parse(page.storage.get(libraryKey));
  resumed.select(0,library.find(item=>item.deck.title===idol.title).id);
  resumed.get("botScenario").value="opening";
  resumed.click("startBotBattle");
  assert.equal(snapshot(resumed).decks[0].title,idol.title);
  assert.equal(snapshot(resumed).phase,"mulligan");
  resumed.click("confirmMulligan");
  assert.equal(snapshot(resumed).phase,"active");
  assert.equal(snapshot(resumed).players[1].hand.length,5);
  assert.equal(snapshot(resumed).players[0].hand.length,5);
});

test("フィレンの登場時能力は手札から誘発し、枠の選択と連続効果に反映する",async()=>{
  const deck={title:"テスト",list:[
    {card_number:"STS/W140-001",num:4,cx:false},
    {card_number:"STS/W140-002",num:4,cx:false},
    {card_number:"STS/W140-031",num:4,cx:true},
    ...frieren.list.slice(0,8).map(({card_number})=>({card_number,num:4,cx:false})),
    {card_number:"SFN/S128-021",num:2,cx:false},
    {card_number:"SFN/S128-022",num:4,cx:true}
  ]};
  const page=launch("",new Map([[key(0),JSON.stringify(deck)]]),null,100,null,true);
  await page.settle();
  page.get("botScenario").value="firen";
  page.click("startBotBattle");
  assert.equal(snapshot(page).phase,"active");
  page.run('move(0,"hand",players[0].hand.findIndex(card=>card.id==="STS/W140-002"),"front0")');
  const click=label=>{
    const button=page.get("dialogBody").children.find(el=>el.textContent===label);
    assert.ok(button,label);
    button.onclick();
  };
  click("能力を使う");
  click("黎明の刻 レイス");
  click("選択を確定");
  click("コストを支払う");
  click("鋼に宿る優しき心 フィレン");
  click("選択を確定");
  click("後列②");
  assert.equal(snapshot(page).players[0].back1[0].botLevel,2);
  assert.equal(page.run("botStats(0,players[0].front0[0]).power"),7000);
  page.run('move(0,"hand",players[0].hand.findIndex(card=>card.id==="STS/W140-031"),"cx")');
  assert.equal(page.run("botStats(0,players[0].front0[0]).power"),8000);
  assert.equal(page.run("botStats(0,players[0].front0[0]).soul"),2);
  page.run('match.turn.phase="attack";startAutoAttack(0,"front0",0)');
  click("黎明の刻 レイス");
  click("選択を確定");
  click("手札へ");
  click("山札の上をストックへ");
  click("ダメージを与える");
  click("クロックへ");
  const {players}=snapshot(page);
  assert.equal(players[1].front0[0].orientation,180);
  assert.equal(players[1].clock.length,2);
  assert.equal(players[0].stock.length,1);
  assert.equal(players[0].hand.some(card=>card.id==="STS/W140-031"),true);
  assert.deepEqual(players.map(board=>Object.values(board).flat().length),[50,50]);
});


test("Bot draws, deploys and attacks only on its turn",()=>{
  const page=launch("",new Map([[key(0),JSON.stringify(frieren)]]));
  page.get("botScenario").value="open";
  page.click("startBotBattle");
  assert.equal(page.get("botStep").disabled,true);
  page.run('finishEndTurn()');
  page.click("botStep");
  assert.equal(snapshot(page).players[1].hand.length,5);
  page.click("botStep");
  assert.deepEqual(["front0","front1","front2"].map(zone=>snapshot(page).players[1][zone].length),[1,1,1]);
  page.click("botStep");
  page.click("botStep");
  const confirm=page.get("dialogBody").children.find(e=>["クロックへ","控え室へ"].includes(e.textContent));
  assert.ok(confirm);
  confirm.onclick();
  const {players,side}=snapshot(page);
  assert.equal(side,0);
  assert.equal(players[1].front0[0].orientation,90);
  assert.equal(players[1].stock.length,1);
  assert.deepEqual(players.map(board=>Object.values(board).flat().length),[50,50]);
});

function launchRules(scenario="rules"){
  const page=launch("",new Map(),null,100,null,true);
  page.get("botScenario").value=scenario;
  page.click("startBotBattle");
  return page;
}
function ruleButton(page,text){
  const button=page.get("dialogBody").children.find(el=>el.textContent===text);
  assert.ok(button,text);
  button.onclick();
}
function ruleCounts(snapshot){
  return snapshot.players.map(board=>Object.values(board).flat().length);
}

test("自動ルール：レベル・ストック不足で中止し、2枚支払い後に登場と起動を解決する",()=>{
  const page=launchRules();
  page.run('botMove(players[0],"level",0,"waiting")');
  page.run('cardClick(0,"hand",2)');
  assert.match(page.get("dialogBody").children.at(-1).textContent,/レベルが不足/);
  page.run('closeResolution();selected=null;botMove(players[0],"waiting",0,"level")');
  page.run('cardClick(0,"hand",2)');
  ruleButton(page,"プレイする");
  ruleButton(page,"前列②");
  let snap=snapshot(page);
  assert.equal(snap.players[0].front1[0].id,"BOT/W000-002");
  assert.equal(snap.players[0].stock.length,1);
  assert.equal(page.run("botStats(0,players[0].front1[0]).power"),4500,JSON.stringify(snap.bot.log));
  page.run('zoneClick(0,"front1")');
  ruleButton(page,"起動・ストック1枚でパワー＋500");
  ruleButton(page,"能力を使う");
  ruleButton(page,"コストを支払う");
  assert.equal(page.run("botStats(0,players[0].front1[0]).power"),5000);
  assert.equal(snapshot(page).players[0].stock.length,0);
  page.run('cardClick(0,"hand",2)');
  assert.match(page.get("dialogBody").children.at(-1).textContent,/ストックが不足/);
  page.run('closeResolution()');
  assert.equal(page.run('autoRulePlace(0,players[0].hand[2].uid,"front2")'),false);
  assert.equal(snapshot(page).players[0].front2.length,0);
  assert.deepEqual(ruleCounts(snapshot(page)),[50,50]);
});

test("自動ルール：CX、アタック時能力、トリガー、カウンター、ダメージ、バトルの順に解決する",()=>{
  const page=launchRules();
  page.run('autoRulePlace(0,players[0].hand[2].uid,"front1");advanceTurn()');
  const before=snapshot(page);
  page.run('cardClick(0,"hand",3)');
  ruleButton(page,"プレイする");
  let snap=snapshot(page);
  assert.equal(snap.players[0].cx.length,1);
  assert.equal(snap.players[0].deck.length,before.players[0].deck.length-1);
  assert.equal(page.run("botStats(0,players[0].front1[0]).soul"),2);
  page.run('advanceTurn();startAutoAttack(0,"front1",0)');
  ruleButton(page,"フロントアタック");
  snap=snapshot(page);
  assert.deepEqual(snap.bot.log.filter(line=>/CXコンボ|トリガー|カウンター|ソウル 4|ダメージ|バトル/.test(line)).map(line=>line.split(/[ （]/)[0]),[
    "CXコンボ・ソウル＋1","トリガー","仮カウンターを使用","ソウル","CXでダメージをキャンセル","バトル"
  ]);
  assert.equal(snap.players[0].front1[0].orientation,180);
  assert.equal(snap.players[1].front1[0].orientation,0);
  assert.equal(snap.players[1].stock.length,2);
  assert.equal(page.run("botStats(0,players[0].front1[0]).soul"),4);
  assert.deepEqual(ruleCounts(snap),[50,50]);
  page.run('advanceTurn()');
  assert.equal(snapshot(page).encore.step,"choose");
  page.run('zoneClick(0,"front1")');
  ruleButton(page,"アンコールしない");
  assert.equal(snapshot(page).players[0].front1.length,0);
  page.run('advanceTurn();advanceTurn()');
  assert.equal(snapshot(page).turn.player,1);
  assert.equal(snapshot(page).players[0].cx.length,0);
  assert.equal(snapshot(page).players[1].front1[0].botPower,4500);
  assert.deepEqual(ruleCounts(snapshot(page)),[50,50]);
});

test("自動ルール：サイドはレベル分を引きバトルなし、ダイレクトはソウル追加、ドローとクロック2ドロー",()=>{
  const page=launchRules();
  page.run('autoRulePlace(0,players[0].hand[2].uid,"front1");setTurnPhase("attack");botMove(players[0],"deck",players[0].deck.length-1,"waiting");startAutoAttack(0,"front1",0)');
  ruleButton(page,"サイドアタック");
  let snap=snapshot(page);
  assert.equal(snap.players[1].stock.length,3);
  assert.equal(snap.players[1].front1[0].orientation,0);
  assert.ok(snap.bot.log.includes("ソウル 1"));
  page.run('startAutoAttack(0,"front0",0)');
  ruleButton(page,"ダイレクトアタック");
  assert.ok(snapshot(page).bot.log.includes("ソウル 2"));
  let hand=snapshot(page).players[0].hand.length;
  page.run('setTurnPhase("draw")');
  assert.equal(snapshot(page).players[0].hand.length,++hand);
  assert.equal(page.get("dialog").open,false);
  page.run('advanceTurn();selected={p:0,z:"hand",index:0};clockAction()');
  snap=snapshot(page);
  assert.equal(snap.turn.phase,"main");
  assert.equal(snap.players[0].hand.length,hand+1);
  assert.equal(snap.players[0].clock.length,1);
  assert.deepEqual(ruleCounts(snap),[50,50]);
});

test("仮カード5種：特徴・キーワードの全一致と応援の位置変更",()=>{
  const page=launchRules("practice-cards");
  const example=page.run(`(()=>{
    const chars=players[0];
    const all=[...chars.front0,...chars.back0,...chars.back1,...chars.deck.slice(-9,-7)];
    return JSON.stringify(all.map(c=>{
      const entry=botEffectCard(c);
      return [entry.cardNumber,botDefinition(c).color,WSEffects.matchTags(entry,"traits",{names:["任意の特徴"],mode:"all"}),
        WSEffects.matchTags(entry,"keywords",{names:["任意の能力"],mode:"all"})];
    }));
  })()`);
  assert.deepEqual(JSON.parse(example),[["101","red"],["102","blue"],["103","blue"],["105","blue"],["104","red"]]
    .map(([id,color])=>["BOT/W000-"+id,color,true,true]));
  assert.deepEqual(JSON.parse(page.run("JSON.stringify([botStats(0,players[0].front0[0]).power,botStats(0,players[0].front1[0]).power])")),[3500,3000]);
  page.run('botMove(players[0],"back0",0,"front2");updateBoard()');
  assert.equal(page.run("botStats(0,players[0].front0[0]).power"),3000);
  assert.deepEqual(ruleCounts(snapshot(page)),[50,50]);
});

test("仮カード5種：集中の任意ドローと回収先、CXの1001、トリガー後のストック",()=>{
  const page=launchRules("practice-cards");
  const activate='activateBrainstorm(0,players[0].back1[0],{stock:1,reveal:5})';
  page.run('zoneClick(0,"back1")');
  ruleButton(page,"集中（1ストック・自身レスト）");
  assert.match(page.get("dialogTitle").textContent,/最大2枚/);
  ruleButton(page,"2枚引く");
  let board=snapshot(page).players[0];
  assert.equal(board.back1[0].orientation,90);
  assert.equal(board.stock.length,2);
  assert.equal(board.hand.length,4);
  assert.equal(board.waiting.length,8);
  page.run(activate);
  assert.match(page.get("botStatus").textContent,/スタンドしていません/);
  assert.equal(snapshot(page).players[0].stock.length,2);
  page.run('setTurnPhase("attack");startAutoAttack(0,"front0",0)');
  ruleButton(page,"ダイレクトアタック");
  assert.match(page.get("dialogTitle").textContent,/カムバック/);
  assert.equal(page.get("dialogBody").children.some(el=>el.textContent==="仮CX"),false);
  const current=page.get("dialogBody").children.find(el=>el.textContent==="仮キャラ");
  assert.ok(current);
  current.onclick();
  ruleButton(page,"選択を確定");
  assert.equal(snapshot(page).players[0].stock.at(-1).id,"BOT/W000-104");
  page.run('startAutoAttack(0,"front1",0)');
  ruleButton(page,"サイドアタック");
  assert.match(page.get("dialogTitle").textContent,/ゲート/);
  assert.equal(page.get("dialogBody").children.some(el=>el.textContent==="仮キャラ"||el.textContent==="仮CX ゲート"),false);
  ruleButton(page,"仮CX");
  ruleButton(page,"選択を確定");
  assert.equal(snapshot(page).players[0].stock.at(-1).id,"BOT/W000-105");
  page.run('botMove(players[0],"stock",players[0].stock.length-1,"hand");setTurnPhase("climax")');
  assert.equal(page.run('autoRulePlace(0,players[0].hand.at(-1).uid,"cx")'),false);
  assert.match(page.get("notice").textContent,/同じ色が必要/);
  page.run('botMove(players[0],"back1",0,"clock")');
  assert.equal(page.run('autoRulePlace(0,players[0].hand.at(-1).uid,"cx")'),true);
  assert.deepEqual(JSON.parse(page.run("JSON.stringify(botStats(0,players[0].front0[0]))")),{power:4500,soul:3});
  assert.deepEqual(ruleCounts(snapshot(page)),[50,50]);
});

test("集中：山札切れのリフレッシュにめくり中のカードを含めず、0枚でも終了できる",()=>{
  const page=launchRules("practice-cards");
  page.run(`(()=>{
    const board=players[0],cx=board.deck.splice(board.deck.findIndex(card=>card.cx===true),1)[0];
    board.waiting.push(...board.deck.splice(0));
    board.deck.push(cx);
    window.firstRevealed=cx.uid;
    activateBrainstorm(0,board.back1[0],{stock:1,reveal:5});
  })()`);
  ruleButton(page,"引かない");
  const board=snapshot(page).players[0];
  const first=page.run("window.firstRevealed");
  assert.ok(board.waiting.some(card=>card.uid===first));
  assert.ok(!board.clock.some(card=>card.uid===first));
  assert.equal(board.hand.length,2);
  assert.equal(board.clock.length,1);
  assert.deepEqual(ruleCounts(snapshot(page)),[50,50]);
});

test("仮Lv1：赤はレベル置場、青はクロックの色でプレイでき、カムバック連動は最大4枚から特徴を回収する",()=>{
  const page=launchRules("practice-level-one");
  const red=snapshot(page).players[0].hand.find(c=>c.id==="BOT/W000-106");
  const blue=snapshot(page).players[0].hand.find(c=>c.id==="BOT/W000-107");
  assert.equal(page.run(`autoRulePlace(0,${JSON.stringify(red.uid)},"front0")`),true);
  assert.equal(page.run(`autoRulePlace(0,${JSON.stringify(blue.uid)},"front1")`),true);
  assert.equal(page.run("botStats(0,players[0].front1[0]).power"),5000);
  page.run('setTurnPhase("climax")');
  assert.equal(page.run('autoRulePlace(0,players[0].hand.find(c=>c.id==="BOT/W000-104").uid,"cx")'),true);
  page.run('setTurnPhase("attack");autoRuleAttack(0,"front0",players[0].front0[0].uid,"direct")');
  assert.match(page.get("dialogTitle").textContent,/山札を何枚見るか/);
  const before=page.run("players[0].deck.length");
  ruleButton(page,"山札を見る");
  assert.match(page.get("dialogTitle").textContent,/巡遊者/);
  assert.equal(page.get("dialogBody").children.some(el=>el.textContent.startsWith("2．")&&el.textContent.endsWith("を手札へ")),false);
  const option=page.get("dialogBody").children.find(el=>el.textContent?.startsWith("1．")&&el.textContent.endsWith("を手札へ"));
  assert.ok(option);
  option.onclick();
  const saved=snapshot(page);
  assert.equal(saved.players[0].deck.length,before-5);
  assert.equal(saved.players[0].waiting.length,3);
  assert.deepEqual(ruleCounts(saved),[50,50]);
});

test("仮Lv1：青は他の特徴持ち2体でパワー＋1000、支払いでトリガーを2回処理する",()=>{
  const page=launchRules("practice-level-one");
  page.run('autoRulePlace(0,players[0].hand.find(c=>c.id==="BOT/W000-107").uid,"front1")');
  assert.equal(page.run("botStats(0,players[0].front1[0]).power"),5000);
  page.run('botMove(players[0],"back0",0,"waiting");updateBoard()');
  assert.equal(page.run("botStats(0,players[0].front1[0]).power"),4000);
  const start=page.run("players[0].deck.length");
  page.run('setTurnPhase("attack");autoRuleAttack(0,"front1",players[0].front1[0].uid,"side")');
  ruleButton(page,"1ストック払う");
  const saved=snapshot(page);
  assert.equal(saved.players[0].deck.length,start-2);
  assert.equal(saved.players[0].stock.length,4);
  assert.equal(saved.bot.log.filter(line=>line.startsWith("トリガー ")).length,2);
  assert.deepEqual(ruleCounts(saved),[50,50]);
});

test("仮Lv2：赤の1コストを支払い、後列から対象の現在レベル×500を加える",()=>{
  const page=launchRules("practice-level-two");
  const play='autoRulePlace(0,players[0].hand.find(c=>c.id==="BOT/W000-108").uid,"back0")';
  const power=zone=>page.run(`botStats(0,players[0].${zone}[0]).power`);
  assert.equal(page.run(play),true);
  assert.equal(snapshot(page).players[0].stock.length,2);
  assert.equal(power("front0"),2500);
  assert.equal(power("front1"),5500);
  page.run('players[0].front1[0].botLevel=2;updateBoard()');
  assert.equal(power("front1"),6000);
  page.run('botMove(players[0],"back0",0,"waiting");updateBoard()');
  assert.equal(power("front1"),5000);
  assert.deepEqual(ruleCounts(snapshot(page)),[50,50]);
});

test("仮Lv2：ソウルトリガー1と、前回の仮Lv1のトリガーなし",()=>{
  const page=launchRules("practice-level-two");
  assert.equal(page.run('JSON.stringify([practiceCards["106"].triggers,practiceCards["107"].triggers])'),"[[],[]]");
  page.run(`(()=>{
    const board=players[0];
    botMove(board,"hand",board.hand.findIndex(c=>c.id==="BOT/W000-108"),"deck");
    setTurnPhase("attack");
    autoRuleAttack(0,"front0",board.front0[0].uid,"direct");
  })()`);
  const saved=snapshot(page);
  assert.equal(saved.players[0].stock.at(-1).id,"BOT/W000-108");
  assert.equal(page.run('botStats(0,players[0].front0[0]).soul'),3);
  assert.ok(saved.bot.log.some(line=>line.includes("ソウル＋1")));
  assert.deepEqual(ruleCounts(saved),[50,50]);
});

function enterGatePractice(page,cxNumber="105"){
  const initial=snapshot(page).players[0];
  assert.equal(page.run('autoRulePlace(0,players[0].hand.find(c=>c.id==="BOT/W000-109").uid,"front0")'),true);
  const played=snapshot(page).players[0];
  assert.equal(played.stock.length,initial.stock.length-2);
  assert.deepEqual(played.clock.map(card=>card.uid),initial.clock.slice(0,-1).map(card=>card.uid));
  assert.equal(played.waiting.at(-1).uid,initial.clock.at(-1).uid);
  assert.equal(page.run('botStats(0,players[0].front0[0]).power'),10000);
  page.run(`(()=>{
    const board=players[0],id="BOT/W000-${cxNumber}";
    if(!board.hand.some(c=>c.id===id))botMove(board,"deck",board.deck.findIndex(c=>c.id===id),"hand");
    setTurnPhase("climax");
    autoRulePlace(0,board.hand.find(c=>c.id===id).uid,"cx");
    setTurnPhase("attack");
  })()`);
}
function attackWithGatePractice(page){
  page.run('autoRuleAttack(0,"front0",players[0].front0[0].uid,"direct")');
  return snapshot(page);
}

test("仮Lv3：クロックの一番上を回復し、ゲート連動は山札下4枚のCX数を通常アタック前に与える",()=>{
  const page=launchRules("practice-level-three");
  enterGatePractice(page);
  const bottom=snapshot(page).players[1].deck.slice(0,4);
  assert.equal(bottom.filter(c=>c.cx).length,2);
  const saved=attackWithGatePractice(page);
  assert.deepEqual(saved.players[1].waiting.slice(0,4).map(c=>c.uid),bottom.map(c=>c.uid));
  const log=saved.bot.log;
  const combo=log.findIndex(line=>line.includes("下から4枚／CX 2枚"));
  assert.ok(combo>=0);
  assert.match(log[combo+1],/^ダメージ 2枚/);
  assert.match(log[combo+2],/^トリガー /);
  assert.deepEqual(ruleCounts(saved),[50,50]);
});

test("仮Lv3：カムバックでは連動せず、ゲート連動の効果ダメージはキャンセルされる",()=>{
  const other=launchRules("practice-level-three");
  enterGatePractice(other,"104");
  const before=snapshot(other).players[1].deck.slice(0,4).map(c=>c.uid);
  const off=attackWithGatePractice(other);
  assert.deepEqual(off.players[1].deck.slice(0,4).map(c=>c.uid),before);
  assert.ok(!off.bot.log.some(line=>line.includes("ゲートCXコンボ")));

  const page=launchRules("practice-level-three");
  enterGatePractice(page);
  page.run('const rival=players[1];botMove(rival,"deck",rival.deck.findIndex((c,i)=>i>=4&&c.cx),"deck")');
  const saved=attackWithGatePractice(page);
  const combo=saved.bot.log.findIndex(line=>line.includes("下から4枚／CX 2枚"));
  assert.ok(combo>=0);
  assert.match(saved.bot.log[combo+1],/^CXでダメージをキャンセル/);
  assert.match(saved.bot.log[combo+2],/^トリガー /);
  assert.deepEqual(ruleCounts(saved),[50,50]);
});

test("仮Lv3：山札が尽きてもリフレッシュを挟んで残りを落とす",()=>{
  const page=launchRules("practice-level-three");
  enterGatePractice(page);
  page.run('const rival=players[1];rival.waiting.push(...rival.deck.splice(1))');
  const saved=attackWithGatePractice(page);
  assert.ok(saved.bot.log.some(line=>line.includes("下から4枚")));
  assert.ok(saved.players[1].clock.length>=1);
  assert.deepEqual(ruleCounts(saved),[50,50]);
});

test("仮Lv3：落とした4枚にCXがなければ効果ダメージは発生しない",()=>{
  const page=launchRules("practice-level-three");
  enterGatePractice(page);
  page.run(`(()=>{
    const deck=players[1].deck;
    for(let i=0;i<4;i++)if(deck[i].cx){
      const index=deck.findIndex((c,j)=>j>=4&&!c.cx);
      [deck[i],deck[index]]=[deck[index],deck[i]];
    }
  })()`);
  const saved=attackWithGatePractice(page);
  const combo=saved.bot.log.findIndex(line=>line.includes("下から4枚／CX 0枚"));
  assert.ok(combo>=0);
  assert.match(saved.bot.log[combo+1],/^トリガー /);
  assert.deepEqual(ruleCounts(saved),[50,50]);
});

test("青の仮Lv0：山札上2枚を入れ替え、1ストックと手札のCXで控え室のCXを回収",()=>{
  const page=launchRules("practice-entry");
  const before=snapshot(page).players[0];
  assert.equal(page.run('autoRulePlace(0,players[0].hand.find(c=>c.id==="BOT/W000-110").uid,"back0")'),true);
  ruleButton(page,"上下を入れ替える");
  ruleButton(page,"能力を使う");
  ruleButton(page,"コストを支払う");
  assert.equal(page.get("dialogBody").children.some(el=>el.textContent==="仮キャラ クロックサーチ"),false);
  ruleButton(page,"仮CX ゲート");
  ruleButton(page,"選択を確定");
  ruleButton(page,"コストを支払う");
  ruleButton(page,"仮CX カムバック");
  ruleButton(page,"選択を確定");
  const saved=snapshot(page),board=saved.players[0];
  assert.deepEqual(board.deck.slice(-2).map(c=>c.uid),before.deck.slice(-2).reverse().map(c=>c.uid));
  assert.equal(board.stock.length,before.stock.length-1);
  assert.ok(board.hand.some(c=>c.id==="BOT/W000-104"));
  assert.ok(board.waiting.some(c=>c.id==="BOT/W000-105"));
  assert.deepEqual(ruleCounts(saved),[50,50]);
});

test("赤の仮Lv0：ストックを払って山札上をクロックに置き、Lv1以下をサーチし、アタックで別の巡遊者を強化",()=>{
  const page=launchRules("practice-entry");
  const before=snapshot(page).players[0];
  assert.equal(page.run('autoRulePlace(0,players[0].hand.find(c=>c.id==="BOT/W000-111").uid,"front0")'),true);
  ruleButton(page,"1ストック払う");
  assert.equal(page.get("dialogBody").children.some(el=>el.textContent==="仮キャラ ゲート連動"),false);
  ruleButton(page,"仮キャラ カムバック連動");
  ruleButton(page,"選択を確定");
  ruleButton(page,"公開を確認");
  let saved=snapshot(page),board=saved.players[0];
  assert.equal(board.clock.at(-1).uid,before.deck.at(-1).uid);
  assert.equal(board.stock.length,before.stock.length-1);
  assert.ok(board.hand.some(c=>c.id==="BOT/W000-106"));
  const oldPower=page.run('botStats(0,players[0].front1[0]).power');
  page.run('const mine=players[0];botMove(mine,"deck",mine.deck.findIndex(c=>!c.cx),"deck");setTurnPhase("attack");autoRuleAttack(0,"front0",mine.front0[0].uid,"direct")');
  assert.match(page.get("dialogTitle").textContent,/巡遊者/);
  ruleButton(page,"仮キャラ 3000");
  ruleButton(page,"選択を確定");
  assert.equal(page.run('botStats(0,players[0].front1[0]).power'),oldPower+1000);
  assert.equal(page.run('botStats(0,players[0].front0[0]).power'),1500);
  saved=snapshot(page);
  assert.deepEqual(ruleCounts(saved),[50,50]);
});

test("赤の仮Lv0：最後の山札をクロックに置いた後、リフレッシュしてサーチできる",()=>{
  const page=launchRules("practice-entry");
  const top=page.run('const mine=players[0];mine.waiting.push(...mine.deck.splice(0,mine.deck.length-1));mine.deck.at(-1).uid');
  page.run('autoRulePlace(0,players[0].hand.find(c=>c.id==="BOT/W000-111").uid,"front0")');
  ruleButton(page,"1ストック払う");
  ruleButton(page,"選ばず進む");
  const saved=snapshot(page);
  assert.equal(saved.players[0].clock[0].uid,top);
  assert.equal(saved.players[0].clock.length,2);
  assert.ok(saved.players[0].deck.length>0);
  assert.deepEqual(ruleCounts(saved),[50,50]);
});

test("赤Lv3：控え室のCX2枚以下で早出しし、手札を捨ててクロックをストックへ移す",()=>{
  const page=launchRules("practice-stock");
  const play='autoRulePlace(0,players[0].hand.find(c=>c.id==="BOT/W000-112").uid,"front0")';
  page.run('const mine=players[0];botMove(mine,"deck",mine.deck.findIndex(c=>c.cx),"waiting")');
  assert.equal(page.run(play),false);
  assert.match(page.get("notice").textContent,/必要 Lv3/);
  page.run('botMove(mine,"waiting",mine.waiting.length-1,"deck")');
  const before=snapshot(page).players[0];
  assert.equal(page.run(play),true);
  ruleButton(page,"能力を使う");
  ruleButton(page,"仮カウンター");
  ruleButton(page,"選択を確定");
  ruleButton(page,"コストを支払う");
  const saved=snapshot(page),own=saved.players[0];
  assert.equal(own.stock.length,before.stock.length-1);
  assert.equal(own.stock.at(-1).uid,before.clock.at(-1).uid);
  assert.equal(own.stock.at(-1).faceUp,false);
  assert.deepEqual(own.clock.map(c=>c.uid),before.clock.slice(0,-1).map(c=>c.uid));
  assert.ok(own.waiting.some(c=>c.id==="BOT/W000-004"));
  assert.equal(page.run('botEffectCard(players[0].front0[0]).level'),3);
  assert.equal(page.run('botStats(0,players[0].front0[0]).power'),9500);
  page.run('botMove(mine,"back0",0,"waiting");updateBoard()');
  assert.equal(page.run('botStats(0,players[0].front0[0]).power'),9000);
  assert.deepEqual(ruleCounts(snapshot(page)),[50,50]);
});

test("青Lv2イベント：自分が1ストック払い、相手のストックを相手の山札の上で同数入れ替える",()=>{
  const page=launchRules("practice-stock");
  const before=snapshot(page);
  page.run('cardClick(0,"hand",players[0].hand.findIndex(c=>c.id==="BOT/W000-113"))');
  assert.equal(page.get("dialogTitle").textContent,"仮イベント 光景");
  ruleButton(page,"プレイする");
  const saved=snapshot(page),[own,rival]=saved.players;
  assert.ok(saved.bot.log.some(line=>line.startsWith("光景・")));
  assert.equal(own.stock.length,before.players[0].stock.length-1);
  assert.deepEqual(own.deck,before.players[0].deck);
  assert.equal(own.waiting.at(-1).id,"BOT/W000-113");
  const count=before.players[1].stock.length;
  assert.deepEqual(rival.waiting.map(c=>c.uid),before.players[1].stock.map(c=>c.uid));
  assert.deepEqual(rival.stock.map(c=>c.uid),before.players[1].deck.slice(-count).reverse().map(c=>c.uid));
  assert.ok(rival.stock.every(c=>!c.faceUp));
  assert.deepEqual(ruleCounts(saved),[50,50]);
});

test("青Lv2イベント：途中のリフレッシュ後も残りのストックを補充する",()=>{
  const page=launchRules("practice-stock");
  page.run('const rival=players[1];rival.waiting.push(...rival.deck.splice(0,rival.deck.length-1))');
  const before=snapshot(page).players[1],count=before.stock.length;
  assert.equal(page.run('autoRulePlayEvent(0,players[0].hand.find(c=>c.id==="BOT/W000-113").uid)'),true);
  const saved=snapshot(page),rival=saved.players[1];
  assert.equal(rival.stock.length,count);
  assert.equal(rival.stock[0].uid,before.deck.at(-1).uid);
  assert.equal(rival.clock.length,1);
  assert.deepEqual(ruleCounts(saved),[50,50]);
});

test("絆：手札を1枚捨て、指定カードだけを控え室から回収して舞台で強化する",()=>{
  const page=launchRules("practice-bond");
  const play=(number,zone)=>page.run(`autoRulePlace(0,players[0].hand.find(c=>c.id==="BOT/W000-${number}").uid,"${zone}")`);
  const target=snapshot(page).players[0].waiting[0];
  assert.equal(play("115","back0"),true);
  ruleButton(page,"能力を使う");
  ruleButton(page,"仮カウンター");
  ruleButton(page,"選択を確定");
  ruleButton(page,"コストを支払う");
  assert.ok(!page.get("dialogBody").children.some(el=>el.textContent==="仮カウンター"));
  ruleButton(page,"仮キャラ 赤Lv1 5500");
  ruleButton(page,"選択を確定");
  const after=snapshot(page).players[0];
  assert.ok(after.hand.some(c=>c.uid===target.uid));
  assert.ok(after.waiting.some(c=>c.id==="BOT/W000-004"));
  assert.equal(play("114","front1"),true);
  assert.equal(page.run("botStats(0,players[0].front1[0]).power"),6500);
  page.run('botMove(players[0],"back0",0,"waiting");updateBoard()');
  assert.equal(page.run("botStats(0,players[0].front1[0]).power"),5500);
  assert.deepEqual(ruleCounts(snapshot(page)),[50,50]);
});

test("絆：回収前に中止しても手札コストと控え室のカードはそのまま",()=>{
  const page=launchRules("practice-bond");
  const before=snapshot(page).players[0];
  page.run('autoRulePlace(0,players[0].hand.find(c=>c.id==="BOT/W000-115").uid,"back0")');
  ruleButton(page,"能力を使う");
  ruleButton(page,"仮カウンター");
  ruleButton(page,"選択を確定");
  ruleButton(page,"コストを支払う");
  ruleButton(page,"効果確認を中止");
  const after=snapshot(page).players[0];
  assert.deepEqual(after.hand,before.hand.filter(c=>c.id!=="BOT/W000-115"));
  assert.deepEqual(after.waiting,before.waiting);
  assert.equal(after.back0[0].id,"BOT/W000-115");
});

test("青Lv2：正面がLv3の場合だけ攻撃したターンのパワーが＋6000される",()=>{
  for(const [lane,type,power] of [["front0","front",13500],["front0","side",13500],["front1","side",7500],["front2","direct",7500]]){
    const page=launchRules("practice-bond");
    if(type==="direct")page.run('botMove(players[1],"front0",0,"waiting")');
    const before=snapshot(page).players[0].stock.length;
    assert.equal(page.run(`autoRulePlace(0,players[0].hand.find(c=>c.id==="BOT/W000-116").uid,"${lane}")`),true);
    assert.equal(snapshot(page).players[0].stock.length,before-1);
    assert.equal(page.run(`botStats(0,players[0].${lane}[0]).power`),7500);
    page.run(`setTurnPhase("attack");autoRuleAttack(0,"${lane}",players[0].${lane}[0].uid,"${type}")`);
    assert.equal(page.run(`botStats(0,players[0].${lane}[0]).power`),power);
    if(type==="front")assert.equal(snapshot(page).players[1].front2[0].orientation,180);
    page.run("botEndTurn(0)");
    assert.equal(page.run(`botStats(0,players[0].${lane}[0]).power`),7500);
    assert.deepEqual(ruleCounts(snapshot(page)),[50,50]);
  }
});

test("青Lv0は正面が空いていない場合にサイドアタックを選択できない",()=>{
  const page=launchRules("practice-waiting");
  page.run('setTurnPhase("attack");autoRuleAskAttack(0,"front1",0)');
  assert.ok(page.get("dialogBody").children.some(el=>el.textContent==="フロントアタック"));
  assert.ok(!page.get("dialogBody").children.some(el=>el.textContent==="サイドアタック"));
  const pagesBefore=snapshot(page);
  page.run('autoRuleAttack(0,"front1",players[0].front1[0].uid,"side")');
  assert.deepEqual(snapshot(page),pagesBefore);
  page.run('closeResolution();botMove(players[1],"front1",0,"waiting");autoRuleAskAttack(0,"front1",0)');
  assert.ok(page.get("dialogBody").children.some(el=>el.textContent==="ダイレクトアタック"));
});

test("青Lv0は舞台と手札の両方から控え室に置かれた時に誘発し、Lv1以上のイベントも選べる",()=>{
  const page=launchRules("practice-waiting");
  const before=snapshot(page).players[0];
  page.run('manualTransfer(0,"front1",0,"waiting")');
  assert.match(page.get("dialogTitle").textContent,/控え室に置かれた時/);
  ruleButton(page,"能力を使う");
  ruleButton(page,"仮カウンター");
  ruleButton(page,"選択を確定");
  ruleButton(page,"山札を見る");
  assert.ok(!page.get("dialogBody").children.some(el=>el.textContent.startsWith("1．")&&el.textContent.endsWith("を手札へ")));
  ruleButton(page,"3．仮イベント 光景を手札へ");
  const after=snapshot(page).players[0];
  assert.equal(after.hand.at(-1).uid,before.deck.at(-3).uid);
  assert.deepEqual(after.waiting.slice(-3).map(c=>c.uid),[before.deck.at(-1).uid,before.deck.at(-2).uid,before.deck.at(-4).uid]);
  page.run('manualTransfer(0,"hand",players[0].hand.findIndex(c=>c.id==="BOT/W000-117"),"waiting")');
  assert.match(page.get("dialogTitle").textContent,/控え室に置かれた時/);
  ruleButton(page,"使わない");
  page.run('updateBoard()');
  assert.equal(page.get("dialog").open,false);
  assert.deepEqual(ruleCounts(snapshot(page)),[50,50]);
});

test("赤Lv0の2つの登場時能力は順に解決し、2つ目は特徴持ちだけを捨てて引く",()=>{
  const page=launchRules("practice-waiting");
  page.run('ruleSampleCards["004"].allTags=false');
  const before=snapshot(page).players[0];
  page.run('autoRulePlace(0,players[0].hand.find(c=>c.id==="BOT/W000-118").uid,"back0")');
  assert.match(page.get("dialogTitle").textContent,/公開と手札交換/);
  ruleButton(page,"手札に加えて1枚捨てる");
  ruleButton(page,"レベル1の仮キャラ");
  ruleButton(page,"選択を確定");
  assert.match(page.get("dialogTitle").textContent,/捨ててドロー/);
  ruleButton(page,"能力を使う");
  assert.ok(!page.get("dialogBody").children.some(el=>el.textContent==="仮カウンター"));
  ruleButton(page,"仮キャラ");
  ruleButton(page,"選択を確定");
  const after=snapshot(page).players[0];
  assert.deepEqual(after.deck.map(c=>c.uid),before.deck.slice(0,-2).map(c=>c.uid));
  assert.equal(after.hand.at(-1).uid,before.deck.at(-2).uid);
  assert.equal(after.waiting.at(-1).uid,before.deck.at(-1).uid);
  assert.deepEqual(ruleCounts(snapshot(page)),[50,50]);
});

test("赤Lv0：山札上に特徴がなければ元に戻し、控え室などからの登場では誘発しない",()=>{
  const page=launchRules("practice-waiting");
  page.run('ruleSampleCards["001"]={allTags:false};autoRulePlace(0,players[0].hand.find(c=>c.id==="BOT/W000-118").uid,"back0")');
  const before=page.run("players[0].deck.at(-1).uid");
  ruleButton(page,"山札の上に戻す");
  ruleButton(page,"使わない");
  assert.equal(snapshot(page).players[0].deck.at(-1).uid,before);
  page.run('manualTransfer(0,"back0",0,"waiting");manualTransfer(0,"waiting",players[0].waiting.length-1,"back0")');
  assert.equal(page.get("dialog").open,false);
  assert.deepEqual(ruleCounts(snapshot(page)),[50,50]);
});

test("最後の山札から控え室に置かれた青Lv0はリフレッシュ後も誘発する",()=>{
  const page=launchRules("practice-waiting");
  page.run(`runRuleOperation(done=>{
    const board=players[0];
    board.waiting.push(...board.deck.splice(0));
    botMove(board,"hand",board.hand.findIndex(c=>c.id==="BOT/W000-117"),"deck");
    done();
  });pullDeck(0,1,"waiting")`);
  assert.match(page.get("dialogTitle").textContent,/控え室に置かれた時/);
  ruleButton(page,"使わない");
  assert.equal(snapshot(page).players[0].clock.length,1);
  assert.deepEqual(ruleCounts(snapshot(page)),[50,50]);
});

test("赤Lv0：特徴を持つ手札がなければ任意ドローは使えない",()=>{
  const page=launchRules("practice-waiting");
  page.run(`for(const number of ["001","003","004"])ruleSampleCards[number]={...ruleSampleCards[number],allTags:false};
    practiceCards["117"].allTags=false;
    autoRulePlace(0,players[0].hand.find(c=>c.id==="BOT/W000-118").uid,"back0")`);
  ruleButton(page,"山札の上に戻す");
  assert.equal(page.get("dialog").open,false);
  assert.equal(snapshot(page).players[0].waiting.length,0);
  assert.deepEqual(ruleCounts(snapshot(page)),[50,50]);
});

const playEarlyBackupTest='autoRulePlace(0,players[0].hand.find(c=>c.id==="BOT/W000-119").uid,"front0")';
test("赤Lv3は特徴4体でLv2からプレイでき、強化と助太刀封じは相手ターン終了まで",()=>{
  const page=launchRules("practice-backup");
  page.run('botMove(players[0],"back1",0,"waiting")');
  assert.equal(page.run(playEarlyBackupTest),false);
  page.run('botMove(players[0],"waiting",0,"back1")');
  assert.equal(page.run(playEarlyBackupTest),true);
  assert.equal(snapshot(page).players[0].stock.length,1);
  assert.equal(page.run('botEffectCard(players[0].front0[0]).level'),3);
  assert.equal(page.run('botStats(0,players[0].front0[0]).power'),13500);
  page.run('finishEndTurn()');
  assert.equal(page.run('botStats(0,players[0].front0[0]).power'),13500);
  const prior=page.run('players[0].stock.length');
  page.run('setTurnPhase("attack");autoRuleAttack(1,"front2",players[1].front2[0].uid,"front")');
  assert.equal(page.get("dialogTitle").textContent,"カウンター");
  assert.ok(!page.get("dialogBody").children.some(button=>button.textContent.includes("助太刀3000")));
  assert.ok(page.get("dialogBody").children.some(button=>button.textContent==="仮カウンターを使う"));
  ruleButton(page,"使わない");
  assert.match(page.get("dialogTitle").textContent,/リバースしたキャラ/);
  ruleButton(page,"払わない");
  assert.equal(page.run('players[0].stock.length'),prior);
  assert.ok(page.run('players[0].hand.some(card=>card.id==="BOT/W000-120")'));
  page.run('finishEndTurn()');
  assert.equal(page.run('botStats(0,players[0].front0[0]).power'),9000);
  assert.deepEqual(ruleCounts(snapshot(page)),[50,50]);
});

test("赤Lv3のバトル中は相手が助太刀を使わず、リバースさせた相手を1ストックでクロックの上へ置く",()=>{
  const page=launchRules("practice-backup");
  page.run(playEarlyBackupTest);
  const target=snapshot(page).players[1].front2[0];
  const before=snapshot(page).players[0].stock.length;
  page.run('setTurnPhase("attack");autoRuleAttack(0,"front0",players[0].front0[0].uid,"front")');
  ruleButton(page,"1ストック払う");
  const {players}=snapshot(page);
  assert.equal(players[0].stock.length,before);
  assert.equal(players[1].clock.at(-1).uid,target.uid);
  assert.equal(players[1].front2.length,0);
  assert.ok(players[1].hand.some(card=>card.id==="BOT/W000-120"));
  assert.deepEqual(ruleCounts(snapshot(page)),[50,50]);
});

test("青Lv2の助太刀は色がなくてもフロントアタック時に1回使用でき、リバースさせた攻撃キャラを思い出へ送る",()=>{
  const page=launchRules("practice-backup");
  page.run('finishEndTurn();setTurnPhase("attack")');
  const before=snapshot(page);
  page.run('autoRuleAttack(1,"front1",players[1].front1[0].uid,"front")');
  ruleButton(page,"仮キャラ 助太刀3000・思い出送りを使う");
  const {players}=snapshot(page);
  assert.equal(players[0].stock.length,before.players[0].stock.length-1);
  assert.ok(players[0].waiting.some(card=>card.id==="BOT/W000-120"));
  assert.equal(page.run('botStats(0,players[0].front1[0]).power'),5500);
  assert.equal(players[1].memory.at(-1).uid,before.players[1].front1[0].uid);
  assert.equal(players[0].front1[0].orientation,0);
  assert.equal(page.get("dialog").open,false);
  assert.deepEqual(ruleCounts(snapshot(page)),[50,50]);
});

test("相手ターン中に赤Lv3が舞台へ移動した場合は、その相手ターンの終了時に強化が切れる",()=>{
  const page=launchRules("practice-backup");
  page.run(`finishEndTurn();const own=players[0];botMove(own,"hand",own.hand.findIndex(c=>c.id==="BOT/W000-119"),"waiting");
    manualTransfer(0,"waiting",own.waiting.length-1,"front0")`);
  assert.equal(page.run('botStats(0,players[0].front0[0]).power'),13500);
  page.run('finishEndTurn()');
  assert.equal(page.run('botStats(0,players[0].front0[0]).power'),9000);
});

test("赤青デッキは確定した50枚で初手・マリガンから開始する",()=>{
  const page=launchRules("red-blue-deck");
  const before=snapshot(page);
  assert.equal(before.phase,"mulligan");
  assert.equal(before.turn.number,1);
  assert.equal(before.turn.phase,"stand");
  assert.equal(before.decks[0].title,"赤青デッキ");
  assert.deepEqual(before.decks[1],before.decks[0]);
  assert.deepEqual(before.decks[0].cards.map(({id,num})=>[id.slice(-3),num]),[
    ["101",2],["102",2],["103",2],["104",4],["105",4],["106",4],["107",2],["108",2],["109",4],["110",2],
    ["111",2],["112",2],["113",2],["114",4],["115",2],["116",2],["117",2],["118",2],["119",2],["120",2]
  ]);
  assert.equal(before.decks[0].cards.filter(c=>c.cx).reduce((sum,c)=>sum+c.num,0),8);
  assert.ok(before.players.every(b=>b.deck.length===45&&b.hand.length===5));
  assert.deepEqual(ruleCounts(before),[50,50]);
  page.click("confirmMulligan");
  assert.equal(snapshot(page).phase,"active");
  assert.equal(page.run('botDefinition({id:"BOT/W000-119"}).stats.power'),9000);
  assert.deepEqual(ruleCounts(snapshot(page)),[50,50]);
});

test("赤青同士ではBotの効果選択を自動で処理し、トリガーの確認だけを挟む",()=>{
  const page=launchRules("red-blue-deck");
  page.click("confirmMulligan");
  page.run(`finishEndTurn();setTurnPhase("main");const b=players[1];
    for(const card of b.hand.splice(0))b.deck.unshift(card);
    const put=(id,to)=>botMove(b,"deck",b.deck.findIndex(c=>c.id.endsWith(id)),to);
    put("118","hand");put("106","hand");put("104","hand");put("114","hand");
    put("101","level");put("114","deck")`);
  page.click("botStep");
  assert.equal(snapshot(page).turn.phase,"climax");
  assert.ok(!page.get("dialog").open);
  assert.ok(snapshot(page).bot.log.some(line=>line.includes("公開と手札交換")));
  assert.ok(snapshot(page).players[1].front1.some(c=>c.id==="BOT/W000-106"));
  page.click("botStep");
  assert.equal(snapshot(page).players[1].cx[0].id,"BOT/W000-104");
  page.click("botStep");
  assert.equal(page.get("dialogTitle").textContent,"Botのトリガーチェック");
  ruleButton(page,"確認して進む");
  page.click("botStep");
  ruleButton(page,"確認して進む");
  assert.ok(snapshot(page).bot.log.some(line=>line.includes("CXコンボで")));
  assert.ok(!page.get("dialog").open);
  assert.deepEqual(ruleCounts(snapshot(page)),[50,50]);
});

test("赤青同士のBotが控え室誘発のコストと対象を自動で選ぶ",()=>{
  const page=launchRules("red-blue-deck");
  page.click("confirmMulligan");
  page.run(`const b=players[1];const put=(id,to)=>botMove(b,"deck",b.deck.findIndex(c=>c.id.endsWith(id)),to);
    put("114","deck");
    runRuleOperation(done=>{put("117","waiting");done()})`);
  assert.ok(!page.get("dialog").open);
  assert.ok(snapshot(page).bot.log.some(line=>line.includes("Lv1以上を探すで")));
  assert.ok(snapshot(page).players[1].hand.some(c=>c.id==="BOT/W000-114"));
  assert.deepEqual(ruleCounts(snapshot(page)),[50,50]);
});

test("赤青デッキの初手とカード詳細に、画像なしで名前・性能・効果を表示する",()=>{
  const page=launchRules("red-blue-deck");
  const flatten=node=>[node.textContent,...node.children.flatMap(flatten)].join(" ");
  const rows=page.get("mulliganCards").children;
  assert.equal(rows.length,5);
  for(const row of rows)assert.match(flatten(row),/仮.+トリガー.+残す/);
  rows[0].onclick();
  assert.match(flatten(page.get("mulliganCards").children[0]),/交換$/);
  page.click("confirmMulligan");
  page.run('showCardDetail({id:"BOT/W000-119"})');
  assert.match(page.get("dialogTitle").textContent,/早出し・助太刀封じ/);
  assert.match(flatten(page.get("dialogBody")),/パワー9000.+助太刀不可.+1ストック/);
});

test("赤青同士の自分のトリガーを確認するまでストックに置かない",()=>{
  const page=launchRules("red-blue-deck");
  page.click("confirmMulligan");
  page.run(`const own=players[0];
    while(own.hand.length)botMove(own,"hand",0,"deck");
    const put=(n,z)=>botMove(own,"deck",own.deck.findIndex(c=>c.id.endsWith(n)),z);
    put("101","front0");put("104","deck");
    setTurnPhase("attack");autoRuleAttack(0,"front0",own.front0[0].uid,"direct")`);
  assert.equal(page.get("dialogTitle").textContent,"自分のトリガーチェック");
  const [list,note]=page.get("dialogBody").children;
  assert.equal(list.children[0].children[0].dataset.cardNumber,"104");
  assert.match(note.textContent,/カムバック/);
  assert.equal(page.run("players[0].stock.length"),0);
  ruleButton(page,"確認して進む");
  ruleButton(page,"選ばず進む");
  assert.equal(snapshot(page).players[0].stock.at(-1).id,"BOT/W000-104");
  assert.deepEqual(ruleCounts(snapshot(page)),[50,50]);
});

test("選択解除でカードを動かさず、占有枠は確認するまで入れ替えない",()=>{
  const page=launchRules("red-blue-deck");
  page.click("confirmMulligan");
  page.run(`setTurnPhase("main");const own=players[0];
    while(own.hand.length)botMove(own,"hand",0,"deck");
    const put=(id,zone)=>botMove(own,"deck",own.deck.findIndex(c=>c.id.endsWith(id)),zone);
    put("101","front0");put("102","hand");selected={p:0,z:"hand",index:0};renderTurnControls()`);
  assert.equal(page.get("clearSelection").hidden,false);
  page.click("clearSelection");
  assert.equal(page.run("selected"),null);
  const before=snapshot(page);
  page.run('selected={p:0,z:"hand",index:0};zoneClick(0,"front0")');
  assert.match(page.get("dialogTitle").textContent,/入れ替えますか/);
  assert.deepEqual(snapshot(page),before);
  ruleButton(page,"キャンセル");
  assert.equal(page.run("selected"),null);
  assert.deepEqual(snapshot(page),before);
  page.run('selected={p:0,z:"hand",index:0};zoneClick(0,"front0")');
  ruleButton(page,"入れ替える");
  const own=snapshot(page).players[0];
  assert.equal(own.front0[0].id,"BOT/W000-102");
  assert.equal(own.waiting.at(-1).id,"BOT/W000-101");
});
