"use strict";

const stellaScenario="stella-sora-mirror";
const stellaDeck={
  title:"ステラソラ同士（DAQBE）",
  cards:[
    ["004",4],["003",2],["094",1],["076",1],["013",2],["024",4],["023",1],
    ["002",4],["019",1],["008",3],["001",3],["T03",4],["025",1],["071",4],
    ["077",1],["068",3],["030",3],["031",4,true],["032",4,true]
  ].map(([number,num,cx=false])=>({id:"STS/W140-"+number,num,cx}))
};
const stellaTrialScenario="stella-level-zero-trial";
const trialReductions=new Set(["094","013","023","030"].map(n=>"STS/W140-"+n));
const stellaTrialDeck={
  title:"ステラソラ・Lv0追加4種",
  cards:[
    ...stellaDeck.cards
      .map(card=>trialReductions.has(card.id)?{...card,num:card.num-1}:card)
      .filter(card=>card.num>0),
    ...["038","040","007","016"].map(number=>({id:"STS/W140-"+number,num:1,cx:false}))
  ]
};
const stellaCustomScenario="stella-custom";
const isStellaDeck=scenario=>scenario===stellaScenario||scenario===stellaTrialScenario||scenario===stellaCustomScenario;
const isDeckMirror=scenario=>scenario===redBlueScenario||isStellaDeck(scenario);
const stellaIs=(card,number)=>sameBotCardNumber(card.id,"STS/W140-"+number);
const stellaAlly=card=>["巡遊者","魔王"].some(trait=>matchesPracticeTrait(card,trait));
const stellaStage=p=>botSlots.flatMap(slot=>players[p][slot].filter(card=>card.faceUp));
const stellaName=card=>botCardInfo(card)?.name??card.id;

function stellaChoose(p,title,cards,done,{optional=false,shown=[]}={}){
  if(!cards.length){
    if(p===1||!shown.length){done(null);return}
    const body=showResolution(title+"・選べるカードなし",shown,effectChoiceImageUrl);
    deckButton(body,"確認して進む",()=>{closeResolution();done(null)});
    return;
  }
  if(p===1){done(cards[0]);return}
  const body=showResolution(title,[]);
  for(const card of shown.length?shown:cards){
    const index=cards.indexOf(card);
    const button=effectCardButton(body,card,index<0?stellaName(card):(index+1)+"．"+stellaName(card),()=>{
      closeResolution();done(card);
    });
    button.disabled=index<0;
  }
  if(optional)deckButton(body,"選ばない",()=>{closeResolution();done(null)});
}
function stellaConfirm(p,title,done){
  if(p===1){done(true);return}
  const body=showResolution(title,[]);
  for(const [label,value] of [["使う",true],["使わない",false]])
    deckButton(body,label,()=>{closeResolution();done(value)});
}
function stellaMove(board,from,card,to){
  const index=board[from].findIndex(entry=>entry.uid===card.uid);
  return index<0?null:botMove(board,from,index,to);
}
function stellaDiscard(p,done,onlyCx=false){
  const board=players[p];
  stellaChoose(p,"控え室に置く手札を選ぶ",board.hand.filter(card=>!onlyCx||card.cx),card=>{
    if(card)stellaMove(board,"hand",card,"waiting");
    done(card);
  });
}
function stellaSalvage(p,test,done){
  const board=players[p];
  stellaChoose(p,"控え室から手札に戻すカードを選ぶ",board.waiting.filter(test),card=>{
    if(card)stellaMove(board,"waiting",card,"hand");
    done();
  });
}
function stellaShow(p,title,cards,done){
  if(!cards.length){done();return}
  if(isAutoRules())autoRuleLog(title+"："+cards.map(stellaName).join("、"));
  if(p===1){done();return}
  const body=showResolution(title,cards);
  deckButton(body,"確認して進む",()=>{closeResolution();done()});
}
function stellaRevealTop(p,done){
  resolveBoardRules(p,()=>{
    const top=players[p].deck.at(-1);
    stellaShow(p,"山札の上を公開",top?[top]:[],()=>done(top));
  });
}
function stellaLookAndTake(p,max,filter,stockSecond,done){
  const board=players[p];
  botLookUpTo(p,max,viewed=>{
    const candidates=viewed.filter(filter);
    stellaChoose(p,"手札に加えるカード",candidates,hand=>{
      function finish(stock){
        stellaShow(p,"選んだカードを公開",[hand,stock].filter(Boolean),()=>{
          for(const card of viewed)stellaMove(board,"deck",card,card===hand?"hand":card===stock?"stock":"waiting");
          resolveBoardRules(p,()=>done(Boolean(hand)));
        });
      }
      if(stockSecond&&hand)stellaChoose(p,"ストックに置くカード",candidates.filter(card=>card!==hand),finish,{optional:true,shown:viewed});
      else finish(null);
    },{optional:true,shown:viewed});
  });
}

function stellaT03(p,source,done){
  autoRuleAddTurnStat(source,"power",2000);
  (source.gainedAbilities??=[]).push("STS/W140-T03:loot");
  done();
}
function stellaT03Attack(p,source,done){
  if(!source.gainedAbilities?.includes("STS/W140-T03:loot")){done();return}
  stellaRevealTop(p,top=>{
    if(!top||!stellaAlly(top)){done();return}
    stellaMove(players[p],"deck",top,"hand");
    resolveBoardRules(p,()=>stellaDiscard(p,done));
  });
}
function stellaT03Retreat(p,source,done){
  const board=players[p];
  stellaChoose(p,"レストする他のキャラを選ぶ",stellaStage(p).filter(card=>card.uid!==source.uid&&stellaAlly(card)),target=>{
    if(!target){done();return}
    target.orientation=90;
    const from=botSlots.find(slot=>board[slot].includes(target));
    const destinations=["back0","back1"].filter(slot=>!board[slot].length);
    function move(slot){stellaMove(board,from,target,slot);done()}
    if(!destinations.length){done();return}
    if(p===1||destinations.length===1){move(destinations[0]);return}
    const body=showResolution("空いている後列を選ぶ",[target]);
    for(const slot of destinations)deckButton(body,labels[slot],()=>{closeResolution();move(slot)});
  });
}
function stellaReis(p,source,done){
  const board=players[p],others=stellaStage(p).filter(card=>card.uid!==source.uid);
  const sacrifices=p===1?others.filter(card=>
    ["back0","back1"].some(slot=>board[slot].includes(card))||
    botSlots.slice(0,3).some(slot=>board[slot].some(entry=>entry.uid!==card.uid&&entry.orientation===0))):others;
  if(!sacrifices.length||!board.hand.some(card=>card.cx)){done();return}
  stellaChoose(p,"使うなら、控え室に置く手札のCXを選ぶ",board.hand.filter(card=>card.cx),cx=>{
    if(!cx){done();return}
    function pay(card){
      if(!card){done();return}
      stellaMove(board,"hand",cx,"waiting");
      stellaMove(board,botSlots.find(slot=>board[slot].includes(card)),card,"waiting");
      const eligible=board.waiting.filter(entry=>entry.cx);
      if(eligible.length===1){stellaMove(board,"waiting",eligible[0],"hand");done();return}
      stellaSalvage(p,entry=>entry.cx,done);
    }
    stellaChoose(p,"続けて、控え室に置く舞台のキャラを選ぶ",sacrifices,pay,{optional:true});
  },{optional:true});
}
function stellaShimiao(p,source,done){
  stellaLookAndTake(p,3,card=>{
    const def=botDefinition(card);
    return def?.type==="event"||def?.type==="character"&&def.keywords?.includes("回想");
  },false,added=>{if(added)stellaDiscard(p,done);else done()});
}
function stellaFreesia(p,source,done){
  if(!players[p].hand.length){done();return}
  stellaConfirm(p,"手札1枚を控え室に置いて山札の上を公開する？",use=>{
    if(!use){done();return}
    stellaDiscard(p,()=>stellaRevealTop(p,top=>{
      const level=top?.cx?0:botDefinition(top)?.stats?.level;
      if(level==null){done();return}
      stellaSalvage(p,card=>stellaAlly(card)&&(botDefinition(card).stats.level??Infinity)<=level,done);
    }));
  });
}
function stellaTeresa(p,source,done){
  const board=players[p],slot=botSlots.find(zone=>board[zone].includes(source));
  if(!slot||source.orientation!==0||!board.hand.length){done();return}
  stellaConfirm(p,"手札1枚とスタンドのテレサを控え室に置いて使う？",use=>{
    if(!use){done();return}
    stellaDiscard(p,()=>{
      stellaMove(board,slot,source,"waiting");
      stellaSalvage(p,card=>botDefinition(card)?.type==="character"&&botDefinition(card).stats.level>=1,()=>{
        const markers=botSlots.flatMap(zone=>board[zone]).reduce((sum,card)=>sum+(card.markers?.length??0),0);
        if(markers+board.memory.length>2){done();return}
        stellaChoose(p,"思い出に置くテレサ",board.waiting.filter(card=>stellaIs(card,"077")),card=>{
          if(card)stellaMove(board,"waiting",card,"memory");
          done();
        },{optional:true});
      });
    });
  });
}
function stellaVerge(p,done){
  const board=players[p];
  const stage=stellaStage(p);
  const back=["back0","back1"].flatMap(slot=>board[slot]).filter(card=>card.faceUp);
  const candidates=p===1?(back.length?back:stage.length>1?stage:[]):stage;
  stellaChoose(p,"ヴェルジュ・控え室に置く舞台のキャラ",candidates,card=>{
    if(!card){done("memory");return}
    stellaMove(board,botSlots.find(slot=>board[slot].includes(card)),card,"waiting");
    stellaLookAndTake(p,4,entry=>stellaAlly(entry)||botDefinition(entry)?.type==="event",true,()=>done("memory"));
  },{optional:true});
}
function stellaMemoryActions(p){
  const board=players[p];
  if(!board.hand.some(card=>card.cx))return [];
  return board.memory.filter(card=>stellaIs(card,"030")).map(card=>({
    label:stellaName(card)+"・記憶でキャラを回収",
    run:done=>{
      if(!board.hand.some(entry=>entry.cx)){done();return}
      stellaConfirm(p,"記憶・手札のCX1枚を控え室に置いてキャラを回収する？",use=>{
        if(use)stellaDiscard(p,()=>stellaSalvage(p,stellaAlly,done),true);
        else done();
      });
    }
  }));
}
function stellaStageSlot(board,card){
  return botSlots.find(slot=>board[slot].some(entry=>entry.uid===card.uid));
}
function stellaDiscardForAbility(p,done){
  const board=players[p];
  stellaChoose(p,"コストにする手札を選ぶ",board.hand,card=>{
    if(card)stellaMove(board,"hand",card,"waiting");
    done(card);
  },{optional:true,shown:board.hand});
}
function stellaKohakuDeploy(p,source,done){
  const board=players[p];
  const eligible=card=>stellaAlly(card)&&botDefinition(card)?.type==="character"&&botEffectCard(card).level<=0;
  if(p===1&&!board.waiting.some(eligible)&&!board.hand.some(eligible)){done();return}
  stellaDiscardForAbility(p,discarded=>{
    if(!discarded){done();return}
    const targets=board.waiting.filter(eligible);
    stellaChoose(p,"控え室から登場させるキャラ",targets,target=>{
      if(!target){done();return}
      function place(slot){
        if(board[slot].length)botMove(board,slot,board[slot].length-1,"waiting");
        const entrant=stellaMove(board,"waiting",target,slot);
        botStageEntry(p,entrant,"waiting",()=>resolveBoardRules(p,done));
      }
      if(p===1){place(botSlots.find(slot=>!board[slot].length)??"front0");return}
      const body=showResolution("登場させる枠を選ぶ",[target],effectChoiceImageUrl);
      for(const slot of botSlots){
        const current=board[slot].at(-1);
        deckButton(body,labels[slot]+(current?"（"+stellaName(current)+"を控え室へ）":""),()=>{
          closeResolution();place(slot);
        });
      }
    },{shown:targets});
  });
}
function stellaKohakuSwap(p,source,done){
  const board=players[p],slot=stellaStageSlot(board,source);
  if(!slot||!board.stock.length){done();return}
  const targets=stellaStage(p).filter(card=>card.uid!==source.uid&&stellaAlly(card));
  function swap(target){
    if(!target){done();return}
    const other=stellaStageSlot(board,target);
    autoRulePay(p,1);
    source.orientation=target.orientation=0;
    [board[slot],board[other]]=[board[other],board[slot]];
    done();
  }
  if(p===1){
    const opposing=slot.startsWith("front")?players[1-p][autoRuleOpposite(slot)].at(-1):null;
    const threat=opposing?botStats(1-p,opposing).power??0:0;
    const currentPower=botStats(p,source).power??0;
    const upgrade=opposing&&threat>=currentPower&&targets.find(card=>
      stellaStageSlot(board,card).startsWith("back")&&(botStats(p,card).power??0)>threat);
    swap(upgrade);
    return;
  }
  stellaChoose(p,"1ストック：コハクと入れ替えるキャラ",targets,swap,{optional:true,shown:targets});
}
function stellaLaarPrepare(p,source,done){
  if(!stellaStageSlot(players[p],source)||!stellaStage(p).every(stellaAlly)){done();return}
  stellaConfirm(p,"ラール・山札の上から1枚を控え室に置く？",use=>{
    if(!use){done();return}
    botRevealTop(p,card=>{
      card.faceUp=true;
      players[p].waiting.push(card);
      const definition=botDefinition(card);
      if(definition?.type==="character"&&botEffectCard(card).level<=2)(source.gainedAbilities??=[]).push("laar-retreat");
      autoRuleLog("ラール・"+stellaName(card)+"を控え室へ");
    },done);
  });
}
function stellaLaarRetreat(p,source,done){
  const board=players[p],slot=stellaStageSlot(board,source);
  if(!slot||!source.gainedAbilities?.includes("laar-retreat")){done();return}
  stellaConfirm(p,"ラールを手札に戻す？",use=>{
    if(use)stellaMove(board,slot,source,"hand");
    done();
  });
}
function stellaCoronisStock(p,source,done){
  const board=players[p];
  stellaRevealTop(p,top=>{
    const slot=stellaStageSlot(board,source);
    if(slot&&top&&botDefinition(top)?.type==="character"&&botEffectCard(top).level<=0){
      stellaMove(board,slot,source,"stock");
    }
    done();
  });
}
function stellaCoronisReveal(p,source,done){
  const board=players[p];
  if(!board.stock.length){done();return}
  const targets=stellaStage(p).filter(card=>card.uid!==source.uid&&stellaAlly(card));
  stellaChoose(p,"1ストック：控え室に置く他のキャラ",targets,target=>{
    if(!target){done();return}
    autoRulePay(p,1);
    stellaMove(board,stellaStageSlot(board,target),target,"waiting");
    function reveal(left){
      if(!left||board.level.length>=4){done();return}
      stellaRevealTop(p,top=>{
        if(!top||board.level.length>=4){done();return}
        const type=botDefinition(top)?.type;
        if(type==="event"||type==="character"&&stellaAlly(top)){
          stellaMove(board,"deck",top,"hand");
          resolveBoardRules(p,()=>reveal(left-1));
        }else reveal(left-1);
      });
    }
    reveal(2);
  },{optional:true,shown:targets});
}
function stellaFirenHoliday(p,source,done){
  const board=players[p],milled=[];
  stellaDiscardForAbility(p,discarded=>{
    if(!discarded){done();return}
    function finish(){
      if(board.level.length>=4){done();return}
      const level=milled.reduce((sum,card)=>sum+(card.cx?0:botEffectCard(card).level??0),0);
      const candidates=board.waiting.filter(card=>botDefinition(card)?.type==="character"&&stellaAlly(card)&&botEffectCard(card).level<=level);
      stellaChoose(p,"控え室からLv"+level+"以下のキャラを回収",candidates,target=>{
        if(target)stellaMove(board,"waiting",target,"hand");
        if(!milled.some(card=>card.cx)){done();return}
        stellaConfirm(p,"フィレン・山札の上1枚をストックに置く？",use=>{
          if(!use){done();return}
          botRevealTop(p,card=>{card.faceUp=false;board.stock.push(card)},done);
        });
      },{optional:true,shown:candidates});
    }
    function mill(left){
      if(!left||board.level.length>=4){finish();return}
      botRevealTop(p,card=>{
        card.faceUp=true;board.waiting.push(card);milled.push(card);
      },found=>{if(found)mill(left-1);else finish()});
    }
    mill(2);
  });
}
const stellaActions={
  "kohaku-deploy":stellaKohakuDeploy,"kohaku-swap":stellaKohakuSwap,
  "laar-prepare":stellaLaarPrepare,
  "coronis-stock":stellaCoronisStock,"coronis-reveal":stellaCoronisReveal,
  "firen-holiday":stellaFirenHoliday,
  "t03-entry":stellaT03,"t03-attack":stellaT03Attack,"reis-cx":stellaReis,
  "shimiao-look":stellaShimiao,"freesia-reveal":stellaFreesia,"teresa-recall":stellaTeresa
};
function stellaPower(p,card){
  const shimiao=stellaIs(card,"071");
  if(!shimiao&&!stellaIs(card,"068"))return 0;
  if(!stellaStage(p).every(stellaAlly))return 0;
  return shimiao?3000:match.turn.player===p?500:1500;
}
