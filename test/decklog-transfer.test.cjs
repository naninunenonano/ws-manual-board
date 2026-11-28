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
  vm.runInContext(read("stella-effects.js"),context);
  vm.runInContext(read("frieren-effects.js"),context);
  vm.runInContext(read("oshi-effects.js"),context);
  vm.runInContext(read("bot-match.js"),context);
  vm.runInContext(read("bot-deck-editor.js"),context);
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
  assert.equal(page.get("dialogTitle").textContent,"控え室に置く手札を選ぶ");
  assert.ok(page.get("dialogBody").children.some(el=>el.textContent==="使わない"));
  click("黎明の刻 レイス");
  assert.equal(page.get("dialogTitle").textContent,"登場させる舞台の枠を選ぶ");
  click("後列②");
  assert.equal(snapshot(page).players[0].back1[0].botLevel,2);
  assert.equal(page.run("botStats(0,players[0].front0[0]).power"),7000);
  page.run('move(0,"hand",players[0].hand.findIndex(card=>card.id==="STS/W140-031"),"cx")');
  assert.equal(page.run("botStats(0,players[0].front0[0]).power"),8000);
  assert.equal(page.run("botStats(0,players[0].front0[0]).soul"),2);
  page.run('match.turn.phase="attack";startAutoAttack(0,"front0",0)');
  click("黎明の刻 レイス");
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
  assert.equal(Boolean(page.get("dialog").open),false);
  assert.equal(page.run("selected"),null);
  page.run('botMove(players[0],"waiting",0,"level")');
  page.run('cardClick(0,"hand",2)');
  assert.equal(Boolean(page.get("dialog").open),false);
  assert.match(page.get("stagePlacementHint").textContent,/置く枠をタップ/);
  assert.equal(page.get("clearSelection").hidden,false);
  page.click("clearSelection");
  assert.equal(page.run("selected"),null);
  assert.equal(page.get("stagePlacementHint").hidden,true);
  page.run('cardClick(0,"hand",2);zoneClick(0,"front1")');
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
  const selectionBefore=page.run("JSON.stringify(selected)");
  page.run('cardClick(0,"hand",2)');
  assert.equal(Boolean(page.get("dialog").open),false);
  assert.equal(page.run("JSON.stringify(selected)"),selectionBefore);
  assert.equal(page.run('autoRulePlace(0,players[0].hand[2].uid,"front2")'),false);
  assert.equal(snapshot(page).players[0].front2.length,0);
  assert.deepEqual(ruleCounts(snapshot(page)),[50,50]);
});

test("自動ルール：CX、アタック時能力、トリガー、カウンター、ダメージ、バトルの順に解決する",()=>{
  const page=launchRules();
  page.run('autoRulePlace(0,players[0].hand[2].uid,"front1");advanceTurn()');
  const before=snapshot(page);
  page.run('cardClick(0,"hand",3)');
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
  assert.match(page.get("dialogTitle").textContent,/山札を上から1枚ずつ見る/);
  const before=page.run("players[0].deck.length");
  ruleButton(page,"1枚見る");
  for(let n=1;n<4;n++)ruleButton(page,"次の1枚を見る");
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
  ruleButton(page,"1．仮キャラ 山札調整・CX回収・登場時・山札の上2枚");
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
  assert.equal(Boolean(page.get("dialog").open),false);
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
  ruleButton(page,"1枚見る");
  for(let n=1;n<4;n++)ruleButton(page,"次の1枚を見る");
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
  ruleButton(page,"1．仮キャラ 特徴公開・手札交換・登場時・《巡遊者》公開と手札交換");
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
  ruleButton(page,"1．仮キャラ 特徴公開・手札交換・登場時・《巡遊者》公開と手札交換");
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

test("赤青同士ではBotの効果選択を自動で処理し、トリガーとダメージの公開を確認する",()=>{
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
  assert.ok(["front0","front1","front2"].some(slot=>snapshot(page).players[1][slot].some(c=>c.id==="BOT/W000-106")));
  page.click("botStep");
  assert.equal(snapshot(page).players[1].cx[0]?.id,"BOT/W000-104");
  page.run(`
    const deck=players[0].deck;
    const cancel=deck.filter(c=>c.cx).slice(0,3);
    for(const card of cancel)deck.push(...deck.splice(deck.indexOf(card),1));
  `);
  let sawCombo=false;
  for(let attack=0;attack<3;attack++){
    page.click("botStep");
    sawCombo||=snapshot(page).bot.log.some(line=>line.includes("CXコンボで"));
    assert.equal(page.get("dialogTitle").textContent,"Botのトリガーチェック");
    ruleButton(page,"確認して進む");
    assert.match(page.get("dialogTitle").textContent,/自分の.*ダメージ/);
    ruleButton(page,"確認して進む");
  }
  assert.ok(sawCombo);
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
  assert.match(page.get("dialogTitle").textContent,/Botの.*ダメージ/);
  ruleButton(page,"確認して進む");
  assert.equal(snapshot(page).players[0].stock.at(-1).id,"BOT/W000-104");
  assert.deepEqual(ruleCounts(snapshot(page)),[50,50]);
});

test("選択解除でカードを動かさず、占有枠は確認するまで入れ替えない",()=>{
  const page=launchRules("red-blue-deck");
  page.click("confirmMulligan");
  page.run(`setTurnPhase("main");const own=players[0];
    while(own.hand.length)botMove(own,"hand",0,"deck");
    const put=(id,zone)=>botMove(own,"deck",own.deck.findIndex(c=>c.id.endsWith(id)),zone);
    put("101","front0");put("102","hand");cardClick(0,"hand",0)`);
  assert.equal(page.get("clearSelection").hidden,false);
  page.click("clearSelection");
  assert.equal(page.run("selected"),null);
  const before=snapshot(page);
  page.run('cardClick(0,"hand",0);zoneClick(0,"front0")');
  assert.match(page.get("dialogTitle").textContent,/入れ替えますか/);
  assert.deepEqual(snapshot(page),before);
  ruleButton(page,"キャンセル");
  assert.equal(page.run("selected"),null);
  assert.deepEqual(snapshot(page),before);
  page.run('cardClick(0,"hand",0);zoneClick(0,"front0")');
  ruleButton(page,"入れ替える");
  const own=snapshot(page).players[0];
  assert.equal(own.front0[0].id,"BOT/W000-102");
  assert.equal(own.waiting.at(-1).id,"BOT/W000-101");
});

test("オトハをLv2でプレイし、登場時のドロー後にリフレッシュを挟んで舞台の枠を選べる",async()=>{
  const page=launchRules();
  await page.settle();
  page.run(`
    var testOtohaBoard=players[0];
    var testOtohaCard=(uid,id)=>({uid,id,faceUp:true,orientation:0,cx:false});
    for(const zone of zones)testOtohaBoard[zone]=[];
    testOtohaBoard.hand.push(testOtohaCard("otoha","STS/W140-003"));
    testOtohaBoard.level.push(testOtohaCard("green","STS/W140-001"),testOtohaCard("level2","BOT/W000-001"));
    for(const uid of ["stock1","stock2"])testOtohaBoard.stock.push(testOtohaCard(uid,"BOT/W000-006"));
    for(const uid of ["memory1","memory2"])testOtohaBoard.memory.push(testOtohaCard(uid,"BOT/W000-001"));
    testOtohaBoard.front1.push({...testOtohaCard("occupied","BOT/W000-001"),
      markers:[{card:testOtohaCard("marker","BOT/W000-001"),faceUp:false}]});
    testOtohaBoard.deck.push({...testOtohaCard("drawn","BOT/W000-003"),faceUp:false});
    testOtohaBoard.waiting.push(testOtohaCard("refresh1","BOT/W000-001"),testOtohaCard("refresh2","BOT/W000-001"));
  `);
  assert.equal(page.run('autoRuleHandLevel(0,testOtohaBoard.hand[0],botDefinition(testOtohaBoard.hand[0]))'),2);
  page.run('cardClick(0,"hand",0)');
  page.run('zoneClick(0,"front0")');
  assert.equal(page.run("testOtohaBoard.stock.length"),0);
  page.run('testOtohaBoard.front0[0].markers=[{card:testOtohaCard("own-marker","BOT/W000-001"),faceUp:false}]');
  assert.equal(page.run("botStats(0,testOtohaBoard.front0[0]).power"),11000);
  page.run("delete testOtohaBoard.front0[0].markers");
  assert.equal(page.run("botStats(0,testOtohaBoard.front0[0]).power"),6000);
  ruleButton(page,"1枚まで引き、コスト1以下のキャラを舞台へ");
  ruleButton(page,"行う");
  assert.equal(page.run("testOtohaBoard.clock.length"),1);
  assert.equal(page.run("testOtohaBoard.deck.length"),3);
  ruleButton(page,"レベル1の仮キャラ");
  ruleButton(page,"選択を確定");
  const replace=page.get("dialogBody").children.find(el=>el.textContent?.startsWith("前列②（"));
  assert.ok(replace);
  replace.onclick();
  assert.equal(page.run("testOtohaBoard.front1[0].uid"),"drawn");
  assert.equal(page.run("testOtohaBoard.front1.length"),1);
  assert.equal(page.run("testOtohaBoard.waiting.some(c=>c.uid==='occupied')"),true);
  assert.equal(page.run("testOtohaBoard.waiting.some(c=>c.uid==='marker'&&c.faceUp)"),true);
  assert.equal(page.run("testOtohaBoard.stock.length"),0);
  assert.equal(page.run("ruleBusy"),false);
});

test("ナツカのCXコンボとCXトリガー時の回復をアタック中に解決する",async()=>{
  const page=launchRules();
  await page.settle();
  page.run(`
    var natsukaBoard=players[0], natsukaRival=players[1];
    var makeNatsukaCard=(uid,id,cx=false)=>({uid,id,cx,faceUp:true,orientation:0});
    for(const board of players)for(const zone of zones)board[zone]=[];
    natsukaBoard.front0.push({...makeNatsukaCard("natsuka","STS/W140-004"),
      markers:[{card:makeNatsukaCard("marker","BOT/W000-001"),faceUp:false}]});
    natsukaBoard.back0.push(makeNatsukaCard("ally","STS/W140-001"));
    natsukaBoard.cx.push(makeNatsukaCard("dream","STS/W140-032R",true));
    natsukaBoard.hand.push(makeNatsukaCard("discard","BOT/W000-001"));
    for(const uid of ["old","close","top"])natsukaBoard.clock.push(makeNatsukaCard(uid,"BOT/W000-001"));
    natsukaBoard.deck.push(makeNatsukaCard("remain","BOT/W000-001"),makeNatsukaCard("trigger","BOT/W000-012",true));
    for(let i=0;i<8;i++)natsukaRival.deck.push(makeNatsukaCard("r"+i,"BOT/W000-001"));
    natsukaRival.deck.push(makeNatsukaCard("cancel","BOT/W000-012",true));
    match.turn.phase="attack";
    autoRuleAttack(0,"front0","natsuka","direct");
  `);
  assert.match(page.get("dialogTitle").textContent,/手札を1枚捨てて/);
  ruleButton(page,"仮キャラ");
  assert.equal(page.run("natsukaRival.waiting[0].uid"),"cancel");
  assert.equal(page.run("natsukaBoard.waiting[0].uid"),"discard");
  assert.equal(page.run("natsukaBoard.stock[0].uid"),"trigger");
  ruleButton(page,"2枚回復");
  assert.equal(page.run("natsukaBoard.clock.map(c=>c.uid).join()"),"old");
  assert.equal(page.run("natsukaRival.clock.length"),4);
  assert.equal(page.run("match.bot.uses['natsuka:cx-trigger-damage-or-heal']"),1);
  assert.equal(page.run("ruleBusy"),false);
  page.run('botEndTurn(0)');
  assert.equal(page.run("natsukaBoard.front0[0].gainedAbilities"),undefined);
});

test("風に揺れる気持ち ナツカは1枚の時だけ風を与え、起動で同じ枠に交代する",async()=>{
  const page=launchRules();
  await page.settle();
  page.run(`
    var windBoard=players[0],windRival=players[1];
    var windCard=(uid,id="STS/W140-019",cx=false)=>({uid,id,cx,faceUp:true,orientation:0});
    for(const board of players)for(const zone of zones)board[zone]=[];
    windBoard.front1.push(windCard("small"));
    windBoard.hand.push(windCard("large","STS/W140-004"));
    windRival.front0.push(windCard("opponent"));
    windBoard.level.push(...["l1","l2","l3"].map(uid=>windCard(uid)));
    windBoard.deck.push(windCard("remaining"));
    var treasure=windCard("treasure","STS/W140-032",true);
  `);
  assert.equal(page.run('botTriggerIcons(0,treasure).join()'),"トレジャー,風");
  page.run('windBoard.back0.push(windCard("another"))');
  assert.equal(page.run('botTriggerIcons(0,treasure).join()'),"トレジャー");
  page.run('windBoard.back0.pop(); runRuleOperation(done=>botResolveAttackTrigger(0,treasure,()=>null,done))');
  ruleButton(page,"風から解決");
  ruleButton(page,"前列①の風に揺れる気持ち ナツカ");
  ruleButton(page,"ストックに置かない");
  assert.equal(page.run('windBoard.hand.at(-1).uid'),"treasure");
  assert.equal(page.run('windRival.hand[0].uid'),"opponent");
  page.run(`
    windRival.back0.push(windCard("back-row"));
    var secondTreasure=windCard("second-treasure","STS/W140-032",true);
    runRuleOperation(done=>botResolveAttackTrigger(0,secondTreasure,()=>null,done));
  `);
  ruleButton(page,"トレジャーから解決");
  ruleButton(page,"ストックに置かない");
  ruleButton(page,"戻さない");
  assert.equal(page.run("windBoard.hand.at(-1).uid"),"second-treasure");
  assert.equal(page.run("windRival.back0[0].uid"),"back-row");
  page.run(`
    windBoard.memory.push(windCard("kanache","STS/W140-024"));
    windBoard.clock.push(windCard("heal"));
    selected={p:0,z:"front1",index:0};openBotAbility();
  `);
  ruleButton(page,"起動・爽風の才媛 ナツカに交代");
  ruleButton(page,"能力を使う");
  ruleButton(page,"同じ枠に出す");
  assert.equal(page.get("dialogTitle").textContent,"次に解決する効果を選ぶ");
  ruleButton(page,"2．回想・マーカーを置く");
  ruleButton(page,"思い出の1枚目をマーカーにする");
  ruleButton(page,"回復する");
  assert.equal(page.run("windBoard.front1[0].uid"),"large");
  assert.equal(page.run("windBoard.memory.length"),0);
  assert.equal(page.run("windBoard.front1[0].markers[0].card.uid"),"kanache");
  assert.equal(page.run("windBoard.front1[0].markers[0].faceUp"),true);
  assert.equal(page.run("windBoard.clock.length"),0);
  assert.equal(page.run("windBoard.waiting.some(card=>card.uid==='small')"),true);
  assert.equal(page.run("windBoard.front1[0].turnPowerBonus"),2000);
  assert.equal(page.run("windBoard.stock.length"),0);
  page.run("botEndTurn(0)");
  assert.equal(page.run("windBoard.front1[0].turnPowerBonus"),undefined);
});

test("カナーチェは思い出に移って回収し、登場したキャラのマーカーになり、離れると思い出に戻る",async()=>{
  const page=launchRules();
  await page.settle();
  page.run(`
    var kaBoard=players[0],kaCard=(uid,id="STS/W140-001")=>({uid,id,faceUp:true,cx:false,orientation:0});
    for(const board of players)for(const zone of zones)board[zone]=[];
    kaBoard.front0.push(kaCard("ka","STS/W140-024"));
    kaBoard.waiting.push(kaCard("salvage"));
    selected={p:0,z:"front0",index:0};
    openBotAbility();
  `);
  ruleButton(page,"起動・思い出にしてキャラを回収");
  ruleButton(page,"能力を使う");
  ruleButton(page,"コストを支払う");
  assert.equal(page.run("kaBoard.memory[0].uid"),"ka");
  const eligible=page.get("dialogBody").children.find(el=>el.textContent.includes("レイス")&&el.onclick);
  assert.ok(eligible);
  eligible.onclick();
  ruleButton(page,"選択を確定");
  assert.equal(page.run("kaBoard.hand[0].uid"),"salvage");
  page.run(`
    kaBoard.waiting.push(kaCard("host"));
    manualTransfer(0,"waiting",0,"front0");
  `);
  ruleButton(page,"思い出の1枚目をマーカーにする");
  assert.equal(page.run("kaBoard.front0[0].markers[0].faceUp"),true);
  page.run(`
    kaBoard.deck.push(kaCard("second"),kaCard("first"));
    runRuleOperation(done=>botDispatch(kaBoard.front0[0],"on_attack",done,0));
  `);
  ruleButton(page,"1枚見る");
  ruleButton(page,"次の1枚を見る");
  ruleButton(page,"上下を入れ替える");
  assert.equal(page.run("kaBoard.deck.map(c=>c.uid).join()"),"first,second");
  page.run('botMove(kaBoard,"front0",0,"waiting")');
  assert.equal(page.run("kaBoard.memory[0].uid"),"ka");
  assert.equal(page.run("kaBoard.waiting[0].uid"),"host");
});

test("魔王ちゃんは他のキャラの最初のアタックでソウルを下げ、山札上のレベル0をストックへ置く",async()=>{
  const page=launchRules();
  await page.settle();
  page.run(`
    var maouBoard=players[0],mkMaou=(uid,id,cx=false)=>({uid,id,cx,faceUp:true,orientation:0});
    for(const board of players)for(const zone of zones)board[zone]=[];
    maouBoard.back0.push(mkMaou("maou","STS/W140-008"));
    maouBoard.front0.push(mkMaou("attacker","STS/W140-004"));
    maouBoard.deck.push(mkMaou("second","STS/W140-004"),mkMaou("first","STS/W140-008"));
    runRuleOperation(done=>botDispatch(maouBoard.back0[0],"on_attack",done));
    runRuleOperation(done=>botDispatch(maouBoard.front0[0],"on_attack",done));
  `);
  ruleButton(page,"使わない");
  assert.equal(page.run("maouBoard.deck.at(-1).uid"),"first");
  assert.equal(page.run("maouBoard.front0[0].botSoul"),undefined);
  page.run('runRuleOperation(done=>botDispatch(maouBoard.front0[0],"on_attack",done))');
  ruleButton(page,"使う");
  ruleButton(page,"ストックに置く");
  assert.equal(page.run("maouBoard.front0[0].botSoul"),1);
  assert.equal(page.run("maouBoard.stock[0].uid"),"first");
  page.run('runRuleOperation(done=>botDispatch(maouBoard.front0[0],"on_attack",done))');
  assert.equal(page.run("maouBoard.front0[0].botSoul"),1);
  page.run('botEndTurn(0)');
  assert.equal(page.run("maouBoard.front0[0].botSoul"),2);
  page.run('runRuleOperation(done=>botDispatch(maouBoard.front0[0],"on_attack",done))');
  ruleButton(page,"使う");
  ruleButton(page,"元に戻す");
  assert.equal(page.run("maouBoard.deck.at(-1).uid"),"second");
});

test("魔王ちゃんの集中は4枚をめくり、CXの枚数まで控え室からキャラを回収できる",async()=>{
  const page=launchRules();
  await page.settle();
  page.run(`
    var maouBoard=players[0],mkMaou=(uid,id="STS/W140-008",cx=false)=>({uid,id,cx,faceUp:true,orientation:0});
    for(const board of players)for(const zone of zones)board[zone]=[];
    maouBoard.back0.push(mkMaou("maou"));
    maouBoard.stock.push(mkMaou("pay"));
    maouBoard.deck.push(mkMaou("remain"),mkMaou("reveal"),mkMaou("cx","STS/W140-032",true),mkMaou("reveal2"),mkMaou("reveal3"));
    selected={p:0,z:"back0",index:0};
    openBotAbility();
  `);
  ruleButton(page,"集中（1ストック・自身レスト）");
  const publicCards=page.get("dialogBody").children[0].children;
  assert.match(publicCards[0].textContent,/公開カード 4枚（CX 1枚）/);
  assert.match(publicCards[1].children[2].children[0].src,/wsstsw140_152\.jpg$/);
  const target=page.get("dialogBody").children.find(el=>el.textContent==="魂の取引 魔王ちゃん");
  assert.match(target.className,/effect-card-choice/);
  assert.match(target.children[0].src,/wsstsw140_132\.jpg$/);
  ruleButton(page,"魂の取引 魔王ちゃん");
  ruleButton(page,"回収を確定");
  assert.equal(page.run("maouBoard.back0[0].orientation"),90);
  assert.equal(page.run("maouBoard.stock.length"),0);
  assert.equal(page.run("maouBoard.waiting.length"),4);
  assert.equal(page.run("maouBoard.hand[0].uid"),"pay");
  assert.equal(page.run("maouBoard.deck[0].uid"),"remain");
});

test("コゼットが付与した能力は自分がリバースした時にバトル相手とクロック上を入れ替える",async()=>{
  const page=launchRules();
  await page.settle();
  page.run(`
    var drinkBoard=players[0],drinkRival=players[1];
    var drinkCard=(uid,id="BOT/W000-001")=>({uid,id,faceUp:true,cx:false,orientation:0});
    for(const board of players)for(const zone of zones)board[zone]=[];
    drinkBoard.front0.push(drinkCard("cosette","STS/W140-023"));
    drinkBoard.back0.push(drinkCard("ally"));
    drinkRival.front2.push(drinkCard("target","STS/W140-004"));
    drinkRival.level.push(drinkCard("level"));
    drinkRival.clock.push(drinkCard("older"),drinkCard("top"));
    drinkRival.deck.push(drinkCard("deck"));
    runRuleOperation(done=>botDispatch(drinkBoard.front0[0],"from_hand_to_stage",done));
  `);
  ruleButton(page,"ドリンクの誘惑 コゼット");
  ruleButton(page,"仮キャラ");
  ruleButton(page,"選択を確定");
  assert.equal(page.run("drinkBoard.back0[0].gainedAbilities.length"),1);
  page.run(`
    runRuleOperation(done=>autoRuleResolveReversals(botBattle(0,"front0","cosette","target","front2"),done));
  `);
  assert.equal(page.run("drinkBoard.front0[0].orientation"),180);
  assert.equal(page.run("drinkRival.front2[0].orientation"),0);
  ruleButton(page,"クロックを入れ替える");
  assert.equal(page.run("drinkRival.waiting[0].uid"),"top");
  assert.equal(page.run("drinkRival.clock.map(c=>c.uid).join()"),"older,target");
  assert.equal(page.run("drinkRival.front2.length"),0);
  page.run("botEndTurn(0)");
  assert.equal(page.run("drinkBoard.back0[0].gainedAbilities"),undefined);
});

test("コゼットは相手の山札上を非公開で確認し、順番を変えない",async()=>{
  const page=launchRules();
  await page.settle();
  page.run(`
    var coBoard=players[0], coRival=players[1];
    var coCard=(uid,id="BOT/W000-001",cx=false)=>({uid,id,faceUp:true,cx,orientation:0});
    for(const board of players)for(const zone of zones)board[zone]=[];
    coBoard.front0.push(coCard("co","STS/W140-013"));
    coRival.deck.push(coCard("bottom"),coCard("second"),coCard("first"));
    runRuleOperation(done=>botDispatch(coBoard.front0[0],"from_hand_to_stage",done,0));
  `);
  ruleButton(page,"1枚見る");
  ruleButton(page,"次の1枚を見る");
  ruleButton(page,"元の順番で戻す");
  assert.equal(page.run("coRival.deck.map(c=>c.uid).join()"),"bottom,second,first");
  assert.equal(page.run("ruleBusy"),false);
});

test("コゼットは自身を控え室に置き、双方から2枚落とし、相手の前列だけを戻せる",async()=>{
  const page=launchRules();
  await page.settle();
  page.run(`
    var coBoard=players[0], coRival=players[1];
    var coCard=(uid,id="BOT/W000-001",cx=false)=>({uid,id,faceUp:true,cx,orientation:0});
    for(const board of players)for(const zone of zones)board[zone]=[];
    coBoard.front0.push(coCard("co","STS/W140-013"));
    coBoard.deck.push(coCard("a0"),coCard("a1"),coCard("a2"));
    coRival.deck.push(coCard("b0"),coCard("b1"),coCard("b2","BOT/W000-012",true));
    coRival.front0.push(coCard("target","STS/W140-004"));
    coRival.back0.push(coCard("back","STS/W140-013"));
    selected={p:0,z:"front0",index:0};
    openBotAbility();
  `);
  ruleButton(page,"起動・双方の山札を落として前列を戻す");
  ruleButton(page,"能力を使う");
  ruleButton(page,"コストを支払う");
  assert.equal(page.run("coBoard.waiting.map(c=>c.uid).join()"),"co,a2,a1");
  assert.equal(page.run("coRival.waiting.map(c=>c.uid).join()"),"b2,b1");
  ruleButton(page,"爽風の才媛 ナツカ");
  ruleButton(page,"選択を確定");
  assert.equal(page.run("coRival.hand[0].uid"),"target");
  assert.equal(page.run("coRival.back0[0].uid"),"back");
  assert.equal(page.run("ruleBusy"),false);
});

test("コゼットは山札切れでリフレッシュを挟み、CXがなければ対象を選ばない",async()=>{
  const page=launchRules();
  await page.settle();
  page.run(`
    var coBoard=players[0], coRival=players[1];
    var coCard=(uid,id="BOT/W000-001")=>({uid,id,faceUp:true,cx:false,orientation:0});
    for(const board of players)for(const zone of zones)board[zone]=[];
    coBoard.front0.push(coCard("co","STS/W140-013"));
    coBoard.waiting.push(coCard("w1"),coCard("w2"),coCard("w3"));
    coBoard.deck.push(coCard("a2"));
    coRival.deck.push(coCard("b0"),coCard("b1"),coCard("b2"));
    coRival.front0.push(coCard("target","STS/W140-004"));
    selected={p:0,z:"front0",index:0};
    openBotAbility();
  `);
  ruleButton(page,"起動・双方の山札を落として前列を戻す");
  ruleButton(page,"能力を使う");
  ruleButton(page,"コストを支払う");
  assert.equal(page.run("coBoard.clock.length"),1);
  assert.equal(page.run("coBoard.waiting.length"),1);
  assert.equal(page.run("coRival.waiting.length"),2);
  assert.equal(page.run("coRival.front0[0].uid"),"target");
  assert.equal(page.run("ruleBusy"),false);
});

test("アヤメの登場時は山札を選んだ順に戻して相手のストックを入れ替える",async()=>{
  const page=launchRules();
  await page.settle();
  page.run(`
    var ayameBoard=players[0], ayameRival=players[1];
    var ayameCard=(uid,id="BOT/W000-001",faceUp=true)=>({uid,id,faceUp,cx:false,orientation:0});
    for(const board of players)for(const zone of zones)board[zone]=[];
    ayameBoard.front0.push(ayameCard("ayame","STS/W140-076"));
    ayameBoard.deck.push(ayameCard("lower"),ayameCard("upper"));
    ayameRival.deck.push(ayameCard("rival-deck","BOT/W000-001",false));
    ayameRival.stock.push(ayameCard("old-stock","BOT/W000-001",false));
    runRuleOperation(done=>botDispatch(ayameBoard.front0[0],"from_hand_to_stage",done,0));
  `);
  ruleButton(page,"1枚見る");
  ruleButton(page,"次の1枚を見る");
  ruleButton(page,"2．仮キャラ");
  ruleButton(page,"1．仮キャラ");
  ruleButton(page,"選択を確定");
  assert.equal(page.run("ayameBoard.deck.map(c=>c.uid).join()"),"upper,lower");
  assert.equal(page.run("ayameRival.stock.length"),1);
  assert.equal(page.run("ayameRival.stock[0].faceUp"),false);
  assert.equal(page.run("ayameRival.waiting.length"),0);
  assert.equal(page.run("[...ayameRival.stock,...ayameRival.deck].map(c=>c.uid).sort().join()"),"old-stock,rival-deck");
  assert.equal(page.run("ruleBusy"),false);
});

test("アヤメは手札を1枚払ったアタックだけ2回トリガーし、両方のソウルを加える",async()=>{
  const page=launchRules();
  await page.settle();
  page.run(`
    var ayameBoard=players[0], ayameRival=players[1];
    var ayameCard=(uid,id="BOT/W000-001")=>({uid,id,faceUp:true,cx:false,orientation:0});
    for(const board of players)for(const zone of zones)board[zone]=[];
    ayameBoard.front0.push(ayameCard("ayame","STS/W140-076"));
    ayameBoard.hand.push(ayameCard("discard"),ayameCard("decline"));
    ayameBoard.deck.push(ayameCard("later"),ayameCard("second","STS/W140-076"),ayameCard("first","STS/W140-076"));
    for(let i=0;i<13;i++)ayameRival.deck.push(ayameCard("r"+i));
    match.turn.phase="attack";
    autoRuleAttack(0,"front0","ayame","direct");
  `);
  assert.match(page.get("dialogTitle").textContent,/手札を1枚捨てて/);
  ruleButton(page,"仮キャラ");
  assert.equal(page.run("ayameBoard.waiting[0].uid"),"discard");
  assert.equal(page.run("ayameBoard.stock.map(c=>c.uid).join()"),"first,second");
  assert.equal(page.run("ayameRival.clock.length"),5);
  assert.equal(page.run("ruleBusy"),false);
  page.run(`
    ayameRival.clock.length=0;
    ayameBoard.front1.push(ayameCard("another","STS/W140-076"));
    ayameBoard.deck.unshift(ayameCard("bottom"));
    autoRuleAttack(0,"front1","another","direct");
  `);
  ruleButton(page,"使わない");
  assert.equal(page.run("ayameBoard.hand[0].uid"),"decline");
  assert.equal(page.run("ayameBoard.stock.map(c=>c.uid).join()"),"first,second,later");
  assert.equal(page.run("ayameBoard.deck[0].uid"),"bottom");
  assert.equal(page.run("ayameRival.clock.length"),3);
  assert.equal(page.run("ruleBusy"),false);
});

test("ステラソラのミラー戦は19種50枚を両者が使用し、初手を別々に配る",async()=>{
  const page=launch("",new Map(),null,100,null,true);
  await page.settle();
  page.get("botScenario").value="stella-sora-mirror";
  page.click("startBotBattle");
  assert.equal(page.run("match.phase"),"mulligan");
  assert.equal(page.run("match.decks[0].cards.length"),19);
  assert.equal(page.run("match.decks[0].cards.reduce((sum,c)=>sum+c.num,0)"),50);
  assert.equal(page.run("match.decks[0].cards.filter(c=>c.cx).reduce((sum,c)=>sum+c.num,0)"),8);
  assert.equal(page.run("JSON.stringify(match.decks[0])===JSON.stringify(match.decks[1])"),true);
  assert.equal(page.run("match.decks[0].cards.every(c=>botDefinition(c))"),true);
  assert.equal(page.run("players.map(b=>b.hand.length).join()"),"5,5");
  assert.equal(page.run("players.map(b=>b.deck.length).join()"),"45,45");
  assert.equal(page.run("new Set(players.flatMap(b=>[...b.hand,...b.deck].map(c=>c.uid))).size"),100);
  page.click("confirmMulligan");
  assert.equal(page.run("match.phase"),"active");
  assert.equal(page.run("match.turn.player"),0);
});

test("ヴェルジュは1枚を手札、1枚をストックに置き、解決後に思い出へ行く",async()=>{
  const page=launchRules();
  await page.settle();
  page.run(`
    var sb=players[0],sc=(uid,no)=>({uid,id:"STS/W140-"+no,faceUp:true,cx:false,orientation:0});
    for(const board of players)for(const zone of zones)board[zone]=[];
    sb.hand.push(sc("event","030"));
    sb.stock.push(sc("pay","071"));
    sb.front0.push(sc("sacrifice","T03"));
    sb.deck.push(sc("remainder","T03"),sc("stock","077"),sc("hand","071"));
    runRuleOperation(done=>autoRuleResolveEvent(0,0,botDefinition(sb.hand[0]),stellaVerge,done));
  `);
  ruleButton(page,"1．巡遊者 コゼット");
  ruleButton(page,"1枚見る");
  ruleButton(page,"次の1枚を見る");
  ruleButton(page,"ここでやめる");
  ruleButton(page,"1．弾む小雨 シーミャオ");
  ruleButton(page,"1．森のうっかりさん テレサ");
  ruleButton(page,"確認して進む");
  assert.equal(page.run("sb.hand[0].uid"),"hand");
  assert.equal(page.run("sb.stock[0].uid"),"stock");
  assert.equal(page.run("sb.memory[0].uid"),"event");
  page.run(`
    var triggered={...sc("trigger","032"),cx:true};
    var payment={...sc("cx-payment","031"),cx:true};
    sb.hand.push(payment);
    runRuleOperation(done=>botResolveAttackTrigger(0,triggered,()=>null,done));
  `);
  ruleButton(page,"ストックに置かない");
  ruleButton(page,"使う");
  ruleButton(page,"1．黎明告げる凱旋歌");
  ruleButton(page,"2．巡遊者 コゼット");
  assert.equal(page.run("sb.hand.at(-1).uid"),"sacrifice");
});

test("TDコゼットの登場時強化、山札公開と、リバース時の後列移動を処理する",async()=>{
  const page=launchRules();
  await page.settle();
  page.run(`
    var sb=players[0],sc=(uid,no)=>({uid,id:"STS/W140-"+no,faceUp:true,cx:false,orientation:0});
    for(const board of players)for(const zone of zones)board[zone]=[];
    sb.front0.push(sc("source","T03"));
    sb.front1.push(sc("ally","071"));
    players[1].front2.push(sc("rival","025"));
    sb.deck.push(sc("remain","030"),sc("add","071"));
    runRuleOperation(done=>botDispatch(sb.front0[0],"from_hand_to_stage",done));
  `);
  assert.equal(page.run("botStats(0,sb.front0[0]).power"),3500);
  page.run('runRuleOperation(done=>botDispatch(sb.front0[0],"on_attack",done))');
  ruleButton(page,"確認して進む");
  ruleButton(page,"1．弾む小雨 シーミャオ");
  assert.equal(page.run("sb.waiting.at(-1).uid"),"add");
  page.run('runRuleOperation(done=>autoRuleResolveReversals(botBattle(0,"front0","source","rival","front2"),done))');
  ruleButton(page,"1．弾む小雨 シーミャオ");
  ruleButton(page,"後列①");
  assert.equal(page.run("sb.back0[0].uid"),"ally");
  assert.equal(page.run("sb.back0[0].orientation"),90);
});

test("巡遊者レイスは支払ったCXを回収でき、レベル0のバトル相手をクロックに置ける",async()=>{
  const page=launchRules();
  await page.settle();
  page.run(`
    var sb=players[0],rb=players[1],sc=(uid,no,cx=false)=>({uid,id:"STS/W140-"+no,faceUp:true,cx,orientation:0});
    for(const board of players)for(const zone of zones)board[zone]=[];
    sb.front0.push(sc("source","025"));
    sb.back0.push(sc("cost","071"));
    sb.hand.push(sc("paid","032",true));
    rb.front2.push(sc("rival","T03"));
    rb.deck.push(sc("remaining","071"));
    rb.clock.push(sc("oldclock","025"));
    runRuleOperation(done=>botDispatch(sb.front0[0],"from_hand_to_stage",done));
  `);
  ruleButton(page,"1．夢の先へ");
  ruleButton(page,"1．弾む小雨 シーミャオ");
  assert.equal(page.run("sb.hand[0].uid"),"paid");
  page.run('runRuleOperation(done=>autoRuleResolveReversals(botBattle(0,"front0","source","rival","front2"),done))');
  ruleButton(page,"クロックを入れ替える");
  assert.equal(page.run("rb.clock[0].uid"),"rival");
  assert.equal(page.run("rb.waiting[0].uid"),"oldclock");
});

test("シーミャオは回想を持たないイベントを選べ、テレサはコストで落ちた自身を思い出にする",async()=>{
  const page=launchRules();
  await page.settle();
  page.run(`
    var sb=players[0],sc=(uid,no)=>({uid,id:"STS/W140-"+no,faceUp:true,cx:false,orientation:0});
    for(const board of players)for(const zone of zones)board[zone]=[];
    sb.front0.push(sc("shimiao","071"));
    sb.front1.push(sc("teresa","077"));
    sb.deck.push(sc("remain","071"),sc("level1","030"),sc("take","030"));
    sb.waiting.push(sc("salvage","019"));
    sb.hand.push(sc("discard","071"));
    runRuleOperation(done=>botDispatch(sb.front0[0],"from_hand_to_stage",done));
  `);
  ruleButton(page,"1枚見る");
  assert.match(page.get("dialogTitle").textContent,/上から1枚目/);
  ruleButton(page,"ここでやめる");
  ruleButton(page,"1．星ノ塔スタッフ ヴェルジュ");
  ruleButton(page,"確認して進む");
  ruleButton(page,"1．弾む小雨 シーミャオ");
  assert.equal(page.run("sb.hand[0].uid"),"take");
  assert.equal(page.run("sb.deck.at(-1).uid"),"level1");
  assert.equal(page.run("botStats(0,sb.front0[0]).power"),3500);
  page.run('selected={p:0,z:"front1",index:0};openBotAbility()');
  ruleButton(page,"起動・キャラを回収してテレサを思い出へ");
  ruleButton(page,"使う");
  ruleButton(page,"1．星ノ塔スタッフ ヴェルジュ");
  ruleButton(page,"1．風に揺れる気持ち ナツカ");
  ruleButton(page,"1．森のうっかりさん テレサ");
  assert.equal(page.run("sb.memory[0].uid"),"teresa");
  assert.equal(page.run("sb.hand[0].uid"),"salvage");
});

test("フリージアはCXをレベル0として回収し、相手のターンだけ増加量が1500になる",async()=>{
  const page=launchRules();
  await page.settle();
  page.run(`
    var sb=players[0],sc=(uid,no,cx=false)=>({uid,id:"STS/W140-"+no,faceUp:true,cx,orientation:0});
    for(const board of players)for(const zone of zones)board[zone]=[];
    sb.front0.push(sc("source","068"));
    sb.deck.push(sc("reveal","032",true));
    sb.waiting.push(sc("higher","019"));
    sb.hand.push(sc("discard","071"));
    runRuleOperation(done=>botDispatch(sb.front0[0],"from_hand_to_stage",done));
  `);
  ruleButton(page,"使う");
  ruleButton(page,"1．弾む小雨 シーミャオ");
  ruleButton(page,"確認して進む");
  ruleButton(page,"1．弾む小雨 シーミャオ");
  assert.equal(page.run("sb.hand[0].uid"),"discard");
  assert.equal(page.run("sb.deck[0].uid"),"reveal");
  assert.equal(page.run("botStats(0,sb.front0[0]).power"),2000);
  page.run("match.turn.player=1");
  assert.equal(page.run("botStats(0,sb.front0[0]).power"),3000);
});

test("黎明の刻 レイスは2回のカード選択でコストと山札サーチを解決する",async()=>{
  const page=launchRules();
  await page.settle();
  page.run(`
    var rb=players[0],rc=(uid,id)=>({uid,id,faceUp:true,cx:false,orientation:0});
    for(const zone of zones)rb[zone]=[];
    rb.front0.push(rc("reis","STS/W140-001"));
    rb.stock.push(rc("payment","STS/W140-004"));
    rb.waiting.push(rc("clock-cost","STS/W140-T03"));
    rb.deck.push(rc("ineligible","STS/W140-004"),rc("wanted","STS/W140-071"));
    runRuleOperation(done=>botDispatch(rb.front0[0],"from_hand_to_stage",done));
  `);
  assert.match(page.get("dialogTitle").textContent,/クロックの下/);
  ruleButton(page,"巡遊者 コゼット");
  const target=page.get("dialogBody").children.find(el=>el.textContent==="弾む小雨 シーミャオ");
  assert.match(target.children[0].src,/wsstsw140_145\.jpg$/);
  assert.equal(page.get("dialogBody").children.some(el=>el.textContent==="爽風の才媛 ナツカ"),false);
  ruleButton(page,"弾む小雨 シーミャオ");
  assert.equal(page.run("ruleBusy"),false);
  assert.equal(page.run("rb.clock[0].uid"),"clock-cost");
  assert.equal(page.run("rb.stock.length"),0);
  assert.equal(page.run("rb.hand[0].uid"),"wanted");
});

test("同時に発動した回想と魔王ちゃんの解決順を選べる",async()=>{
  const page=launchRules();
  await page.settle();
  page.run(`
    var b=players[0],mkOrder=(uid,no)=>({uid,id:"STS/W140-"+no,cx:false,faceUp:true,orientation:0});
    for(const zone of zones)b[zone]=[];
    var striker=mkOrder("atk","071");
    striker.markers=[{card:mkOrder("marker","024"),faceUp:true}];
    b.front0.push(striker);
    b.back0.push(mkOrder("maou","008"));
    b.deck.push(mkOrder("lv0","025"),mkOrder("lv3","004"));
    runRuleOperation(done=>botDispatch(striker,"on_attack",done));
  `);
  assert.equal(page.get("dialogTitle").textContent,"次に解決する効果を選ぶ");
  const marker=page.get("dialogBody").children.find(el=>el.textContent.startsWith("1．カリスマ教師の気苦労 カナーチェ"));
  assert.ok(marker);
  marker.onclick();
  ruleButton(page,"1枚見る");
  ruleButton(page,"次の1枚を見る");
  ruleButton(page,"上下を入れ替える");
  ruleButton(page,"使う");
  ruleButton(page,"ストックに置く");
  assert.equal(page.run("b.stock[0].uid"),"lv0");
});

test("ステラソラBotは唯一出せる魔王ちゃんをクロックにせず前列に出す",async()=>{
  const page=launch("",new Map(),null,100,null,true);
  await page.settle();
  page.get("botScenario").value="stella-sora-mirror";
  page.click("startBotBattle");
  page.click("confirmMulligan");
  page.run(`
    finishEndTurn();
    var b=players[1],mkMain=(uid,no)=>({uid,id:"STS/W140-"+no,cx:no==="032",faceUp:true,orientation:0});
    for(const zone of zones)b[zone]=[];
    b.hand.push(mkMain("only","008"),mkMain("cx","032"));
    b.deck.push(mkMain("remaining","004"));
    setTurnPhase("clock");
    autoRuleBotStep();
  `);
  assert.equal(page.run("b.clock.length"),0);
  assert.equal(page.run("match.turn.phase"),"main");
  page.run("autoRuleBotStep()");
  assert.equal(page.run("b.front0[0].uid"),"only");
  assert.equal(page.run("match.turn.phase"),"climax");
});

test("ステラソラBotは手札から出せなくても、攻撃可能な後列キャラを前列に移す",async()=>{
  const page=launch("",new Map(),null,100,null,true);
  await page.settle();
  page.get("botScenario").value="stella-sora-mirror";
  page.click("startBotBattle");
  page.click("confirmMulligan");
  page.run(`
    finishEndTurn();
    var b=players[1];
    for(const zone of zones)b[zone]=[];
    b.back0.push({uid:"rear",id:"STS/W140-008",faceUp:true,orientation:0});
    setTurnPhase("main");
    autoRuleBotStep();
  `);
  assert.equal(page.run("b.front0[0].uid"),"rear");
  assert.equal(page.run("b.back0.length"),0);
});

test("ステラソラのCXは自分とBotがストック0枚でプレイできる",async()=>{
  const page=launch("",new Map(),null,100,null,true);
  await page.settle();
  page.get("botScenario").value="stella-sora-mirror";
  page.click("startBotBattle");
  page.click("confirmMulligan");
  page.run(`
    var cxCard=(uid,no,cx=false)=>({uid,id:"STS/W140-"+no,cx,faceUp:true,orientation:0});
    for(const b of players)for(const zone of zones)b[zone]=[];
    players[0].hand.push(cxCard("song","031",true),cxCard("dream","032",true));
    players[0].front0.push(cxCard("firen","002"));
    setTurnPhase("climax");
    cardClick(0,"hand",0);
  `);
  assert.equal(Boolean(page.get("dialog").open),false);
  assert.equal(page.run("selected"),null);
  assert.equal(page.run("players[0].cx.length"),0);
  page.run('players[0].clock.push(cxCard("green","008"));cardClick(0,"hand",0)');
  assert.equal(page.run("players[0].cx[0].uid"),"song");
  assert.equal(page.run("players[0].stock.length"),0);
  assert.equal(page.run("botStats(0,players[0].front0[0]).power"),4000);
  page.run('cardClick(0,"hand",0)');
  assert.equal(Boolean(page.get("dialog").open),false);
  assert.equal(page.run("selected"),null);
  assert.equal(page.run("players[0].cx[0].uid"),"song");
  page.run(`
    finishEndTurn();
    players[1].hand.push(cxCard("bot-song","031",true));
    players[1].clock.push(cxCard("bot-green","008"));
    players[1].front0.push(cxCard("bot-firen","002"));
    setTurnPhase("climax");
    autoRuleBotStep();
  `);
  assert.equal(page.run("players[1].cx[0].uid"),"bot-song");
  assert.equal(page.run("players[1].stock.length"),0);
  assert.equal(page.run("match.turn.phase"),"attack");
});

test("フィレンのCXコンボは控え室の対象が1枚なら移動先だけ選ぶ",async()=>{
  for(const choice of ["手札へ","ストックへ","使わない"]){
    const page=launch("",new Map(),null,100,null,true);
    await page.settle();
    page.get("botScenario").value="stella-sora-mirror";
    page.click("startBotBattle");
    page.click("confirmMulligan");
    page.run(`
      var b=players[0],make=(uid,no)=>({uid,id:"STS/W140-"+no,faceUp:true,orientation:0});
      b.waiting=[make("target","025")];
      b.cx=[make("song","031")];
      b.front0=[make("source","002")];
      runRuleOperation(done=>botDispatch(b.front0[0],"on_attack",done));
    `);
    assert.equal(page.get("dialogTitle").textContent,"選んだキャラをどこに置く？");
    ruleButton(page,choice);
    const zone={"手札へ":"hand","ストックへ":"stock","使わない":"waiting"}[choice];
    assert.equal(page.run(`b.${zone}.at(-1).uid`),"target");
    if(choice!=="使わない"){
      assert.match(page.get("dialogTitle").textContent,/自分のフィレン・(手札に回収|ストックへ)/);
      ruleButton(page,"確認して進む");
    }
    assert.equal(page.get("dialog").open,false);
  }
});

test("Bot戦では手動コマンドを隠し、舞台内の移動と公開領域の確認はできる",()=>{
  const page=launchRules();
  assert.equal(page.get("battleSideControl").hidden,true);
  assert.equal(page.get("shuffle").hidden,true);
  assert.equal(page.get("manualBattleHint").hidden,true);
  page.run('zoneClick(0,"deck");zoneClick(0,"stock");manualDestination(0,"hand",0)');
  assert.equal(Boolean(page.get("dialog").open),false);
  page.run('var originalUid=players[0].front0[0].uid;moveFromBoard(0,"front0",0,"back0")');
  assert.equal(page.run('players[0].back0[0].uid'),page.run('originalUid'));
  page.run('openList(0,"back0")');
  const buttons=page.get("dialogBody").children[0].children.flatMap(item=>item.children);
  assert.ok(buttons.length);
  assert.ok(buttons.every(button=>!["移動先を選択","縦向き","右90°","180°"].includes(button.textContent)));
});

test("集中はCXが0枚でも対戦ログに公開順で残す",()=>{
  const page=launchRules();
  page.run(`
    var concentration=players[0];
    concentration.deck=[...concentration.deck.filter(c=>c.cx),...concentration.deck.filter(c=>!c.cx)];
    var revealOrder=concentration.deck.slice(-2).reverse().map(c=>c.id);
    activateBrainstorm(0,concentration.front0[0],{stock:1,reveal:2});
  `);
  assert.equal(page.run('JSON.stringify(match.bot.battleLog.at(-1).cards)'),page.run("JSON.stringify(revealOrder)"));
  page.click("botBattleLog");
  assert.match(page.get("dialogBody").children[0].value,/2枚公開・CX 0枚/);
  assert.equal(page.get("close").hidden,false);
});

test("成立とキャンセルのダメージと公開順はリロード後も対戦ログで確認できる",()=>{
  const page=launchRules();
  page.run(`
    var own=players[0],opponent=players[1];
    function moveToTop(board,cx){
      const index=board.deck.findIndex(card=>card.cx===cx);
      board.deck.push(...board.deck.splice(index,1));
      return board.deck.at(-1).id;
    }
    var first=moveToTop(own,false);
    runRuleOperation(done=>botDamage(0,1,done));
    var cancelCx=moveToTop(opponent,true),beforeCx=moveToTop(opponent,false);
    runRuleOperation(done=>botDamage(1,3,done));
  `);
  const [hit,cancel]=snapshot(page).bot.battleLog;
  assert.equal(hit.p,0);
  assert.deepEqual(hit.cards,[page.run("first")]);
  assert.match(cancel.text,/キャンセル/);
  assert.equal(cancel.p,1);
  assert.deepEqual(cancel.cards,[page.run("beforeCx"),page.run("cancelCx")]);
  const reopened=launch("",page.storage);
  reopened.click("botBattleLog");
  const text=reopened.get("dialogBody").children[0].value;
  assert.match(text,/自分｜ダメージ 1枚/);
  assert.match(text,/Bot｜CXでダメージをキャンセル/);
  assert.ok(text.includes("["+cancel.cards[0]+"]、"));
});

test("ステラソラのLv0追加4種でDAQBEと初手から対戦できる",async()=>{
  const page=launch("",new Map(),null,100,null,true);
  await page.settle();
  page.get("botScenario").value="stella-level-zero-trial";
  page.click("startBotBattle");
  assert.deepEqual(ruleCounts(snapshot(page)),[50,50]);
  assert.equal(page.run('match.decks[1]===stellaDeck'),true);
  const base=JSON.parse(page.run("JSON.stringify(match.decks[1].cards)"));
  const trial=JSON.parse(page.run("JSON.stringify(match.decks[0].cards)"));
  const trialCounts=new Map(trial.map(c=>[c.id,c.num]));
  const cuts=base.filter(c=>trialCounts.get(c.id)!==c.num);
  assert.deepEqual(cuts.map(c=>[c.id.slice(9),c.num-(trialCounts.get(c.id)??0)]),[
    ["094",1],["013",1],["023",1],["030",1]
  ]);
  assert.equal(trial.filter(c=>c.cx).reduce((n,c)=>n+c.num,0),8);
  for(const number of ["038","040","007","016"]){
    assert.equal(trialCounts.get("STS/W140-"+number),1);
    assert.equal(page.run(`botDefinition({id:"STS/W140-${number}"}).stats.level`),0);
  }
  page.click("confirmMulligan");
  assert.equal(snapshot(page).phase,"active");
});

async function launchStellaAbility(){
  const page=launchRules();
  await page.settle();
  page.run(`
    const own=players[0], opponent=players[1];
    const card=(no,uid,cx=false)=>({id:"STS/W140-"+no,uid,cx,faceUp:true,orientation:0});
    for(const board of players)for(const zone of zones)board[zone]=[];
  `);
  return page;
}

test("コハクは捨てたLv0を登場させ、相手アタック開始時にスタンドして入れ替える",async()=>{
  const page=await launchStellaAbility();
  page.run('own.hand.push(card("038","kohaku"),card("040","laar"));own.stock.push(card("032","pay",true));autoRulePlace(0,"kohaku","front0")');
  ruleButton(page,"1．カモメのポテト ラール");
  ruleButton(page,"1．カモメのポテト ラール");
  ruleButton(page,"後列①");
  page.run('own.front0[0].orientation=90;own.back0[0].orientation=180;match.turn.player=1;setTurnPhase("attack")');
  const choose=page.get("dialogBody").children.find(el=>el.textContent.includes("コハク")&&el.textContent.includes("入れ替え"));
  assert.ok(choose);
  choose.onclick();
  ruleButton(page,"1．カモメのポテト ラール");
  assert.equal(page.run('own.front0[0].uid+":"+own.front0[0].orientation'),"laar:0");
  assert.equal(page.run('own.back0[0].uid+":"+own.back0[0].orientation'),"kohaku:0");
  assert.equal(page.run('own.stock.length'),0);
  ruleButton(page,"使わない");
});

test("ラールは自分のスタンドフェイズに起きず、条件を満たすとフロントアタックを受けた時に手札へ戻れる",async()=>{
  const page=await launchStellaAbility();
  page.run(`
    own.front0.push(card("040","laar"));
    own.front0[0].orientation=90;
    own.deck.push(card("016","reserve-own"),card("032","damage",true),card("016","milled"));
    opponent.front2.push(card("038","attacker"));
    opponent.deck.push(card("016","reserve"),card("016","trigger"));
    setTurnPhase("stand");
  `);
  assert.equal(page.run("own.front0[0].orientation"),90);
  page.run('match.turn.player=1;setTurnPhase("attack")');
  ruleButton(page,"使う");
  assert.equal(page.run('own.waiting[0].uid'),"milled");
  page.run('autoRuleAttack(1,"front2","attacker","front")');
  ruleButton(page,"使う");
  assert.equal(page.run('own.hand[0].uid'),"laar");
  assert.equal(page.run('own.front0.length'),0);
  assert.equal(page.run('own.waiting.some(c=>c.uid==="damage")'),true);
});

test("クルニスの2つの登場時能力は順番を選べて、自身をストックに置いた後も残りを解決する",async()=>{
  const page=await launchStellaAbility();
  page.run(`
    own.front1.push(card("038","ally"));
    own.deck.push(card("016","reserve"),card("030","event"),card("016","lv0"));
    own.hand.push(card("007","coronis"));
    autoRulePlace(0,"coronis","front0");
  `);
  const first=page.get("dialogBody").children.find(el=>el.textContent.includes("自身をストックへ"));
  assert.ok(first);
  first.onclick();
  ruleButton(page,"確認して進む");
  assert.equal(page.run('own.stock[0].uid'),"coronis");
  ruleButton(page,"1．銃弾のロンド コハク");
  ruleButton(page,"確認して進む");
  ruleButton(page,"確認して進む");
  assert.equal(page.run('own.hand.map(c=>c.uid).join()'),"lv0,event");
  assert.equal(page.run('own.waiting.map(c=>c.uid).join()'),"coronis,ally");
});

test("休暇フィレンは舞台から控え室に置かれた時だけ誘発し、落としたカードのLv合計とCXを参照する",async()=>{
  const page=await launchStellaAbility();
  page.run(`
    own.hand.push(card("008","discard"),card("016","fromHand"));
    own.front0.push(card("016","firen"));
    own.waiting.push(card("003","tooHigh"));
    own.deck.push(card("016","reserve"),card("008","stock"),card("025","other"),card("004","ignore"));
    own.deck.splice(2,2,card("032","cx",true),card("023","lv2"));
    runRuleOperation(done=>{botMove(own,"hand",1,"waiting");done()});
  `);
  assert.equal(Boolean(page.get("dialog").open),false);
  page.run('runRuleOperation(done=>{botMove(own,"front0",0,"waiting");done()})');
  ruleButton(page,"1．魂の取引 魔王ちゃん");
  assert.match(page.get("dialogTitle").textContent,/Lv2以下/);
  assert.equal(page.get("dialogBody").children.some(el=>el.textContent.includes("長夜無明")),false);
  ruleButton(page,"選ばない");
  ruleButton(page,"使う");
  assert.equal(page.run('own.stock[0].uid'),"stock");
  assert.equal(page.run('own.waiting.some(c=>c.uid==="lv2")&&own.waiting.some(c=>c.uid==="cx")'),true);
});

test("Bot戦専用ページは両デッキの枚数を別々に編集し、保存した50枚で対戦を始める",async()=>{
  const page=launch("",new Map(),null,100,null,true);
  await page.click("openBotDeckEditor");
  assert.equal(page.get("setupScreen").hidden,true);
  assert.equal(page.get("botDeckEditorScreen").hidden,false);
  assert.equal(page.get("startEditedBotBattle").disabled,false);
  const adjust=(target,name,delta)=>{
    const row=target.get("botDeckCardRows").children.find(entry=>entry.children[0].textContent===name);
    assert.ok(row,name);
    row.children[1].children[delta<0?0:2].onclick();
  };
  adjust(page,"巡遊者 グレイ",-1);
  assert.equal(page.get("startEditedBotBattle").disabled,true);
  adjust(page,"銃弾のロンド コハク",1);
  assert.equal(page.get("startEditedBotBattle").disabled,false);
  page.click("editOpponentBotDeck");
  adjust(page,"黎明告げる凱旋歌",-1);
  adjust(page,"カモメのポテト ラール",1);
  assert.match(page.get("botDeckTotals").textContent,/Bot 50\/50枚（CX 7\/8枚）/);
  assert.equal(page.get("startEditedBotBattle").disabled,true);
  adjust(page,"カモメのポテト ラール",-1);
  adjust(page,"黎明告げる凱旋歌",1);
  page.get("botDeckPreset").value="trial";
  page.click("applyBotDeckPreset");
  assert.equal(page.get("startEditedBotBattle").disabled,false);

  const reopened=launch("",page.storage,null,100,null,true);
  await reopened.click("openBotDeckEditor");
  reopened.click("startEditedBotBattle");
  assert.equal(reopened.get("botDeckEditorScreen").hidden,true);
  assert.equal(reopened.run("match.bot.scenario"),"stella-custom");
  assert.deepEqual(ruleCounts(snapshot(reopened)),[50,50]);
  assert.equal(reopened.run('match.decks[0].cards.some(c=>c.id==="STS/W140-038")'),true);
  assert.equal(reopened.run('match.decks[0].cards.some(c=>c.id==="STS/W140-040")'),false);
  assert.equal(reopened.run('match.decks[1].cards.some(c=>c.id==="STS/W140-040")'),true);
  reopened.click("confirmMulligan");
  assert.equal(reopened.run("isAutoRules()"),true);
});

test("光り物と通常版で合計4枚を上限とし、光り物のカード番号で保存して対戦に使う",async()=>{
  const page=launch("",new Map(),null,100,null,true);
  await page.click("openBotDeckEditor");
  const row=page.get("botDeckCardRows").children.find(entry=>entry.children[0].textContent==="巡遊者 コゼット");
  const variants=row.children[0].children[1];
  const [minus,,plus]=row.children[1].children;
  assert.match(row.children[2].children[0].src,/wsstsw140t_026\.jpg$/);
  assert.equal(plus.disabled,true);
  minus.onclick();
  variants.value="STS/W140-T03SP";
  variants.onchange();
  assert.match(row.children[2].children[0].src,/wsstsw140t_002\.jpg$/);
  plus.onclick();
  assert.equal(plus.disabled,true);
  assert.equal(page.get("startEditedBotBattle").disabled,false);

  const reopened=launch("",page.storage,null,100,null,true);
  await reopened.click("openBotDeckEditor");
  reopened.click("startEditedBotBattle");
  assert.equal(reopened.run('match.decks[0].cards.find(c=>c.id==="STS/W140-T03SP").num'),1);
  assert.equal(reopened.run('match.decks[0].cards.find(c=>c.id==="STS/W140-T03").num'),3);
  assert.equal(reopened.run('botDefinition({id:"STS/W140-T03SP"}).cardNumber'),"STS/W140-T03");
  assert.match(reopened.run('effectChoiceImageUrl("STS/W140-T03SP")'),/wsstsw140t_002\.jpg$/);
});

test("ステラソラBot戦は集中0ヒットとキャンセルされたダメージをその場で見せる",async()=>{
  const page=launch("",new Map(),null,100,null,true);
  await page.click("openBotDeckEditor");
  page.click("startEditedBotBattle");
  page.click("confirmMulligan");
  page.run(`
    const b=players[0];
    const put=(id,to)=>botMove(b,"deck",b.deck.findIndex(c=>c.id==="STS/W140-"+id),to);
    while(b.hand.length)botMove(b,"hand",0,"deck");
    put("008","back0");put("001","stock");put("032","deck");
    for(const id of ["019","023","068","071"])put(id,"deck");
    setTurnPhase("main");
    activateBrainstorm(0,b.back0[0],{stock:1,reveal:4,salvage:true});
  `);
  assert.match(page.get("dialogTitle").textContent,/自分の集中・CX 0枚/);
  assert.equal(page.get("dialogBody").children[0].children.length,4);
  ruleButton(page,"確認して進む");
  page.run('runRuleOperation(done=>botDamage(0,1,done))');
  assert.match(page.get("dialogTitle").textContent,/自分のCXでダメージをキャンセル/);
  assert.equal(page.get("dialogBody").children[0].children.length,1);
  ruleButton(page,"確認して進む");
  assert.deepEqual(ruleCounts(snapshot(page)),[50,50]);
});

test("オンライン用の新規作成はBotデッキと独立し、50枚とCX8枚を満たすデッキを登録する",async()=>{
  const page=launch("",new Map(),null,100,null,true);
  await page.click("openOnlineDeckBuilder");
  assert.equal(page.get("startEditedBotBattle").hidden,true);
  assert.match(page.get("botDeckTotals").textContent,/^0\/50枚/);
  page.get("builtOnlineDeckName").value="オンライン検証";
  page.get("builtOnlineDeckName").oninput();
  assert.equal(page.get("saveBuiltOnlineDeck").disabled,true);
  page.get("botDeckPreset").value="trial";
  page.click("applyBotDeckPreset");
  assert.equal(page.get("saveBuiltOnlineDeck").disabled,false);
  page.click("saveBuiltOnlineDeck");
  const [saved]=JSON.parse(page.storage.get(libraryKey));
  assert.equal(saved.deck.title,"オンライン検証");
  assert.equal(saved.deck.list.reduce((sum,card)=>sum+card.num,0),50);
  assert.equal(saved.deck.list.filter(card=>card.cx).reduce((sum,card)=>sum+card.num,0),8);
  assert.equal(saved.deck.list.find(card=>card.card_number==="STS/W140-038").num,1);
  assert.equal(page.get("botDeckEditorScreen").hidden,true);
  await page.click("openBotDeckEditor");
  assert.equal(page.get("startEditedBotBattle").hidden,false);
  assert.match(page.get("botDeckTotals").textContent,/Bot 50\/50枚/);
  const kohaku=page.get("botDeckCardRows").children.find(row=>row.children[0].textContent==="銃弾のロンド コハク");
  assert.equal(kohaku.children[1].children[1].textContent,"0");
});

test("共通のデッキ作成画面で大会を参考にした構成を保存し、Bot側に読み込んで対戦できる",async()=>{
  const page=launch("",new Map(),null,100,null,true);
  await page.click("openBotDeckEditor");
  page.click("editNewDeck");
  page.get("botDeckPreset").value="sendai";
  page.get("botDeckPreset").onchange();
  assert.equal(page.get("botDeckPresetLink").href,"https://ws-tcg.com/deckrecipe/5856/");
  page.click("applyBotDeckPreset");
  assert.match(page.get("botDeckTotals").textContent,/^50\/50枚（CX 8\/8枚）/);
  page.get("builtOnlineDeckName").value="仙台トリオ3位";
  page.get("builtOnlineDeckName").oninput();
  assert.equal(page.get("saveBuiltOnlineDeck").disabled,false);
  page.click("saveBuiltOnlineDeck");
  const [saved]=JSON.parse(page.storage.get(libraryKey));
  assert.equal(saved.deck.title,"仙台トリオ3位");
  assert.equal(page.get("botDeckEditorScreen").hidden,false);
  page.click("editOpponentBotDeck");
  page.get("loadBuilderDeck").value=saved.id;
  page.get("loadBuilderDeck").onchange();
  page.click("applyBuilderDeck");
  page.click("startEditedBotBattle");
  assert.deepEqual(ruleCounts(snapshot(page)),[50,50]);
  assert.equal(page.run('match.decks[0].cards.find(c=>c.id==="STS/W140-003").num'),2);
  assert.equal(page.run('match.decks[1].cards.find(c=>c.id==="STS/W140-003").num'),3);
  assert.deepEqual(JSON.parse(page.run('JSON.stringify(match.decks[1].cards.map(({id,num})=>[id.slice(9),num]).sort())')),[
    ["001",4],["002",4],["003",3],["004",4],["008",4],["019",1],["022",1],["023",1],["024",4],
    ["025",2],["030",3],["031",4],["032",4],["035",2],["071",4],["076",1],["T03",4]
  ]);
});

test("シアは登場時に見たカードを控え室へ置いてから回収でき、舞台から控え室へ移動した時にも誘発する",async()=>{
  const page=await launchStellaAbility();
  page.run(`
    own.hand.push(card("035SP","shia"),card("008","discard"),card("001","discard2"));
    own.stock.push(card("032","stock1",true),card("032","stock2",true));
    own.deck.push(card("004","reserve"),card("032","keep",true),card("023","recover"));
    autoRulePlace(0,"shia","front0");
  `);
  ruleButton(page,"1．波に先立つ兎 シア・登場時・山札の上を確認");
  ruleButton(page,"1枚見る");
  ruleButton(page,"次の1枚を見る");
  ruleButton(page,"2．夢の先へ");
  ruleButton(page,"選択を確定");
  assert.equal(page.run("own.deck.at(-1).uid"),"keep");
  ruleButton(page,"1．魂の取引 魔王ちゃん");
  ruleButton(page,"1．ドリンクの誘惑 コゼット");
  assert.equal(page.run("own.stock.length"),1);
  assert.equal(page.run("own.hand.at(-1).uid"),"recover");
  page.run('runRuleOperation(done=>{botMove(own,"front0",0,"waiting");done()})');
  ruleButton(page,"1．黎明の刻 レイス");
  const shia=page.get("dialogBody").children.find(el=>el.textContent.endsWith("波に先立つ兎 シア"));
  assert.ok(shia);
  shia.onclick();
  assert.equal(page.run("own.stock.length"),0);
  assert.equal(page.run("own.hand.at(-1).uid"),"shia");
});

test("オトハの助太刀でパワーを上げ、追加コストで選んだ攻撃キャラの今回のダメージを減らす",async()=>{
  const page=await launchStellaAbility();
  page.run(`
    own.level.push(card("001","level1"),card("035","level2"));
    own.hand.push(card("022S","backup"));
    own.front0.push(card("013","defender"));
    own.back0.push(card("025","cost"));
    own.stock.push(card("032","stock1",true),card("032","stock2",true));
    own.deck.push(card("004","damage"),card("004","keep"));
    opponent.front2.push(card("013","attacker"));
    opponent.back0.push(card("008","protected"));
    opponent.deck.push(card("025","reserve"),card("025","trigger"));
    match.turn.player=1;
    setTurnPhase("attack");
    autoRuleAttack(1,"front2","attacker","front");
  `);
  ruleButton(page,"千の貌を持つ女 オトハを使う");
  assert.equal(page.run('botStats(0,own.front0[0]).power'),11000);
  assert.equal(page.run("own.stock.length"),1);
  ruleButton(page,"2．巡遊者 レイス");
  assert.equal(page.get("dialogBody").children.some(el=>el.textContent.includes("魔王ちゃん")),false);
  ruleButton(page,"1．ムーンシャドウ コゼット");
  assert.equal(page.run("own.stock.length"),0);
  assert.equal(page.run('own.waiting.some(c=>c.uid==="cost")'),true);
  assert.equal(page.run('botStats(1,opponent.front2[0]).soul'),0);
  assert.equal(page.run("own.clock.length"),0);
  assert.equal(page.get("dialog").open,false);
});

test("Botはオトハの助太刀と追加効果を使い、コストで控え室に置かれたシアの能力も解決する",async()=>{
  const page=await launchStellaAbility();
  page.run(`
    own.front0.push(card("013","attacker"));
    opponent.level.push(card("001","level1"),card("035","level2"));
    opponent.hand.push(card("022","backup"),card("030","discard"));
    opponent.front2.push(card("023","defender"));
    opponent.back0.push(card("035","shia"));
    opponent.stock.push(card("032","stock1",true),card("032","stock2",true),card("032","stock3",true));
    opponent.waiting.push(card("004","recover"));
    opponent.deck.push(card("001","reserve"));
    runRuleOperation(done=>autoRuleCounter(1,own.front0[0],opponent.front2[0],done));
  `);
  assert.equal(page.run("opponent.stock.length"),0);
  assert.equal(page.run("opponent.back0.length"),0);
  assert.equal(page.run("opponent.hand.at(-1).uid"),"recover");
  assert.equal(page.run('botStats(1,opponent.front2[0]).power'),8000);
  assert.equal(page.run('botStats(0,own.front0[0]).soul'),0);
  assert.equal(Boolean(page.get("dialog").open),false);
});

test("大会レシピ1TK8A8の16種をBot側に指定し、ステラソラ対フリーレンを開始できる",async()=>{
  const page=launch("",new Map(),null,100,null,true);
  await page.click("openBotDeckEditor");
  page.click("editOpponentBotDeck");
  page.get("botDeckPreset").value="frieren";
  page.click("applyBotDeckPreset");
  assert.equal(page.get("builderTitleFilter").value,"SFN");
  assert.equal(page.get("botDeckCardRows").children.length,page.run('botCatalog.cards.filter(card=>card.cardNumber.startsWith("SFN/")).length'));
  assert.ok(page.get("botDeckCardRows").children.some(row=>row.children[0].children.some(child=>child.textContent.includes("Bot未対応"))));
  assert.equal(page.get("startEditedBotBattle").disabled,false);
  page.click("startEditedBotBattle");
  const game=snapshot(page);
  assert.deepEqual(ruleCounts(game),[50,50]);
  assert.ok(game.decks[0].cards.every(card=>card.id.startsWith("STS/")));
  assert.equal(game.decks[1].cards.length,16);
  assert.ok(game.decks[1].cards.every(card=>card.id.startsWith("SFN/")));
  assert.equal(game.decks[1].cards.reduce((sum,card)=>sum+(card.cx?card.num:0),0),8);
});

test("勇者一行の像を思い出に置いて回収し、ヒンメルは各ターン最初のプレイだけ軽くなる",async()=>{
  const page=await launchStellaAbility();
  page.run(`
    const fri=(number,uid,cx=false)=>({id:"SFN/"+number,uid,cx,faceUp:true,orientation:0});
    own.front0.push(fri("S128-017","statue"));
    own.stock.push(fri("S136-006","stock"),fri("S136-065","stock2"));
    own.waiting.push(fri("S108-T04","recover"));
    own.level.push(fri("S136-001","lv1"),fri("S136-001","lv2"),fri("S136-001","lv3"));
    own.deck.push(fri("S136-006","reserve"));
    own.hand.push(fri("S128-003","first"),fri("S128-003","second"));
    runRuleOperation(done=>frierenStatue(0,own.front0[0],done));
  `);
  ruleButton(page,"1．“勇者”ヒンメル");
  assert.equal(page.run("own.memory[0].uid"),"statue");
  assert.equal(page.run("own.hand.at(-1).uid"),"recover");
  assert.equal(page.run('autoRuleAttackAllowed(0,"front0",own.memory[0])'),false);
  assert.equal(page.run('autoRuleLegalPlay(0,own.hand[0],"main","character")'),"");
  page.run('autoRulePlace(0,"first","front0")');
  assert.equal(page.run("own.stock.length"),0);
  assert.match(page.run('autoRuleLegalPlay(0,own.hand[0],"main","character")'),/必要 2枚/);
});

test("チョイスでハイターが許可したイベントを回収し、トリガーしたCXはストックに置く",async()=>{
  const page=await launchStellaAbility();
  page.run(`
    const fri=(number,uid,cx=false)=>({id:"SFN/"+number,uid,cx,faceUp:true,orientation:0});
    const trigger=fri("S128-022OFR","choice",true);
    own.back0.push(fri("S136-005","heiter"));
    own.waiting.push(fri("S128-021","event"),fri("S136-076","noSoul"));
    runRuleOperation(done=>botTriggerEffect(0,trigger,done));
  `);
  assert.equal(page.get("dialogBody").children.some(el=>el.textContent.includes("フェルン")),false);
  ruleButton(page,"1．銅像の錆を綺麗に取る魔法");
  ruleButton(page,"手札へ");
  assert.equal(page.run("own.hand[0].uid"),"event");
  assert.equal(page.run("own.stock[0].uid"),"choice");
});

test("ヒンメルのCXコンボは下3枚のCXの枚数だけ2点を繰り返し、通常のダメージと独立する",async()=>{
  const page=await launchStellaAbility();
  page.run(`
    const fri=(number,uid,cx=false)=>({id:"SFN/"+number,uid,cx,faceUp:true,orientation:0});
    own.front0.push(fri("S128-003","himmel"));
    own.back0.push(fri("S136-006","ally1"));
    own.back1.push(fri("S136-005","ally2"));
    own.cx.push(fri("S128-022","combo",true));
    opponent.deck.push(card("031","bottom1",true),card("004","bottom2"),card("032","bottom3",true));
    for(let i=0;i<5;i++)opponent.deck.push(card("001","damage"+i));
    runRuleOperation(done=>frierenHimmelCombo(0,own.front0[0],done));
  `);
  ruleButton(page,"確認して進む");
  assert.equal(page.run("opponent.waiting.map(card=>card.uid).join()"),"bottom1,bottom2,bottom3");
  assert.equal(page.run("opponent.clock.length"),4);
  assert.equal(page.run("match.bot.battleLog.filter(entry=>entry.text.startsWith(\"ダメージ\")).length"),2);
});

test("対応CXを置いた瞬間に思い出にアイゼンがなければ、控え室のアイゼン4枚を一度に思い出へ置ける",async()=>{
  const page=await launchStellaAbility();
  page.run(`
    const fri=(no,uid,cx=false)=>({id:"SFN/"+no,uid,cx,faceUp:true,orientation:0});
    own.deck.push(fri("S136-001","reserve"));
    own.hand.push(fri("S108-T09","cx",true),fri("S128-022","next-cx",true));
    own.clock.push(fri("S136-001","yellow"));
    for(let i=0;i<4;i++)own.waiting.push(fri(i===3?"S136-006S":"S136-006","eisen"+i));
    own.waiting.push(fri("S108-T04","other"));
    setTurnPhase("climax");
    autoRulePlace(0,"cx","cx");
  `);
  ruleButton(page,"すべて思い出にする");
  assert.equal(page.run("own.memory.map(c=>c.uid).join()"),"eisen0,eisen1,eisen2,eisen3");
  assert.equal(page.run("own.waiting.map(c=>c.uid).join()"),"other");
  page.run(`
    botMove(own,"memory",1,"waiting");
    botMove(own,"cx",0,"waiting");
    autoRulePlace(0,"next-cx","cx");
  `);
  assert.equal(Boolean(page.get("dialog").open),false);
  assert.equal(page.run('own.waiting.some(c=>c.uid==="eisen1")'),true);
});

test("アイゼンの誘発は置いた瞬間のカードを記録し、任意の枚数だけを思い出にできる",async()=>{
  const page=await launchStellaAbility();
  page.run(`
    const fri=(no,uid,cx=false)=>({id:"SFN/"+no,uid,cx,faceUp:true,orientation:0});
    own.deck.push(fri("S136-001","reserve"));
    own.waiting.push(fri("S136-006","first"),fri("S136-006S","foil"));
    const queued=frierenEisenActions(0,fri("S128-022","cx",true));
    own.waiting.push(fri("S136-006","late"));
    runRuleOperation(done=>botResolveTriggered(0,queued,done));
  `);
  ruleButton(page,"2．旅の日常 アイゼン");
  ruleButton(page,"選んだカードを思い出にする");
  assert.equal(page.run("own.memory.map(c=>c.uid).join()"),"foil");
  assert.equal(page.run("own.waiting.map(c=>c.uid).join()"),"first,late");
});

test("思い出のアイゼン4枚分のパワーとアタック時能力が重複する",async()=>{
  const page=await launchStellaAbility();
  page.run(`
    const fri=(no,uid)=>({id:"SFN/"+no,uid,faceUp:true,orientation:0});
    own.front0.push(fri("S128-003","himmel"));
    for(let i=0;i<4;i++)own.memory.push(fri("S136-006","eisen"+i),fri("S128-017","statue"+i));
    for(let i=0;i<6;i++)opponent.deck.push(card("001","top"+i));
    runRuleOperation(done=>botDispatch(own.front0[0],"on_attack",done));
  `);
  assert.equal(page.run('botStats(0,own.front0[0]).power'),13500);
  for(let i=0;i<4;i++)ruleButton(page,"山札の下に置く");
  assert.equal(page.run('opponent.deck.at(-1).uid'),"top1");
  assert.equal(Boolean(page.get("dialog").open),false);
});

test("お前山の上見スギを選ぶと、指定の50枚が自分側にもBot側にも使える",async()=>{
  const page=launch("",new Map(),null,100,null,true);
  await page.click("openBotDeckEditor");
  page.get("botDeckPreset").value="frierenGreen";
  page.click("applyBotDeckPreset");
  page.click("editOpponentBotDeck");
  page.click("applyBotDeckPreset");
  assert.equal(page.get("startEditedBotBattle").disabled,false);
  page.click("startEditedBotBattle");
  const {decks}=snapshot(page);
  const expected={ "S128-003":4,"S128-002":1,"S128-009":2,"S136-012":1,"S136-046":1,"S136-036":2,
    "S128-017":4,"S108-T04":4,"S136-001":4,"S136-005":3,"S136-006":4,"S136-033":3,"S136-034":3,
    "S136-065":1,"S108-T11":1,"S136-048":1,"S128-021":3,"S108-T09":4,"S128-022":4 };
  for(const deck of decks){
    assert.deepEqual(Object.fromEntries(deck.cards.map(card=>[card.id.slice(4),card.num])),expected);
    assert.equal(deck.cards.filter(card=>card.cx).reduce((sum,card)=>sum+card.num,0),8);
  }
});

test("Botのラヴィーネが手札を払い山札からカンネを登場させ、互いのアタック時能力を有効にする",async()=>{
  const page=await launchStellaAbility();
  page.run(`
    const fri=(no,uid,cx=false)=>({id:"SFN/"+no,uid,cx,faceUp:true,orientation:0});
    opponent.hand.push(fri("S136-033","lawine"),fri("S136-001","cost"));
    opponent.deck.push(fri("S136-034S","kanne"),fri("S108-T09","reserve",true),fri("S136-006","reserve2"));
    match.turn.player=1;
    runRuleOperation(done=>autoRuleResolvePlay(1,0,"front0",done));
  `);
  assert.equal(page.run("opponent.front1[0].uid"),"kanne");
  assert.equal(page.run("opponent.waiting[0].uid"),"cost");
  page.run('runRuleOperation(done=>botDispatch(opponent.front1[0],"on_attack",done,1))');
  assert.equal(page.run("botStats(1,opponent.front1[0]).power"),3000);
  assert.equal(page.run("botStats(1,opponent.front1[0]).soul"),2);
  page.run('runRuleOperation(done=>botDispatch(opponent.front0[0],"on_attack",done,1))');
  assert.equal(page.run("botStats(1,opponent.front0[0]).power"),5000);
});

test("未来を予知できる能力は双方の山札を元の順番のまま見てストックに入る",async()=>{
  const page=await launchStellaAbility();
  page.run(`
    const fri=(no,uid)=>({id:"SFN/"+no,uid,cx:false,faceUp:true,orientation:0});
    own.level.push(fri("S136-033","green"),fri("S136-001","yellow"));
    own.hand.push(fri("S136-048","event"));
    for(let i=0;i<4;i++){
      own.deck.push(fri("S136-001","own"+i));
      opponent.deck.push(card("001","opponent"+i));
    }
    autoRulePlayEvent(0,"event");
  `);
  ruleButton(page,"1枚見る");
  ruleButton(page,"次の1枚を見る");
  ruleButton(page,"次の1枚を見る");
  assert.match(page.get("dialogTitle").textContent,/3枚目/);
  ruleButton(page,"ここでやめる");
  ruleButton(page,"1枚見る");
  assert.match(page.get("dialogTitle").textContent,/相手の山札/);
  ruleButton(page,"元の順番で戻す");
  assert.equal(page.run("own.deck.map(c=>c.uid).join()"),"own0,own1,own2,own3");
  assert.equal(page.run("opponent.deck.map(c=>c.uid).join()"),"opponent0,opponent1,opponent2,opponent3");
  assert.equal(page.run("own.stock[0].uid"),"event");
});

test("故郷の花は特徴持ち4枚で早出しでき、登場時回復と手札2枚を使う4ダメージを解決する",async()=>{
  const page=await launchStellaAbility();
  page.run(`
    const fri=(no,uid)=>({id:"SFN/"+no,uid,cx:false,faceUp:true,orientation:0});
    own.level.push(fri("S136-001","lv1"),fri("S136-034","lv2"));
    own.clock.push(fri("S136-001","heal"));
    own.hand.push(fri("S128-002","flower"),fri("S136-006","discard0"),fri("S136-006","discard1"));
    for(const [i,slot] of ["front1","front2","back0","back1"].entries())own[slot].push(fri("S136-065","ally"+i));
    for(let i=0;i<5;i++){
      own.stock.push(fri("S136-006","pay"+i));
      opponent.deck.push(card("001","damage"+i));
    }
    own.deck.push(fri("S136-001","reserve"));
    autoRulePlace(0,"flower","front0");
  `);
  ruleButton(page,"使う");
  assert.equal(page.run("own.clock.length"),0);
  assert.equal(page.run("botStats(0,own.front0[0]).power"),10500);
  page.run('runRuleOperation(done=>botDispatch(own.front0[0],"on_attack",done))');
  ruleButton(page,"1．旅の日常 アイゼン");
  ruleButton(page,"2．旅の日常 アイゼン");
  ruleButton(page,"コストを払う");
  assert.equal(page.run("own.stock.length"),0);
  assert.equal(page.run("opponent.clock.length"),4);
});

test("メトーデはLv2以上をリバースさせるとCX条件で下5枚を落として1ダメージを与える",async()=>{
  const page=await launchStellaAbility();
  page.run(`
    const fri=(no,uid,cx=false)=>({id:"SFN/"+no,uid,cx,faceUp:true,orientation:0});
    own.front0.push(fri("S136-036","methode"));
    own.cx.push(fri("S128-022","combo",true));
    opponent.front2.push(card("013","target"));
    for(let i=0;i<7;i++)opponent.deck.push(card("001","deck"+i,i===4));
    runRuleOperation(done=>botDispatch(own.front0[0],"from_hand_to_stage",done));
  `);
  assert.equal(page.run("botStats(0,own.front0[0]).power"),6500);
  page.run(`
    opponent.front2[0].orientation=180;
    runRuleOperation(done=>autoRuleResolveReversals([{owner:0,source:own.front0[0],target:opponent.front2[0],slot:"front2",sourceSlot:"front0"}],done));
  `);
  ruleButton(page,"確認して進む");
  assert.equal(page.run("opponent.waiting.length"),5);
  assert.equal(page.run("opponent.clock.length"),1);
});

test("魔法使いフリーレンはリバースした時にまだリバースしていないLv0の相手も山札下へ置ける",async()=>{
  const page=await launchStellaAbility();
  page.run(`
    own.front0.push({id:"SFN/S108-T11",uid:"mage",faceUp:true,orientation:180,cx:false});
    opponent.front2.push(card("001","target"));
    opponent.deck.push(card("001","reserve"));
    runRuleOperation(done=>autoRuleResolveReversals([{owner:1,source:opponent.front2[0],target:own.front0[0],slot:"front0",sourceSlot:"front2"}],done));
  `);
  ruleButton(page,"山札の下に置く");
  assert.equal(page.run("opponent.front2.length"),0);
  assert.equal(page.run("opponent.deck[0].uid"),"target");
});

test("南の勇者の登場時にイベントを回収し、能力を与えた味方のリバースで早出しの相手をクロックへ送る",async()=>{
  const page=await launchStellaAbility();
  page.run(`
    const fri=(no,uid)=>({id:"SFN/"+no,uid,cx:false,faceUp:true,orientation:0});
    own.level.push(fri("S136-033","green"),fri("S136-001","yellow"));
    own.hand.push(fri("S136-046","hero"),fri("S136-006","discard"));
    own.stock.push(fri("S136-006","cost"));
    own.waiting.push(fri("S136-048","event"));
    own.deck.push(fri("S136-001","reserve"));
    opponent.deck.push(card("001","reserve2"));
    opponent.front2.push(card("004","early"));
    opponent.clock.push(card("001","replace"));
    autoRulePlace(0,"hero","front0");
  `);
  ruleButton(page,"1．人類最強 南の勇者・登場時・最大2枚にリバース時能力を付与");
  ruleButton(page,"人類最強 南の勇者");
  ruleButton(page,"選択を確定");
  ruleButton(page,"1．旅の日常 アイゼン");
  ruleButton(page,"1．未来を予知できる能力");
  assert.equal(page.run("own.hand[0].uid"),"event");
  page.run(`
    own.front0[0].orientation=180;
    runRuleOperation(done=>autoRuleResolveReversals([{owner:1,source:opponent.front2[0],target:own.front0[0],slot:"front0",sourceSlot:"front2"}],done));
  `);
  ruleButton(page,"クロックを入れ替える");
  assert.equal(page.run("opponent.clock[0].uid"),"early");
  assert.equal(page.run("opponent.waiting[0].uid"),"replace");
});

test("Botはメインで確実に勝てる対面を作り、ダイレクトよりそのフロントから殴る",async()=>{
  const page=await launchStellaAbility();
  page.run(`
    const ownCard=(uid,power)=>({...card("001",uid),botPower:power});
    opponent.front0.push(ownCard("strong",6500));
    opponent.front1.push(ownCard("weak",1000));
    own.front0.push(ownCard("target",4000));
    match.turn.player=1;
    match.turn.number=2;
    match.bot.scenario="stella-sora-mirror";
    setTurnPhase("main");
    autoRuleBotStep();
  `);
  assert.equal(page.run("opponent.front2[0].uid"),"strong");
  page.run(`
    opponent.deck.push(ownCard("trigger",1000),ownCard("reserve",1000));
    own.deck.push(ownCard("damage",1000),ownCard("reserve2",1000));
    setTurnPhase("attack");
    autoRuleBotStep();
  `);
  assert.equal(page.run("opponent.front2[0].orientation"),90);
  assert.equal(page.run('opponent.front0.concat(opponent.front1).find(c=>c.uid==="weak").orientation'),0);
  ruleButton(page,"確認して進む");
  ruleButton(page,"確認して進む");
  assert.equal(page.run("own.front0[0].orientation"),180);
});

test("Botはパワー不足でもサイドで攻撃し、トリガーをストックに置く",async()=>{
  const page=await launchStellaAbility();
  page.run(`
    opponent.front0.push(card("001","attacker"));
    opponent.deck.push(card("001","reserve"),card("001","trigger"));
    own.front2.push(card("004","lv3"));
    own.deck.push(card("001","reserve2"));
    match.turn.player=1;
    setTurnPhase("attack");
    autoRuleBotStep();
  `);
  assert.equal(page.run("opponent.front0[0].orientation"),90);
  assert.equal(page.run("opponent.stock[0].uid"),"trigger");
  assert.equal(page.run("own.clock.length"),0);
  assert.equal(page.run("own.front2[0].orientation"),0);
});

test("Botは前列2枚と手札4枚があればクロックを省略する",async()=>{
  const page=await launchStellaAbility();
  page.run(`
    for(let i=0;i<4;i++)opponent.hand.push(card("001","hand"+i));
    opponent.front0.push(card("001","front0"));
    opponent.front1.push(card("001","front1"));
    match.bot.scenario="stella-sora-mirror";
    match.turn.player=1;
    setTurnPhase("clock");
    autoRuleBotStep();
  `);
  assert.equal(page.run("match.turn.phase"),"main");
  assert.equal(page.run("opponent.clock.length"),0);
  assert.equal(page.run("opponent.hand.length"),4);
});

test("Botは勝てる対面がなければ空き枠へ移動し、ソウルが高いサイドよりダイレクトを優先する",async()=>{
  const page=await launchStellaAbility();
  page.run(`
    opponent.front0.push({...card("001","side"),botSoul:5});
    opponent.front1.push(card("001","mover"));
    own.front2.push(card("004","occupied0"));
    own.front1.push(card("004","occupied1"));
    match.turn.player=1;
    match.turn.number=2;
    match.bot.scenario="stella-sora-mirror";
    setTurnPhase("main");
    autoRuleBotStep();
  `);
  assert.equal(page.run("opponent.front2.length"),1);
  page.run(`
    opponent.front0.splice(0);
    opponent.front1.splice(0);
    opponent.front0.push({...card("001","side"),botSoul:8});
    opponent.deck.push(card("001","reserve"),card("001","trigger"));
    own.deck.push(card("001","reserve2"),card("001","damage"));
    setTurnPhase("attack");
    autoRuleBotStep();
  `);
  assert.equal(page.run("opponent.front2[0].orientation"),90);
  assert.equal(page.run("opponent.front0[0].orientation"),0);
  assert.match(page.run("match.bot.log.join()"),/ダイレクトを優先/);
});


test("Botは集中でレストする前に後列のキャラを攻撃に回し、3回の攻撃でストックを増やす",async()=>{
  const page=await launchStellaAbility();
  page.run(`
    opponent.front0.push(card("001","front"));
    opponent.back0.push(card("T03","support"));
    opponent.back1.push(card("008","brainstorm"));
    opponent.stock.push(card("001","starting-stock"));
    for(let i=0;i<12;i++){
      opponent.deck.push(card("002","trigger"+i));
      own.deck.push(card("001","damage"+i));
    }
    match.turn.player=1;
    match.turn.number=2;
    match.bot.scenario="stella-sora-mirror";
    setTurnPhase("main");
    autoRuleBotStep();
    match.bot.scenario=autoRuleScenario;
    setTurnPhase("attack");
    for(let i=0;i<3;i++)autoRuleBotStep();
  `);
  assert.equal(page.run("opponent.stock.length"),4);
  assert.equal(page.run("botSlots.slice(0,3).filter(slot=>opponent[slot][0]?.orientation===90).length"),3);
});

test("Botはレベル1でフィレンに合う色を選び、対応CXで次のターンの手札を補う",async()=>{
  const page=await launchStellaAbility();
  page.run(`
    opponent.hand.push(card("032","other-cx",true),card("002","firen"),card("031R","song",true));
    for(let i=0;i<6;i++)opponent.clock.push(card("076","blue"+i));
    opponent.clock.push(card("008","green"));
    opponent.waiting.push(card("025","salvage"));
    for(let i=0;i<5;i++){
      opponent.deck.push(card("001","trigger"+i));
      own.deck.push(card("001","damage"+i));
    }
    match.turn.player=1;
    match.turn.number=2;
    match.bot.scenario="stella-sora-mirror";
    openMandatoryLevel(1,()=>{});
    setTurnPhase("main");
    autoRuleBotStep();
    autoRuleBotStep();
  `);
  assert.equal(page.run("opponent.level[0].uid"),"green");
  assert.equal(page.run("opponent.cx[0].uid"),"song");
  assert.equal(page.run('botSlots.slice(0,3).some(slot=>opponent[slot][0]?.uid==="firen")'),true);
  page.run("autoRuleBotStep()");
  ruleButton(page,"確認して進む");
  ruleButton(page,"確認して進む");
  ruleButton(page,"確認して進む");
  assert.equal(page.run("opponent.stock.length"),1);
  assert.equal(page.run("opponent.hand.at(-1).uid"),"salvage");
  assert.equal(page.get("botRecovery").hidden,false);
});


test("Botは出せるキャラがなければ、集中で外した後にもう一度集中できる",async()=>{
  const page=await launchStellaAbility();
  page.run(`
    opponent.back0.push(card("008","concentration1"));
    opponent.back1.push(card("008","concentration2"));
    opponent.stock.push(card("001","stock1"),card("001","stock2"));
    for(let i=0;i<10;i++)opponent.deck.push(card("001","miss"+i));
    match.turn.player=1;
    match.turn.number=2;
    match.bot.scenario="stella-sora-mirror";
    setTurnPhase("main");
    autoRuleBotStep();
  `);
  for(let i=0;i<2;i++){
    assert.equal(page.get("dialogTitle").textContent,"Botの集中・CX 0枚");
    ruleButton(page,"確認して進む");
  }
  assert.equal(page.run("opponent.stock.length"),0);
  assert.equal(page.run("match.turn.phase"),"climax");
});

test("手札が6枚あるBotはフィレンの対応をストックに置き、対象を公開する",async()=>{
  const page=await launchStellaAbility();
  page.run(`
    for(let i=0;i<6;i++)opponent.hand.push(card("001","hand"+i));
    opponent.front0.push(card("002","firen"));
    opponent.cx.push(card("031","song",true));
    opponent.waiting.push(card("025","salvage"));
    match.bot.scenario="stella-sora-mirror";
    runRuleOperation(done=>botDispatch(opponent.front0[0],"on_attack",done,1));
  `);
  assert.equal(page.get("dialogTitle").textContent,"Botのフィレン・ストックへ");
  assert.equal(page.run("opponent.stock[0].uid"),"salvage");
  ruleButton(page,"確認して進む");
});

test("Botは集中で回収したカードを表示し、出せるキャラが手に入れば2回目を使わない",async()=>{
  const page=await launchStellaAbility();
  page.run(`
    opponent.back0.push(card("008","concentration1"));
    opponent.back1.push(card("008","concentration2"));
    opponent.stock.push(card("032","stock1",true),card("032","stock2",true));
    for(let i=0;i<8;i++)opponent.deck.push(card("T03","found"+i));
    opponent.deck.push(card("031","hit",true));
    match.turn.player=1;
    match.turn.number=2;
    match.bot.scenario="stella-sora-mirror";
    setTurnPhase("main");
    autoRuleBotStep();
  `);
  assert.equal(page.get("dialogTitle").textContent,"Botの集中・CX 1枚");
  ruleButton(page,"確認して進む");
  assert.equal(page.get("dialogTitle").textContent,"Botの集中・手札に回収");
  assert.equal(page.get("dialogBody").children[0].children.length,1);
  ruleButton(page,"確認して進む");
  assert.equal(page.run("opponent.stock.length"),1);
  assert.equal(page.run("match.turn.phase"),"climax");
  assert.ok(page.run("botSlots.slice(0,3).some(slot=>opponent[slot][0]?.uid.startsWith('found'))"));
});

test("BotのマリガンはLv0とレベル1の対応CXを残し、重複CXや終盤札を交換する",async()=>{
  const page=launch("",new Map(),null,100,null,true);
  await page.settle();
  page.get("botScenario").value="stella-sora-mirror";
  page.click("startBotBattle");
  page.run(`
    const b=players[1];
    while(b.hand.length)botMove(b,"hand",0,"deck");
    for(const number of ["001","031","031","076","094"]){
      const i=b.deck.findIndex(card=>card.id.endsWith("-"+number));
      botMove(b,"deck",i,"hand");
    }
  `);
  const original=JSON.parse(page.run("JSON.stringify(players[1].hand)"));
  page.click("confirmMulligan");
  const after=snapshot(page);
  assert.equal(after.players[1].hand.length,5);
  assert.ok(after.players[1].hand.some(card=>card.uid===original[0].uid));
  assert.ok(after.players[1].hand.some(card=>card.uid===original[1].uid));
  assert.deepEqual(after.players[1].waiting.map(card=>card.uid),original.slice(2).reverse().map(card=>card.uid));
  assert.ok(after.bot.battleLog.some(entry=>entry.p===1&&entry.text==="マリガンで3枚交換"));
  assert.deepEqual(ruleCounts(after),[50,50]);
});

test("Botはレベル0でフィレンの対応CXを温存し、レベル置場は対応の緑を優先する",async()=>{
  const page=await launchStellaAbility();
  page.run(`
    match.decks[1]=stellaDeck;
    match.bot.scenario="stella-sora-mirror";
    match.turn.player=1;
    match.turn.number=2;
    opponent.front0.push(card("001","front"));
    opponent.hand.push(card("031","song",true));
    opponent.clock.push(card("076","blue"));
    for(let i=0;i<5;i++)opponent.clock.push(card("076","blue"+i));
    opponent.clock.push(card("008","green"));
    setTurnPhase("climax");
    autoRuleBotStep();
  `);
  assert.equal(page.run("opponent.cx.length"),0);
  assert.equal(page.run("opponent.hand[0].uid"),"song");
  page.run("openMandatoryLevel(1,()=>{})");
  assert.equal(page.run("opponent.level[0].uid"),"green");
});

test("フリーレンのBotは対応CXが手札にあれば、レベル0のうちに勇者ヒンメルを回収する",async()=>{
  const page=await launchStellaAbility();
  page.run(`
    match.decks[1]=frierenDeck;
    match.bot.scenario="stella-custom";
    const fri=(no,uid,cx=false)=>({id:"SFN/"+no,uid,cx,faceUp:true,orientation:0});
    opponent.hand.push(fri("S108-T09","cx",true));
    opponent.waiting.push(fri("S136-001","level0"),fri("S108-T04","combo"));
    stellaSalvage(1,frierenAlly,()=>{});
  `);
  assert.equal(page.run("opponent.hand.at(-1).uid"),"combo");
});

test("Botはフィレンの登場時、同名を控え室または手札から用意して2面展開する",async()=>{
  for(const duplicateZone of ["waiting","hand","deck"]){
    const page=await launchStellaAbility();
    page.run(`
      match.decks[1]=stellaDeck;
      match.bot.scenario="stella-sora-mirror";
      match.turn.player=1;
      match.turn.number=4;
      opponent.level.push(card("008","green"));
      opponent.hand.push(card("002","firen"),card("031","song",true),card("094","spare"));
      opponent.deck.push(card("001","deck"));
      opponent[${JSON.stringify(duplicateZone)}].push(card("002SP","duplicate"));
      setTurnPhase("main");
      autoRuleBotStep();
    `);
    const expected=duplicateZone==="deck"?"firen":"duplicate,firen";
    assert.equal(page.run('botSlots.slice(0,3).flatMap(slot=>opponent[slot]).map(c=>c.uid).sort().join()'),expected,duplicateZone);
    assert.ok(page.run('opponent.hand.some(c=>c.uid==="song")'));
    assert.equal(page.run('opponent.hand.some(c=>c.uid==="spare")'),duplicateZone!=="waiting");
  }
});


test("カード情報のみの収録カードを含むデッキはBot戦を開始できない",async()=>{
  const page=launch("",new Map(),null,100,null,true);
  await page.settle();
  page.run(`
    const newDeck={...stellaDeck,cards:stellaDeck.cards.map(card=>
      card.id==="STS/W140-094"?{...card,id:"STS/W140-005"}:card)};
    startBotMatch(newDeck,stellaCustomScenario,stellaDeck);
  `);
  assert.equal(page.run("isDeckSetup()"),true);
  assert.match(page.get("setupNotice").textContent,/Bot未対応/);
});

test("スタンバイでレベル＋1までのキャラをレストで出し、ルビーが対応CXを使ってスタンドする",async()=>{
  const page=await launchStellaAbility();
  page.run(`
    const oshi=(number,uid,cx=false)=>({id:"OSK/"+number,uid,cx,faceUp:true,orientation:0});
    match.turn.player=1;
    match.turn.phase="climax";
    opponent.level.push(oshi("S133-003","red"),oshi("S133-043","second"));
    opponent.back0.push(oshi("S133-003","ally-1"));
    opponent.back1.push(oshi("S133-043","ally-2"));
    opponent.waiting.push(oshi("S133-037","ruby"),oshi("S133-003","recover"));
    opponent.hand.push(oshi("S133-059","standby",true));
    opponent.deck.push(oshi("S133-003","deck"));
    autoRuleResolvePlay(1,0,"cx",()=>{});
  `);
  assert.equal(page.run("opponent.front0[0].orientation"),90);
  assert.equal(page.run("botStats(1,opponent.front0[0]).power"),11000);
  page.run('match.turn.phase="attack";autoRuleAttackStart(()=>{});');
  assert.equal(page.run("opponent.front0[0].orientation"),0);
  assert.equal(page.run("opponent.cx.length"),0);
  assert.equal(page.run('opponent.waiting.some(card=>card.uid==="standby")'),true);
  assert.equal(page.run("opponent.hand[0].uid"),"recover");
});

test("ルビーの攻撃時コンボは公開した山札上を残し、そのレベル以下のキャラだけ回収する",async()=>{
  const page=await launchStellaAbility();
  page.run(`
    const oshi=(number,uid,cx=false)=>({id:"OSK/"+number,uid,cx,faceUp:true,orientation:0});
    match.turn.player=1;
    opponent.front0.push(oshi("S133-043","ruby"));
    opponent.back0.push(oshi("S133-003","ally"));
    opponent.deck.push(oshi("S133-059","top",true));
    opponent.cx.push(oshi("S133-060","combo",true));
    opponent.waiting.push(oshi("S133-037","too-high"),oshi("S133-003","eligible"));
    botDispatch(opponent.front0[0],"on_attack",()=>{},1);
  `);
  assert.equal(page.run("opponent.deck.at(-1).uid"),"top");
  assert.equal(page.run("opponent.hand[0].uid"),"eligible");
  assert.equal(page.run("botStats(1,opponent.front0[0]).power"),8000);
});

test("双星は芸能界4枚で早出しでき、登場時に回復し、バトルに勝つと手札へ戻れる",async()=>{
  const page=await launchStellaAbility();
  page.run(`
    const oshi=(number,uid)=>({id:"OSK/"+number,uid,faceUp:true,orientation:0,cx:false});
    match.turn.player=1;
    match.turn.phase="main";
    for(const slot of botSlots.slice(1))opponent[slot].push(oshi("S133-003",slot));
    opponent.hand.push(oshi("S121-030","aqua-ruby"));
    opponent.level.push(oshi("S133-003","red"),oshi("S133-043","second"));
    opponent.clock.push(oshi("S133-003","damage"));
    opponent.stock.push(oshi("S133-003","stock1"),oshi("S133-003","stock2"));
    opponent.deck.push(oshi("S133-003","deck"));
    own.front2.push(card("001","opponent"));
  `);
  assert.equal(page.run('autoRuleLegalPlay(1,opponent.hand[0],"main","character")'),"");
  page.run('autoRuleResolvePlay(1,0,"front0",()=>{});');
  assert.equal(page.run("opponent.clock.length"),0);
  assert.equal(page.run("botStats(1,opponent.front0[0]).power"),10000);
  page.run('autoRuleResolveReversals(botBattle(1,"front0","aqua-ruby","opponent","front2"),()=>{});');
  assert.equal(page.run("opponent.hand[0]?.uid"),"aqua-ruby");
});

test("ツクヨミは自身以外を強化し、コストを払いクロックの下の札も回収する",async()=>{
  const page=await launchStellaAbility();
  page.run(`
    const oshi=(number,uid)=>({id:"OSK/"+number,uid,faceUp:true,orientation:0,cx:false});
    match.turn.player=1;
    opponent.back0.push(oshi("S133-046","tsukuyomi"));
    opponent.front0.push(oshi("S133-003","ally"));
    opponent.stock.push(oshi("S133-003","stock1"),oshi("S133-003","stock2"));
    opponent.hand.push(oshi("S133-003","discard"));
    opponent.clock.push(oshi("S133-003","bottom"),oshi("S133-043","top"));
  `);
  assert.equal(page.run("botStats(1,opponent.back0[0]).power"),5000);
  assert.equal(page.run("botStats(1,opponent.front0[0]).power"),2500);
  page.run('oshiTsukuyomiClock(1,opponent.back0[0],()=>{});');
  assert.equal(page.run("opponent.stock.length"),0);
  assert.equal(page.run("opponent.back0[0].orientation"),90);
  assert.equal(page.run("opponent.hand[0].uid"),"bottom");
  assert.equal(page.run("opponent.clock[0].uid"),"top");
});

test("メモ魔の助太刀は芸能界のキャラの枚数だけ相手の山札の下を落とす",async()=>{
  const page=await launchStellaAbility();
  page.run(`
    const oshi=(number,uid)=>({id:"OSK/"+number,uid,faceUp:true,orientation:0,cx:false});
    opponent.front0.push(oshi("S133-003","defender"));
    opponent.back0.push(oshi("S133-046","ally"));
    opponent.hand.push(oshi("S107-093","backup"));
    opponent.stock.push(oshi("S133-003","stock"));
    opponent.level.push(oshi("S133-003","lv1"),oshi("S133-003","lv2"));
    own.deck.push(card("001","bottom"),card("001","middle"),card("001","top"));
    autoRuleCounter(1,card("001","attacker"),opponent.front0[0],()=>{});
  `);
  assert.equal(page.run("opponent.front0[0].turnPowerBonus"),3000);
  assert.equal(page.run('own.waiting.map(card=>card.uid).join()'),"bottom,middle");
  assert.equal(page.run("own.deck[0].uid"),"top");
});

test("個人間オーディションは山札上の1枚を手札に加え、青の手札を捨てると戻る",async()=>{
  const page=await launchStellaAbility();
  page.run(`
    const oshi=(number,uid)=>({id:"OSK/"+number,uid,faceUp:true,orientation:0,cx:false});
    opponent.front0.push(oshi("S133-003","ally"));
    opponent.hand.push(oshi("S133-095","event"),oshi("S133-061","blue"));
    opponent.stock.push(oshi("S133-003","stock"));
    opponent.deck.push(oshi("S133-003","unseen"),oshi("S133-003","third"),oshi("S133-003","second"),oshi("S133-003","first"));
    const definition=botDefinition(opponent.hand[0]);
    autoRuleResolveEvent(1,0,definition,autoRuleEventEffect(definition),()=>{});
  `);
  assert.equal(page.run('opponent.hand.map(card=>card.uid).join()'),"first,event");
  assert.equal(page.run('opponent.waiting.map(card=>card.uid).sort().join()'),"blue,second,stock,third");
  assert.equal(page.run("opponent.deck[0].uid"),"unseen");
});
