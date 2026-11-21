"use strict";

// The sample deck exercises the rules without assigning abilities to real cards.
const autoRuleScenario="rules";
const autoRuleTitle="共通ルール・仮カード";
const practiceScenario="practice-cards";
const practiceTitle="仮カード5種・効果確認";
const ruleStep=(handler,params)=>({handler,params});
const rulePower=(amount)=>ruleStep("modifyPower",{selection:"@source",amount});
const ruleSoul=(amount)=>ruleStep("modifySoul",{selection:"@source",amount});
const ruleEffect=(id,category,timing,steps,extra={})=>({
  id,category,timing,type:"auto",optional:false,conditions:[],costs:[],steps,...extra
});
const ruleSampleCards={
  "002":{name:"2コストの仮キャラ",stats:{level:1,cost:2,power:4000,soul:1},effects:[
    ruleEffect("sample-play","登場時・パワー＋500","from_hand_to_stage",[rulePower(500)]),
    ruleEffect("sample-act","起動・ストック1枚でパワー＋500","main",[rulePower(500)],{
      type:"activated",optional:true,limit:{perTurn:1},costs:[ruleStep("payStock",{side:"self",count:1})]
    }),
    ruleEffect("sample-combo","CXコンボ・ソウル＋1","on_attack",[ruleSoul(1)],{
      conditions:[ruleStep("cxName",{side:"self",name:"仮CX",cardNumbers:["BOT/W000-012"]})]
    })
  ]},
  "003":{name:"レベル1の仮キャラ",stats:{level:1,cost:0,power:4500,soul:1}},
  "004":{name:"仮カウンター",type:"event",counter:{power:2000},stats:{level:1,cost:1,power:null,soul:null}},
  "005":{name:"ソウルトリガーの仮キャラ",triggers:["ソウル"]},
  "012":{name:"仮CX",stats:{level:null,cost:0,power:null,soul:null},effects:[
    ruleEffect("sample-cx-play","CX配置時・1枚ドロー","on_cx_play",[ruleStep("draw",{side:"self",count:1})]),
    ruleEffect("sample-cx-buff","パワー＋1000・ソウル＋1","while_in_cx",[
      ruleStep("continuousCxBuff",{side:"self",power:1000,soul:1})
    ],{type:"continuous"})
  ]},
  "013":{name:"ソウル2つの仮CX",triggers:["ソウル","ソウル"],stats:{level:null,cost:0,power:null,soul:null}}
};

function salvageTrigger(name,cardType){
  const waiting={side:"self",zone:"waiting"}, hand={side:"self",zone:"hand"};
  return ruleEffect("salvage-"+cardType,name,"on_trigger",[
    ruleStep("selectCards",{from:waiting,as:"salvage",count:1,min:0,cardType}),
    ruleStep("move",{from:waiting,to:hand,selection:"salvage"})
  ],{type:"trigger"});
}
const practiceClimax={
  type:"climax",stats:{level:null,cost:0,power:null,soul:null},
  effects:[ruleEffect("cx-1001","パワー＋1000・ソウル＋1","while_in_cx",[
    ruleStep("continuousCxBuff",{side:"self",power:1000,soul:1})
  ],{type:"continuous"})]
};
const practiceCards={
  "101":{name:"仮キャラ 3000",color:"red",stats:{level:0,cost:0,power:3000,soul:1}},
  "102":{name:"仮キャラ 応援",color:"blue",stats:{level:0,cost:0,power:1000,soul:1},assist:{power:500}},
  "103":{name:"仮キャラ 集中",color:"blue",stats:{level:0,cost:0,power:1500,soul:1},effects:[
    ruleEffect("draw-brainstorm","集中（1ストック・自身レスト）","main",[],{
      type:"activated",brainstorm:{stock:1,reveal:5}
    })
  ]},
  "104":{...practiceClimax,name:"仮CX カムバック",color:"red",triggers:["カムバック"],effects:[
    ...practiceClimax.effects,salvageTrigger("カムバック","character")
  ]},
  "105":{...practiceClimax,name:"仮CX ゲート",color:"blue",triggers:["ゲート"],effects:[
    ...practiceClimax.effects,salvageTrigger("ゲート","climax")
  ]}
};

function isAutoRules(scenario=match?.bot?.scenario){return scenario===autoRuleScenario||scenario===practiceScenario}
function practiceDeck(deck){
  // Single specimens for the effect test. The player deck remains independent.
  const replaced=new Set(["007","008","009","012","013"]);
  return {title:"仮カード5種・効果確認",cards:[
    ...deck.cards.map(card=>({...card,num:card.num-Number(replaced.has(card.id.slice(-3)))})),
    ...Object.entries(practiceCards).map(([number,card])=>({id:"BOT/W000-"+number,num:1,cx:card.type==="climax"}))
  ]};
}
function preparePracticeCards(board){
  function put(number,to){
    const index=board.deck.findIndex(card=>card.id.endsWith("-"+number));
    botMove(board,"deck",index,to);
  }
  put("101","front0");put("102","back0");put("103","back1");put("009","front1");
  put("008","waiting");put("012","waiting");
  // Top five have two CXs. After drawing two, the next two checks are Comeback and Gate.
  for(const number of ["105","104","008","009","007","012","007","013","007"])put(number,"deck");
}
function autoRuleDefinition(card){
  return {name:"仮キャラ",color:"green",type:card.cx?"climax":"character",
    stats:{level:0,cost:0,power:2500,soul:1},traits:[],keywords:[],triggers:[],allTags:true,
    ...(practiceCards[card.id.slice(-3)]??ruleSampleCards[card.id.slice(-3)])};
}
function prepareAutoRuleBoards(boards,scenario){
  function put(p,number,to,count=1){
    const board=boards[p];
    for(let i=0;i<count;i++)botMove(board,"deck",board.deck.findIndex(c=>c.id.endsWith("-"+number)),to);
  }
  for(const p of [0,1]){
    put(p,"001","level");put(p,"006","stock",3);
    put(p,"004","hand");put(p,"003","hand");put(p,"005","deck");
  }
  if(scenario===practiceScenario)preparePracticeCards(boards[0]);
  else{
    put(0,"002","hand",2);put(0,"012","hand");put(0,"001","front0");
    // CX placement draws the top card; the next card is a soul trigger.
    put(0,"001","deck");
  }
  put(1,"003","front1");put(1,"001","front0");
  for(const p of [0,1]){
    const board=boards[p];
    const head=board.deck.splice(-(p===1?1:scenario===practiceScenario?9:2));
    const rest=board.deck.filter(c=>c.cx);
    board.deck=board.deck.filter(c=>!c.cx);
    rest.forEach((card,i)=>board.deck.splice(3+i*5,0,card));
    board.deck.push(...head);
  }
}

function autoRuleLog(text){
  const lines=match.bot.log??=[];
  lines.push(text);
  if(lines.length>8)lines.shift();
  botMessage(lines.join(" ／ "));
}
function autoRuleStat(card,stat){
  const key=stat==="power"?"botPower":"botSoul";
  return card[key]??botDefinition(card)?.stats?.[stat]??null;
}
function autoRuleAddTurnStat(card,stat,amount){
  if(!amount)return;
  const [value,bonus]=stat==="power"?["botPower","turnPowerBonus"]:["botSoul","turnSoulBonus"];
  card[value]=autoRuleStat(card,stat)+amount;
  card[bonus]=(card[bonus]??0)+amount;
}
function autoRuleBuff(p,card){
  const live=players[p];
  const front=[live.front0,live.front1,live.front2].findIndex(zone=>zone.some(c=>c.uid===card.uid));
  const totals={power:0,soul:0};
  for(const [i,slot] of ["back0","back1"].entries()){
    if(front!==i&&front!==i+1)continue;
    const source=live[slot].at(-1);
    if(source?.faceUp)totals.power+=botDefinition(source)?.assist?.power??0;
  }
  if(!live.cx.length)return totals;
  const board=botEffectBoard(p);
  for(const cx of players[p].cx){
    for(const effect of botDefinition(cx)?.effects??[]){
      if(effect.type!=="continuous"||effect.timing!=="while_in_cx")continue;
      const result=WSEffects.run(effect,board,{sourceUid:cx.uid});
      if(result.status!=="success")continue;
      for(const step of result.log){
        if(step.handler==="continuousCxBuff"&&step.cards?.includes(card.uid)){
          totals.power+=step.powerBonus;totals.soul+=step.soulBonus;
        }
      }
    }
  }
  return totals;
}

function autoRuleLegalPlay(p,card,phase,type){
  const def=botDefinition(card),board=players[p];
  if(!def||def.type!==type)return "このカードは現在の操作ではプレイできません";
  if(match.turn.phase!==phase||(phase!=="attack"&&match.turn.player!==p))return "現在のフェイズではプレイできません";
  const {level,cost}=def.stats;
  if(!Number.isInteger(cost)||board.stock.length<cost)return "ストックが不足しています（必要 "+cost+"枚）";
  if(level!=null&&board.level.length<level)return "プレイヤーのレベルが不足しています（必要 Lv"+level+"）";
  if(def.color&&(type==="climax"||level>0)&&![...board.level,...board.clock].some(c=>botDefinition(c)?.color===def.color))
    return "レベル置場かクロックに同じ色が必要です";
  return "";
}
function autoRulePay(p,cost){
  const board=players[p];
  for(let i=0;i<cost;i++)botMove(board,"stock",board.stock.length-1,"waiting");
}
function autoRulePlace(p,uid,zone){
  if(ruleBusy||p!==side)return false;
  const board=players[p],index=board.hand.findIndex(card=>card.uid===uid),card=board.hand[index];
  if(!card)return false;
  const climax=zone==="cx";
  if(!climax&&!isStageZone(zone))return false;
  const error=autoRuleLegalPlay(p,card,climax?"climax":"main",climax?"climax":"character");
  if(error||climax&&board.cx.length){message(error||"すでにCXをプレイしています");return false}
  selected=null;
  runRuleOperation(done=>{
    const cost=botDefinition(card).stats.cost;
    autoRulePay(p,cost);
    if(board[zone].length)botMove(board,zone,0,"waiting");
    botMove(board,"hand",index,zone);
    autoRuleLog(botCardInfo(card).name+"をプレイ"+(cost?"（ストック−"+cost+"）":""));
    botDispatch(card,climax?"on_cx_play":"from_hand_to_stage",()=>resolveBoardRules(p,done),p);
  });
  return true;
}
function autoRuleHandMenu(p,index){
  if(ruleBusy||match.turn.player!==p)return false;
  const card=players[p].hand[index],type=botDefinition(card)?.type,phase=match.turn.phase;
  if(!(phase==="main"&&type==="character"||phase==="climax"&&type==="climax"))return false;
  const body=showResolution(botCardInfo(card).name,[card]);
  setRuleModal(false);
  const error=autoRuleLegalPlay(p,card,phase,type);
  if(error){body.append(document.createTextNode(error));return true}
  deckButton(body,"プレイする",()=>{
    closeResolution();
    if(type==="climax"){autoRulePlace(p,card.uid,"cx");return}
    const targets=showResolution("登場させる枠",[card]);
    setRuleModal(false);
    for(const slot of botSlots){
      const occupied=players[p][slot].length>0;
      deckButton(targets,labels[slot]+(occupied?"（入れ替え）":""),()=>{
        closeResolution();autoRulePlace(p,card.uid,slot);
      });
    }
  });
  return true;
}

function autoRuleDispatchBoard(p,timing,done){
  const cards=botSlots.flatMap(zone=>players[p][zone]).filter(card=>card.faceUp);
  function next(index){
    if(index===cards.length){done();return}
    const card=cards[index];
    if(!botSlots.some(zone=>players[p][zone].some(c=>c.uid===card.uid))){next(index+1);return}
    botDispatch(card,timing,()=>next(index+1),p);
  }
  next(0);
}
function autoRuleDraw(p){
  match.turn.drawPending=true;
  runRuleOperation(done=>autoRuleDispatchBoard(p,"at_draw_start",()=>{
    botRevealTop(p,card=>{card.faceUp=true;players[p].hand.push(card)},found=>{
      match.turn.drawPending=false;
      if(found)autoRuleLog((p===0?"自分":"Bot")+"が1枚ドロー");
      done();
    });
  }));
}
function autoRuleEndPhase(p){
  runRuleOperation(done=>autoRuleDispatchBoard(p,"at_end_start",()=>resolveBoardRules(p,done)));
}
function autoRuleEnterEncore(turn){
  runRuleOperation(finish=>autoRuleDispatchBoard(turn,"at_encore_start",()=>
    autoRuleDispatchBoard(1-turn,"at_encore_start",()=>{
      autoRuleAdvanceEncore();
      finish();
    })));
}
function autoRuleAdvanceEncore(){
  const turn=match.turn.player;
  const actor=[turn,1-turn].find(p=>encoreCandidates(p).length);
  match.encore={actor:actor??turn,step:actor===undefined?"complete":"choose"};
}
function autoRuleBeforeTurnEnd(){
  if(players[0].hand.length>7)endHandConfirmation();
  else finishEndTurn();
}
function autoRuleOpposite(zone){return "front"+(2-Number(zone.slice(-1)))}
function autoRuleAttackAllowed(p,zone,card){
  return card?.faceUp&&card.orientation===0&&zone.startsWith("front")&&botDefinition(card)?.type==="character"&&
    !(match.turn.number===1&&p===match.firstPlayer&&match.bot.attacked);
}
function autoRuleAskAttack(p,zone,index){
  const card=players[p][zone][index];
  if(!autoRuleAttackAllowed(p,zone,card))return;
  const rival=players[1-p][autoRuleOpposite(zone)].at(-1);
  const body=showResolution("アタックを宣言",[card]);
  setRuleModal(false);
  for(const type of rival?["front","side"]:["direct"]){
    deckButton(body,({front:"フロントアタック",side:"サイドアタック",direct:"ダイレクトアタック"})[type],()=>{
      closeResolution();autoRuleAttack(p,zone,card.uid,type);
    });
  }
}

function autoRuleCounter(p,target,done){
  const board=players[p];
  const candidates=board.hand.filter(card=>{
    const def=botDefinition(card);
    return def?.counter&&!autoRuleLegalPlay(p,card,"attack",def.type);
  });
  if(!target||!candidates.length){done();return}
  function play(card){
    autoRulePay(p,botDefinition(card).stats.cost);
    botMove(board,"hand",board.hand.indexOf(card),"waiting");
    const bonus=botDefinition(card).counter.power;
    autoRuleAddTurnStat(target,"power",bonus);
    autoRuleLog(botCardInfo(card).name+"を使用（パワー＋"+bonus+"）");
    done();
  }
  if(p===1){play(candidates[0]);return}
  const body=showResolution("カウンター",[target]);
  for(const card of candidates)deckButton(body,botCardInfo(card).name+"を使う",()=>{closeResolution();play(card)});
  deckButton(body,"使わない",()=>{closeResolution();done()});
}
function autoRuleAttack(p,zone,uid,type){
  const board=players[p],rival=players[1-p],opposite=autoRuleOpposite(zone);
  const attacker=board[zone].at(-1),target=rival[opposite].at(-1);
  if(ruleBusy||attacker?.uid!==uid||!autoRuleAttackAllowed(p,zone,attacker)||
    !(target?["front","side"]:["direct"]).includes(type))return;
  const adjustment=type==="direct"?1:type==="side"?-Math.max(0,botEffectCard(target).level??0):0;
  const targetUid=target?.uid;
  selected=null;attacker.orientation=90;match.bot.attacked=true;
  autoRuleAddTurnStat(attacker,"soul",adjustment);
  runRuleOperation(done=>{
    autoRuleLog(({front:"フロント",side:"サイド",direct:"ダイレクト"})[type]+"アタック");
    const current=()=>board[zone].find(c=>c.uid===uid);
    const defender=()=>rival[opposite].find(c=>c.uid===targetUid);
    function damage(){
      const active=current();
      if(!active){done();return}
      const amount=Math.max(0,botStats(p,active).soul??0);
      autoRuleLog("ソウル "+amount);
      botDamage(1-p,amount,()=>{
        if(type==="front")botBattle(p,zone,uid,targetUid,opposite);
        done();
      });
    }
    function counter(){if(type==="front")autoRuleCounter(1-p,defender(),damage);else damage()}
    function trigger(){
      let revealed;
      botRevealTop(p,card=>{revealed=card},found=>{
        if(!found){counter();return}
        const souls=(botDefinition(revealed)?.triggers??[]).filter(icon=>icon==="ソウル").length;
        if(current())autoRuleAddTurnStat(current(),"soul",souls);
        autoRuleLog("トリガー "+botCardInfo(revealed).name+(souls?"（ソウル＋"+souls+"）":""));
        botTriggerEffect(p,revealed,counter);
      });
    }
    botDispatch(attacker,"on_attack",trigger,p);
  });
}
function autoRuleBotStep(){
  const p=1,board=players[p],turn=match.turn;
  switch(turn.phase){
    case "stand": setTurnPhase("draw");break;
    case "draw": setTurnPhase("clock");break;
    case "clock": setTurnPhase("main");break;
    case "main":{
      for(const slot of botSlots.slice(0,3)){
        const i=board.hand.findIndex(c=>!autoRuleLegalPlay(p,c,"main","character"));
        if(i<0)break;
        if(board[slot].length)continue;
        autoRulePay(p,botDefinition(board.hand[i]).stats.cost);
        botMove(board,"hand",i,slot);
      }
      setTurnPhase("climax");break;
    }
    case "climax":setTurnPhase("attack");break;
    case "attack":{
      const slot=botSlots.slice(0,3).find(s=>autoRuleAttackAllowed(p,s,board[s].at(-1)));
      if(slot)autoRuleAttack(p,slot,board[slot].at(-1).uid,players[0][autoRuleOpposite(slot)].length?"front":"direct");
      else encoreAction("enter");
      break;
    }
    case "encore":{
      if(match.encore.step==="complete"){encoreAction("end");break}
      const candidate=encoreCandidates(p)[0];
      if(!candidate){encoreAction("done");break}
      botMove(board,candidate.zone,candidate.index,"waiting");
      match.encorePrivate[p].done.push(candidate.card.uid);
      autoRuleAdvanceEncore();
      updateBoard();
      break;
    }
    case "end":
      while(board.hand.length>7)botMove(board,"hand",0,"waiting");
      finishEndTurn();
      break;
  }
}

function activateBrainstorm(p,source,{stock,reveal}){
  const board=players[p];
  if(ruleBusy||p!==match.turn.player||match.turn.phase!=="main"||
    !botSlots.some(slot=>board[slot].some(card=>card.uid===source.uid)))return;
  if(!source.faceUp||source.orientation!==0||board.stock.length<stock){
    const reason=source.orientation!==0?"自身がスタンドしていません":"ストックが不足しています";
    autoRuleLog("集中を使えません："+reason);
    updateBoard();
    return;
  }
  selected=null;
  runRuleOperation(done=>{
    autoRulePay(p,stock);
    source.orientation=90;
    const revealed=[];
    function finishDraw(n){
      if(!n){done();return}
      botRevealTop(p,card=>{card.faceUp=true;board.hand.push(card)},found=>{
        if(found)finishDraw(n-1);else done();
      });
    }
    function confirm(){
      const max=revealed.filter(card=>card.cx===true).length;
      for(const card of revealed){card.faceUp=true;board.waiting.push(card)}
      autoRuleLog("集中で"+revealed.length+"枚、CXが"+max+"枚（"+revealed.map(card=>botCardInfo(card).name).join("、")+"）");
      resolveBoardRules(p,()=>{
        if(!max){done();return}
        const body=showResolution("集中・引く枚数を選ぶ（最大"+max+"枚）",revealed);
        for(let n=0;n<=max;n++)deckButton(body,n===0?"引かない":n+"枚引く",()=>{
          closeResolution();
          autoRuleLog(n===0?"集中では引かない":"集中で"+n+"枚ドロー");
          finishDraw(n);
        });
      });
    }
    function flip(){
      if(revealed.length===reveal){confirm();return}
      botRevealTop(p,card=>revealed.push(card),found=>{if(found)flip();else confirm()});
    }
    flip();
  });
}
