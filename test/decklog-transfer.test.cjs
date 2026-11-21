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

function launch(hash = "", storage = new Map(), replaceState = null, randomValue = 100) {
  const handlers = new Map();
  const settle = () => new Promise(resolve=>setImmediate(resolve));
  let randomCalls = 0;
  let allowConfirmation = true;
  const element = () => ({
    textContent:"", children:[], style:{setProperty(){}}, dataset:{}, classList:{add(){},remove(){}},
    append(...children){ this.children.push(...children); },
    replaceChildren(...children){ this.children = children; },
    setAttribute(){}, insertBefore(){}, addEventListener(){}, scrollIntoView(){}, querySelector(){ return null; },
    showModal(){ this.open = true; }, close(){ this.open = false; }
  });
  const elements = new Map(Array.from(html.matchAll(/ id="([^"]+)"/g), ([,id]) => [id,element()]));
  elements.get("applyDeck").disabled = true;
  const location = {hash,pathname:"/ws-manual-board/",search:""};
  const context = vm.createContext({
    document:{getElementById:id=>elements.get(id),createElement:element},
    location,
    window:{
      history:{replaceState:replaceState ?? (()=>{location.hash = "";})},
      addEventListener:(type,callback)=>handlers.set(type,callback),
      scrollTo(){}
    },
    localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    crypto:{getRandomValues(buffer){ randomCalls++; buffer[0] = randomValue; return buffer; }},
    confirm:()=>allowConfirmation, console:{warn(){}}
  });
  vm.runInContext(boardScript,context);
  vm.runInContext(matchScript,context);
  vm.runInContext(importScript,context);
  return {
    get:id=>elements.get(id), location, storage, settle,
    navigate(nextHash){ location.hash = nextHash; handlers.get("hashchange")?.(); },
    apply(p){ elements.get("side").onchange({target:{value:p}}); elements.get("applyDeck").onclick(); },
    click:id=>elements.get(id).onclick(),
    counts:p=>expected(JSON.parse(storage.get(key(p)))),
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
  assert.equal(page.get("deckCode").value,deck.code);
}
const expected = deck => Object.fromEntries(deck.list.map(row=>[row.card_number,row.num]));

test("initial transfer, same-tab transfer with a saved deck, and restored decks", async () => {
  const page = launch(fragment(frieren));
  await page.settle();
  checkPreview(page,frieren);
  assert.equal(page.location.hash,"");
  page.apply(0);
  assert.deepEqual(page.counts(0),expected(frieren));
  page.navigate(fragment(idol));
  await page.settle();
  checkPreview(page,idol);
  assert.match(page.get("savedDeckStatus").textContent,/勇者一行/);
  assert.deepEqual(page.counts(0),expected(frieren));
  page.apply(1);
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
  page.click("draw");
  page.click("shuffle");
  page.run("players[side].deck.slice(-7).forEach(card=>card.cx=false)");
  for(let i=0;i<7;i++) page.click("damage");
  page.click("level");
  page.get("dialogBody").children[2].onclick();
  page.get("battleSide").onchange({target:{value:"1"}});
  page.click("draw");
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
  page.click("draw");
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
  page.click("draw");
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
  assert.match(unregistered.get("setupNotice").textContent,/プレイヤー1のデッキを登録/);
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
const chooseLevel=page=>{
  assert.match(page.get("dialogTitle").textContent,/強制レベルアップ/);
  panel(page)[1].onclick();
};

test("refresh only moves one point to clock",()=>{
  const page=ruleGame(0,0,4);
  page.click("refresh");
  assert.deepEqual([state(page).deck.length,state(page).clock.length,state(page).waiting.length],[3,1,0]);
});

test("level-up only, with eight clock cards",()=>{
  const page=ruleGame(3,8,1);
  const latest=state(page).clock.at(-1).uid;
  page.click("level");
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
    page.click("level");
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
  single.click("refresh");
  assert.equal(state(single).deck.length,0);
  assert.equal(state(single).clock.length,1);
  assert.equal(single.run("ruleBusy"),false);
  const chained=ruleGame(0,6,1);
  chained.click("refresh");
  assert.equal(state(chained).clock.length,7);
  chooseLevel(chained);
  assert.equal(state(chained).deck.length,5);
  assert.equal(state(chained).clock.length,1);
  assert.equal(chained.run("ruleBusy"),false);
});

test("multiple level-ups precede the point without duplicate choice dialogs",()=>{
  const page=ruleGame(0,15,4);
  page.click("level");
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
