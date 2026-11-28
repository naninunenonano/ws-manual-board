"use strict";

const oshiIs=(card,number)=>card&&sameBotCardNumber(card.id,"OSK/"+number);
const oshiAlly=card=>{
  const definition=botDefinition(card);
  return definition?.type==="character"&&definition.traits?.includes("芸能界");
};
const oshiOther=(p,source)=>stellaStage(p).filter(card=>card!==source&&oshiAlly(card));
const oshiFrontRuby=p=>botSlots.slice(0,3).flatMap(slot=>players[p][slot])
  .filter(card=>card.faceUp&&oshiIs(card,"S133-037"));

function oshiPower(p,card){
  if(!card.faceUp||!oshiAlly(card)||!stellaStage(p).includes(card))return 0;
  const rubyPower=1000*oshiFrontRuby(p).length;
  const ownTurnPower=oshiIs(card,"S133-043")&&match.turn.player===p&&oshiOther(p,card).length?3000:0;
  return rubyPower+ownTurnPower;
}

function oshiStandby(p,done){
  const board=players[p];
  const candidates=board.waiting.filter(card=>botDefinition(card)?.type==="character"&&
    botEffectCard(card).level<=board.level.length+1);
  if(p===1)candidates.sort((a,b)=>botEffectCard(b).level-botEffectCard(a).level);
  stellaChoose(p,"スタンバイ・控え室から登場させるキャラ",candidates,card=>{
    if(!card){done();return}
    function place(slot){
      const occupant=board[slot].at(-1);
      if(occupant)stellaMove(board,slot,occupant,"waiting");
      const entrant=stellaMove(board,"waiting",card,slot);
      if(!entrant){done();return}
      entrant.orientation=90;
      botStageEntry(p,entrant,"waiting",()=>resolveBoardRules(p,done));
    }
    if(p===1){
      const slot=botSlots.find(zone=>!board[zone].length);
      if(slot)place(slot);
      else done();
      return;
    }
    const body=showResolution("スタンバイ・置く枠を選ぶ",[card]);
    for(const [index,slot] of botSlots.entries()){
      const label=(index<3?"前列 "+(index+1):"後列 "+(index-2))+
        (board[slot].length?"・"+stellaName(board[slot].at(-1))+"を入れ替え":"・空き");
      deckButton(body,label,()=>{closeResolution();place(slot)});
    }
    deckButton(body,"登場させない",()=>{closeResolution();done()});
  },{optional:true});
}

function oshiRubyTop(p,done){
  const board=players[p],top=board.deck.at(-1);
  if(!top){done();return}
  function move(discard){
    if(discard)stellaMove(board,"deck",top,"waiting");
    resolveBoardRules(p,done);
  }
  if(p===1){move(!botTriggerIcons(p,top).length);return}
  const body=showResolution("山札の上を確認",[top]);
  deckButton(body,"山札の上に戻す",()=>{closeResolution();move(false)});
  deckButton(body,"控え室に置く",()=>{closeResolution();move(true)});
}

const oshiActions=Object.freeze({
  "oshi-standby":(p,card,done)=>oshiStandby(p,done),
  "oshi-ruby-ready":(p,card,done)=>{
    const board=players[p],cx=board.cx.find(entry=>oshiIs(entry,"S133-059"));
    if(!cx||oshiOther(p,card).length<2){done();return}
    stellaConfirm(p,"なんの事？を控え室に置いてルビーをスタンドする？",use=>{
      if(!use){done();return}
      stellaMove(board,"cx",cx,"waiting");
      card.orientation=0;
      stellaChoose(p,"控え室から手札に戻すキャラ",board.waiting.filter(oshiAlly),target=>{
        if(target)stellaMove(board,"waiting",target,"hand");
        done();
      },{optional:true});
    });
  },
  "oshi-ruby-salvage":(p,card,done)=>{
    if(!players[p].cx.some(cx=>oshiIs(cx,"S133-060"))||!oshiOther(p,card).length){done();return}
    stellaRevealTop(p,top=>{
      if(!top){done();return}
      const level=botEffectCard(top).level??0;
      stellaSalvage(p,target=>oshiAlly(target)&&botEffectCard(target).level<=level,()=>{
        autoRuleAddTurnStat(card,"power",1000);
        done();
      });
    });
  }
});
