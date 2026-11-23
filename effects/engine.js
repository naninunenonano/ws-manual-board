"use strict";

const WSEffects = (() => {
  const catalog = typeof module==="object"?require("../card-catalog.js"):CardCatalog;
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
  const typeMatch = (card,type) => type===undefined || card.type===type;
  const levelMatch = (card,maxLevel) => maxLevel===undefined || (integer(card.level) && card.level<=maxLevel);
  const sameNumber = (ctx,left,right) => catalog.sameCardNumber(left,right,ctx.findCard);
  const costMatch = (card,maxCost) => maxCost===undefined || (integer(card.cost) && card.cost<=maxCost);
  const matching = (ctx,card,p) => typeMatch(card,p.cardType)&&levelMatch(card,p.maxLevel)&&costMatch(card,p.maxCost)
    && (!p.cardNumbers || p.cardNumbers.some(number=>sameNumber(ctx,card.cardNumber,number)))
    && (!p.traits || checkTags(card,"traits",p.traits))
    && (!p.keywords || checkTags(card,"keywords",p.keywords))
    && (!p.excludeUid || card.uid!==p.excludeUid);
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
      if(card.allTags===true)return !tagList(card[field]?.[off]).includes(tag);
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
              || (card.allTags!==undefined&&typeof card.allTags!=="boolean")
              || ["power","soul","level"].some(stat=>card[stat]!=null&&!integer(card[stat])) || (card.type!=null&&!["character","event","climax"].includes(card.type)) || (card.markers!=null&&(!Array.isArray(card.markers)||card.markers.some(marker=>!object(marker))))) {
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
      const uids = selection==="@source"&&context.choices.sourceUid?[context.choices.sourceUid]:context.selections.get(selection);
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
    && [p.end,p.position].every(v=>v===undefined||end(v))
    && (p.replaceStage===undefined||p.replaceStage===true&&p.to.zone==="stage"&&word(p.selection)),
    p=>zoneLabel(p.from)+"から"+zoneLabel(p.to)+"へ"+(p.selection?"選んだカードを":p.count+"枚を")+"移動",
    (ctx,p)=>{
      const cards=move(ctx,p);
      return p.replaceStage?{cards,replaceStage:true}:cards;
    },["from","to","count","end","position","selection","replaceStage"]);
  operation("optionalTopMove","任意で一番上を移動",p=>ref(p.from)&&ref(p.to)&&p.from.side===p.to.side
    && p.from.zone!==p.to.zone&&word(p.choiceKey)&&word(p.label),
    p=>p.label,
    (ctx,p)=>{
      if(!pile(ctx,p.from).length)return [];
      const chosen=ctx.choices[p.choiceKey];
      if(typeof chosen!=="boolean")fail("一番上のカードを移動するか選択してください","needs-choice");
      return chosen?takeFromTop(ctx,p.from.side,p.from.zone,p.to.zone,1):[];
    },["from","to","choiceKey","label"]);
  operation("healUpTo","クロックの上から任意枚数を回復",p=>knownKey(sides,p.side)&&count(p.max)&&p.max>0&&word(p.choiceKey),
    p=>sides[p.side]+"のクロックの上から"+p.max+"枚まで控え室に置く",
    (ctx,p)=>{
      const max=Math.min(p.max,pile(ctx,{side:p.side,zone:"clock"}).length);
      const amount=max?ctx.choices[p.choiceKey]:0;
      if(!count(amount)||amount>max)fail("回復する枚数を選んでください","needs-choice");
      return takeFromTop(ctx,p.side,"clock","waiting",amount);
    },["side","max","choiceKey"]);
  operation("dealDamage","ダメージ",p=>knownKey(sides,p.side)&&count(p.count)&&p.count>0,
    p=>sides[p.side]+"に"+p.count+"ダメージ",
    (ctx,p)=>{
      const deck=pile(ctx,{side:p.side,zone:"deck"}), revealed=[];
      while(revealed.length<p.count&&deck.length){
        revealed.push(deck.pop());
        if(revealed.at(-1).type==="climax")break;
      }
      const cancelled=revealed.at(-1)?.type==="climax";
      pile(ctx,{side:p.side,zone:cancelled?"waiting":"clock"}).push(...revealed);
      return {cards:revealed.map(card=>card.uid),revealed:revealed.map(card=>card.uid),cancelled};
    },["side","count"]);
  operation("grantStageAbility","ターン中の能力獲得",p=>knownKey(sides,p.side)&&word(p.abilityId)&&count(p.minMarkers),
    p=>"このカードの下にマーカーが"+p.minMarkers+"枚以上なら、ターン中に能力を得る",
    (ctx,p)=>{
      const card=pile(ctx,{side:p.side,zone:"stage"}).find(entry=>entry.uid===ctx.choices.sourceUid);
      if(!card||(card.markers?.length??0)<p.minMarkers)return [];
      card.gainedAbilities=[...new Set([...(card.gainedAbilities??[]),p.abilityId])];
      return [card.uid];
    },["side","abilityId","minMarkers"]);
  register(conditions,"ownClimaxTrigger","このカードがCXをトリガー",
    p=>knownKey(sides,p.side)&&word(p.abilityId),p=>"このカードが得た能力を持ち、トリガーチェックでCXが出た",
    (ctx,p)=>ctx.choices.triggerClimax===true&&pile(ctx,{side:p.side,zone:"stage"})
      .some(card=>card.uid===ctx.choices.sourceUid&&card.gainedAbilities?.includes(p.abilityId)),["side","abilityId"]);
  operation("chooseBranch","実行する効果の選択",p=>word(p.choiceKey)&&Array.isArray(p.branches)&&p.branches.length>=2
    && p.branches.every(branch=>object(branch)&&word(branch.label)&&Array.isArray(branch.steps)
      && branch.steps.every(step=>step?.handler!=="chooseBranch")
      && inspect({optional:false,steps:branch.steps}).issues.length===0),
    p=>p.branches.map(branch=>branch.label).join(" ／ "),
    (ctx,p)=>{
      const index=ctx.choices[p.choiceKey];
      if(!count(index)||index>=p.branches.length)fail("実行する効果を選んでください","needs-choice");
      return {branch:index,label:p.branches[index].label};
    },["choiceKey","branches"]);
  const frontBounceTargets=ctx=>pile(ctx,{side:"opponent",zone:"stage"}).filter(card=>
    card.row==="front"&&card.faceUp!==false&&matching(ctx,card,{cardType:"character",maxLevel:3}));
  operation("lookOpponentTop","相手の山札を非公開で確認",p=>p.max===2,
    ()=>"相手の山札の上を2枚まで見て、元の順番のまま戻す",()=>[],["max"]);
  operation("millDeckTop","山札の上を控え室へ",p=>knownKey(sides,p.side)&&p.count===2,
    p=>sides[p.side]+"の山札の上から2枚を控え室へ",
    (ctx,p)=>{
      const deck=pile(ctx,{side:p.side,zone:"deck"}), amount=Math.min(deck.length,p.count);
      const climax=deck.slice(deck.length-amount).some(card=>card.type==="climax");
      return {cards:takeFromTop(ctx,p.side,"deck","waiting",amount),climax};
    },["side","count"]);
  operation("bounceFrontAfterMill","CXが落ちた場合に前列を手札へ",p=>p.max===2,
    ()=>"落としたカードにCXがあれば、相手前列のレベル3以下を2枚まで手札へ戻す",
    (ctx,p)=>{
      const targets=frontBounceTargets(ctx), picks=ctx.choices.frontBounce??[];
      if(!Array.isArray(picks)||picks.length>p.max||new Set(picks).size!==picks.length||
        !picks.every(uid=>targets.some(card=>card.uid===uid)))fail("相手前列の対象を選んでください","needs-choice");
      ctx.selections.set("frontBounce",picks);
      return move(ctx,{from:{side:"opponent",zone:"stage"},to:{side:"opponent",zone:"hand"},selection:"frontBounce"});
    },["max"]);
  operation("draw","ドロー",p=>knownKey(sides,p.side)&&count(p.count),
    p=>sides[p.side]+"が"+p.count+"枚引く",
    (ctx,p)=>takeFromTop(ctx,p.side,"deck","hand",p.count),["side","count"]);
  operation("payStock","ストック支払い",p=>knownKey(sides,p.side)&&count(p.count),
    p=>sides[p.side]+"のストックを"+p.count+"枚支払う",
    (ctx,p)=>takeFromTop(ctx,p.side,"stock","waiting",p.count),["side","count"]);
  operation("selectCards","対象カード選択",p=>ref(p.from)&&word(p.as)&&p.as!=="activate"&&count(p.count)
    && ["traits","keywords"].every(kind=>p[kind]===undefined||validFilter(p[kind]))
    && (p.min===undefined||count(p.min)&&p.min<=p.count)
    && (p.cardType===undefined||["character","event","climax"].includes(p.cardType))
    && (p.maxLevel===undefined||integer(p.maxLevel))
    && (p.maxCost===undefined||count(p.maxCost))
    && (p.cardNumbers===undefined||names(p.cardNumbers)&&p.cardNumbers.length>0)
    && (p.excludeUid===undefined||word(p.excludeUid))
    && (p.excludeSource===undefined||typeof p.excludeSource==="boolean"),
    p=>zoneLabel(p.from)+"から"+p.count+"枚を選ぶ（"+(p.cardNumbers?.join("、")??p.as)+"）"+
      ["traits","keywords"].filter(kind=>p[kind]).map(kind=>" ／ "+tagFields[kind][2]+" "+filterLabel(p[kind])).join(""),
    (ctx,p)=>{
      const picks = Object.hasOwn(ctx.choices,p.as) ? ctx.choices[p.as] : (p.count===0 ? [] : undefined);
      if (picks===undefined) fail("選択「"+p.as+"」に"+p.count+"枚指定してください","needs-choice");
      const available = new Map(pile(ctx,p.from).map(card=>[card.uid,card]));
      if (!Array.isArray(picks) || picks.length>(p.count) || picks.length<(p.min??p.count) || new Set(picks).size!==picks.length
          || !picks.every(id=>available.has(id))) fail("選択「"+p.as+"」の枚数・対象を確認してください","needs-choice");
      for(const uid of picks){
        if(!matching(ctx,available.get(uid),{...p,excludeUid:p.excludeUid==="@source"||p.excludeSource?ctx.choices.sourceUid:p.excludeUid}))fail("選択「"+p.as+"」はカード条件に合いません","needs-choice");
      }
      for(const uid of picks)for(const kind of ["traits","keywords"]){
        if(p[kind]&&!checkTags(available.get(uid),kind,p[kind]))fail("選択「"+p.as+"」は"+tagFields[kind][2]+"の条件に合いません","needs-choice");
      }
      ctx.selections.set(p.as,[...picks]);
      return [...picks];
    },["from","as","count","min","traits","keywords","cardType","maxLevel","maxCost","cardNumbers","excludeUid","excludeSource"]);
  operation("searchDeck","山札検索",p=>knownKey(sides,p.side)&&word(p.as)&&count(p.max)&&
    (p.cardType===undefined||["character","event","climax"].includes(p.cardType))&&
    (p.maxLevel===undefined||integer(p.maxLevel)),
    p=>"山札から条件に合うカードを最大"+p.max+"枚選ぶ",
    (ctx,p)=>{const picks=ctx.choices[p.as];if(!Array.isArray(picks)||picks.length>p.max||new Set(picks).size!==picks.length)
      fail("山札検索の選択を指定してください","needs-choice");
      const available=new Map(pile(ctx,{side:p.side,zone:"deck"}).map(c=>[c.uid,c]));
      if(!picks.every(uid=>available.has(uid)&&matching(ctx,available.get(uid),p)))
        fail("山札検索の対象が条件に合いません","needs-choice");
      ctx.selections.set(p.as,[...picks]);return [...picks];},
    ["side","as","max","cardType","maxLevel"]);
  operation("revealTop","山札上公開",p=>knownKey(sides,p.side),
    p=>sides[p.side]+"の山札上1枚を公開",
    (ctx,p)=>{const deck=pile(ctx,{side:p.side,zone:"deck"});if(!deck.length)fail("山札がありません");
      ctx.revealed=deck[deck.length-1].uid;return [ctx.revealed];},["side"]);
  operation("consoleTop","コンソール系公開判定",p=>knownKey(sides,p.side)
    && (p.cardType===undefined||["character","event","climax"].includes(p.cardType))
    && (p.maxLevel===undefined||integer(p.maxLevel))
    && (p.traits===undefined||validFilter(p.traits))
    && (p.count===undefined||count(p.count)&&p.count>0)
    && (p.to===undefined||ref(p.to)&&!(p.to.side===p.side&&p.to.zone==="deck"))
    && (p.returnPosition===undefined||end(p.returnPosition)),
    p=>sides[p.side]+"の山札上"+(p.count??1)+"枚を公開し、条件一致なら"+
      zoneLabel(p.to??{side:p.side,zone:"hand"})+"へ、違えば山札の"+(p.returnPosition==="bottom"?"下":"上")+"に戻す",
    (ctx,p)=>{
      const deck=pile(ctx,{side:p.side,zone:"deck"}),amount=p.count??1;
      if(deck.length<amount)fail(sides[p.side]+"の山札が"+amount+"枚必要です");
      const revealed=deck.slice(-amount).reverse(),moved=[],returned=[];
      for(const card of revealed)(matching(ctx,card,p)?moved:returned).push(card);
      deck.splice(-amount);
      pile(ctx,p.to??{side:p.side,zone:"hand"}).push(...moved);
      if(p.returnPosition==="bottom")deck.unshift(...returned.slice().reverse());
      else deck.push(...returned.slice().reverse());
      return {cards:moved.map(card=>card.uid),revealed:revealed.map(card=>card.uid),returned:returned.map(card=>card.uid)};
    },["side","cardType","maxLevel","traits","count","to","returnPosition"]);
  operation("revealSelection","選択カード公開",p=>word(p.selection),
    p=>"選択カードを公開", (ctx,p)=>{const ids=ctx.selections.get(p.selection);
      if(!ids)fail("選択がありません");return [...ids];},["selection"]);
  operation("shuffleDeck","山札シャッフル",p=>knownKey(sides,p.side),
    p=>sides[p.side]+"の山札をシャッフル",
    (ctx,p)=>{const deck=pile(ctx,{side:p.side,zone:"deck"});
      for(let i=deck.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}
      return deck.map(c=>c.uid);},["side"]);
  operation("selectNamed","同名カード選択",p=>ref(p.from)&&word(p.as)&&word(p.cardNumber)&&count(p.count)&&p.count>0,
    p=>zoneLabel(p.from)+"から指定カードを"+p.count+"枚選ぶ",
    (ctx,p)=>{const ids=ctx.choices[p.as],available=new Map(pile(ctx,p.from).filter(c=>sameNumber(ctx,c.cardNumber,p.cardNumber)).map(c=>[c.uid,c]));
      if(!Array.isArray(ids)||ids.length!==p.count||new Set(ids).size!==ids.length||!ids.every(id=>available.has(id)))fail("同名カードを選択してください","needs-choice");
      ctx.selections.set(p.as,[...ids]);return [...ids];},["from","as","cardNumber","count"]);
  operation("modifyLevel","レベル増減",p=>word(p.selection)&&integer(p.amount)&&(p.untilTurnEnd===undefined||typeof p.untilTurnEnd==="boolean"),
    p=>"選択したカードのレベルを"+p.amount+"変更",
    (ctx,p)=>{const ids=p.selection==="@source"&&ctx.choices.sourceUid?[ctx.choices.sourceUid]:ctx.selections.get(p.selection);
      if(!ids)fail("選択がありません");
      const found=cardsIn(ctx.board).filter(e=>ids.includes(e.card.uid));if(found.length!==ids.length||found.some(e=>!integer(e.card.level)))fail("レベルを確認してください");
      for(const {card} of found){
        card.level+=p.amount;
        if(p.untilTurnEnd)card.turnLevelBonus=(card.turnLevelBonus??0)+p.amount;
      }
      return [...ids];},["selection","amount","untilTurnEnd"]);
  operation("chooseDestination","移動先選択",p=>ref(p.from)&&Array.isArray(p.destinations)&&p.destinations.length>0&&p.destinations.every(ref)&&word(p.selection)&&word(p.choiceKey),
    p=>"選択したカードの移動先を選ぶ",
    (ctx,p)=>{const destination=ctx.choices[p.choiceKey];if(!p.destinations.some(d=>d.side===destination?.side&&d.zone===destination?.zone))fail("移動先を選んでください","needs-choice");
      return move(ctx,{from:p.from,to:destination,selection:p.selection});},["from","destinations","selection","choiceKey"]);
  register(conditions,"otherStageTraitCount","他の舞台の特徴枚数条件",
    p=>knownKey(sides,p.side)&&count(p.min)&&validFilter(p.traits),
    p=>"他の舞台に条件を満たすキャラが"+p.min+"枚以上",
    (ctx,p)=>pile(ctx,{side:p.side,zone:"stage"}).filter(c=>c.uid!==ctx.choices.sourceUid&&c.type==="character"&&checkTags(c,"traits",p.traits)).length>=p.min,
    ["side","min","traits"]);
  register(conditions,"cxName","CX置場のカード名",
    p=>knownKey(sides,p.side)&&word(p.name)&&(p.cardNumbers===undefined||(Array.isArray(p.cardNumbers)&&p.cardNumbers.length>0&&p.cardNumbers.every(word))),
    p=>"CX置場に「"+p.name+"」がある",
    (ctx,p)=>pile(ctx,{side:p.side,zone:"cx"}).some(c=>p.cardNumbers?p.cardNumbers.some(number=>sameNumber(ctx,c.cardNumber,number)):c.name===p.name),["side","name","cardNumbers"]);
  operation("continuousCxBuff","CX永続修正の参照",p=>knownKey(sides,p.side)&&integer(p.power)&&integer(p.soul),
    p=>"CXがある間キャラ全体にパワー"+p.power+"、ソウル"+p.soul,
    (ctx,p)=>{const source=ctx.choices.sourceUid;
      if(!pile(ctx,{side:p.side,zone:"cx"}).some(c=>c.uid===source))fail("対象CXがCX置場にありません","condition-not-met");
      return {cards:pile(ctx,{side:p.side,zone:"stage"}).filter(c=>c.type==="character").map(c=>c.uid),powerBonus:p.power,soulBonus:p.soul};
    },["side","power","soul"]);
  operation("treasureTrigger","トレジャー処理",p=>knownKey(sides,p.side)&&word(p.triggerUid),
    p=>"トレジャーを手札に戻し、任意で山札の上をストックに置く",
    (ctx,p)=>{const waiting=pile(ctx,{side:p.side,zone:"waiting"});const idx=waiting.findIndex(c=>c.uid===(p.triggerUid==="@source"?ctx.choices.sourceUid:p.triggerUid));
      if(idx<0)fail("トリガーしたCXが控え室にありません");
      if(typeof ctx.choices.treasureStock!=="boolean")fail("ストックに置くか選んでください","needs-choice");
      if(ctx.choices.treasureStock&&!pile(ctx,{side:p.side,zone:"deck"}).length)fail("山札がありません");
      const [card]=waiting.splice(idx,1);pile(ctx,{side:p.side,zone:"hand"}).push(card);
      return {cards:[card.uid],revealed:[card.uid],stock:ctx.choices.treasureStock?takeFromTop(ctx,p.side,"deck","stock",1):[]};},["side","triggerUid"]);
  register(conditions,"memoryMarkerCount","思い出・マーカー合計",
    p=>knownKey(sides,p.side)&&(p.min!==undefined||p.max!==undefined)
      && [p.min,p.max].every(value=>value===undefined||count(value))&&(p.min??0)<=(p.max??Infinity),
    p=>"思い出とマーカーの合計が"+(p.min==null?p.max+"枚以下":p.max==null?p.min+"枚以上":p.min+"〜"+p.max+"枚"),
    (ctx,p)=>{const n=pile(ctx,{side:p.side,zone:"memory"}).length+
      Object.values(ctx.board[p.side]).flat().reduce((sum,card)=>sum+(card.markers?.length??0),0);
      return n>=(p.min??0)&&n<=(p.max??Infinity);},["side","min","max"]);
  register(conditions,"sourceInZone","このカードの領域",ref, p=>"このカードが"+zoneLabel(p)+"にある",
    (ctx,p)=>pile(ctx,p).some(card=>card.uid===ctx.choices.sourceUid),["side","zone"]);
  register(conditions,"sourceMarkerCount","このカードのマーカー枚数",
    p=>knownKey(sides,p.side)&&count(p.min), p=>"このカードの下にマーカーが"+p.min+"枚以上",
    (ctx,p)=>{
      const source=pile(ctx,{side:p.side,zone:"stage"}).find(card=>card.uid===ctx.choices.sourceUid);
      return !!source&&(source.markers?.length??0)>=p.min;
    },["side","min"]);
  for (const [id,stat,label] of [["modifyPower","power","パワー"],["modifySoul","soul","ソウル"]]) {
    operation(id,label+"増減",p=>word(p.selection)&&integer(p.amount),
      p=>"選択したカードの"+label+"を"+(p.amount>0?"+":"")+p.amount,
      (ctx,p)=>{
        const uids = p.selection==="@source"&&ctx.choices.sourceUid?[ctx.choices.sourceUid]:ctx.selections.get(p.selection);
        if (!uids) fail("選択「"+p.selection+"」がありません");
        const cards = cardsIn(ctx.board).filter(({card})=>uids.includes(card.uid)).map(({card})=>card);
        if (cards.length!==uids.length || cards.some(card=>!integer(card[stat])||!integer(card[stat]+p.amount))) {
          fail("対象の"+label+"が未確認、または有効範囲外です");
        }
        for (const card of cards) card[stat]+=p.amount;
        return [...uids];
      },["selection","amount"]);
  }
  register(conditions,"opposingLevel","正面のキャラのレベル",
    p=>integer(p.level),
    p=>"正面のキャラがLv"+p.level,
    (ctx,p)=>pile(ctx,{side:"opponent",zone:"stage"}).some(card=>
      card.uid===ctx.choices.opposingUid&&card.type==="character"&&card.level===p.level),
    ["level"]);
  register(conditions,"zoneCount","領域の枚数条件",
    p=>ref(p.from)&&(p.traits===undefined||validFilter(p.traits))&&(p.min!==undefined||p.max!==undefined)
      && (p.min===undefined||count(p.min)) && (p.max===undefined||count(p.max))
      && (p.min??0)<=(p.max??Infinity),
    p=>zoneLabel(p.from)+(p.traits?"の《"+p.traits.names.join("、")+"》":"")+"の枚数"+(p.min===undefined?"":" "+p.min+"枚以上")+(p.max===undefined?"":" "+p.max+"枚以下"),
    (ctx,p)=>{
      const results=pile(ctx,p.from).map(card=>!p.traits||matchTags(card,"traits",p.traits));
      const known=results.filter(result=>result===true).length;
      const possible=known+results.filter(result=>result===null).length;
      return known>=(p.min??0)&&possible<=(p.max??Infinity);
    },
    ["from","min","max","traits"]);

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
      if (key==="choices"?effect[key]?.length:key==="limit"?effect[key]!=null&&! (object(effect[key])&&count(effect[key].perTurn)&&effect[key].perTurn>0&&Object.keys(effect[key]).length===1):effect[key]!=null) {
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
      else if (step.handler==="selectCards"||step.handler==="selectNamed"){
        if(selections.has(step.params.as))issues.push({status:"invalid",message:at+" の選択IDが重複しています"});
        selections.add(step.params.as);
      }else if(step.handler==="searchDeck"){
        if(selections.has(step.params.as))issues.push({status:"invalid",message:at+" の選択IDが重複しています"});
        selections.add(step.params.as);
      }else if (step.params.selection && !selections.has(step.params.selection) &&
        !(step.params.selection==="@source"&&["move","modifyPower","modifySoul","modifyLevel"].includes(step.handler))){
        issues.push({status:"invalid",message:at+" が未定義の選択 "+step.params.selection+" を参照しています"});
      }
    }
    return {issues,entries};
  }

  function selectionRequest(context,entry) {
    const {handler,params}=entry.step;
    if(handler!=="selectCards"&&handler!=="searchDeck"&&handler!=="selectNamed")return null;
    const from=params.from??{side:params.side,zone:"deck"};
    const filter={...params,excludeUid:params.excludeUid==="@source"||params.excludeSource?context.choices.sourceUid:params.excludeUid};
    const candidates=pile(context,from).filter(card=>{
      try{return matching(context,card,filter)&&(handler!=="selectNamed"||sameNumber(context,card.cardNumber,params.cardNumber))}catch(error){if(error.status==="unconfirmed")return false;throw error}
    });
    return {kind:"select",label:zoneLabel(from),from,candidates,min:handler==="searchDeck"?0:params.min??params.count,
      max:params.max??params.count,phase:entry.phase};
  }

  function* execute(effect, board, choices, guided, findCard) {
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
      const context={board:working,choices,findCard,selections:new Map()};
      if(effect.limit?.perTurn){const used=choices.usedThisTurn??0;if(!count(used))fail("使用回数が不正です","invalid");
        if(used>=effect.limit.perTurn)return result("condition-not-met","このターンの使用回数上限です");}
      for (const entry of entries) {
        at=entry;
        if (entry.phase!=="conditions") break;
        const met=entry.implementation.run(context,entry.step.params);
        log.push({phase:entry.phase,handler:entry.step.handler,ok:met});
        if (!met) return result("condition-not-met",guided?entry.implementation.describe(entry.step.params)+"の条件を満たしていません":"発動条件を満たしていません");
      }
      at=null;
      if (effect.optional) {
        if(guided)choices.activate=yield {kind:"optional"};
        if (typeof choices.activate!=="boolean") return result("needs-choice","効果を実行するか選んでください");
        if (!choices.activate) return result("skipped","任意効果を実行しませんでした");
      }
      const pending=entries.filter(entry=>entry.phase!=="conditions");
      for(let index=0;index<pending.length;index++){
        const entry=pending[index];
        at=entry;
        const {handler,params}=entry.step;
        if(handler==="bounceFrontAfterMill"&&!log.some(step=>step.handler==="millDeckTop"&&step.climax))continue;
        if(guided){
          if(handler==="lookOpponentTop"){
            const deck=pile(context,{side:"opponent",zone:"deck"}),max=Math.min(deck.length,params.max);
            if(max){
              const n=yield {kind:"private-look-count",max};
              if(!count(n)||n>max)fail("見る枚数を選んでください","needs-choice");
              if(n)yield {kind:"private-look",cards:deck.slice(-n).reverse()};
            }
          }
          if(handler==="bounceFrontAfterMill"){
            const candidates=frontBounceTargets(context);
            choices.frontBounce=candidates.length?yield {kind:"select",label:"相手の前列",from:{side:"opponent",zone:"stage"},
              candidates,min:0,max:Math.min(candidates.length,params.max),phase:entry.phase,committedState:working}:[];
          }
          if(handler==="healUpTo"){
            const max=Math.min(params.max,pile(context,{side:params.side,zone:"clock"}).length);
            if(max)choices[params.choiceKey]=yield {kind:"heal",max};
          }
          if(handler==="chooseBranch")choices[params.choiceKey]=yield {kind:"branch",labels:params.branches.map(branch=>branch.label)};
          if(handler==="optionalTopMove"&&pile(context,params.from).length){
            choices[params.choiceKey]=yield {kind:"optional-top",label:params.label};
          }
          if(handler==="chooseDestination"){
            if(context.selections.get(params.selection)?.length===0)continue;
            choices[params.choiceKey]=yield {kind:"destination",destinations:params.destinations};
          }
          if(handler==="treasureTrigger"){
            const uid=params.triggerUid==="@source"?choices.sourceUid:params.triggerUid;
            const card=pile(context,{side:params.side,zone:"waiting"}).find(c=>c.uid===uid);
            if(!card)fail("公開したトレジャーがありません");
            choices.treasureStock=yield {kind:"treasure",card,canStock:pile(context,{side:params.side,zone:"deck"}).length>0};
          }
          const request=selectionRequest(context,entry);
          if(request){
            if(request.candidates.length<request.min)
              fail(request.label+"に条件を満たすカードが"+request.min+"枚必要です","condition-not-met");
            const picks=yield request;
            if(!Array.isArray(picks)||!picks.every(uid=>request.candidates.some(card=>card.uid===uid)))
              fail("有効なカードを選んでください","needs-choice");
            Object.defineProperty(choices,params.as,{value:picks,configurable:true,writable:true,enumerable:true});
          }else if(entry.phase==="costs"){
            if(handler==="payStock"&&pile(context,{side:params.side,zone:"stock"}).length<params.count)
              fail(entry.implementation.describe(params)+"ための枚数が足りません","condition-not-met");
            yield {kind:"cost",text:entry.implementation.describe(params)};
          }
        }
        let outcome;
        if(guided&&handler==="dealDamage"){
          const resolved=yield {kind:"damage",state:working,side:params.side,amount:params.count};
          if(resolved){
            validateBoard(resolved.state);
            working=context.board=structuredClone(resolved.state);
            outcome=resolved.damage;
          }
        }
        if(guided&&handler==="millDeckTop"){
          const cards=[];
          let climax=false;
          const deck=()=>pile(context,{side:params.side,zone:"deck"});
          for(let i=0;i<=params.count;i++){
            if(!deck().length){
              const refreshed=yield {kind:"deck-empty",state:working,side:params.side,bothSides:true};
              if(refreshed){validateBoard(refreshed);working=context.board=structuredClone(refreshed);}
            }
            if(i===params.count||!deck().length)break;
            climax ||= deck().at(-1).type==="climax";
            cards.push(...takeFromTop(context,params.side,"deck","waiting",1));
          }
          outcome={cards,climax};
        }
        outcome??=entry.implementation.run(context,params);
        const details=Array.isArray(outcome)?{cards:outcome}:outcome;
        if(handler==="revealTop"||handler==="revealSelection")details.revealed=details.cards;
        log.push({phase:entry.phase,handler,ok:true,...details});
        if(handler==="chooseBranch"){
          const branch=params.branches[details.branch];
          pending.splice(index+1,0,...instructions({steps:branch.steps}));
        }
        if(guided&&handler==="optionalTopMove"&&params.from.zone==="deck"&&details.cards.length&&!pile(context,params.from).length){
          const refreshed=yield {kind:"deck-empty",state:working};
          if(refreshed){validateBoard(refreshed);working=context.board=structuredClone(refreshed);}
        }
        if(guided&&handler!=="treasureTrigger"&&details.revealed?.length){
          const cards=cardsIn(working);
          yield {kind:"reveal",cards:details.revealed.map(uid=>cards.find(entry=>entry.card.uid===uid)?.card).filter(Boolean),
            returned:details.returned??[]};
        }
      }
      if(effect.limit?.perTurn){choices.usedThisTurn=(choices.usedThisTurn??0)+1;log.push({phase:"limit",handler:"perTurn",ok:true,usedThisTurn:choices.usedThisTurn});}
      return result("success");
    } catch(error) {
      if (at)log.push({phase:at.phase,handler:at.step.handler,ok:false,message:error.message});
      return result(error.status??"failed",error.message);
    }
  }

  function run(effect,board,choices={},findCard) {
    return execute(effect,board,choices,false,findCard).next().value;
  }

  function guide(effect,board,choices={},findCard) {
    return execute(effect,board,{...choices},true,findCard);
  }

  function continuousStatBonus(board,card,timing,stat,findCard) {
    const printed=card?.[stat];
    if(!integer(printed))return 0;
    const zone=timing==="in_hand"?"hand":"stage";
    let bonus=0;
    for(const effect of findCard(card.cardNumber)?.effects??[]){
      if(effect.type!=="continuous"||effect.timing!==timing)continue;
      const result=run(effect,board,{sourceUid:card.uid},findCard);
      if(result.status==="success"){
        const value=result.state.self[zone].find(entry=>entry.uid===card.uid)?.[stat];
        if(integer(value))bonus+=value-printed;
      }
    }
    return bonus;
  }

  // Continuous CX modifiers are calculated, never written into printed card stats.
  function continuousModifiers(board,side,findCard) {
    validateBoard(board);
    if(!knownKey(sides,side))fail("プレイヤーを確認してください","invalid");
    const relative=side==="self"?board:{self:board.opponent,opponent:board.self};
    const modifiers=new Map(relative.self.stage.filter(card=>card.type==="character")
      .map(card=>[card.uid,{uid:card.uid,powerBonus:0,soulBonus:0,power:card.power??null,soul:card.soul??null}]));
    for(const cx of relative.self.cx){
      for(const effect of findCard(cx.cardNumber)?.effects??[]){
        if(effect.type!=="continuous"||effect.timing!=="while_in_cx")continue;
        const result=run(effect,relative,{sourceUid:cx.uid});
        if(result.status!=="success")continue;
        for(const step of result.log){
          if(step.handler!=="continuousCxBuff")continue;
          for(const uid of step.cards){
            const stat=modifiers.get(uid);
            if(!stat)continue;
            stat.powerBonus+=step.powerBonus;
            stat.soulBonus+=step.soulBonus;
            if(integer(stat.power))stat.power+=step.powerBonus;
            if(integer(stat.soul))stat.soul+=step.soulBonus;
          }
        }
      }
    }
    return [...modifiers.values()];
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

  return {zones,sides,emptyBoard,validateBoard,cardsIn,effectiveTags,matchTags,inspect,run,guide,compare,continuousModifiers,continuousStatBonus,
    describe:(entry)=>entry.implementation?.valid(entry.step.params)
      ? entry.implementation.describe(entry.step.params):String(entry.step?.handler??"未確認"),
    handlers:()=>[...operations,...conditions].map(([id,entry])=>({id,label:entry.label}))};
})();

if(typeof module==="object")module.exports=WSEffects;
