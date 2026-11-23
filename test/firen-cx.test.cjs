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

test("Both Treasure CXs grant the same bonus, but only the song satisfies Firen's named combo",()=>{
  const CardCatalog=require("../card-catalog.js");
  const find=number=>CardCatalog.findCard(cards,number);
  const ability=firen.effects.find(effect=>effect.timing==="on_attack");
  const songIds=["031","031R","031S","031SP","031SSP","031OFR"];
  for(const [side,number] of [...songIds,"032","032R","032SP"].entries()){
    const board=WSEffects.emptyBoard();
    const player=side%2===0?"self":"opponent";
    const cardNumber="STS/W140-"+number;
    const definition=find(cardNumber);
    assert.equal(definition.name,songIds.includes(number)?"黎明告げる凱旋歌":"夢の先へ");
    assert.deepEqual(definition.triggers,["トレジャー"]);
    const ally=makeCard("ally",firen);
    board[player].stage.push(ally);
    board[player].cx.push({...makeCard("cx",definition),cardNumber});
    const [bonus]=WSEffects.continuousModifiers(board,player,find);
    assert.equal(bonus.power,ally.power+1000);
    assert.equal(bonus.soul,ally.soul+1);
    const relative=player==="self"?board:{self:board.opponent,opponent:board.self};
    relative.self.waiting.push(makeCard("target",firen));
    const combo=WSEffects.guide(ability,relative,{},find).next();
    assert.equal(combo.done,!songIds.includes(number));
    if(combo.done)assert.equal(combo.value.status,"condition-not-met");
    else assert.equal(combo.value.kind,"select");

    relative.self.waiting.push(relative.self.cx.pop());
    const treasure=definition.effects.find(effect=>effect.timing==="on_trigger");
    const result=WSEffects.run(treasure,relative,{sourceUid:"cx",treasureStock:false});
    assert.equal(result.status,"success");
    assert.equal(result.state.self.hand.at(-1).cardNumber,cardNumber);
  }
});
