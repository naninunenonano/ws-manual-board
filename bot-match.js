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
  if(botCatalog&&card)return WSFormalCards.find(botCatalog,card.id);
  return null;
}
function botCardInfo(card){
  const def=botDefinition(card);
  if(!def)return cardCatalog[card.id]||null;
  return {name:def.name??card.id,level:def.stats?.level,power:def.stats?.power,cost:def.stats?.cost};
}
function botMove(board,from,index,to,position="top"){
  const card=board[from].splice(index,1)[0];
  if(!card)return null;
  card.faceUp=!["deck","stock"].includes(to);
  if(isStageZone(from)&&!isStageZone(to)){
    card.orientation=0;
    for(const marker of card.markers??[]){
      marker.card.faceUp=true;board.waiting.push(marker.card);
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
  const redBlue=scenario===redBlueScenario;
  const opening=scenario==="opening"||redBlue;
  if(redBlue)deck=redBlueDeck;
  else if(rules)deck=Object.hasOwn(practiceTitles,scenario)?practiceDeck(botDeck,scenario):{...botDeck,title:"共通ルール確認用デッキ"};
  if(!deck){message("プレイヤー1の使用デッキを選択してください");return}
  if(!rules&&!Object.hasOwn(botScenarioNames,scenario))return;
  const opponentDeck=scenario===bondScenario?practiceDeckWithSpecimens(botDeck,botDeck.title,[["109",1]],["001"]):
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
    turn:{player:0,number:opening?1:rules?3:1,phase:opening?"stand":"main",drawPending:false},bot:{scenario,uses:{},...(rules?{log:[redBlue?"赤青デッキ50枚・初手から開始":scenario===backupScenario?"赤Lv3を前列①にプレイできます。青Lv2の助太刀は相手のフロントアタック時に使えます":scenario===waitingScenario?"青Lv0を控え室へ移動して誘発を確認。赤Lv0を出すと公開と任意ドローを順に試せます":scenario===bondScenario?"赤Lv0を出すと絆で控え室の赤Lv1を回収できます。青Lv2を前列①に出すと相手のLv3にアタックできます":scenario===stockScenario?"赤Lv3は控え室のCXが2枚以下ならLv2で登場できます。青のイベントで相手のストックを入れ替えられます":scenario===entryScenario?"手札の青Lv0で山札調整とCX回収、赤Lv0でクロックサーチを確認できます":scenario===levelThreeScenario?"青Lv3を前列①に出し、ゲートCXを置いてアタックできます":scenario===levelTwoScenario?"手札のLv2を後列①に置き、前のLv0とLv1のパワーを確認できます":scenario===levelOneScenario?"赤はレベル置場、青はクロックにあります。手札のLv1とカムバックCXをプレイできます":scenario===practiceScenario?"後列の「仮キャラ 集中」をタップ。2枚引くと続くトリガーで両方の仮CXを確認できます":"手札の仮キャラをタップしてプレイ"]}:{})}};
  if(!writeMatch(snapshot))return;
  match=snapshot;players=boards;side=0;selected=null;mulliganSelection=new Set();
  showMatchScreen();
  if(!rules)botMessage("");
  message("Bot戦を開始しました");
}

function botEffectCard(card){
  const def=botDefinition(card);
  return {uid:card.uid,cardNumber:card.id,name:def?.name??null,type:def?.type??(card.cx?"climax":null),
    level:card.botLevel??def?.stats?.level??null,power:card.botPower??def?.stats?.power??null,
    soul:card.botSoul??def?.stats?.soul??null,turnLevelBonus:card.turnLevelBonus??0,
    traits:def?.traits??null,keywords:def?.keywords??null,allTags:def?.allTags??false,markers:card.markers??[]};
}
function botEffectBoard(p){
  const result=WSEffects.emptyBoard();
  for(const [label,owner] of [["self",p],["opponent",1-p]]){
    const board=players[owner];
    for(const zone of Object.keys(result[label])){
      const cards=zone==="stage"?botSlots.flatMap(slot=>board[slot]):board[zone];
      result[label][zone]=cards.map(botEffectCard);
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
  const markers=[];
  for(const [zone,cards] of Object.entries(state.self)){
    for(const entry of cards){
      const old=all.get(entry.uid);
      if(!old)return false;
      const card={...old.card,botPower:entry.power,botSoul:entry.soul,botLevel:entry.level,turnLevelBonus:entry.turnLevelBonus};
      if(isAutoRules()){
        card.turnPowerBonus=(card.turnPowerBonus??0)+(entry.power??0)-(autoRuleStat(old.card,"power")??0);
        card.turnSoulBonus=(card.turnSoulBonus??0)+(entry.soul??0)-(autoRuleStat(old.card,"soul")??0);
      }
      if(zone!=="stage"&&isStageZone(old.zone)){
        card.orientation=0;
        markers.push(...(card.markers??[]).map(marker=>({...marker.card,faceUp:true})));
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
  next.waiting.push(...markers);
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
    const bonus=WSEffects.continuousModifiers(botEffectBoard(p)).find(entry=>entry.uid===card.uid);
    if(bonus){power=bonus.power;soul=bonus.soul;}
  }
  if(match.turn?.player===p&&power!=null){
    const effect=botDefinition(card)?.effects?.find(item=>item.timing==="own_turn"&&item.type==="continuous");
    const key=effect?.steps?.find(step=>step.handler==="selectCards")?.params.as;
    if(key){
      const result=WSEffects.run(effect,botEffectBoard(p),{sourceUid:card.uid,[key]:[card.uid]});
      if(result.status==="success"){
        const modified=result.state.self.stage.find(entry=>entry.uid===card.uid);
        if(modified)power+=modified.power-original.power;
      }
    }
  }
  return {power,soul};
}

function botDispatch(card,timing,done,p=0,context={}){
  const effects=botDefinition(card)?.effects?.filter(item=>item.timing===timing&&item.type==="auto")??[];
  function next(i){
    if(i===effects.length){done?.();return}
    const effect=effects[i],resume=()=>next(i+1);
    if(effect.reorderTop)autoRuleReorderTop(p,resume);
    else if(effect.clockSearchCost)autoRuleClockSearch(p,card,effect,resume);
    else if(effect.traitLoot)autoRuleTraitLoot(p,card,effect,resume);
    else botGuide(card,effect,success=>{
      if(success&&effect.lookTop){
        const {max,targetLabel,minLevel}=effect.lookTop;
        resolveBoardRules(p,()=>autoRuleLookTop(p,max,effect.category,targetLabel,candidate=>
          (botEffectCard(candidate).level??-1)>=minLevel,resume));
      }else if(success&&effect.drawAfterCost)autoRuleDrawAfterCost(p,effect.drawAfterCost,resume);
      else resume();
    },p,true,context);
  }
  next(0);
}
function botGuide(card,ability,done,p=0,abortable=true,context={}){
  const key=card.uid+":"+ability.id;
  const iterator=WSEffects.guide(ability,botEffectBoard(p),{
    ...context,sourceUid:card.uid,usedThisTurn:match.bot.uses[key]??0
  });
  function finish(result,destinations=new Map()){
    const success=result.status==="success"&&botApplyEffect(result.state,destinations,p);
    if(success&&ability.limit?.perTurn)match.bot.uses[key]=(match.bot.uses[key]??0)+1;
    const text=success?"解決しました":result.status==="success"?"舞台の空き枠がありません":result.message;
    if(!isAutoRules())botMessage((ability.category??ability.id)+" · "+text);
    else if(result.status!=="condition-not-met")autoRuleLog((ability.category??ability.id)+" · "+text);
    done?.(success);
  }
  function chooseStage(result){
    if(result.status!=="success"){finish(result);return}
    const retained=new Set(result.state.self.stage.map(card=>card.uid));
    const available=botSlots.filter(slot=>!players[p][slot].some(card=>retained.has(card.uid)));
    const staged=new Set(botSlots.flatMap(slot=>players[p][slot].map(card=>card.uid)));
    const entering=result.state.self.stage.filter(card=>!staged.has(card.uid));
    if(entering.length>available.length){finish(result);return}
    const destinations=new Map();
    function pick(index){
      if(index===entering.length){finish(result,destinations);return}
      const entry=entering[index];
      const body=showResolution("登場させる舞台の枠を選ぶ",[{id:entry.cardNumber}]);
      for(const [i,slot] of available.entries())deckButton(body,labels[slot],()=>{
        closeResolution();
        destinations.set(entry.uid,slot);
        available.splice(i,1);
        pick(index+1);
      });
      deckButton(body,"効果確認を中止",()=>{closeResolution();done?.(false)});
    }
    pick(0);
  }
  function step(answer){
    const next=iterator.next(answer);
    if(next.done){chooseStage(next.value);return}
    const prompt=next.value;
    const body=showResolution(ability.category??"カード効果",prompt.kind==="reveal"?prompt.cards.map(c=>({id:c.cardNumber})):prompt.kind==="treasure"?[card]:[]);
    const add=(label,action)=>deckButton(body,label,()=>{closeResolution();action()});
    const respond=(label,result)=>add(label,()=>step(result));
    if(prompt.kind==="optional"){
      respond("能力を使う",true);respond("使わない",false);
    }else if(prompt.kind==="select"){
      body.append(document.createTextNode(prompt.label+"から選んでください"));
      const picks=new Set();
      const confirm=add("選択を確定",()=>step([...picks]));confirm.disabled=prompt.min>0;
      for(const entry of prompt.candidates){
        const actual={id:entry.cardNumber};
        const b=deckButton(body,botCardInfo(actual)?.name??entry.cardNumber,()=>{
          if(picks.has(entry.uid))picks.delete(entry.uid);
          else if(picks.size<prompt.max)picks.add(entry.uid);
          b.setAttribute("aria-pressed",String(picks.has(entry.uid)));
          b.style.outline=picks.has(entry.uid)?"2px solid #f4cf73":"";
          confirm.disabled=picks.size<prompt.min;
        });
        b.setAttribute("aria-pressed","false");
      }
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
    if(abortable)add("効果確認を中止",()=>{iterator.return();done?.(false)});
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
    for(const card of board[zone])if(card.turnLevelBonus){
      card.botLevel-=card.turnLevelBonus;delete card.turnLevelBonus;
    }
  }
  while(players[p].cx.length)botMove(players[p],"cx",0,"waiting");
  if(isAutoRules()){
    match.bot.attacked=false;
    for(const board of players)for(const zone of zones)for(const card of board[zone]){
      if(card.turnPowerBonus)card.botPower-=card.turnPowerBonus;
      if(card.turnSoulBonus)card.botSoul-=card.turnSoulBonus;
      delete card.turnPowerBonus;delete card.turnSoulBonus;
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
    const result=cancel?"CXでダメージをキャンセル":"ダメージ "+revealed.length+"枚";
    if(isAutoRules()){
      autoRuleLog(result+(revealed.length?"（"+revealed.map(c=>botCardInfo(c).name).join("、")+"）":""));
      revealed.forEach(card=>{card.faceUp=true;board[destination].push(card)});
      resolveBoardRules(target,done);
      return;
    }
    botMessage(result);
    if(!revealed.length){resolveBoardRules(target,done);return}
    const body=showResolution(result,revealed);
    deckButton(body,cancel?"控え室へ":"クロックへ",()=>{
      closeResolution();
      for(const card of revealed){card.faceUp=true;board[destination].push(card)}
      resolveBoardRules(target,done);
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
  if(defence<=attack&&defender.orientation!==180)reversals.push({owner:p,source:attacker,target:defender,slot:opposite});
  if(attack<=defence&&attacker.orientation!==180)reversals.push({owner:1-p,source:defender,target:attacker,slot:zone});
  if(attack<=defence)attacker.orientation=180;
  if(defence<=attack)defender.orientation=180;
  if(isAutoRules())autoRuleLog("バトル "+attack+" 対 "+defence+(attack===defence?"（両方リバース）":attack<defence?"（攻撃側リバース）":"（防御側リバース）"));
  return reversals;
}

function botHumanAttack(p,zone,index){
  const board=players[p],uid=board[zone][index].uid;
  const defender=players[1-p][zone].at(-1);
  selected=null;
  runRuleOperation(done=>{
    board[zone][index].orientation=90;
    function afterEffects(){
      const attacker=board[zone].find(c=>c.uid===uid);
      if(!attacker){done();return}
      function damage(){
        const body=showResolution("ダメージ枚数を決める",[]);
        const current=board[zone].find(card=>card.uid===uid);
        if(!current){closeResolution();done();return}
        const attack=botStats(p,current),n=(attack.soul??1)+(defender?0:1);
        const amount=deckSelect(50,n),zero=document.createElement("option");
        zero.value=0;zero.textContent="0枚";amount.prepend(zero);
        body.append(document.createTextNode(defender?"フロントアタック":"ダイレクトアタック"),amount);
        deckButton(body,"ダメージを与える",()=>{
          closeResolution();
          botDamage(1-p,Number(amount.value),()=>{
            botBattle(p,zone,uid,defender?.uid);
            done();
          });
        });
      }
      let trigger;
      botRevealTop(p,card=>{trigger=card},found=>{
        if(!found){damage();return}
        botTriggerEffect(p,trigger,damage);
      });
    }
    botDispatch(board[zone][index],"on_attack",afterEffects);
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
        botBattle(1,zone,attacker.uid,defender?.uid);
        done();
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
function renderBotControls(){
  document.getElementById("botControls").hidden=false;
  document.getElementById("botModeName").textContent="Bot戦 · "+((match.bot.scenario===redBlueScenario?redBlueDeck.title:practiceTitles[match.bot.scenario])??(isAutoRules()?autoRuleTitle:botScenarioNames[match.bot.scenario]));
  const button=document.getElementById("botStep");
  button.disabled=!botCanStep();
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
  return (botDefinition(card)?.effects??[]).filter(ability=>ability.type==="activated");
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
        if(!board[slot].length)botMove(board,"hand",index,slot);
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
function openBotAbility(){
  const card=selected?.p===0&&isStageZone(selected.z)?players[0][selected.z][selected.index]:null;
  const abilities=botDefinitionForAbilities(card);
  if(!abilities.length)return;
  const body=showResolution("起動能力",[card]);
  setRuleModal(false);
  for(const ability of abilities)deckButton(body,ability.category??ability.id,()=>{
    closeResolution();
    if(ability.brainstorm){activateBrainstorm(0,card,ability.brainstorm);return}
    runRuleOperation(done=>botGuide(card,ability,done));
  });
}
document.getElementById("botAbility").onclick=openBotAbility;
