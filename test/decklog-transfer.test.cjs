const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const read = name => fs.readFileSync(path.join(__dirname, "..", name), "utf8");
const html = read("index.html");
const boardScript = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const importScript = read("decklog-import.js");

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
  .map(({code,title,rows}) => ({code,title,list:rows.map(([card_number,num])=>({card_number,num}))}));
const [frieren, idol] = decks;
const fragment = deck => "#decklog=" + encodeURIComponent(JSON.stringify(deck));
const key = p => "ws-manual-deck-v1-p" + p;

function launch(hash = "", storage = new Map(), replaceState = null) {
  const handlers = new Map();
  const element = () => ({
    textContent:"", children:[], style:{}, dataset:{}, classList:{add(){}},
    append(...children){ this.children.push(...children); },
    replaceChildren(...children){ this.children = children; },
    addEventListener(){}, scrollIntoView(){}
  });
  const elements = new Map(Array.from(html.matchAll(/ id="([^"]+)"/g), ([,id]) => [id,element()]));
  elements.get("applyDeck").disabled = true;
  const location = {hash,pathname:"/ws-manual-board/",search:""};
  const context = vm.createContext({
    document:{getElementById:id=>elements.get(id),createElement:element},
    location,
    window:{
      history:{replaceState:replaceState ?? (()=>{location.hash = "";})},
      addEventListener:(type,callback)=>handlers.set(type,callback)
    },
    localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},
    confirm:()=>true, console:{warn(){}}
  });
  vm.runInContext(boardScript,context);
  vm.runInContext(importScript,context);
  return {
    get:id=>elements.get(id), location, storage,
    navigate(nextHash){ location.hash = nextHash; handlers.get("hashchange")?.(); },
    apply(p){ elements.get("side").onchange({target:{value:p}}); elements.get("applyDeck").onclick(); },
    counts(p){
      const ids = vm.runInContext("players["+p+"].deck.map(card=>card.id)",context);
      const counts = {};
      for (const id of ids) counts[id] = (counts[id] ?? 0) + 1;
      return counts;
    }
  };
}

function checkPreview(page,deck) {
  const [title,rows] = page.get("deckPreview").children;
  assert.equal(title?.textContent, deck.title+" / "+deck.list.length+"種類 / 50枚");
  assert.deepEqual(rows.children.map(row=>row.textContent), deck.list.map(row=>row.card_number+" × "+row.num));
  assert.equal(page.get("applyDeck").disabled,false);
  assert.equal(page.get("deckCode").value,deck.code);
}
const expected = deck => Object.fromEntries(deck.list.map(row=>[row.card_number,row.num]));

test("initial transfer, same-tab transfer with a saved deck, and restored decks", () => {
  const page = launch(fragment(frieren));
  checkPreview(page,frieren);
  assert.equal(page.location.hash,"");
  page.apply(0);
  assert.deepEqual(page.counts(0),expected(frieren));
  page.navigate(fragment(idol));
  checkPreview(page,idol);
  assert.match(page.get("savedDeckStatus").textContent,/勇者一行/);
  assert.deepEqual(page.counts(0),expected(frieren));
  page.apply(1);
  assert.deepEqual(page.counts(1),expected(idol));
  const reopened = launch("",page.storage);
  assert.deepEqual(reopened.counts(0),expected(frieren));
  assert.deepEqual(reopened.counts(1),expected(idol));
});

test("legacy saved data and numeric-string quantities are accepted", () => {
  const storage = new Map([[key(0),JSON.stringify({title:frieren.title,cards:frieren.list.map(row=>({id:row.card_number,num:row.num}))})]]);
  const page = launch(fragment({...idol,list:idol.list.map(row=>({...row,num:String(row.num)}))}),storage);
  checkPreview(page,idol);
  assert.deepEqual(page.counts(0),expected(frieren));
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

test("a browser history error does not block receiving a deck", () => {
  const page = launch(fragment(frieren),new Map(),()=>{throw Error("history unavailable");});
  checkPreview(page,frieren);
});
