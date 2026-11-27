"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../card-catalog.js");
const {officialImageUrl,effectChoiceImageUrl,effectChoiceFallbackUrl,isFrierenTrialClimax} = require("../card-images.js");

const card = (number="TEST/S001-001",attrs={}) => ({cardNumber:number,type:"character",
  color:"青",title:"テストタイトル",product:"試験商品",stats:{level:0,cost:0,power:1000,soul:1},effects:[],...attrs});
const catalog = (...cards) => ({schemaVersion:1,cards});

test("card numbers normalize and use the existing image URL convention",()=>{
  const number=C.normalizeNumber(" test/s001-001 ");
  assert.equal(number,"TEST/S001-001");
  assert.equal(officialImageUrl(number),"https://ws-tcg.com/wordpress/wp-content/images/cardlist/t/test_s001/test_s001_001.png");
  assert.equal(C.validNumber("TEST/S001-001A*"),true);
  assert.equal(officialImageUrl("TEST/S001-001A*"),null);
});

test("Frieren trial print images use the larger scan and fall back to the same printing",()=>{
  for(const [number,file] of [["T04","025"],["T04SP","001"],["T09","030"],["T09R","012"],["T13","034"],["T13R","015"]]){
    const id="SFN/S108-"+number;
    assert.equal(isFrierenTrialClimax(id),number.startsWith("T09"));
    assert.equal(officialImageUrl(id),"https://www.c-labo-online.jp/data/c-labo/product/wssfns108t_"+file+".jpg");
    assert.equal(effectChoiceImageUrl(id),officialImageUrl(id));
    assert.equal(effectChoiceFallbackUrl(id),"https://heartofthecards.com/images/cards/ws/sfn-s108-"+number.toLowerCase()+".png");
  }
  assert.match(officialImageUrl("SFN/S128-003"),/sfn-s128-003\.png$/);
});

test("type-dependent stats keep zero distinct from null and reject invalid numbers",()=>{
  assert.deepEqual(C.validateCard(card()),[]);
  assert.deepEqual(C.validateCard(card(undefined,{type:"event",stats:{level:0,cost:0,power:null,soul:null}})),[]);
  assert.deepEqual(C.validateCard(card(undefined,{type:"climax",stats:{level:null,cost:null}})),[]);
  const issues=C.validateCard(card(undefined,{type:"event",color:"",stats:{level:undefined,cost:-1,power:0,soul:0.1}}));
  assert.equal(issues.length,5);
  assert.equal(C.validateCard(card(undefined,{type:"constructor"}))[0].path,"カード.type");
  assert.ok(C.validateCard(card(undefined,{stats:{level:1,cost:1,power:2**53,soul:1}})).length);
});

test("effect IDs must be unique; unimplemented handlers warn and remain exportable",()=>{
  const effect=C.template("skill-1");
  const valid=card(undefined,{effects:[effect,{...C.template("skill-2"),extra:{x:1}}]});
  assert.ok(C.validateCard(valid).every(issue=>issue.code==="unsupported-handler" && issue.severity==="warning"));
  assert.deepEqual(C.checked(JSON.parse(JSON.stringify(catalog(valid)))),catalog(valid));
  const issues=C.validateCard(card(undefined,{effects:[effect,{...effect,steps:[{handler:"!",params:[]}]},{...effect,id:"other",steps:[]}]}));
  assert.ok(issues.some(issue=>issue.code==="duplicate-effect"));
  assert.ok(issues.some(issue=>issue.path.endsWith(".handler") && issue.severity==="error"));
  assert.ok(issues.some(issue=>issue.path.endsWith(".params") && issue.severity==="error"));
  assert.ok(issues.some(issue=>issue.path.endsWith(".steps") && issue.severity==="error"));
});

test("bad JSON reports line/column and cannot silently round unsafe integers",()=>{
  assert.throws(()=>C.parseJson('{\n  "steps": [1,]\n}'),/2行 15列/);
  assert.throws(()=>C.parseJson('{"bad":"\\u0"}'),/1行/);
  assert.throws(()=>C.parseJson('{"param":9007199254740993}'),/数値/);
  assert.deepEqual(C.parseJson('{"value":false}'),{value:false});
});

test("merge is atomic, detects normalized duplicate keys, and offers overwrite or keep",()=>{
  const base=catalog(card());
  const tweaked=card("test/s001-001",{title:"変更後"});
  const added=card("TEST/S001-002");
  const [skip,replace]=[false,true].map(mode=>C.mergeCatalog(base,catalog(tweaked,added),mode));
  assert.deepEqual([skip.added,skip.updated,skip.skipped],[1,0,1]);
  assert.equal(skip.catalog.cards[0].title,"テストタイトル");
  assert.equal(replace.catalog.cards[0].title,"変更後");
  assert.equal(replace.catalog.cards[0].cardNumber,"TEST/S001-001");
  assert.throws(()=>C.mergeCatalog(base,catalog(tweaked,added,card()),true),e=>e.issues.some(i=>i.code==="duplicate-card"));
  assert.throws(()=>C.mergeCatalog(base,{schemaVersion:2,cards:[]},true),e=>e.issues[0].code==="version");
  assert.deepEqual(base,catalog(card()));
});

test("number, title and product filters are independent and group JSON preserves data",()=>{
  const a=card("TEST/S001-001");
  const b=card("TEST/S001-002",{product:"別商品"});
  const c=card("TEST/S001-003",{title:"",product:"別商品"});
  assert.deepEqual(C.selectCards([a,b,c],{number:"s001-00",title:"テストタイトル",product:"別商品"}),[b]);
  assert.deepEqual(C.selectCards([a,b,c],{title:""}),[c]);
  assert.deepEqual(C.checked(C.parseJson(JSON.stringify(catalog(a,b,c)))),catalog(a,b,c));
});

test("rarity suffixes share definitions and search results while image URLs keep the printing",()=>{
  const {officialImageUrl}=require("../card-images.js");
  const basic={cardNumber:"STS/W140-T03"}, other={cardNumber:"STS/W140-T04"};
  for(const suffix of ["R","S","SP","SSP","RRR","OFR","SEC","A"]){
    const print=basic.cardNumber+suffix;
    assert.equal(C.findCard([basic,other],print.toLowerCase()),basic);
    assert.deepEqual(C.selectCards([basic,other],{number:print}),[basic]);
    assert.match(officialImageUrl(print),new RegExp("_t03"+suffix.toLowerCase()+"\\.png$"));
  }
  const internal={cardNumber:"TEST/S001-1A02"};
  assert.equal(C.findCard([internal],"TEST/S001-1A02SEC"),internal);
  assert.equal(C.findCard([basic,other],basic.cardNumber+"A1"),undefined);
  assert.equal(C.findCard([other],basic.cardNumber+"R"),undefined);
  const explicit={cardNumber:basic.cardNumber+"SP"};
  const alias={...other,variants:[basic.cardNumber+"SSP"]};
  const find=number=>C.findCard([basic,explicit,alias],number);
  assert.equal(find(explicit.cardNumber),explicit);
  assert.equal(find(basic.cardNumber+"SSP"),alias);
  assert.equal(C.sameCardNumber(basic.cardNumber,explicit.cardNumber,find),false);
  assert.equal(C.sameCardNumber(other.cardNumber,basic.cardNumber+"SSP",find),true);
});
