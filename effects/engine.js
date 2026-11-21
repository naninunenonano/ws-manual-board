"use strict";

const WSEffects = (() => {
  const zones = {deck:"山札",hand:"手札",stage:"舞台",clock:"クロック",level:"レベル置場",
    stock:"ストック",waiting:"控え室",memory:"思い出",cx:"CX置場"};
  const sides = {self:"自分",opponent:"相手"};
  const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
  const word = value => typeof value === "string" && !!value.trim();
  const integer = Number.isSafeInteger;
  const count = n => integer(n) && n >= 0;
  const end = s => s === "top" || s === "bottom";
  const knownKey = (table,key)=>typeof key==="string" && Object.hasOwn(table,key);
  const ref = v => object(v) && knownKey(sides,v.side) && knownKey(zones,v.zone)
    && Object.keys(v).every(key=>key==="side" || key==="zone");
  const zoneLabel = ({side,zone}) => sides[side]+"の"+zones[zone];
  const operations = new Map();
  const conditions = new Map();
  const tagFields = {traits:["traitChanges","removed","特徴"],keywords:["keywordChanges","disabled","キーワード能力"]};
  const names = value => Array.isArray(value)&&value.every(word);
  const validFilter = filter => object(filter)&&names(filter.names)&&filter.names.length>0
    && ["any","all","none"].includes(filter.mode)
    && Object.keys(filter).every(key=>key==="names"||key==="mode");
  const tagList = value => Array.isArray(value)?value:[];
  function effectiveTags(card, kind) {
    const [field,off]=tagFields[kind];
    if (card[kind]==null)return null;
    const removed=tagList(card[field]?.[off]);
    return [...new Set([...card[kind],...tagList(card[field]?.added)])].filter(tag=>!removed.includes(tag));
  }
  function matchTags(card,kind,filter) {
    const [field,off]=tagFields[kind];
    const effective=effectiveTags(card,kind);
    const results=filter.names.map(tag=>{
      if(effective!==null)return effective.includes(tag);
      if(tagList(card[field]?.[off]).includes(tag))return false;
      if(tagList(card[field]?.added).includes(tag))return true;
      return null;
    });
    if(filter.mode==="none")return results.includes(true)?false:results.includes(null)?null:true;
    if(filter.mode==="all")return results.includes(false)?false:results.includes(null)?null:true;
    return results.includes(true)?true:results.includes(null)?null:false;
  }
  function checkTags(card,kind,filter) {
    const matched=matchTags(card,kind,filter);
    if(matched===null)fail(card.uid+" の"+tagFields[kind][2]+"は未確認です","unconfirmed");
    return matched;
  }

  const emptyBoard = () => Object.fromEntries(Object.keys(sides).map(side=>[
    side,Object.fromEntries(Object.keys(zones).map(zone=>[zone,[]]))
  ]));

  function fail(message, status="failed") {
    throw Object.assign(new Error(message), {status});
  }

  function validateBoard(board) {
    if (!object(board)) fail("盤面を指定してください","invalid");
    const seen = new Set();
    for (const side of Object.keys(sides)) {
      if (!object(board[side])) fail(sides[side]+"の盤面がありません","invalid");
      for (const zone of Object.keys(zones)) {
        const cards = board[side][zone];
        if (!Array.isArray(cards)) fail(zoneLabel({side,zone})+"のカード一覧がありません","invalid");
        for (const card of cards) {
          if (!object(card) || !word(card.uid) || seen.has(card.uid) || !word(card.cardNumber)
              || ["power","soul"].some(stat=>card[stat]!=null&&!integer(card[stat]))) {
            fail(zoneLabel({side,zone})+"のカード番号・個体ID・数値を確認してください","invalid");
          }
          for(const [kind,[field,off,label]] of Object.entries(tagFields)){
            const changes=card[field];
            const invalidTags=card[kind]!=null&&!names(card[kind]);
            const invalidChanges=changes!=null&&(!object(changes) ||
              [changes.added,changes[off]].some(value=>value!==undefined&&!names(value)));
            if(invalidTags || invalidChanges){
              fail(card.uid+" の"+label+"が不正です","invalid");
            }
          }
          seen.add(card.uid);
        }
      }
    }
  }

  function pile({board},{side,zone}) {return board[side][zone];}
  function cardsIn(board) {
    return Object.keys(sides).flatMap(side=>Object.keys(zones).flatMap(zone=>
      board[side][zone].map(card=>({side,zone,card}))));
  }

  function move(context,{from,to,count:amount,end:sourceEnd="top",position="top",selection}) {
    const source = pile(context,from), destination = pile(context,to);
    if (source===destination) fail("同じ領域への移動は指定できません");
    let moving;
    if (selection) {
      const uids = context.selections.get(selection);
      if (!uids) fail("選択「"+selection+"」がありません");
      moving = source.filter(card=>uids.includes(card.uid));
      if (moving.length!==uids.length) fail("選んだカードが指定元の領域にありません");
    } else {
      if (source.length<amount) fail(zoneLabel(from)+"のカードが不足しています");
      const offset = sourceEnd==="top" ? source.length-amount : 0;
      moving = source.slice(offset,offset+amount);
    }
    const movingSet = new Set(moving);
    context.board[from.side][from.zone] = source.filter(card=>!movingSet.has(card));
    if (position==="bottom") destination.unshift(...moving);
    else destination.push(...moving);
    return moving.map(card=>card.uid);
  }

  function takeFromTop(ctx, side, from, to, amount) {
    const source=pile(ctx,{side,zone:from});
    if(source.length<amount)fail(zoneLabel({side,zone:from})+"のカードが不足しています");
    const cards=source.splice(source.length-amount,amount).reverse();
    pile(ctx,{side,zone:to}).push(...cards);
    return cards.map(card=>card.uid);
  }

  function register(map,id,label,check,describe,run,keys) {
    if (map.has(id)) throw new Error("処理識別子が重複しています: "+id);
    map.set(id,{label,describe,run,valid:params=>object(params)
      && Object.keys(params).every(key=>keys.includes(key)) && check(params)});
  }
  const operation = (...args) => register(operations,...args);
  operation("move","カード移動",p=>ref(p.from)&&ref(p.to)
    && (p.from.side!==p.to.side || p.from.zone!==p.to.zone)
    && (word(p.selection)?p.count===undefined&&p.end===undefined:count(p.count)&&p.selection===undefined)
    && [p.end,p.position].every(v=>v===undefined||end(v)),
    p=>zoneLabel(p.from)+"から"+zoneLabel(p.to)+"へ"+(p.selection?"選んだカードを":p.count+"枚を")+"移動",
    move,["from","to","count","end","position","selection"]);
  operation("draw","ドロー",p=>knownKey(sides,p.side)&&count(p.count),
    p=>sides[p.side]+"が"+p.count+"枚引く",
    (ctx,p)=>takeFromTop(ctx,p.side,"deck","hand",p.count),["side","count"]);
  operation("payStock","ストック支払い",p=>knownKey(sides,p.side)&&count(p.count),
    p=>sides[p.side]+"のストックを"+p.count+"枚支払う",
    (ctx,p)=>takeFromTop(ctx,p.side,"stock","waiting",p.count),["side","count"]);
  operation("selectCards","対象カード選択",p=>ref(p.from)&&word(p.as)&&p.as!=="activate"&&count(p.count)
    && ["traits","keywords"].every(kind=>p[kind]===undefined||validFilter(p[kind])),
    p=>zoneLabel(p.from)+"から"+p.count+"枚を選ぶ（"+p.as+"）"+
      ["traits","keywords"].filter(kind=>p[kind]).map(kind=>" ／ "+tagFields[kind][2]+" "+filterLabel(p[kind])).join(""),
    (ctx,p)=>{
      const picks = p.count===0 ? [] : Object.hasOwn(ctx.choices,p.as) ? ctx.choices[p.as] : undefined;
      if (picks===undefined) fail("選択「"+p.as+"」に"+p.count+"枚指定してください","needs-choice");
      const available = new Map(pile(ctx,p.from).map(card=>[card.uid,card]));
      if (!Array.isArray(picks) || picks.length!==p.count || new Set(picks).size!==p.count
          || !picks.every(id=>available.has(id))) fail("選択「"+p.as+"」の枚数・対象を確認してください","needs-choice");
      for(const uid of picks)for(const kind of ["traits","keywords"]){
        if(p[kind]&&!checkTags(available.get(uid),kind,p[kind]))fail("選択「"+p.as+"」は"+tagFields[kind][2]+"の条件に合いません","needs-choice");
      }
      ctx.selections.set(p.as,[...picks]);
      return [...picks];
    },["from","as","count","traits","keywords"]);
  for (const [id,stat,label] of [["modifyPower","power","パワー"],["modifySoul","soul","ソウル"]]) {
    operation(id,label+"増減",p=>word(p.selection)&&integer(p.amount),
      p=>"選択したカードの"+label+"を"+(p.amount>0?"+":"")+p.amount,
      (ctx,p)=>{
        const uids = ctx.selections.get(p.selection);
        if (!uids) fail("選択「"+p.selection+"」がありません");
        const cards = cardsIn(ctx.board).filter(({card})=>uids.includes(card.uid)).map(({card})=>card);
        if (cards.length!==uids.length || cards.some(card=>!integer(card[stat])||!integer(card[stat]+p.amount))) {
          fail("対象の"+label+"が未確認、または有効範囲外です");
        }
        for (const card of cards) card[stat]+=p.amount;
        return [...uids];
      },["selection","amount"]);
  }
  register(conditions,"zoneCount","領域の枚数条件",
    p=>ref(p.from)&&(p.min!==undefined||p.max!==undefined)
      && (p.min===undefined||count(p.min)) && (p.max===undefined||count(p.max))
      && (p.min??0)<=(p.max??Infinity),
    p=>zoneLabel(p.from)+"の枚数"+(p.min===undefined?"":" "+p.min+"枚以上")+(p.max===undefined?"":" "+p.max+"枚以下"),
    (ctx,p)=>{const n=pile(ctx,p.from).length;return n>=(p.min??0)&&n<=(p.max??Infinity);},
    ["from","min","max"]);

  const filterLabel = filter=>filter.names.join("、")+"（"+({all:"すべて",any:"いずれか",none:"どれも持たない"})[filter.mode]+"）";
  for(const [id,kind] of [["hasTraits","traits"],["hasKeywords","keywords"]]){
    const label=tagFields[kind][2];
    register(conditions,id,label+"の判定",p=>word(p.uid)&&validFilter({names:p.names,mode:p.mode}),
      p=>p.uid+" の"+label+" "+filterLabel(p),
      (ctx,p)=>{
        const card=cardsIn(ctx.board).find(entry=>entry.card.uid===p.uid)?.card;
        if(!card)fail("個体ID "+p.uid+" のカードが盤面にありません");
        return checkTags(card,kind,p);
      },["uid","names","mode"]);
  }

  function instructions(effect) {
    return [
      ...(effect.conditions??[]).map(step=>({phase:"conditions",step})),
      ...(effect.costs??[]).map(step=>({phase:"costs",step})),
      ...(effect.target?[{phase:"target",step:effect.target}]:[]),
      ...effect.steps.map(step=>({phase:"steps",step}))
    ].map((entry,index)=>({...entry,index,implementation:(entry.phase==="conditions"?conditions:operations).get(entry.step?.handler)}));
  }

  function inspect(effect) {
    if(effect?.implementationStatus==="unimplemented")return {issues:[{status:"unsupported",message:"実行処理は未実装です"}],entries:[]};
    const issues=[];
    if (!object(effect) || typeof effect.optional!=="boolean" || !Array.isArray(effect.steps)
        || !effect.steps.length || ["conditions","costs","choices"].some(key=>key in effect&&!Array.isArray(effect[key]))) {
      return {issues:[{status:"invalid",message:"効果の構造を確認してください"}],entries:[]};
    }
    for (const key of ["duration","limit","choices"]) {
      if (key==="choices"?effect[key]?.length:effect[key]!=null) {
        issues.push({status:"unsupported",message:({duration:"継続期間",limit:"回数制限",choices:"分岐する選択肢"})[key]+"の実行は未実装です"});
      }
    }
    if (effect.target!=null && !object(effect.target))issues.push({status:"invalid",message:"対象定義が不正です"});
    const entries=instructions(effect);
    const selections=new Set();
    for (const {phase,step,implementation,index} of entries) {
      const at = ({conditions:"条件",costs:"コスト",target:"対象",steps:"処理"})[phase]+" "+(index+1);
      if (!object(step)||!word(step.handler))issues.push({status:"invalid",message:at+" の処理識別子がありません"});
      else if (!implementation)issues.push({status:"unsupported",message:at+" の "+step.handler+" は未実装です"});
      else if (!implementation.valid(step.params))issues.push({status:"invalid",message:at+" の "+step.handler+" のパラメータが不正です"});
      else if (phase==="target" && step.handler!=="selectCards")issues.push({status:"unsupported",message:at+" の対象指定方式は未実装です"});
      else if (step.handler==="selectCards"){
        if(selections.has(step.params.as))issues.push({status:"invalid",message:at+" の選択IDが重複しています"});
        selections.add(step.params.as);
      }else if (step.params.selection && !selections.has(step.params.selection)){
        issues.push({status:"invalid",message:at+" が未定義の選択 "+step.params.selection+" を参照しています"});
      }
    }
    return {issues,entries};
  }

  function run(effect, board, choices = {}) {
    const log=[];
    let working, at=null;
    const result=(status,message="")=>({status,state:working??null,log,message});
    try {
      validateBoard(board);
      working=structuredClone(board);
      if (!object(choices)) fail("選択はオブジェクトで指定してください","invalid");
      const {issues,entries}=inspect(effect);
      if (issues.length) return {...result(issues.some(issue=>issue.status==="invalid")?"invalid":"unsupported",
        issues.map(issue=>issue.message).join(" ／ ")),issues};
      const context={board:working,choices,selections:new Map()};
      for (const entry of entries) {
        at=entry;
        if (entry.phase!=="conditions") break;
        const met=entry.implementation.run(context,entry.step.params);
        log.push({phase:entry.phase,handler:entry.step.handler,ok:met});
        if (!met) return result("condition-not-met","発動条件を満たしていません");
      }
      at=null;
      if (effect.optional) {
        if (typeof choices.activate!=="boolean") return result("needs-choice","効果を実行するか選んでください");
        if (!choices.activate) return result("skipped","任意効果を実行しませんでした");
      }
      for (const entry of entries.filter(entry=>entry.phase!=="conditions")) {
        at=entry;
        const cards=entry.implementation.run(context,entry.step.params);
        log.push({phase:entry.phase,handler:entry.step.handler,ok:true,cards});
      }
      return result("success");
    } catch(error) {
      if (at)log.push({phase:at.phase,handler:at.step.handler,ok:false,message:error.message});
      return result(error.status??"failed",error.message);
    }
  }

  function equal(a,b) {
    if (a===b)return true;
    if (Array.isArray(a)||Array.isArray(b)) return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((value,i)=>equal(value,b[i]));
    return object(a)&&object(b)&&Object.keys(a).length===Object.keys(b).length
      && Object.keys(a).every(key=>Object.hasOwn(b,key)&&equal(a[key],b[key]));
  }

  function compare(actual,expected) {
    if (!["success","condition-not-met","skipped"].includes(actual.status)) return false;
    return actual.status===expected?.status && equal(actual.state,expected.state);
  }

  return {zones,sides,emptyBoard,validateBoard,cardsIn,effectiveTags,matchTags,inspect,run,compare,
    describe:(entry)=>entry.implementation?.valid(entry.step.params)
      ? entry.implementation.describe(entry.step.params):String(entry.step?.handler??"未確認"),
    handlers:()=>[...operations,...conditions].map(([id,entry])=>({id,label:entry.label}))};
})();

if(typeof module==="object")module.exports=WSEffects;
