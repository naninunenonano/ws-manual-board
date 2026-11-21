"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const catalog = require("../card-catalog.js");
const data = require("../card-data/catalog.json");
const engine = require("../effects/engine.js");
test("STS/W140-001: metadata, variants and implemented effects", () => {
  const cards = catalog.checked(data, {formal:true}).cards;
  const card = cards.find(c => c.cardNumber === "STS/W140-001");
  assert.ok(card);
  assert.deepEqual(card.variants, ["STS/W140-001","STS/W140-001S","STS/W140-001SP"]);
  assert.equal(card.color, "緑");
  assert.deepEqual(card.stats, {level:0,cost:0,power:1500,soul:1});
  assert.deepEqual(card.triggers, []);
  assert.deepEqual(card.traits, ["巡遊者","恩恵意志"]);
  assert.deepEqual(card.keywords, []);
  assert.equal(card.effects.length,2);
  assert.match(card.effects[0].sourceText,/巡遊者/);
  assert.match(card.effects[0].sourceText,/魔王/);
  assert.match(card.effects[0].sourceText,/レベル1以下/);
  assert.match(card.effects[1].sourceText,/回想/);
  assert.match(card.effects[1].sourceText,/ターン1/);
  for(const effect of card.effects) {
    assert.equal(effect.implementationStatus,"implemented");
    assert.deepEqual(engine.inspect(effect).issues,[]);
    assert.ok(effect.sourceText.length>0);
  }
});

test("Reis on-play cost, search and shuffle",()=>{
 const e=data.cards[0].effects[0],b=engine.emptyBoard();
 const c=(uid,zone,extra={})=>({uid,cardNumber:"TEST/S001-001",...extra});
 b.self.stock.push(c("stock"));b.self.waiting.push(c("cost","waiting",{type:"character",traits:["巡遊者"]}));
 b.self.deck.push(c("target","deck",{type:"character",level:1}),c("other","deck",{type:"event",level:0}));
 const result=engine.run(e,b,{activate:true,clockCost:["cost"],searched:["target"]});
 assert.equal(result.status,"success",result.message);
 assert.equal(result.state.self.clock[0].uid,"cost");
 assert.equal(result.state.self.hand[0].uid,"target");
 assert.equal(result.state.self.stock.length,0);
 assert.equal(b.self.clock.length,0);
 assert.equal(engine.run(e,b,{activate:false}).status,"skipped");
});
test("Reis console success, failure, turn limit and memory-marker condition",()=>{
 const e=data.cards[0].effects[1],card=(uid,extra={})=>({uid,cardNumber:"TEST/S001-001",...extra});
 const b=engine.emptyBoard();
 b.self.stage.push(card("source",{type:"character"}),card("cost",{type:"character",keywords:["回想"]}));
 b.self.deck.push(card("hit",{type:"character",level:0}));
 const choices={sourceUid:"source",recollectionCost:["cost"],usedThisTurn:0};
 const result=engine.run(e,b,choices);
 assert.equal(result.status,"success",result.message);
 assert.equal(result.state.self.memory[0].uid,"cost");
 assert.equal(result.state.self.hand[0].uid,"hit");
 assert.equal(engine.run(e,b,{...choices,usedThisTurn:1}).status,"condition-not-met");
 const miss=structuredClone(b);miss.self.deck=[card("miss",{type:"event",level:0})];
 const failedReveal=engine.run(e,miss,{...choices,usedThisTurn:0});
 assert.equal(failedReveal.status,"success",failedReveal.message);
 assert.equal(failedReveal.state.self.deck[0].uid,"miss");
 const memoryFull=structuredClone(b);memoryFull.self.memory.push(card("m1"),card("m2"));
 assert.equal(engine.run(e,memoryFull,{...choices,usedThisTurn:0}).status,"condition-not-met");
});

test("guided on-play choices use the draft after costs and abort leaves the original board intact",()=>{
 const e=data.cards[0].effects[0], b=engine.emptyBoard();
 const c=(uid,extra={})=>({uid,cardNumber:"TEST/S001-001",...extra});
 b.self.stock.push(c("stock"));
 b.self.waiting.push(c("cost",{type:"character",traits:["巡遊者"]}),c("other",{type:"event",traits:["魔王"]}));
 b.self.deck.push(c("search",{type:"character",level:1}),c("miss",{type:"character",level:2}));
 const guide=engine.guide(e,b);
 assert.equal(guide.next().value.kind,"optional");
 assert.equal(guide.next(true).value.kind,"cost");
 assert.deepEqual(guide.next().value.candidates.map(c=>c.uid),["cost"]);
 assert.equal(guide.next(["cost"]).value.kind,"cost");
 const search=guide.next().value;
 assert.equal(search.min,0);
 assert.deepEqual(search.candidates.map(c=>c.uid),["search"]);
 guide.return();
 assert.deepEqual(b.self.stock.map(c=>c.uid),["stock"]);
 assert.deepEqual(b.self.waiting.map(c=>c.uid),["cost","other"]);
 const noSearch=engine.guide(e,b);
 noSearch.next();noSearch.next(true);noSearch.next();noSearch.next(["cost"]);noSearch.next();
 const finished=noSearch.next([]).value;
 assert.equal(finished.status,"success");
 assert.equal(finished.state.self.hand.length,0);
 assert.equal(finished.state.self.clock[0].uid,"cost");
});

test("guided console skips its source, reports returning a miss, and handles more than one top card",()=>{
 const e=data.cards[0].effects[1],b=engine.emptyBoard();
 const c=(uid,extra={})=>({uid,cardNumber:"TEST/S001-001",type:"character",level:0,...extra});
 b.self.stage.push(c("source",{keywords:["回想"]}),c("dest",{keywords:["回想"]}));
 b.self.deck.push(c("miss",{level:2}));
 const guide=engine.guide(e,b,{sourceUid:"source"});
 assert.deepEqual(guide.next().value.candidates.map(c=>c.uid),["dest"]);
 assert.equal(guide.next(["dest"]).value.kind,"cost");
 const reveal=guide.next().value;
 assert.equal(reveal.kind,"reveal");
 assert.deepEqual(reveal.returned,["miss"]);
 assert.equal(guide.next().value.status,"success");
 b.self.deck=[c("bottom"),c("miss1",{level:1}),c("hit"),c("miss2",{type:"event"})];
 const multi={optional:false,steps:[{handler:"consoleTop",params:{side:"self",cardType:"character",maxLevel:0,count:3,to:{side:"self",zone:"waiting"},returnPosition:"bottom"}}]};
 const actual=engine.run(multi,b);
 assert.equal(actual.status,"success");
 assert.deepEqual(actual.log[0].revealed,["miss2","hit","miss1"]);
 assert.deepEqual(actual.state.self.deck.map(c=>c.uid),["miss1","miss2","bottom"]);
 assert.deepEqual(actual.state.self.waiting.map(c=>c.uid),["hit"]);
});
