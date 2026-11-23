"use strict";

const assert=require("node:assert/strict");
const test=require("node:test");
const Catalog=require("../card-catalog.js");
const Effects=require("../effects/engine.js");
const {cards}=require("../card-data/catalog.json");

const find=number=>Catalog.findCard(cards,number);
const natsuka=find("STS/W140-004");
const [enter,combo,gained]=natsuka.effects;
const sample=(uid,extra={})=>({uid,cardNumber:"TEST/S001-001",type:"character",traits:[],...extra});
function fixture({marker=true,dream="STS/W140-032R",allyTraits=["魔王"]}={}){
  const board=Effects.emptyBoard();
  board.self.stage.push(sample("natsuka",{cardNumber:natsuka.cardNumber,traits:natsuka.traits,
    markers:marker?[sample("marker")]:[]}),sample("ally",{traits:allyTraits}));
  board.self.cx.push(sample("cx",{cardNumber:dream,type:"climax"}));
  board.self.hand.push(sample("cost"));
  board.self.clock.push(sample("bottom"),sample("middle"),sample("top"));
  board.opponent.deck.push(sample("second"),sample("first"));
  return board;
}
const sourceUid="natsuka";
const pay={sourceUid,activate:true,discard:["cost"]};
const run=(effect,board,choices)=>Effects.run(effect,board,choices,find);

test("Natsuka card data and three effect definitions validate",()=>{
  assert.equal(natsuka.color,"緑");
  assert.deepEqual(natsuka.stats,{level:3,cost:2,power:9500,soul:2});
  assert.deepEqual(natsuka.traits,["巡遊者","花咲旅団"]);
  assert.deepEqual(natsuka.triggers,["ソウル"]);
  for(const effect of natsuka.effects)assert.deepEqual(Effects.inspect(effect).issues,[]);
});

test("Natsuka may heal exactly the top clock card when entering",()=>{
  const board=fixture();
  const declined=run(enter,board,{sourceUid,heal:false});
  assert.deepEqual(declined.state,board);
  const result=run(enter,board,{sourceUid,heal:true});
  assert.deepEqual(result.state.self.clock.map(c=>c.uid),["bottom","middle"]);
  assert.equal(result.state.self.waiting.at(-1).uid,"top");
});

test("Natsuka CX combo needs Dream and a different eligible character and may decline the cost",()=>{
  for(const option of [{dream:"STS/W140-031"},{allyTraits:["花咲旅団"]}]){
    const board=fixture(option);
    assert.equal(run(combo,board,pay).status,"condition-not-met");
  }
  const board=fixture({marker:false});
  assert.deepEqual(run(combo,board,{sourceUid,activate:false}).state,board);
  assert.equal(run(combo,board,{...pay,discard:[]}).status,"needs-choice");
  const result=run(combo,board,pay);
  assert.equal(result.status,"success");
  assert.deepEqual(result.state.self.waiting.map(c=>c.uid),["cost"]);
  assert.deepEqual(result.state.opponent.clock.map(c=>c.uid),["first","second"]);
  assert.equal(result.state.self.stage[0].gainedAbilities,undefined);
});

test("A canceled initial burn still grants the marked Natsuka its turn-one trigger ability",()=>{
  const board=fixture({dream:"STS/W140-032OFR"});
  board.opponent.deck[0].type="climax";
  const comboResult=run(combo,board,pay);
  const state=comboResult.state;
  assert.deepEqual(state.opponent.waiting.map(c=>c.uid),["first","second"]);
  assert.deepEqual(state.opponent.clock,[]);
  assert.deepEqual(state.self.stage[0].gainedAbilities,[gained.id]);
  assert.equal(run(gained,state,{sourceUid,triggerClimax:false}).status,"condition-not-met");
  assert.equal(run(gained,state,{sourceUid:"ally",triggerClimax:true}).status,"condition-not-met");
  assert.equal(run(gained,state,{sourceUid,triggerClimax:true,usedThisTurn:1}).status,"condition-not-met");

  for(const healCount of [0,1,2]){
    const healing=run(gained,state,{sourceUid,triggerClimax:true,triggerMode:1,healCount});
    assert.equal(healing.status,"success");
    assert.deepEqual(healing.state.self.clock.map(c=>c.uid),["bottom","middle","top"].slice(0,3-healCount));
  }

  state.opponent.deck.push(sample("spare"),sample("next-cx",{type:"climax"}));
  const damage=run(gained,state,{sourceUid,triggerClimax:true,triggerMode:0});
  assert.equal(damage.status,"success");
  assert.deepEqual(damage.state.opponent.deck.map(c=>c.uid),["spare"]);
  assert.equal(damage.state.opponent.waiting.at(-1).uid,"next-cx");
});
