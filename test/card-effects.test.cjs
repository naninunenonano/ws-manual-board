"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const catalog=require("../card-catalog.js");
const engine=require("../effects/engine.js");
const suite=require("../effects/cases.js");

const official=catalog.checked(catalog.parseJson(fs.readFileSync(path.join(__dirname,"../card-data/catalog.json"),"utf8")),{formal:true});
test("formal catalog normalizes and checks unique card numbers; unresolved facts remain unknown",()=>{
  const partial={cardNumber:" test/s001-010  ",name:"架空",type:"character",stats:{level:0},effects:null};
  const input={schemaVersion:1,cards:[partial]};
  const [card]=catalog.checked(input,{formal:true}).cards;
  assert.equal(card.cardNumber,"TEST/S001-010");
  assert.equal(card.effects,null);
  assert.equal(card.stats.level,0);
  assert.equal(catalog.selectCards([card],{name:"架空",number:"s001"}).length,1);
  assert.throws(()=>catalog.checked({...input,cards:[partial,card]},{formal:true}),err=>err.issues.some(i=>i.code==="duplicate-card"));
  assert.ok(Array.isArray(official.cards));
  const legacy={schemaVersion:1,cards:[{cardNumber:"TEST/S001-011",name:{custom:"metadata"},
    type:"climax",color:"赤",stats:{},effects:[]}]};
  assert.deepEqual(catalog.checked(legacy),legacy);
});
test("official records with supported handlers use valid effect parameters",()=>{
  for(const card of official.cards)for(const effect of card.effects??[]){
    if(effect.steps==null || effect.optional==null || ["conditions","costs","choices"].some(key=>effect[key]===null))continue;
    const invalid=engine.inspect(effect).issues.filter(issue=>issue.status==="invalid");
    assert.deepEqual(invalid,[],card.cardNumber+" / "+effect.id);
  }
});

const casesDirectory=path.join(__dirname,"card-effects");
for(const file of fs.readdirSync(casesDirectory).filter(file=>file.endsWith(".json")).sort()){
  const source=catalog.parseJson(fs.readFileSync(path.join(casesDirectory,file),"utf8"));
  for(const scenario of source.cases){
    test(file+" / "+scenario.label,()=>{
      const card=source.card??catalog.findCard(official.cards,scenario.cardNumber);
      const verdict=suite.execute(card,scenario,engine);
      assert.deepEqual(verdict.actual.status,verdict.expected.status,JSON.stringify(verdict.actual.log));
      assert.deepEqual(verdict.actual.state,verdict.expected.state);
      assert.equal(verdict.pass,true);
    });
  }
}

test("unsupported or invalid instructions block all costs and earlier steps",()=>{
  const board=engine.emptyBoard();
  const coin={uid:"a",cardNumber:"TEST/S001-001"};
  board.self.stock.push(coin);
  const effect={optional:false,costs:[{handler:"payStock",params:{side:"self",count:1}}],
    steps:[{handler:"future",params:{}}]};
  for(const [steps,status] of [
    [effect.steps,"unsupported"],
    [[{handler:"draw",params:{side:"self",count:-1}}],"invalid"],
    [[{handler:"draw",params:{side:"self",count:1,future:true}}],"invalid"]
  ]){
    const result=engine.run({...effect,steps},board);
    assert.equal(result.status,status);
    assert.deepEqual(result.state,board);
    assert.deepEqual(result.log,[]);
    assert.equal(engine.compare(result,{status,state:board}),false);
  }
});
test("after a failed step the log reports completed work; a rerun starts from the unmodified input",()=>{
  const board=engine.emptyBoard();
  board.self.stock=[{uid:"a",cardNumber:"TEST/S001-001"}];
  const effect={optional:false,costs:[{handler:"payStock",params:{side:"self",count:1}}],
    steps:[{handler:"draw",params:{side:"self",count:1}}]};
  const result=engine.run(effect,board);
  assert.equal(result.status,"failed");
  assert.deepEqual(result.log.map(step=>[step.handler,step.ok]),[["payStock",true],["draw",false]]);
  assert.deepEqual(result.state.self.waiting,board.self.stock);
  assert.equal(board.self.stock.length,1);
  assert.deepEqual(engine.run(effect,board),result);
});
test("selection identifies physical copies and ordered moves preserve relative order",()=>{
  const board=engine.emptyBoard();
  board.self.hand=["a","b","c"].map(uid=>({uid,cardNumber:"TEST/S001-001"}));
  board.opponent.deck=[{uid:"z",cardNumber:"TEST/S001-001"}];
  const from={side:"self",zone:"hand"};
  const effect={optional:false,steps:[
    {handler:"selectCards",params:{from,count:2,as:"picked"}},
    {handler:"move",params:{from,to:{side:"opponent",zone:"deck"},position:"bottom",selection:"picked"}}
  ]};
  for (const picked of [undefined,["a","a"],["a","z"]])
    assert.equal(engine.run(effect,board,picked?{picked}:{}).status,"needs-choice");
  const result=engine.run(effect,board,{picked:["c","a"]});
  assert.equal(result.status,"success");
  assert.deepEqual(result.state.opponent.deck.map(c=>c.uid),["a","c","z"]);
  assert.deepEqual(result.state.self.hand.map(c=>c.uid),["b"]);
  assert.equal(board.self.hand.length,3);
  assert.equal(engine.compare(result,{status:"success",state:board}),false);
});
test("empty zones, duplicate physical IDs, duration and limits are explicit",()=>{
  const board=engine.emptyBoard(), effect={optional:true,steps:[{handler:"draw",params:{side:"self",count:0}}]};
  assert.equal(engine.run(effect,board).status,"needs-choice");
  assert.equal(engine.run(effect,board,{activate:true}).status,"success");
  for(const option of [{limit:{uses:1}},{duration:{until:"end"}},{choices:[{id:"a"}]}])
    assert.equal(engine.run({...effect,...option},board,{activate:true}).status,"unsupported");
  board.self.hand.push({uid:"same",cardNumber:"TEST/S001-001"});
  board.opponent.hand.push({uid:"same",cardNumber:"TEST/S001-001"});
  assert.equal(engine.run(effect,board,{activate:true}).status,"invalid");
});
