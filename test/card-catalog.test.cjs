"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../card-catalog.js");
const {officialImageUrl,effectChoiceImageUrl,cardLaboImageUrl,isKnownClimaxImage,setCardImage} = require("../card-images.js");

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

test("implemented normal cards use matching Card Labo images and unavailable variants use the same official printing",()=>{
  for(const {cardNumber,catalogOnly} of require("../card-data/catalog.json").cards){
    if(catalogOnly)continue;
    assert.ok(cardLaboImageUrl(cardNumber),cardNumber);
    assert.equal(effectChoiceImageUrl(cardNumber),cardLaboImageUrl(cardNumber));
  }
  assert.equal(effectChoiceImageUrl("STS/W140-002"),"https://www.c-labo-online.jp/data/c-labo/product/wsstsw140_120.jpg");
  assert.equal(effectChoiceImageUrl("STS/W140-002SP"),"https://www.c-labo-online.jp/data/c-labo/product/wsstsw140_007.jpg");
  assert.equal(effectChoiceImageUrl("SFN/S128-003SP"),officialImageUrl("SFN/S128-003SP"));
  assert.match(officialImageUrl("SFN/S128-003SP"),/sfn_s128_003sp\.png$/);
  assert.equal(isKnownClimaxImage("STS/W140-031R"),true);
  assert.equal(isKnownClimaxImage("SFN/S108-T04"),false);
});

test("image load failures first try the official printing",()=>{
  const img={};
  let missing=0;
  assert.equal(setCardImage(img,"SFN/S108-T09R",()=>missing++),true);
  assert.match(img.src,/wssfns108t_012\.jpg$/);
  img.onerror();
  assert.equal(img.src,officialImageUrl("SFN/S108-T09R"));
  assert.equal(missing,0);
  img.onerror();
  assert.equal(missing,1);
});

test("Stella Sora and Frieren regular releases are present with playable stats",()=>{
  const cards=require("../card-data/catalog.json").cards;
  const expected=[["STS/W140",100,3],["STS/W140-T",20,2],["SFN/S108",111,3],
    ["SFN/S108-T",20,2],["SFN/S128",111,3],["SFN/S136",100,3]];
  for(const [set,count,width] of expected){
    for(let number=1;number<=count;number++){
      const prefix=set+(set.endsWith("-T")?"":"-")+String(number).padStart(width,"0");
      const card=cards.find(entry=>entry.cardNumber===prefix||entry.cardNumber===prefix+"A");
      assert.ok(card,prefix);
      if(card.type==="character")assert.ok(Number.isInteger(card.stats.power),prefix);
    }
  }
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
