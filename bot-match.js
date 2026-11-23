"use strict";

// The bot uses a neutral practice deck. The selected player deck is never edited.
const botScenarioNames={opening:"通常の初手",open:"ダイレクト確認",front:"正面のバトル確認",firen:"フィレン・凱旋歌"};
const botSlots=["front0","front1","front2","back0","back1"];
const botDeck={title:"Bot練習デッキ",cards:Array.from({length:13},(_,i)=>({
  id:"BOT/W000-"+String(i+1).padStart(3,"0"),num:i===10?2:4,cx:i>=11
}))};
let botCatalog;
if(typeof WSFormalCards!=="undefined")WSFormalCards.load().then(data=>{
  botCatalog=data;
  if(match?.bot&&isMatchActive())updateBoard();
}).catch(()=>{});

function botDefinition(card){
  if(card?.id.startsWith("BOT/")){
    if(isAutoRules())return autoRuleDefinition(card);
    return {name:card.cx?"BotのCX":"Botの練習キャラ",type:card.cx?"climax":"character",
      stats:{level:0,cost:0,power:2500,soul:1},traits:[],keywords:[]};
  }
  if(card)return findBotCard(card.id);
  return null;
}
const findBotCard=number=>botCatalog?WSFormalCards.find(botCatalog,number):undefined;
const sameBotCardNumber=(left,right)=>CardCatalog.sameCardNumber(left,right,findBotCard);
function botCardInfo(card){
  const def=botDefinition(card);
  if(!def)return cardCatalog[card.id]||null;
  return {name:def.name??card.id,level:def.stats?.level,power:def.stats?.power,cost:def.stats?.cost};
}
function botCardDetails(card){
  if(!match?.bot)return null;
  const def=botDefinition(card);
  if(!def?.abilityText)return null;
  const {level,cost,power,soul}=def.stats;
  const type={character:"キャラ",event:"イベント",climax:"CX"}[def.type];
  const color={red:"赤",blue:"青"}[def.color]??def.color;
  const stats=[color,type,level==null?null:"Lv"+level,cost==null||def.type==="climax"?null:"コスト"+cost,
    power==null?null:"パワー"+power,soul==null?null:"ソウル"+soul,"トリガー "+(def.triggers?.join("・")||"なし")];
  return {name:def.name,shortName:def.name.replace(/^仮(?:キャラ|イベント|CX) /,""),
    stats:stats.filter(Boolean).join(" ／ "),abilityText:def.abilityText};
}
const practiceCardMarks={
  "101":"⚔","102":"⚑","103":"◎","104":"↶","105":"⌂","106":"◆","107":"Ⅱ","108":"↟","109":"✦","110":"⇅",
  "111":"⌕","112":"↑","113":"⇄","114":"⬟","115":"∞","116":"⚡","117":"▤","118":"↔","119":"♛","120":"⛨"
};
function appendPracticeCardFace(parent,card){
  const detail=botCardDetails(card);
  if(!detail)return false;
  const def=botDefinition(card);
  const number=card.id.slice(-3);
  const face=document.createElement("span");
  face.className="practice-card-face";
  face.dataset.color=def.color;
  face.dataset.cardNumber=number;
  face.setAttribute("role","img");
  face.setAttribute("aria-label",detail.name+" ／ "+detail.stats);
  const rank=document.createElement("span"),mark=document.createElement("span"),code=document.createElement("span");
  rank.className="practice-face-rank";rank.textContent=def.type==="climax"?"CX":def.type==="event"?"E"+def.stats.level:"L"+def.stats.level;
  mark.className="practice-face-mark";mark.textContent=practiceCardMarks[number];
  code.className="practice-face-code";code.textContent=number;
  face.append(rank,mark,code);
  parent.append(face);
  return true;
}
function appendBotCardDetails(parent,detail){
  const box=document.createElement("span");
  box.className="practice-card-detail";
  const stats=document.createElement("span");
  stats.className="practice-card-stats";
  stats.textContent=detail.stats;
  box.append(stats);
  for(const line of detail.abilityText){
    const text=document.createElement("span");
    text.className="practice-card-effect";
    text.textContent=line;
    box.append(text);
  }
  parent.append(box);
}
function botMove(board,from,index,to,position="top"){
  const card=board[from].splice(index,1)[0];
  if(!card)return null;
  card.faceUp=!["deck","stock"].includes(to);
  if(isStageZone(from)&&!isStageZone(to)){
    card.orientation=0;
    for(const marker of card.markers??[]){
      marker.card.faceUp=true;board[botMarkerExitZone(marker)].push(marker.card);
    }
    delete card.markers;
  }
  autoRuleStageChange(card,from,to,players.indexOf(board));
  if(position==="bottom")board[to].unshift(card);
  else board[to].push(card);
  return card;
}
function prepareBotScenario(board){
  const isId=id=>c=>WSFormalCards.find(botCatalog,c.id)?.cardNumber===id;
  function place(predicate,to){
    const i=board.deck.findIndex(predicate);
    if(i<0)return false;
    botMove(board,"deck",i,to);
    return true;
  }
  const firen=isId("STS/W140-002"),song=isId("STS/W140-031");
  const other=card=>{
    const definition=botDefinition(card);
    return !firen(card)&&definition?.type==="character"&&definition.traits?.some(trait=>trait==="巡遊者"||trait==="魔王");
  };
  if(!place(firen,"hand")||!place(firen,"waiting")||!place(song,"hand")||!place(song,"deck")||
     !place(other,"back0")||!place(other,"waiting"))return false;
  const top=board.deck.pop();
  for(const zone of ["hand","level"])botMove(board,"deck",0,zone);
  board.deck.push(top);
  return true;
}

function startBotMatch(deck,scenario){
  if(!isDeckSetup())return;
  if(onlineMatch?.active()){message("オンラインルームを退出してから開始してください");return}
  const rules=isAutoRules(scenario);
  const redBlue=isDeckMirror(scenario);
  const mirrorDeck=scenario===stellaScenario?stellaDeck:redBlueDeck;
  if(scenario===stellaScenario&&!botCatalog){message("カードデータの読み込みをお待ちください");return}
  const opening=scenario==="opening"||redBlue;
  if(redBlue)deck=mirrorDeck;
  else if(rules)deck=Object.hasOwn(practiceTitles,scenario)?practiceDeck(botDeck,scenario):{...botDeck,title:"共通ルール確認用デッキ"};
  if(!deck){message("プレイヤー1の使用デッキを選択してください");return}
  if(!rules&&!Object.hasOwn(botScenarioNames,scenario))return;
  const opponentDeck=redBlue?mirrorDeck:scenario===bondScenario?practiceDeckWithSpecimens(botDeck,botDeck.title,[["109",1]],["001"]):
    scenario===backupScenario?practiceDeckWithSpecimens(botDeck,botDeck.title,[["120",1]],["009"]):botDeck;
  const boards=[buildMatchBoard(deck,0),buildMatchBoard(opponentDeck,1)];
  const [own,opponent]=boards;
  if(redBlue){
    for(const board of boards){
      shuffle(board.deck);
      for(let i=0;i<5;i++)botMove(board,"deck",board.deck.length-1,"hand");
    }
  }else if(rules){prepareAutoRuleBoards(boards,scenario);}
  else if(scenario==="firen"){
    if(!botCatalog){message("カードデータの読み込みをお待ちください");return}
    if(!prepareBotScenario(own)){
      message("フィレン2枚、凱旋歌2枚と、フィレン以外の登録済み《巡遊者》か《魔王》のキャラ2枚が必要です");
      return;
    }
  }else{
    shuffle(own.deck);
    for(let i=0;i<5;i++)botMove(own,"deck",own.deck.length-1,"hand");
  }
  if(!rules){
    // Five level-zero practice characters form the bot's starting hand.
    for(let i=0;i<5;i++)botMove(opponent,"deck",0,"hand");
    if(scenario==="front"||scenario==="firen")botMove(opponent,"hand",0,"front0");
    else if(scenario==="open")botMove(opponent,"hand",0,"front1");
    if(scenario==="opening")shuffle(opponent.deck);
    else{
      const climaxes=opponent.deck.filter(card=>card.cx);
      opponent.deck=opponent.deck.filter(card=>!card.cx);
      climaxes.forEach((card,i)=>opponent.deck.splice(i*5,0,card));
    }
    if(scenario!=="opening"){
      const first=opponent.deck.findIndex(c=>c.cx===(scenario==="front"));
      botMove(opponent,"deck",first,"deck");
    }
  }
  const snapshot={version:1,phase:opening?"mulligan":"active",screen:opening?"mulligan":"battle",
    side:0,firstPlayer:0,mulliganPlayer:0,openingHandDealt:true,decks:[deck,opponentDeck],players:boards,result:null,
    turn:{player:0,number:opening?1:rules?3:1,phase:opening?"stand":"main",drawPending:false},bot:{scenario,uses:{},...(rules?{log:[redBlue?mirrorDeck.title+"・初手から開始":scenario===backupScenario?"赤Lv3を前列①にプレイできます。青Lv2の助太刀は相手のフロントアタック時に使えます":scenario===waitingScenario?"青Lv0を控え室へ移動して誘発を確認。赤Lv0を出すと公開と任意ドローを順に試せます":scenario===bondScenario?"赤Lv0を出すと絆で控え室の赤Lv1を回収できます。青Lv2を前列①に出すと相手のLv3にアタックできます":scenario===stockScenario?"赤Lv3は控え室のCXが2枚以下ならLv2で登場できます。青のイベントで相手のストックを入れ替えられます":scenario===entryScenario?"手札の青Lv0で山札調整とCX回収、赤Lv0でクロックサーチを確認できます":scenario===levelThreeScenario?"青Lv3を前列①に出し、ゲートCXを置いてアタックできます":scenario===levelTwoScenario?"手札のLv2を後列①に置き、前のLv0とLv1のパワーを確認できます":scenario===levelOneScenario?"赤はレベル置場、青はクロックにあります。手札のLv1とカムバックCXをプレイできます":scenario===practiceScenario?"後列の「仮キャラ 集中」をタップ。2枚引くと続くトリガーで両方の仮CXを確認できます":"手札の仮キャラをタップしてプレイ"]}:{})}};
  if(!writeMatch(snapshot))return;
  match=snapshot;players=boards;side=0;selected=null;mulliganSelection=new Set();
  showMatchScreen();
  if(!rules)botMessage("");
  message("Bot戦を開始しました");
}

function botEffectCard(card){
  const def=botDefinition(card);
  return {uid:card.uid,cardNumber:card.id,faceUp:card.faceUp,orientation:card.orientation,name:def?.name??null,type:def?.type??(card.cx?"climax":null),
    level:card.botLevel??def?.stats?.level??null,cost:def?.stats?.cost??null,power:card.botPower??def?.stats?.power??null,
    soul:card.botSoul??def?.stats?.soul??null,turnLevelBonus:card.turnLevelBonus??0,
    traits:def?.traits??null,keywords:def?.keywords??null,allTags:def?.allTags??false,markers:card.markers??[],gainedAbilities:card.gainedAbilities??[]};
}
function botEffectBoard(p){
  const result=WSEffects.emptyBoard();
  for(const [label,owner] of [["self",p],["opponent",1-p]]){
    const board=players[owner];
    for(const zone of Object.keys(result[label])){
      result[label][zone]=zone==="stage"?botSlots.flatMap(slot=>board[slot].map(card=>({
        ...botEffectCard(card),row:slot.startsWith("front")?"front":"back",faceUp:card.faceUp
      }))):board[zone].map(botEffectCard);
    }
  }
  return result;
}
function botApplyEffect(state,destinations,p){
  const board=players[p];
  const all=new Map(zones.flatMap(zone=>board[zone].map(card=>[card.uid,{card,zone}])));
  const slots=new Map();
  for(const entry of state.self.stage){
    const old=all.get(entry.uid);
    if(old&&isStageZone(old.zone))slots.set(entry.uid,old.zone);
  }
  for(const entry of state.self.stage){
    if(!slots.has(entry.uid)){
      const open=destinations.get(entry.uid);
      if(!open||[...slots.values()].includes(open))return false;
      slots.set(entry.uid,open);
    }
  }
  const next=Object.fromEntries(zones.map(zone=>[zone,[]]));
  const releasedMarkers={waiting:[],memory:[]};
  for(const [zone,cards] of Object.entries(state.self)){
    for(const entry of cards){
      const old=all.get(entry.uid);
      if(!old)return false;
      const card={...old.card,botPower:entry.power,botSoul:entry.soul,botLevel:entry.level,turnLevelBonus:entry.turnLevelBonus};
      if(zone==="stage"&&entry.gainedAbilities?.length)card.gainedAbilities=entry.gainedAbilities;
      else delete card.gainedAbilities;
      if(isAutoRules()){
        card.turnPowerBonus=(card.turnPowerBonus??0)+(entry.power??0)-(autoRuleStat(old.card,"power")??0);
        card.turnSoulBonus=(card.turnSoulBonus??0)+(entry.soul??0)-(autoRuleStat(old.card,"soul")??0);
      }
      if(zone!=="stage"&&isStageZone(old.zone)){
        card.orientation=0;
        for(const marker of card.markers??[])releasedMarkers[botMarkerExitZone(marker)].push({...marker.card,faceUp:true});
        delete card.markers;
      }
      const target=zone==="stage"?slots.get(entry.uid):zone;
      if(old.zone!==target){
        card.faceUp=!["deck","stock"].includes(target);
        autoRuleStageChange(card,old.zone,target,p);
      }
      next[target].push(card);
    }
  }
  for(const [zone,cards] of Object.entries(releasedMarkers))next[zone].push(...cards);
  Object.assign(board,next);
  return true;
}
function botStats(p,card){
  const original=botEffectCard(card);
  let {power,soul}=original;
  const own=players[p];
  if(isAutoRules()){
    const bonus=autoRuleBuff(p,card);
    if(power!=null)power+=bonus.power;
    if(soul!=null)soul+=bonus.soul;
  }else if(own.cx.length&&botCatalog){
    const bonus=WSEffects.continuousModifiers(botEffectBoard(p),"self",findBotCard).find(entry=>entry.uid===card.uid);
    if(bonus){power=bonus.power;soul=bonus.soul;}
  }
  if(!isAutoRules()&&power!=null&&botDefinition(card)?.effects?.some(effect=>effect.timing==="on_stage"&&effect.type==="continuous")){
    power+=WSEffects.continuousStatBonus(botEffectBoard(p),original,"on_stage","power",findBotCard);
  }
  if(match.turn?.player===p&&power!=null){
    const effect=botDefinition(card)?.effects?.find(item=>item.timing==="own_turn"&&item.type==="continuous");
    const key=effect?.steps?.find(step=>step.handler==="selectCards")?.params.as;
    if(key){
      const result=WSEffects.run(effect,botEffectBoard(p),{sourceUid:card.uid,[key]:[card.uid]},findBotCard);
      if(result.status==="success"){
        const modified=result.state.self.stage.find(entry=>entry.uid===card.uid);
        if(modified)power+=modified.power-original.power;
      }
    }
  }
  if(power!=null)power+=stellaPower(p,card);
  return {power,soul};
}

function botMarkerAbility(card,timing){
  return botDefinition(card)?.effects?.find(effect=>effect.timing===timing);
}
function botMarkerExitZone(marker){
  return match?.bot&&botMarkerAbility(marker.card,"leave_marker")?"memory":"waiting";
}
function botResolveRecall(p,entrant,done){
  const board=players[p];
  const current=botSlots.flatMap(slot=>board[slot]).find(card=>card.uid===entrant.uid);
  if(!current||botDefinition(current)?.type!=="character"||current.markers?.length){done();return}
  const choices=board.memory.filter(card=>botMarkerAbility(card,"own_character_enter_stage"));
  if(!choices.length){done();return}
  function attach(card){
    const index=board.memory.findIndex(entry=>entry.uid===card.uid);
    if(index>=0&&!current.markers?.length){
      const [marker]=board.memory.splice(index,1);
      marker.faceUp=true;
      current.markers=[{card:marker,faceUp:true}];
    }
    done();
  }
  if(p===1){attach(choices[0]);return}
  const body=showResolution("回想・登場したキャラの下に置く",[current,...choices]);
  choices.forEach((card,index)=>deckButton(body,"思い出の"+(index+1)+"枚目をマーカーにする",()=>{
    closeResolution();attach(card);
  }));
  deckButton(body,"マーカーにしない",()=>{closeResolution();done()});
}
function botStageEntry(p,card,from,done){
  botResolveRecall(p,card,()=>{
    if(from==="hand")botDispatch(card,"from_hand_to_stage",done,p);
    else done();
  });
}
function botResolveMarkerAttack(p,card,done){
  const current=botSlots.flatMap(slot=>players[p][slot]).find(entry=>entry.uid===card.uid);
  if(!current||!["巡遊者","魔王"].some(trait=>matchesPracticeTrait(current,trait))){done();return}
  const markers=(current.markers??[]).filter(marker=>marker.faceUp&&botMarkerAbility(marker.card,"marker_host_attack"));
  function next(index){
    if(index===markers.length){done();return}
    autoRuleReorderTop(p,()=>next(index+1),true);
  }
  next(0);
}
function botOtherAttackEffects(p,attacker,done){
  const board=players[p];
  const sources=botSlots.flatMap(slot=>board[slot]).filter(card=>card.faceUp&&card.uid!==attacker.uid);
  function next(index){
    const source=sources[index];
    if(!source){done();return}
    const resume=()=>next(index+1);
    const effect=botDefinition(source)?.effects?.find(entry=>entry.timing==="other_own_attack");
    if(!effect||!botSlots.some(slot=>board[slot].some(card=>card.uid===source.uid))){resume();return}
    const key=source.uid+":"+effect.id;
    if((match.bot.uses[key]??0)>=effect.limit.perTurn){resume();return}
    const current=botSlots.flatMap(slot=>board[slot]).find(card=>card.uid===attacker.uid);
    if(!current){done();return}
    match.bot.uses[key]=(match.bot.uses[key]??0)+1;
    current.botSoul=(current.botSoul??botDefinition(current)?.stats?.soul??1)-1;
    current.turnSoulBonus=(current.turnSoulBonus??0)-1;
    const top=board.deck.at(-1);
    if(!top){resume();return}
    const info=botEffectCard(top);
    const stocked=info.type==="character"&&info.level!=null&&info.level<=0;
    function finish(){
      if(stocked)botMove(board,"deck",board.deck.length-1,"stock");
      resolveBoardRules(p,resume);
    }
    if(p===1){autoRuleLog("山札の上を公開："+(info.name??info.cardNumber)+(stocked?"（ストックへ）":"（元に戻す）"));finish();return}
    const body=showResolution(effect.category,[top]);
    deckButton(body,stocked?"ストックに置く":"元に戻す",()=>{closeResolution();finish()});
  }
  next(0);
}

function botDispatch(card,timing,done,p=0,context={}){
  const effects=botDefinition(card)?.effects?.filter(item=>item.timing===timing&&item.type==="auto"
    &&(timing!=="on_own_climax_trigger"||card.gainedAbilities?.includes(item.id)))??[];
  function next(i){
    if(i===effects.length){
      if(timing==="on_attack")botResolveMarkerAttack(p,card,()=>botOtherAttackEffects(p,card,()=>done?.()));
      else done?.();
      return;
    }
    const effect=effects[i],resume=()=>next(i+1);
    if(Object.hasOwn(stellaActions,effect.id))stellaActions[effect.id](p,card,resume);
    else if(effect.reorderTop)autoRuleReorderTop(p,resume);
    else if(effect.clockSearchCost)autoRuleClockSearch(p,card,effect,resume);
    else if(effect.traitLoot)autoRuleTraitLoot(p,card,effect,resume);
    else botGuide(card,effect,(success,result)=>{
      const triggerChecks=success&&result?.log.find(step=>step.triggerChecks)?.triggerChecks;
      if(triggerChecks)context.setTriggerChecks?.(triggerChecks);
      if(success&&effect.lookTop){
        const {max,targetLabel,minLevel}=effect.lookTop;
        resolveBoardRules(p,()=>autoRuleLookTop(p,max,effect.category,targetLabel,candidate=>
          (botEffectCard(candidate).level??-1)>=minLevel,resume));
      }else if(success&&effect.drawAfterCost)autoRuleDrawAfterCost(p,effect.drawAfterCost,resume);
      else resume();
    },p,!effect.steps?.some(step=>["chooseBranch","lookAndOrderTop"].includes(step.handler)),context);
  }
  next(0);
}
function botTriggerIcons(p,card){
  const definition=botDefinition(card),icons=definition?.triggers??[];
  if(definition?.type!=="climax"||!icons.includes("トレジャー"))return icons;
  const sources=botSlots.flatMap(slot=>players[p][slot]).filter(entry=>entry.faceUp&&
    sameBotCardNumber(entry.id,"STS/W140-019"));
  return sources.length===1?[...icons,"風"]:icons;
}
function botResolveWind(p,done){
  const rival=players[1-p];
  const targets=botSlots.flatMap(slot=>rival[slot].map(card=>({slot,card}))).filter(({card})=>
    card.faceUp&&!card.cx&&!["event","climax"].includes(botDefinition(card)?.type)&&
    !botDefinition(card)?.keywords?.includes("相手の効果に選ばれない"));
  if(!targets.length){done();return}
  function bounce({slot,card}){
    const index=rival[slot].findIndex(entry=>entry.uid===card.uid);
    if(index>=0)botMove(rival,slot,index,"hand");
    done();
  }
  if(p===1){bounce(targets[0]);return}
  const body=showResolution("風・相手のキャラを手札に戻す",targets.map(({card})=>card));
  for(const target of targets)deckButton(body,labels[target.slot]+"の"+(botCardInfo(target.card)?.name??target.card.id),()=>{
    closeResolution();bounce(target);
  });
  deckButton(body,"戻さない",()=>{closeResolution();done()});
}
function botResolveTriggerIcons(p,trigger,done){
  if(!botTriggerIcons(p,trigger).includes("風")){botTriggerEffect(p,trigger,done);return}
  const windFirst=()=>botResolveWind(p,()=>botTriggerEffect(p,trigger,done));
  const treasureFirst=()=>botTriggerEffect(p,trigger,()=>botResolveWind(p,done));
  if(p===1){windFirst();return}
  const body=showResolution("トレジャーと風の解決順を選ぶ",[trigger]);
  deckButton(body,"風から解決",()=>{closeResolution();windFirst()});
  deckButton(body,"トレジャーから解決",()=>{closeResolution();treasureFirst()});
}
function botResolveAttackTrigger(p,trigger,attacker,done){
  botResolveTriggerIcons(p,trigger,()=>{
    const source=attacker();
    if(trigger.cx!==true){done();return}
    const finish=()=>stellaMemoryTrigger(p,done);
    if(!source){finish();return}
    botDispatch(source,"on_own_climax_trigger",finish,p,{triggerClimax:true});
  });
}

function botGuide(card,ability,done,p=0,abortable=true,context={}){
  const key=card.uid+":"+ability.id;
  const reisSearch=ability.id==="on-play-waiting-okaken";
  const reisConsole=ability.id==="memory-recollection-top-reveal";
  const simpleReis=reisSearch||reisConsole;
  const iterator=WSEffects.guide(ability,botEffectBoard(p),{
    ...context,sourceUid:card.uid,usedThisTurn:match.bot.uses[key]??0
  },findBotCard);
  function apply(state,destinations,bothSides){
    return botApplyEffect(state,destinations,p)&&(!bothSides||botApplyEffect({self:state.opponent},new Map(),1-p));
  }
  function finish(result,destinations=new Map(),entered=[]){
    const bothSides=result.log.some(step=>["millDeckTop","shuffleStockIntoDeck"].includes(step.handler)&&step.ok);
    const success=result.status==="success"&&apply(result.state,destinations,bothSides);
    if(success&&ability.limit?.perTurn)match.bot.uses[key]=(match.bot.uses[key]??0)+1;
    const text=success?"解決しました":result.status==="success"?"舞台の空き枠がありません":result.message;
    if(!isAutoRules())botMessage((ability.category??ability.id)+" · "+text);
    else if(result.status!=="condition-not-met")autoRuleLog((ability.category??ability.id)+" · "+text);
    if(!success||!entered.length){done?.(success,result);return}
    function dispatch(index){
      if(index===entered.length){done?.(true,result);return}
      const entry=entered[index];
      const current=players[p][destinations.get(entry.uid)].find(card=>card.uid===entry.uid);
      if(current)botStageEntry(p,current,"hand",()=>dispatch(index+1));
      else dispatch(index+1);
    }
    resolveBoardRules(p,()=>dispatch(0));
  }
  function chooseStage(result){
    if(result.status!=="success"){finish(result);return}
    const retained=new Set(result.state.self.stage.map(card=>card.uid));
    const available=botSlots.filter(slot=>!players[p][slot].some(card=>retained.has(card.uid)));
    const staged=new Set(botSlots.flatMap(slot=>players[p][slot].map(card=>card.uid)));
    const entering=result.state.self.stage.filter(card=>!staged.has(card.uid));
    const replaceable=new Set(result.log.filter(step=>step.replaceStage).flatMap(step=>step.cards));
    const destinations=new Map();
    function assign(entry,slot){
      const victims=new Set(players[p][slot].map(card=>card.uid));
      const displaced=result.state.self.stage.filter(card=>victims.has(card.uid));
      result.state.self.stage=result.state.self.stage.filter(card=>!victims.has(card.uid));
      result.state.self.waiting.push(...displaced);
      destinations.set(entry.uid,slot);
    }
    const candidates=entry=>[...new Set(replaceable.has(entry.uid)?[...available,...botSlots]:available)]
      .filter(slot=>![...destinations.values()].includes(slot));
    if(p===1&&isAutoRules()){
      for(const entry of entering){
        const slot=candidates(entry)[0];
        if(!slot){finish(result);return}
        assign(entry,slot);
      }
      finish(result,destinations,entering.filter(entry=>replaceable.has(entry.uid)));
      return;
    }
    function pick(index){
      if(index===entering.length){finish(result,destinations,entering.filter(entry=>replaceable.has(entry.uid)));return}
      const entry=entering[index];
      const slots=candidates(entry);
      if(!slots.length){finish(result);return}
      const body=showResolution("登場させる舞台の枠を選ぶ",[{id:entry.cardNumber}]);
      for(const slot of slots){
        const occupant=players[p][slot].at(-1);
        const replacing=occupant&&result.state.self.stage.some(card=>card.uid===occupant.uid);
        const label=labels[slot]+(replacing?"（"+(botCardInfo(occupant)?.name??occupant.id)+"を控え室へ）":"");
        deckButton(body,label,()=>{
          closeResolution();
          assign(entry,slot);
          pick(index+1);
        });
      }
      if(abortable)deckButton(body,"効果確認を中止",()=>{closeResolution();done?.(false)});
    }
    pick(0);
  }
  function step(answer){
    const next=iterator.next(answer);
    if(next.done){chooseStage(next.value);return}
    const prompt=next.value;
    if(prompt.kind==="commit-cost"){
      if(!botApplyEffect(prompt.state,new Map(),p)){done?.(false);return}
      abortable=false;
      render();
      step(botEffectBoard(p));
      return;
    }
    if(prompt.kind==="damage"){
      if(!botApplyEffect(prompt.state,new Map(),p)){done?.(false);return}
      abortable=false;
      const target=prompt.side==="self"?p:1-p;
      botDamage(target,prompt.amount,damage=>step({state:botEffectBoard(p),damage}));
      return;
    }
    if(prompt.kind==="deck-empty"){
      if(!apply(prompt.state,new Map(),prompt.bothSides||prompt.side==="opponent")){done?.(false);return}
      abortable=false;
      const target=prompt.side==="opponent"?1-p:p;
      resolveBoardRules(target,()=>{
        if(players[target].level.length>=4){done?.(false);return}
        step(botEffectBoard(p));
      });
      return;
    }
    if(prompt.committedState){
      if(!apply(prompt.committedState,new Map(),true)){done?.(false);return}
      abortable=false;
      render();
    }
    if(simpleReis&&(prompt.kind==="cost"||prompt.kind==="optional"&&reisSearch)){
      step(prompt.kind==="optional"?true:undefined);
      return;
    }
    if(reisSearch&&prompt.kind==="reveal"){
      const names=prompt.cards.map(entry=>stellaName({id:entry.cardNumber}));
      if(isAutoRules())autoRuleLog(names.join("、")+"を公開して手札へ");
      else botMessage(names.join("、")+"を公開して手札へ");
      step();
      return;
    }
    if(p===1&&isAutoRules()){
      switch(prompt.kind){
        case "optional":case "optional-top":step(true);break;
        case "branch":step(players[p].clock.length>=5?Math.min(1,prompt.labels.length-1):0);break;
        case "select":{
          const priority=card=>{
            const def=botDefinition({id:card.cardNumber});
            return Number(card.type==="climax")+Number(!!(def?.lookOnAttack||def?.millOnAttack));
          };
          const candidates=prompt.from.zone==="hand"?[...prompt.candidates].sort((a,b)=>priority(a)-priority(b)):prompt.candidates;
          step(candidates.slice(0,prompt.max).map(card=>card.uid));
          break;
        }
        case "look-count":case "private-look-count":case "heal":step(prompt.max);break;
        case "destination":step(prompt.destinations[0]);break;
        case "treasure":step(prompt.canStock);break;
        default:step();break;
      }
      return;
    }
    const cardChoices=prompt.kind==="select"&&(prompt.from.zone==="deck"||simpleReis);
    const title=simpleReis&&prompt.kind==="select"?(prompt.phase==="costs"?
      (reisSearch?"ストック1枚を払い、クロックの下に置くカードを選ぶ":"思い出に置く回想キャラを選ぶ"):
      "山札からレベル1以下のキャラを1枚まで選ぶ"):ability.category??"カード効果";
    const visibleCards=!cardChoices&&prompt.kind==="select"&&prompt.committedState?prompt.candidates:
      ["reveal","private-look"].includes(prompt.kind)?prompt.cards:[];
    const body=showResolution(title,prompt.kind==="treasure"?[card]:visibleCards.map(c=>({id:c.cardNumber})));
    const add=(label,action)=>deckButton(body,label,()=>{closeResolution();action()});
    const respond=(label,result)=>add(label,()=>step(result));
    if(prompt.kind==="branch"){
      prompt.labels.forEach((label,index)=>respond(label,index));
    }else if(prompt.kind==="private-look-count"){
      body.append(document.createTextNode("相手の山札を上から何枚見るか選んでください。"));
      for(let n=0;n<=prompt.max;n++)respond(n?n+"枚見る":"見ない",n);
    }else if(prompt.kind==="private-look"){
      respond("元の順番で戻す");
    }else if(prompt.kind==="look-count"){
      for(let n=0;n<=prompt.max;n++)respond(n?n+"枚見る":"見ない",n);
    }else if(prompt.kind==="heal"){
      for(let n=0;n<=prompt.max;n++)respond(n===0?"回復しない":n+"枚回復",n);
    }else if(prompt.kind==="optional-top"){
      body.append(document.createTextNode(prompt.label));
      respond("行う",true);respond("行わない",false);
    }else if(prompt.kind==="optional"){
      respond("能力を使う",true);respond("使わない",false);
    }else if(prompt.kind==="select"){
      const immediate=cardChoices&&prompt.max===1;
      if(!simpleReis){
        const hint=document.createElement("p");
        hint.textContent=prompt.text??prompt.label+"から選んでください";
        body.append(hint);
      }
      const picks=new Set(),orderButtons=[];
      let confirm;
      for(const [candidateIndex,entry] of prompt.candidates.entries()){
        const actual={id:entry.cardNumber};
        const label=((prompt.topOrder||prompt.privateLook)?(candidateIndex+1)+"．":"")+(botCardInfo(actual)?.name??entry.cardNumber);
        const choose=()=>{
          if(immediate){
            if(simpleReis&&prompt.phase==="costs")abortable=false;
            closeResolution();
            step([entry.uid]);
            return;
          }
          if(picks.has(entry.uid))picks.delete(entry.uid);
          else if(picks.size<prompt.max)picks.add(entry.uid);
          b.setAttribute("aria-pressed",String(picks.has(entry.uid)));
          if(prompt.topOrder){
            const ordered=[...picks];
            for(const [uid,button,label] of orderButtons){
              const index=ordered.indexOf(uid);
              (button.firstChild??button).textContent=index<0?label:(index+1)+"番目に戻す ／ "+label;
            }
          }
          b.style.outline=picks.has(entry.uid)?"2px solid #f4cf73":"";
          confirm.disabled=picks.size<prompt.min;
        };
        const b=cardChoices?effectCardButton(body,actual,label,choose):deckButton(body,label,choose);
        if(!immediate)b.setAttribute("aria-pressed","false");
        if(prompt.topOrder)orderButtons.push([entry.uid,b,label]);
      }
      if(!immediate){confirm=add("選択を確定",()=>step([...picks]));confirm.disabled=prompt.min>0}
      if(prompt.min===0)respond("選ばず進む",[]);
    }else if(prompt.kind==="destination"){
      for(const destination of prompt.destinations)respond(labels[destination.zone]+"へ",destination);
    }else if(prompt.kind==="treasure"){
      respond("山札の上をストックへ",true).disabled=!prompt.canStock;
      respond("ストックに置かない",false);
    }else if(prompt.kind==="reveal"){
      body.append(document.createTextNode("公開カード "+prompt.cards.map(c=>c.cardNumber).join("、")));
      respond("公開を確認");
    }else{
      body.append(document.createTextNode(prompt.text??"コストを確認してください"));
      respond("コストを支払う");
    }
    if(abortable)add(simpleReis?"使わない":"効果確認を中止",()=>{iterator.return();done?.(false)});
  }
  step();
}

function botMessage(text){document.getElementById("botStatus").textContent=text}

function botCheckEnd(){
  if(!isMatchActive())return false;
  const loser=players.findIndex(board=>board.level.length>=4);
  if(loser<0)return false;
  match={...match,phase:"ended",screen:"result",result:{reason:"level",winner:1-loser}};
  writeMatch(match);
  showMatchScreen();
  return true;
}
function botEndTurn(p){
  for(const board of players)for(const zone of zones){
    for(const card of board[zone]){
      delete card.gainedAbilities;
      if(card.turnPowerBonus){card.botPower-=card.turnPowerBonus;delete card.turnPowerBonus}
      if(card.turnSoulBonus){card.botSoul-=card.turnSoulBonus;delete card.turnSoulBonus}
      if(card.turnLevelBonus){card.botLevel-=card.turnLevelBonus;delete card.turnLevelBonus}
    }
  }
  while(players[p].cx.length)botMove(players[p],"cx",0,"waiting");
  if(isAutoRules()){
    match.bot.attacked=false;
    for(const board of players)for(const zone of zones)for(const card of board[zone]){
      delete card.botBackupReverse;
      if(card.botEntryBattleBuff?.until<match.turn.number)delete card.botEntryBattleBuff;
    }
  }
  match.bot.uses={};
}

function botRevealTop(p,receive,done){
  resolveBoardRules(p,()=>{
    const card=players[p].deck.pop();
    if(card)receive(card);
    resolveBoardRules(p,()=>done(!!card));
  });
}
function botDamage(target,amount,done){
  const board=players[target],revealed=[];
  function finish(cancel){
    const destination=cancel?"waiting":"clock";
    const damage={cards:revealed.map(card=>card.uid),cancelled:cancel};
    const result=cancel?"CXでダメージをキャンセル":"ダメージ "+revealed.length+"枚";
    if(isAutoRules()){
      autoRuleLog(result+(revealed.length?"（"+revealed.map(c=>botCardInfo(c).name).join("、")+"）":""));
      revealed.forEach(card=>{card.faceUp=true;board[destination].push(card)});
      resolveBoardRules(target,()=>done(damage));
      return;
    }
    botMessage(result);
    if(!revealed.length){resolveBoardRules(target,()=>done(damage));return}
    const body=showResolution(result,revealed);
    deckButton(body,cancel?"控え室へ":"クロックへ",()=>{
      closeResolution();
      for(const card of revealed){card.faceUp=true;board[destination].push(card)}
      resolveBoardRules(target,()=>done(damage));
    });
  }
  function next(){
    if(revealed.length===amount){finish(false);return}
    botRevealTop(target,card=>revealed.push(card),found=>{
      if(!found){finish(false);return}
      if(revealed.at(-1).cx===true){finish(true);return}
      next();
    });
  }
  next();
}
function botBattle(p,zone,attackUid,defenceUid,opposite=zone){
  const attacker=players[p][zone].at(-1),defender=players[1-p][opposite].at(-1);
  if(!attacker||!defender||attacker.uid!==attackUid||defender.uid!==defenceUid)return;
  const attack=botStats(p,attacker).power,defence=botStats(1-p,defender).power;
  if(attack==null||defence==null){
    botMessage("パワー未登録のキャラがいるため、バトルのリバースは手動で確認してください");
    return;
  }
  const reversals=[];
  if(defence<=attack&&defender.orientation!==180)reversals.push({owner:p,source:attacker,target:defender,slot:opposite,sourceSlot:zone});
  if(attack<=defence&&attacker.orientation!==180)reversals.push({owner:1-p,source:defender,target:attacker,slot:zone,sourceSlot:opposite});
  if(attack<=defence)attacker.orientation=180;
  if(defence<=attack)defender.orientation=180;
  if(isAutoRules())autoRuleLog("バトル "+attack+" 対 "+defence+(attack===defence?"（両方リバース）":attack<defence?"（攻撃側リバース）":"（防御側リバース）"));
  return reversals;
}

function botHumanAttack(p,zone,index){
  const board=players[p],uid=board[zone][index].uid;
  const defender=players[1-p][zone].at(-1);
  selected=null;
  let triggerChecks=1;
  runRuleOperation(done=>{
    board[zone][index].orientation=90;
    function afterEffects(){
      const attacker=board[zone].find(c=>c.uid===uid);
      if(!attacker){done();return}
      let triggerSouls=0;
      function damage(){
        const body=showResolution("ダメージ枚数を決める",[]);
        const current=board[zone].find(card=>card.uid===uid);
        if(!current){closeResolution();done();return}
        const attack=botStats(p,current),n=(attack.soul??1)+(defender?0:1)+triggerSouls;
        const amount=deckSelect(50,n),zero=document.createElement("option");
        zero.value=0;zero.textContent="0枚";amount.prepend(zero);
        body.append(document.createTextNode(defender?"フロントアタック":"ダイレクトアタック"),amount);
        deckButton(body,"ダメージを与える",()=>{
          closeResolution();
          botDamage(1-p,Number(amount.value),()=>{
            autoRuleResolveReversals(botBattle(p,zone,uid,defender?.uid)??[],done);
          });
        });
      }
      function check(remaining){
        if(!remaining){damage();return}
        let trigger;
        botRevealTop(p,card=>{trigger=card},found=>{
          if(!found){damage();return}
          if(triggerChecks>1)triggerSouls+=botDefinition(trigger)?.triggers?.filter(icon=>icon==="ソウル").length??0;
          botResolveAttackTrigger(p,trigger,()=>board[zone].find(c=>c.uid===uid),()=>check(remaining-1));
        });
      }
      check(triggerChecks);
    }
    botDispatch(board[zone][index],"on_attack",afterEffects,p,{setTriggerChecks:n=>{triggerChecks=n}});
  });
}

function botTriggerEffect(p,trigger,done){
  const board=players[p];
  const effect=botDefinition(trigger)?.effects?.find(item=>item.type==="trigger"&&item.timing==="on_trigger");
  if(effect){
    const includesTrigger=effect.steps.some(step=>step.handler==="treasureTrigger");
    if(includesTrigger){trigger.faceUp=true;board.waiting.push(trigger)}
    botGuide(trigger,effect,success=>{
      if(!includesTrigger){trigger.faceUp=false;board.stock.push(trigger)}
      else if(!success){
        const index=board.waiting.findIndex(card=>card.uid===trigger.uid);
        if(index>=0)botMove(board,"waiting",index,"stock");
      }
      resolveBoardRules(p,done);
    },p);
    return;
  }
  function stock(){trigger.faceUp=false;board.stock.push(trigger);done()}
  if(isAutoRules()){stock();return}
  const body=showResolution("トリガーチェック",[trigger]);
  deckButton(body,"ストックに置く",()=>{closeResolution();stock()});
}

function botAttack(zone){
  const attacker=players[1][zone].at(-1),defender=players[0][zone].at(-1);
  attacker.orientation=90;
  runRuleOperation(done=>{
    botRevealTop(1,card=>{card.faceUp=false;players[1].stock.push(card)},()=>{
      const amount=(botStats(1,attacker).soul??1)+(defender?0:1);
      botDamage(0,amount,()=>{
        autoRuleResolveReversals(botBattle(1,zone,attacker.uid,defender?.uid)??[],done);
      });
    });
  });
}
function botCanStep(){
  if(!isMatchActive()||!match.bot||ruleBusy||document.getElementById("dialog").open)return false;
  if(match.turn.phase==="encore")return match.encore?.actor===1||
    match.encore?.step==="complete"&&match.turn.player===1;
  return match.turn.player===1;
}
let botTurnTimer=null;
function scheduleBotTurn(){
  if(!isDeckMirror(match?.bot?.scenario)||!botCanStep()){
    if(botTurnTimer!==null)clearTimeout(botTurnTimer);
    botTurnTimer=null;
    return;
  }
  if(botTurnTimer!==null)return;
  const scheduledMatch=match;
  botTurnTimer=setTimeout(()=>{
    botTurnTimer=null;
    if(match===scheduledMatch)runBotTurnStep();
    scheduleBotTurn();
  },350);
}
function renderBotControls(){
  document.getElementById("botControls").hidden=false;
  document.getElementById("botModeName").textContent="Bot戦 · "+((match.bot.scenario===stellaScenario?stellaDeck.title:match.bot.scenario===redBlueScenario?redBlueDeck.title:practiceTitles[match.bot.scenario])??(isAutoRules()?autoRuleTitle:botScenarioNames[match.bot.scenario]));
  const button=document.getElementById("botStep");
  button.hidden=isDeckMirror(match.bot.scenario);
  button.disabled=!botCanStep();
  scheduleBotTurn();
  const phase=match.turn.phase;
  if(isAutoRules()&&match.bot.log)botMessage(match.bot.log.join(" ／ "));
  const steps={stand:"Botのドロー",draw:isAutoRules()?"Botのクロックへ":"Botがキャラを出す",clock:"Botのメインへ",climax:"Botのアタックへ",main:isAutoRules()?"Botがキャラを出す":"Botのアタックへ",
    attack:"Botのアタックを進める",encore:"Botのアンコールを進める",end:"自分のターンへ"};
  button.textContent=button.disabled?"Botの行動を進める":steps[phase];
  const card=selected?.p===0&&isStageZone(selected.z)?players[0][selected.z][selected.index]:null;
  const abilities=botDefinitionForAbilities(card);
  document.getElementById("botAbility").hidden=!abilities.length;
}
function botDefinitionForAbilities(card){
  if(!card||match.turn.player!==0||match.turn.phase!=="main"||ruleBusy)return [];
  return (botDefinition(card)?.effects??[]).filter(ability=>ability.type==="activated"&&
    (ability.id!=="teresa-recall"||card.orientation===0&&players[0].hand.length>0)&&
    (ability.id!=="replace-with-natsuka"||players[0].level.length>=3)&&
    (!ability.conditions?.some(step=>step.handler==="sourceStanding")||card.faceUp!==false&&(card.orientation??0)===0));
}

function runBotTurnStep(){
  if(!botCanStep())return;
  if(isAutoRules()){autoRuleBotStep();return}
  const board=players[1],turn=match.turn;
  switch(turn.phase){
    case "stand":
      turn.phase="draw";turn.drawPending=false;
      pullDeck(1,1,"hand");
      break;
    case "draw":
      turn.phase="main";
      for(const slot of botSlots.slice(0,3)){
        const index=board.hand.findIndex(card=>card.cx!==true);
        if(index<0)break;
        if(!board[slot].length)botResolveRecall(1,botMove(board,"hand",index,slot),()=>{});
      }
      botMessage("Botが空いている前列に練習キャラを出しました");updateBoard();
      break;
    case "main":
      turn.phase="attack";updateBoard();break;
    case "attack":{
      const slot=botSlots.slice(0,3).find(s=>board[s].at(-1)?.orientation===0);
      if(slot)botAttack(slot);
      else encoreAction("enter");
      break;
    }
    case "encore":{
      const context=match.encore;
      if(context.step==="complete"){encoreAction("end");return}
      if(context.step==="start"){encoreAction("start");return}
      const target=encoreCandidates(1)[0];
      if(!target){encoreAction("done");return}
      const uid=target.card.uid;
      botMove(board,target.zone,target.index,"waiting");
      match.encorePrivate[1].done.push(uid);
      updateBoard();break;
    }
    case "end":
      while(board.hand.length>7)botMove(board,"hand",0,"waiting");
      finishEndTurn();break;
  }
}
document.getElementById("botStep").onclick=runBotTurnStep;
function botReplaceWithNatsuka(p,source,done){
  const board=players[p],slot=botSlots.find(zone=>board[zone].some(card=>card.uid===source.uid));
  if(!slot||board.level.length<3){botMessage("レベル3以上で使えます");done();return}
  const body=showResolution("このカードを控え室に置いて能力を使う？",[source]);
  deckButton(body,"能力を使う",()=>{
    closeResolution();
    botMove(board,slot,board[slot].findIndex(card=>card.uid===source.uid),"waiting");
    const candidates=board.hand.filter(card=>sameBotCardNumber(card.id,"STS/W140-004"));
    if(!candidates.length){done();return}
    const choice=showResolution("同じ枠に爽風の才媛 ナツカを出す？",candidates);
    for(const [index,candidate] of candidates.entries())deckButton(choice,candidates.length===1?"同じ枠に出す":(index+1)+"枚目を出す",()=>{
      closeResolution();
      const entrant=botMove(board,"hand",board.hand.findIndex(card=>card.uid===candidate.uid),slot);
      autoRuleAddTurnStat(entrant,"power",2000);
      botDispatch(entrant,"from_hand_to_stage",done,p);
    });
    deckButton(choice,"出さない",()=>{closeResolution();done()});
  });
  deckButton(body,"使わない",()=>{closeResolution();done()});
}
function openBotAbility(){
  const card=selected?.p===0&&isStageZone(selected.z)?players[0][selected.z][selected.index]:null;
  const abilities=botDefinitionForAbilities(card);
  if(!abilities.length)return;
  const details=botCardDetails(card);
  const body=showResolution(details?details.name+"・起動能力":"起動能力",details?[]:[card]);
  if(details)appendBotCardDetails(body,details);
  setRuleModal(false);
  for(const ability of abilities)deckButton(body,ability.category??ability.id,()=>{
    closeResolution();
    if(ability.brainstorm){activateBrainstorm(0,card,ability.brainstorm);return}
    if(ability.id==="replace-with-natsuka"){runRuleOperation(done=>botReplaceWithNatsuka(0,card,done));return}
    if(Object.hasOwn(stellaActions,ability.id)){runRuleOperation(done=>stellaActions[ability.id](0,card,done));return}
    runRuleOperation(done=>botGuide(card,ability,done));
  });
}
document.getElementById("botAbility").onclick=openBotAbility;
