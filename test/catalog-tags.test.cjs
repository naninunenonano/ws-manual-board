"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const C=require("../card-catalog.js");
const E=require("../effects/engine.js");
const Cases=require("../effects/cases.js");
const data=require("../card-data/catalog.json");
const W=C.findCard(data.cards,"STS/W140-001");
const fixture=(cardNumber,extra={})=>({cardNumber,...extra});
const tag=(mode,...names)=>({mode,names});
const op=(handler,params)=>({handler,params});

test("products come from the catalog and alias searches return each definition once",()=>{
  const a=fixture("TEST/S001-001",{product:"商品A",variants:["TEST/S001-001","test/s001-001Sp"]});
  const b=fixture("TEST/S001-002",{product:"商品A"});
  const c=fixture("TEST/S002-001",{product:"新商品"});
  assert.deepEqual(C.products([a,b]),["商品A"]);
  assert.deepEqual(new Set(C.products([a,b,c])),new Set(["商品A","新商品"]));
  assert.deepEqual(C.selectCards([a,b,c],{product:"商品A"}),[a,b]);
  assert.deepEqual(C.selectCards([a,b,c],{product:"新商品",number:"test/s001"}),[]);
  assert.equal(C.findCard([a,b,c]," test/s001-001sp "),a);
  assert.equal(C.findCard([a,b,c],"TEST/S001-001S"),undefined);
  assert.deepEqual(C.selectCards([a,b,c],{number:"test/s001-001"}),[a]);
});

test("formal validation rejects alias collisions and preserves unknown versus empty tag lists",()=>{
  const a=fixture("TEST/S001-001",{variants:["test/s001-001sp"],traits:null,keywords:[]});
  const b=fixture("TEST/S001-002",{variants:["TEST/S001-001SP"]});
  const canon=fixture("TEST/S001-001SP");
  const wrap=cards=>({schemaVersion:1,cards});
  const check=cards=>C.checked(wrap(cards),{formal:true});
  const normalized=check([a]).cards[0];
  assert.deepEqual(normalized.variants,["TEST/S001-001SP"]);
  assert.equal(normalized.traits,null);
  assert.deepEqual(normalized.keywords,[]);
  const duplicate=e=>e.issues.some(issue=>issue.code==="duplicate-card");
  assert.throws(()=>check([a,b]),duplicate);
  assert.throws(()=>check([a,canon]),duplicate);
  assert.throws(()=>check([{...a,variants:["TEST/S001-001S","test/s001-001s"]}]),duplicate);
  assert.throws(()=>check([{...a,keywords:"回想"}]),e=>e.issues.some(issue=>issue.path.endsWith(".keywords")));
});

test("trait matching supports single, any, all, none and temporary additions/removals",()=>{
  const card={traits:["巡遊者","恩恵意志"],traitChanges:{added:["魔王"],removed:["巡遊者"]}};
  assert.deepEqual(E.effectiveTags(card,"traits"),["恩恵意志","魔王"]);
  assert.equal(E.matchTags(card,"traits",tag("any","魔王")),true);
  assert.equal(E.matchTags(card,"traits",tag("any","巡遊者","魔王")),true);
  assert.equal(E.matchTags(card,"traits",tag("all","巡遊者","魔王")),false);
  assert.equal(E.matchTags(card,"traits",tag("all","恩恵意志","魔王")),true);
  assert.equal(E.matchTags(card,"traits",tag("none","巡遊者")),true);
  assert.equal(E.matchTags(card,"traits",tag("none","魔王")),false);
  assert.equal(E.matchTags({traits:null},"traits",tag("none","魔王")),null);
  assert.equal(E.matchTags({traits:[]},"traits",tag("none","魔王")),true);
  assert.deepEqual(card.traits,["巡遊者","恩恵意志"]);
});

test("keyword matching respects disabled keywords and never infers them from prose",()=>{
  assert.ok(W.effects[1].sourceText.includes("回想"));
  assert.equal(E.matchTags(W,"keywords",tag("any","回想")),false);
  const added={...W,keywordChanges:{added:["回想","経験"],disabled:["回想"]}};
  assert.equal(E.matchTags(added,"keywords",tag("any","回想")),false);
  assert.equal(E.matchTags(added,"keywords",tag("any","回想","経験")),true);
  assert.equal(E.matchTags(added,"keywords",tag("none","回想")),true);
  const uncertain={keywords:null,keywordChanges:{added:["経験"],disabled:["回想"]}};
  assert.equal(E.matchTags(uncertain,"keywords",tag("any","経験","助太刀")),true);
  assert.equal(E.matchTags(uncertain,"keywords",tag("all","経験","助太刀")),null);
  assert.equal(E.matchTags(uncertain,"keywords",tag("none","回想")),true);
});

test("common condition and selection handlers work with current tags and preserve physical variant IDs",()=>{
  const board=E.emptyBoard(),from={side:"self",zone:"stage"};
  board.self.stage.push({uid:"w",cardNumber:"STS/W140-001SP",traits:W.traits,keywords:W.keywords,
    keywordChanges:{added:["回想"]},power:1500});
  const effect={id:"example",optional:false,conditions:[
    op("hasTraits",{uid:"w",...tag("any","巡遊者","魔王")}),
    op("hasKeywords",{uid:"w",...tag("all","回想")})
  ],target:op("selectCards",{from,count:1,as:"actor",traits:tag("all","恩恵意志"),keywords:tag("any","回想")}),
  steps:[op("modifyPower",{selection:"actor",amount:500})]};
  const next=structuredClone(board);
  next.self.stage[0].power=2000;
  assert.equal(Cases.execute({...W,effects:[effect]},{
    cardNumber:"STS/W140-001SP",effectId:effect.id,before:board,choices:{actor:["w"]},expected:{status:"success",state:next}
  },E).pass,true);
  assert.equal(next.self.stage[0].cardNumber,"STS/W140-001SP");
  assert.equal(board.self.stage[0].power,1500);
  const pending=E.run({...effect,conditions:[op("hasTraits",{uid:"w",...tag("none","巡遊者")})]},board,{actor:["w"]});
  assert.equal(pending.status,"condition-not-met");
  const mismatch=E.run({...effect,target:op("selectCards",{from,count:1,as:"actor",keywords:tag("none","回想")})},board,{actor:["w"]});
  assert.equal(mismatch.status,"needs-choice");
  board.self.stage[0].traits=null;
  const unknown=E.run(effect,board,{actor:["w"]});
  assert.equal(unknown.status,"unconfirmed");
  assert.equal(E.compare(unknown,{status:"unconfirmed",state:board}),false);
});

test("the submitted Wraith data resolves all explicit variants and is implemented",()=>{
  for(const number of ["STS/W140-001","STS/W140-001S","STS/W140-001SP"])
    assert.equal(C.findCard(data.cards,number),W);
  assert.equal(W.product,"ブースターパック ステラソラ");
  assert.equal(W.type,"character");
  assert.deepEqual(W.effects.map(effect=>effect.category),["控えオカケン","コンソール系"]);
  for(const effect of W.effects){
    const result=E.run(effect,E.emptyBoard());
    assert.equal(result.status,"needs-choice");
    assert.deepEqual(result.log,[]);
  }
});
