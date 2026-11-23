"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const Catalog = require("../card-catalog.js");
const Effects = require("../effects/engine.js");
const {cards} = require("../card-data/catalog.json");

const find = number => Catalog.findCard(cards,number);
const otoha = find("STS/W140-003");
const [early,marker,entry] = otoha.effects;
const character = (uid,extra={}) => ({uid,cardNumber:"TEST/S001-001",type:"character",cost:0,...extra});
const source = (extra={}) => character("otoha",{cardNumber:otoha.cardNumber,...otoha.stats,...extra});
const choices = {sourceUid:"otoha"};

test("Otoha catalog records a green level 3 character and all three abilities",()=>{
  assert.deepEqual(otoha.stats,{level:3,cost:2,power:6000,soul:2});
  assert.equal(otoha.color,"緑");
  assert.deepEqual(otoha.traits,["巡遊者"]);
  assert.deepEqual(otoha.triggers,["ソウル"]);
  for(const effect of otoha.effects)assert.deepEqual(Effects.inspect(effect).issues,[]);
});

test("Otoha reduces only its hand level at three memory cards and markers combined",()=>{
  const board=Effects.emptyBoard();
  const card=source();
  board.self.hand.push(card);
  board.self.memory.push(character("memory-one"),character("memory-two"));
  const host=character("host");
  board.self.stage.push(host);
  assert.equal(Effects.run(early,board,choices,find).status,"condition-not-met");
  host.markers=[character("face-down-marker",{faceUp:false})];
  assert.equal(Effects.continuousStatBonus(board,card,"in_hand","level",find),-1);
  assert.equal(card.level,3);
  board.self.stage.push(board.self.hand.pop());
  assert.equal(Effects.run(early,board,choices,find).status,"condition-not-met");
});

test("Otoha gains 5000 for its own markers, regardless of how many it has",()=>{
  const board=Effects.emptyBoard(),card=source();
  board.self.stage.push(card,character("other",{markers:[character("other-marker")]}));
  assert.equal(Effects.continuousStatBonus(board,card,"on_stage","power",find),0);
  card.markers=[character("one"),character("two")];
  assert.equal(Effects.continuousStatBonus(board,card,"on_stage","power",find),5000);
  assert.equal(card.power,6000);
  assert.equal(Effects.run(marker,board,choices,find).state.self.stage[0].power,11000);
  card.markers.pop();
  assert.equal(Effects.continuousStatBonus(board,card,"on_stage","power",find),5000);
  card.markers.pop();
  assert.equal(Effects.continuousStatBonus(board,card,"on_stage","power",find),0);
});

test("Otoha chooses one mode, draws blind and may deploy the newly drawn legal character",()=>{
  const board=Effects.emptyBoard();
  board.self.stage.push(source());
  board.self.hand.push(character("too-expensive",{cost:2}),character("event",{type:"event",cost:0}));
  board.self.deck.push(character("remaining"),character("drawn",{cost:1,level:3}));
  board.self.clock.push(character("clock"));
  const guide=Effects.guide(entry,board,choices,find);
  assert.equal(guide.next().value.kind,"branch");
  assert.deepEqual(guide.next(0).value,{kind:"optional-top",label:"山札から1枚引く"});
  const pick=guide.next(true).value;
  assert.deepEqual(pick.candidates.map(c=>c.uid),["drawn"]);
  const result=guide.next(["drawn"]).value;
  assert.equal(result.status,"success");
  assert.deepEqual(result.state.self.deck.map(c=>c.uid),["remaining"]);
  assert.deepEqual(result.state.self.stage.map(c=>c.uid),["otoha","drawn"]);
  assert.equal(result.state.self.clock.length,1);
  assert.equal(board.self.stage.length,1);
  assert.equal(Effects.run(entry,board,{...choices,entryMode:0,draw:false,deploy:[]},find).status,"success");
  assert.equal(Effects.run(entry,board,{...choices,entryMode:0,draw:false,deploy:["too-expensive"]},find).status,"needs-choice");
});

test("Otoha may recover only the top clock card, independently of deck and hand",()=>{
  const board=Effects.emptyBoard();
  board.self.stage.push(source());
  board.self.clock.push(character("older"),character("top"));
  board.self.deck.push(character("deck"));
  const result=Effects.run(entry,board,{...choices,entryMode:1,heal:true},find);
  assert.equal(result.status,"success");
  assert.deepEqual(result.state.self.clock.map(c=>c.uid),["older"]);
  assert.deepEqual(result.state.self.waiting.map(c=>c.uid),["top"]);
  assert.deepEqual(result.state.self.deck,board.self.deck);
  assert.deepEqual(Effects.run(entry,board,{...choices,entryMode:1,heal:false},find).state,board);
  assert.equal(Effects.run(entry,board,choices,find).status,"needs-choice");
});
