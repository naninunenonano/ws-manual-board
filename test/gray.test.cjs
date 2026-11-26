"use strict";
const assert=require("node:assert/strict");
const test=require("node:test");
const Catalog=require("../card-catalog.js");
const Effects=require("../effects/engine.js");
const {cards}=require("../card-data/catalog.json");

const find=number=>Catalog.findCard(cards,number);
const gray=find("STS/W140-094");
const [early,power,burn,enter]=gray.effects;
const unit=(uid,extra={})=>({uid,cardNumber:"TEST/S001-001",type:"character",traits:[],...extra});
const source=()=>unit("gray",{cardNumber:gray.cardNumber,traits:gray.traits,...gray.stats});
const opts={sourceUid:"gray"};
const ids=zone=>zone.map(card=>card.uid);
const run=(effect,board,choices=opts)=>Effects.run(effect,board,choices,find);

test("Gray's early play requires four eligible face-up stage characters",()=>{
  assert.deepEqual(gray.stats,{level:3,cost:2,power:6500,soul:2});
  assert.equal(gray.color,"青");
  assert.deepEqual(gray.triggers,["ソウル"]);
  for(const effect of gray.effects)assert.deepEqual(Effects.inspect(effect).issues,[]);
  const board=Effects.emptyBoard(),card=source();
  board.self.hand.push(card);
  board.self.stage.push(unit("one",{traits:["巡遊者","魔王"]}),unit("two",{traits:["魔王"]}),
    unit("three",{traits:["巡遊者"]}),unit("faceDown",{traits:["魔王"],faceUp:false}),unit("other"));
  board.opponent.stage.push(unit("opposing",{traits:["巡遊者"]}));
  assert.equal(run(early,board).status,"condition-not-met");
  board.self.stage[3].faceUp=true;
  assert.equal(run(early,board).state.self.hand[0].level,2);
  assert.equal(card.level,3);
});

test("Gray's marker condition gates both power and the optional attack burn",()=>{
  const board=Effects.emptyBoard(),card=source();
  board.self.stage.push(card);
  board.self.stock.push(unit("stock"));
  board.self.hand.push(unit("hand"));
  board.opponent.deck.push(unit("second"),unit("cx",{type:"climax"}));
  const pay={...opts,activate:true,discard:["hand"]};
  assert.equal(run(power,board).status,"condition-not-met");
  assert.equal(run(burn,board,pay).status,"condition-not-met");
  card.markers=[{faceUp:false},{}];
  assert.equal(run(power,board).state.self.stage[0].power,10000);
  assert.deepEqual(run(burn,board,{...opts,activate:false}).state,board);
  const cancelled=run(burn,board,pay).state;
  assert.deepEqual(ids(cancelled.self.waiting),["stock","hand"]);
  assert.deepEqual(ids(cancelled.opponent.waiting),["cx"]);
  assert.deepEqual(ids(cancelled.opponent.deck),["second"]);
  board.opponent.deck[1].type="character";
  assert.deepEqual(ids(run(burn,board,pay).state.opponent.clock),["cx"]);
  board.self.hand=[];
  assert.equal(run(burn,board,pay).status,"condition-not-met");
  card.markers=[];
  assert.equal(run(power,board).status,"condition-not-met");
});

test("Gray includes itself in X and may keep any one viewed card without revealing it",()=>{
  const board=Effects.emptyBoard();
  board.self.stage.push(source(),unit("ally",{traits:["魔王","巡遊者"]}),unit("other"));
  board.self.deck.push(unit("bottom"),unit("climax",{type:"climax"}),unit("top",{type:"event"}));
  const guide=Effects.guide(enter,board,opts,find);
  assert.deepEqual(guide.next().value,{kind:"look-next",side:"self",cards:[],max:2,canContinue:true});
  const one=guide.next(true).value;
  assert.deepEqual(ids(one.cards),["top"]);
  assert.deepEqual(ids(board.self.deck),["bottom","climax","top"]);
  const select=guide.next(true).value;
  assert.equal(select.privateLook,true);
  assert.deepEqual(ids(select.candidates),["top","climax"]);
  const result=guide.next(["climax"]).value;
  assert.equal(result.status,"success");
  assert.deepEqual(ids(result.state.self.deck),["bottom"]);
  assert.deepEqual(ids(result.state.self.hand),["climax"]);
  assert.deepEqual(ids(result.state.self.waiting),["top"]);
  assert.equal(result.log.at(-1).revealed,undefined);
  assert.deepEqual(run(enter,board,{...opts,lookCount:0}).state,board);
  const allWaiting=run(enter,board,{...opts,lookCount:1,lookPick:[]}).state;
  assert.deepEqual(ids(allWaiting.self.waiting),["top"]);
  assert.deepEqual(ids(allWaiting.self.deck),["bottom","climax"]);
  assert.equal(run(enter,board,{...opts,lookCount:3,lookPick:[]}).status,"needs-choice");
  assert.equal(run(enter,board,{...opts,lookCount:2,lookPick:["bottom"]}).status,"needs-choice");
  board.self.deck.pop();board.self.deck.pop();
  assert.deepEqual(Effects.guide(enter,board,opts,find).next().value,{kind:"look-next",side:"self",cards:[],max:1,canContinue:true});
});

test("Gray refreshes after moving the last viewed cards to their destinations",()=>{
  const board=Effects.emptyBoard();
  board.self.stage.push(source(),unit("unknown",{traits:null}));
  board.self.deck.push(unit("last"));
  const guide=Effects.guide(enter,board,opts,find);
  assert.deepEqual(guide.next().value,{kind:"look-next",side:"self",cards:[],max:1,canContinue:true});
  assert.equal(guide.next(true).value.privateLook,true);
  const refresh=guide.next([]).value;
  assert.equal(refresh.kind,"deck-empty");
  assert.deepEqual(ids(refresh.state.self.deck),[]);
  assert.deepEqual(ids(refresh.state.self.waiting),["last"]);
  refresh.state.self.clock.push(refresh.state.self.waiting.pop());
  const result=guide.next(refresh.state).value;
  assert.equal(result.status,"success");
  assert.deepEqual(ids(result.state.self.clock),["last"]);
});
