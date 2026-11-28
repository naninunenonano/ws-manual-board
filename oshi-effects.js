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
  const idolPower=1500*oshiOther(p,card).filter(source=>oshiIs(source,"S107-044")).length;
  const coffeePower=oshiIs(card,"S121-065")&&match.turn.player===p?1000:0;
  const gotandaPower=500*oshiOther(p,card).filter(source=>oshiIs(source,"S133-079")).length;
  const bladePower=oshiIs(card,"S121-047")&&players[p].front1.includes(card)?1500*oshiOther(p,card).length:0;
  const memPower=oshiIs(card,"S133-013")&&match.turn.player===p&&oshiExperience(p)>=5?5000:0;
  return rubyPower+ownTurnPower+tsukuyomiPower+idolPower+coffeePower+gotandaPower+bladePower+memPower;
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

const oshiFront=p=>botSlots.slice(0,3).flatMap(slot=>players[p][slot]);
const oshiAuditionCard=card=>oshiIs(card,"S133-095");
const oshiLevel=card=>botEffectCard(card).level??0;

function oshiHandCost(p,stock,eligible,done,{resonance=false}={}){
  const board=players[p];
  const cards=board.hand.filter(card=>eligible(card)&&(!resonance||
    board.hand.some(other=>other!==card&&oshiAuditionCard(other))));
  if(board.stock.length<stock||!cards.length){done(false);return}
  stellaChoose(p,"コストとして控え室に置く手札",cards,card=>{
    if(!card){done(false);return}
    autoRulePay(p,stock);
    stellaMove(board,"hand",card,"waiting");
    const auditions=resonance?board.hand.filter(oshiAuditionCard):[];
    if(!resonance){done(true);return}
    stellaChoose(p,"共鳴で公開する個人間オーディション",auditions,shown=>
      stellaShow(p,"共鳴・手札を公開",[shown],()=>done(true)));
  },{optional:true});
}

function oshiStageCost(p,source,done){
  const board=players[p];
  stellaChoose(p,"コストとして控え室に置く他の《芸能界》",oshiOther(p,source),card=>{
    if(card)stellaMove(board,stellaStageSlot(board,card),card,"waiting");
    done(Boolean(card));
  },{optional:true});
}

function oshiTopTake(p,eligible,done){
  stellaRevealTop(p,top=>{
    if(top&&eligible(top))stellaMove(players[p],"deck",top,"hand");
    resolveBoardRules(p,done);
  });
}

function oshiMemoryLimit(actor,done){
  const board=players[actor];
  function discard(){
    if(board.memory.length<=4){done();return}
    stellaChoose(actor,"思い出を4枚残す・控え室に置くカード",[...board.memory],card=>{
      stellaMove(board,"memory",card,"waiting");
      discard();
    });
  }
  discard();
}

function oshiChristmasReveal(p,done){
  const board=players[p],revealed=[];
  function finish(){
    if(!revealed.length){done();return}
    stellaChoose(p,"公開した《芸能界》を手札に加える",revealed.filter(oshiAlly),card=>{
      for(const entry of revealed)stellaMove(board,"deck",entry,entry===card?"hand":"waiting");
      stellaChoose(p,"控え室に置く手札",board.hand,discard=>{
        if(discard)stellaMove(board,"hand",discard,"waiting");
        resolveBoardRules(p,done);
      });
    },{optional:true,shown:revealed});
  }
  function next(){
    const card=board.deck.at(-1-revealed.length);
    if(!card||revealed.length===3){finish();return}
    stellaConfirm(p,"山札の次のカードを公開する？",use=>{
      if(!use){finish();return}
      revealed.push(card);
      stellaShow(p,"公開したカード",[card],next);
    });
  }
  next();
}

const oshiAdditionalActions={
  "oshi-ai-encore":(p,card,done)=>{
    if(match.turn.player!==p||!oshiFront(p).includes(card)||
       oshiFront(1-p).some(other=>other.orientation!==180)){done();return}
    oshiHandCost(p,1,()=>true,paid=>{
      if(!paid){done();return}
      let amount=0;
      botRevealTop(p,top=>{
        amount=oshiLevel(top)+1;
        top.faceUp=true;
        players[p].waiting.push(top);
      },found=>found?botAbilityDamage(1-p,amount,done):done());
    });
  },
  "oshi-kana-valentine":(p,card,done)=>oshiStageCost(p,card,paid=>{
    if(!paid){done();return}
    const board=players[p];
    autoRuleAddTurnStat(card,"power",3000);
    function heal(){
      if(board.clock.length)botMove(board,"clock",board.clock.length-1,"stock");
      done();
    }
    function burn(){botAbilityDamage(1-p,1,()=>oshiTopTake(p,oshiAlly,done))}
    if(p===1){if(board.clock.length>=2)heal();else burn();return}
    const body=showResolution("有馬かな・解決する効果",[card]);
    deckButton(body,"クロックの上をストックへ",()=>{closeResolution();heal()});
    deckButton(body,"1ダメージと山札上の公開",()=>{closeResolution();burn()});
  }),
  "oshi-kana-memory-limit":(p,card,done)=>oshiMemoryLimit(p,()=>oshiMemoryLimit(1-p,done)),
  "oshi-kana-stock-reset":(p,card,done)=>oshiHandCost(p,1,()=>true,
    paid=>paid?resolveKoukei(p,done):done()),
  "oshi-aqua-backup":(p,card,done)=>{
    const board=players[p],rival=players[1-p];
    const targets=stellaStage(1-p).filter(target=>oshiLevel(target)>rival.level.length);
    if(!targets.length||!stellaStage(p).length){done();return}
    oshiHandCost(p,1,()=>true,paid=>{
      if(!paid){done();return}
      stellaChoose(p,"コストとして控え室に置く舞台のキャラ",stellaStage(p),cost=>{
        stellaMove(board,stellaStageSlot(board,cost),cost,"waiting");
        stellaChoose(p,"思い出に置く相手のキャラ",targets,target=>{
          if(target)stellaMove(rival,stellaStageSlot(rival,target),target,"memory");
          done();
        });
      });
    });
  },
  "oshi-ruby-entry":(p,card,done)=>{
    autoRuleAddTurnStat(card,"power",1500*stellaStage(p).filter(oshiAlly).length);
    done();
  },
  "oshi-akane-backup-soul":(p,card,done,context)=>{
    const targets=stellaStage(1-p);
    if(!targets.length){done();return}
    if(context.attacker)targets.sort((a,b)=>Number(b===context.attacker)-Number(a===context.attacker));
    oshiHandCost(p,1,oshiAlly,paid=>{
      if(!paid){done();return}
      stellaChoose(p,"ソウルを2減らす相手のキャラ",targets,target=>{
        if(target)autoRuleAddTurnStat(target,"soul",-2);
        done();
      });
    },{resonance:true});
  },
  "oshi-christmas-lock":(p,card,done)=>{
    autoRuleAddTurnStat(card,"power",3000);
    stellaChoose(p,"移動できなくする相手のキャラ",stellaStage(1-p),target=>{
      if(target)target.oshiLockedUntil=match.turn.number+1;
      done();
    });
  },
  "oshi-christmas-reveal":(p,card,done)=>oshiChristmasReveal(p,done),
  "oshi-mem-stock":(p,card,done)=>stellaRevealTop(p,top=>{
    if(top&&oshiLevel(top)>=2)stellaMove(players[p],"deck",top,"stock");
    resolveBoardRules(p,done);
  }),
  "oshi-mem-reorder":(p,card,done)=>oshiHandCost(p,1,()=>true,paid=>{
    if(!paid){done();return}
    autoRuleReorderTop(p,()=>stellaSalvage(p,oshiAlly,done),true);
  }),
  "oshi-ai-memory":(p,card,done)=>oshiHandCost(p,0,()=>true,paid=>{
    if(!paid){done();return}
    const board=players[p];
    stellaLookAndTake(p,4,target=>oshiLevel(target)>=1,false,()=>{
      if(board.memory.length>2){done();return}
      stellaChoose(p,"思い出にする聖夜の待ち合わせ アイ",board.waiting.filter(target=>oshiIs(target,"S121-027")),target=>{
        if(target)stellaMove(board,"waiting",target,"memory");
        done();
      },{optional:true});
    });
  }),
  "oshi-aqua-double":(p,card,done,context)=>{
    context.setTriggerChecks?.(2);
    done();
  },
  "oshi-akane-top":(p,card,done)=>{
    if(!oshiOther(p,card).length){done();return}
    frierenTopMove(p,p,false,()=>{autoRuleAddTurnStat(card,"power",1500);done()});
  },
  "oshi-akane-attack":(p,card,done)=>oshiStageCost(p,card,paid=>
    paid?oshiTopTake(p,target=>oshiAlly(target)||oshiAuditionCard(target),done):done()),
  "oshi-coffee-aqua":(p,card,done)=>{
    const board=players[p];
    if(!board.stock.length){done();return}
    stellaChoose(p,"クロックの下に置く《芸能界》",board.waiting.filter(oshiAlly),cost=>{
      if(!cost){done();return}
      autoRulePay(p,1);
      botMove(board,"waiting",board.waiting.indexOf(cost),"clock","bottom");
      resolveBoardRules(p,()=>frierenSearch(p,"山札のレベル1以下のキャラ",
        target=>botDefinition(target)?.type==="character"&&oshiLevel(target)<=1,done));
    },{optional:true});
  }
};

function oshiReverseActions(owner,source,target){
  const actions=[];
  if(oshiIs(source,"S133-082"))actions.push({
    label:"隠してきた激情 ルビー・共鳴",run:done=>oshiHandCost(owner,0,()=>true,paid=>{
      if(!paid){done();return}
      const board=players[owner];
      stellaChoose(owner,"手札に戻す《芸能界》",board.waiting.filter(oshiAlly),hand=>{
        if(!hand){done();return}
        stellaMove(board,"waiting",hand,"hand");
        stellaChoose(owner,"ストックに置く《芸能界》",board.waiting.filter(oshiAlly),stock=>{
          if(stock)stellaMove(board,"waiting",stock,"stock");
          done();
        },{optional:true});
      },{optional:true});
    },{resonance:true})
  });
  for(const support of stellaStage(owner).filter(card=>card!==source&&oshiIs(card,"S133-P01"))){
    actions.push({label:stellaName(support)+"・パワー＋500",run:done=>
      stellaChoose(owner,"パワーを上げる《芸能界》のキャラ",stellaStage(owner).filter(oshiAlly),card=>{
        if(card)autoRuleAddTurnStat(card,"power",500);
        done();
      })});
  }
  if(oshiIs(target,"S121-027")&&oshiLevel(source)<=0&&source.orientation!==180){
    actions.push({owner:1-owner,label:"聖夜の待ち合わせ アイ・相打ち",run:done=>{
      stellaConfirm(1-owner,"レベル0以下のバトル相手をリバースする？",use=>{
        if(!use||source.orientation===180||!stellaStage(owner).includes(source)){done();return}
        source.orientation=180;
        const slot=stellaStageSlot(players[owner],source);
        const sourceSlot=stellaStageSlot(players[1-owner],target);
        if(slot&&sourceSlot)
          autoRuleResolveReversals([{owner:1-owner,source:target,target:source,slot,sourceSlot}],done);
        else done();
      });
    }});
  }
  return actions;
}

function oshiAquaCover(p,target,done){
  const board=players[p];
  if(!oshiAlly(target)||!board.stock.length){done();return}
  stellaChoose(p,"アクアを思い出に置いてバトル中のキャラを手札に戻す",
    oshiOther(p,target).filter(card=>oshiIs(card,"S107-035")),source=>{
      if(source){
        autoRulePay(p,1);
        stellaMove(board,stellaStageSlot(board,source),source,"memory");
        stellaMove(board,stellaStageSlot(board,target),target,"hand");
      }
      done();
    },{optional:true});
}

function oshiCanMove(card){
  return !(isAutoRules()&&card?.oshiLockedUntil>=match.turn.number);
}

const oshiExperience=p=>players[p].level.reduce((sum,card)=>sum+oshiLevel(card),0);
function oshiEncoreHand(p,card){
  const required=botDefinition(card)?.oshiEncoreExperience;
  return required!==undefined&&oshiExperience(p)>=required?players[p].hand.filter(oshiAlly):[];
}

function oshiHandEncore(p,slot,card,cost){
  const board=players[p];
  stellaMove(board,"hand",cost,"waiting");
  stellaMove(board,slot,card,"waiting");
  const entrant=stellaMove(board,"waiting",card,slot);
  if(entrant)entrant.orientation=90;
}

function oshiRemoveSource(p,card){
  const board=players[p],slot=stellaStageSlot(board,card);
  return slot&&stellaMove(board,slot,card,"waiting");
}

function oshiClockCost(p,done,onPay){
  const board=players[p];
  if(!board.stock.length){done(false);return}
  stellaChoose(p,"クロックの下に置く《芸能界》",board.waiting.filter(oshiAlly),card=>{
    if(!card){done(false);return}
    autoRulePay(p,1);
    botMove(board,"waiting",board.waiting.indexOf(card),"clock","bottom");
    onPay?.();
    resolveBoardRules(p,()=>done(board.level.length<4));
  },{optional:true});
}

function oshiKanaLookTwo(p,done){
  const board=players[p];
  botLookUpTo(p,2,viewed=>{
    const chosen=[];
    function finish(){
      stellaShow(p,"選んだカードを公開",chosen,()=>{
        for(const card of viewed)stellaMove(board,"deck",card,chosen.includes(card)?"hand":"waiting");
        resolveBoardRules(p,done);
      });
    }
    function choose(){
      const candidates=viewed.filter(card=>oshiAlly(card)&&!chosen.includes(card));
      if(!candidates.length){finish();return}
      stellaChoose(p,"手札に加える《芸能界》",candidates,card=>{
        if(!card){finish();return}
        chosen.push(card);
        choose();
      },{optional:true});
    }
    choose();
  });
}

function oshiSlotOptions(p,title,slots,done){
  if(!slots.length){done(null);return}
  if(p===1||slots.length===1){done(slots[0]);return}
  const body=showResolution(title,[]);
  for(const slot of slots)deckButton(body,labels[slot],()=>{closeResolution();done(slot)});
}

function oshiTournamentAbilityReady(p,card,id){
  const board=players[p],rival=players[1-p];
  switch(id){
    case "oshi-akane-xmas-bounce":return stellaStage(1-p).length>0;
    case "oshi-gotanda-mill":return card.orientation===0&&board.stock.length>=2;
    case "oshi-ruby-newyear-look":return board.stock.length>0;
    case "oshi-kana-more-move":return board.hand.length>0&&oshiOther(p,card).length>0&&
      botSlots.some(slot=>!rival[slot].length)&&stellaStage(1-p).some(oshiCanMove);
    case "oshi-miyazaki-salvage":return board.hand.length>0;
    case "oshi-ruby-report":return card.orientation===0;
    default:return true;
  }
}

const oshiTournamentActions={
  "oshi-akane-xmas-look":(p,card,done)=>oshiHandCost(p,0,()=>true,paid=>{
    if(paid)stellaLookAndTake(p,4,oshiAlly,false,done);
    else done();
  }),
  "oshi-akane-xmas-bounce":(p,card,done)=>{
    const rival=players[1-p];
    if(!oshiRemoveSource(p,card)){done();return}
    stellaChoose(p,"手札に戻す相手キャラ",stellaStage(1-p),target=>{
      if(target)stellaMove(rival,stellaStageSlot(rival,target),target,"hand");
      done();
    });
  },
  "oshi-gotanda-mill":(p,card,done)=>{
    autoRulePay(p,2);
    card.orientation=90;
    frierenMill(1-p,12,false,()=>done());
  },
  "oshi-ruby-newyear-power":(p,card,done)=>stellaRevealTop(p,top=>{
    if(!top||!oshiAlly(top)){done();return}
    oshiStageBuff(p,()=>true,2000,0,done);
  }),
  "oshi-ruby-newyear-look":(p,card,done)=>{
    autoRulePay(p,1);
    oshiRemoveSource(p,card);
    stellaLookAndTake(p,4,oshiAlly,false,done);
  },
  "oshi-kana-more-look":(p,card,done)=>oshiClockCost(p,paid=>paid?oshiKanaLookTwo(p,done):done()),
  "oshi-kana-more-move":(p,card,done)=>oshiHandCost(p,0,()=>true,paid=>{
    if(!paid){done();return}
    oshiRemoveSource(p,card);
    const rival=players[1-p];
    stellaChoose(p,"移動させる相手キャラ",stellaStage(1-p).filter(oshiCanMove),target=>{
      if(!target){done();return}
      oshiSlotOptions(p,"移動先の空き枠",botSlots.filter(slot=>!rival[slot].length),slot=>{
        if(slot)stellaMove(rival,stellaStageSlot(rival,target),target,slot);
        done();
      });
    });
  }),
  "oshi-miyazaki-mill":(p,card,done)=>stellaConfirm(p,"山札の上3枚を控え室に置く？",use=>
    use?frierenMill(p,3,false,()=>done()):done()),
  "oshi-miyazaki-salvage":(p,card,done)=>oshiHandCost(p,0,()=>true,paid=>{
    if(!paid){done();return}
    oshiRemoveSource(p,card);
    stellaSalvage(p,oshiAlly,done);
  }),
  "oshi-blade-look":(p,card,done)=>stellaLookAndTake(p,4,target=>target.cx,false,taken=>{
    if(!taken){done();return}
    stellaDiscard(p,()=>done());
  }),
  "oshi-ruby-report":(p,card,done)=>{
    card.orientation=90;
    autoRuleReorderTop(p,()=>{
      const board=players[p];
      if(board.memory.length>2){done();return}
      stellaChoose(p,"思い出にする“B小町”アイ",board.waiting.filter(target=>oshiIs(target,"S107-034")),target=>{
        if(target)stellaMove(board,"waiting",target,"memory");
        done();
      },{optional:true});
    },true);
  },
  "oshi-kana-fan-top":(p,card,done)=>frierenTopMove(p,p,false,()=>{
    autoRuleAddTurnStat(card,"power",3000);
    done();
  }),
  "oshi-kana-fan-take":(p,card,done)=>oshiStageCost(p,card,paid=>paid?oshiTopTake(p,oshiAlly,done):done()),
  "oshi-ruby-b-cx":(p,card,done)=>stellaRevealTop(p,top=>{
    if(!top||oshiLevel(top)<1){done();return}
    oshiStageBuff(p,oshiAlly,1000,1,done);
  })
};

function oshiStageBuff(p,eligible,power,soul,done){
  stellaChoose(p,"強化するキャラ",stellaStage(p).filter(eligible),target=>{
    if(target){
      autoRuleAddTurnStat(target,"power",power);
      autoRuleAddTurnStat(target,"soul",soul);
    }
    done();
  });
}

function oshiTournamentReversals(owner,source,target){
  const actions=[];
  if(oshiIs(source,"S133-013")&&oshiLevel(target)>=2)actions.push({
    owner,label:stellaName(source)+"・山札上を公開して回収",run:done=>
      stellaRevealTop(owner,top=>{
        if(!top||!oshiAlly(top)){done();return}
        const board=players[owner];
        stellaChoose(owner,"手札に戻す《芸能界》",board.waiting.filter(oshiAlly),card=>{
          if(card)stellaMove(board,"waiting",card,"hand");
          done();
        },{optional:true});
      })
  });
  if(oshiIs(target,"S107-034"))actions.push({
    owner:1-owner,label:stellaName(target)+"・思い出と山札サーチ",run:done=>{
      const p=1-owner,board=players[p];
      const slot=stellaStageSlot(board,target);
      if(!slot){done();return}
      oshiClockCost(p,paid=>{
        if(!paid){done();return}
        frierenSearch(p,"山札から《芸能界》を選ぶ",oshiAlly,done);
      },()=>stellaMove(board,slot,target,"memory"));
    }
  });
  return actions;
}

function oshiMeltCover(p,target,done){
  const board=players[p];
  if(!oshiAlly(target)){done();return}
  const actions=oshiOther(p,target).filter(card=>oshiIs(card,"S107-095")).map(card=>({
    label:stellaName(card)+"・バトル中のキャラを＋3000",run:next=>{
      if(!stellaStage(p).includes(target)){next();return}
      stellaConfirm(p,"メルトを控え室に置いてバトル中のキャラを強化する？",use=>{
        if(use&&oshiRemoveSource(p,card))autoRuleAddTurnStat(target,"power",3000);
        next();
      });
    }
  }));
  botResolveTriggered(p,actions,done);
}
