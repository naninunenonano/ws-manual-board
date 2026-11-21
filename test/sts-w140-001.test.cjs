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
 const failedReveal=engine.run(e,miss,choices);
 assert.equal(failedReveal.status,"success",failedReveal.message);
 assert.equal(failedReveal.state.self.deck[0].uid,"miss");
 const memoryFull=structuredClone(b);memoryFull.self.memory.push(card("m1"),card("m2"));
 assert.equal(engine.run(e,memoryFull,choices).status,"condition-not-met");
});
