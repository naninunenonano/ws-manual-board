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
  const tsukuyomiPower=1000*oshiOther(p,card).filter(source=>oshiIs(source,"S133-046")).length;
  return rubyPower+ownTurnPower+tsukuyomiPower;
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

function oshiAquaRubyReturn(p,card,done){
  const board=players[p],slot=stellaStageSlot(board,card);
  if(!slot){done();return}
  stellaConfirm(p,"導かれし双星を手札に戻す？",use=>{
    if(use)stellaMove(board,slot,card,"hand");
    done();
  });
}

function oshiTsukuyomiReady(p,card){
  const board=players[p];
  return card.orientation===0&&board.stock.length>=2&&board.hand.length>0&&board.clock.length>0;
}

function oshiTsukuyomiClock(p,card,done){
  if(!oshiTsukuyomiReady(p,card)){done();return}
  const board=players[p];
  stellaChoose(p,"ツクヨミ・控え室に置く手札",board.hand,cost=>{
    if(!cost){done();return}
    autoRulePay(p,2);
    stellaMove(board,"hand",cost,"waiting");
    card.orientation=90;
    stellaChoose(p,"ツクヨミ・クロックから手札に戻すカード",board.clock,target=>{
      if(target)stellaMove(board,"clock",target,"hand");
      done();
    });
  },{optional:true});
}

function oshiAudition(p,done){
  const board=players[p];
  if(!stellaStage(p).every(oshiAlly)){done();return}
  autoRuleLookTop(p,3,"個人間オーディション","カード",()=>true,()=>{
    if(players.some(player=>player.level.length>=4)){done();return}
    stellaChoose(p,"個人間オーディション・再利用に使う青の手札",
      board.hand.filter(card=>botDefinition(card)?.color==="青"),cost=>{
        if(cost)stellaMove(board,"hand",cost,"waiting");
        done(cost?"hand":"waiting");
      },{optional:true});
  });
}

const oshiActions=Object.freeze({
  "oshi-aqua-ruby-heal":(p,card,done)=>{
    const clock=players[p].clock;
    if(!clock.length){done();return}
    stellaConfirm(p,"導かれし双星・クロックの上から1枚を回復する？",use=>{
      if(use)stellaMove(players[p],"clock",clock.at(-1),"waiting");
      done();
    });
  },
  "oshi-akane-backup-mill":(p,card,done)=>
    frierenMill(1-p,stellaStage(p).filter(oshiAlly).length,true,()=>done()),
  "oshi-tsukuyomi-clock":oshiTsukuyomiClock,
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
