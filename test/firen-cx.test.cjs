"use strict";
const assert=require("node:assert/strict");
const test=require("node:test");
const WSEffects=require("../effects/engine.js");
const {cards}=require("../card-data/catalog.json");
const firen=cards.find(card=>card.cardNumber==="STS/W140-002");
const song=cards.find(card=>card.cardNumber==="STS/W140-031");
const makeCard=(uid,definition)=>({uid,cardNumber:definition.cardNumber,type:definition.type,
  ...definition.stats,traits:definition.traits,keywords:definition.keywords});

test("Firen's optional CX target can be declined without asking for a destination",()=>{
  const board=WSEffects.emptyBoard();
  board.self.cx.push(makeCard("cx",song));
  board.self.waiting.push(makeCard("firen",firen));
  const ability=firen.effects.find(effect=>effect.timing==="on_attack");
  const guide=WSEffects.guide(ability,board);
  assert.equal(guide.next().value.kind,"select");
  const done=guide.next([]);
  assert.equal(done.done,true);
  assert.equal(done.value.status,"success");
  assert.deepEqual(done.value.state,board);
});

test("Treasure moves the revealed CX to hand regardless of the stock choice",()=>{
  for(const takeStock of [true,false]){
    const board=WSEffects.emptyBoard();
    board.self.waiting.push(makeCard("triggered",song));
    board.self.deck.push(makeCard("top",firen));
    const ability=song.effects.find(effect=>effect.timing==="on_trigger");
    const guide=WSEffects.guide(ability,board,{sourceUid:"triggered"});
    const prompt=guide.next().value;
    assert.equal(prompt.kind,"treasure");
    assert.equal(prompt.card.uid,"triggered");
    const done=guide.next(takeStock);
    assert.equal(done.done,true);
    assert.equal(done.value.status,"success");
    assert.deepEqual(done.value.log[0].revealed,["triggered"]);
    assert.deepEqual(done.value.state.self.hand.map(card=>card.uid),["triggered"]);
    assert.deepEqual(done.value.state.self.stock.map(card=>card.uid),takeStock?["top"]:[]);
    assert.equal(done.value.state.self.deck.length,takeStock?0:1);
  }
});
