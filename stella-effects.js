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
const isDeckMirror=scenario=>scenario===redBlueScenario||scenario===stellaScenario;
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
  const body=showResolution(title,shown.length?[]:cards);
  if(shown.length){
    for(const card of shown){
      const index=cards.indexOf(card);
      const button=effectCardButton(body,card,index<0?stellaName(card):(index+1)+"．"+stellaName(card),()=>{
        closeResolution();done(card);
      });
      button.disabled=index<0;
    }
  }else for(const [index,card] of cards.entries())deckButton(body,(index+1)+"．"+stellaName(card),()=>{
    closeResolution();done(card);
  });
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
const stellaActions={
  "t03-entry":stellaT03,"t03-attack":stellaT03Attack,"reis-cx":stellaReis,
  "shimiao-look":stellaShimiao,"freesia-reveal":stellaFreesia,"teresa-recall":stellaTeresa
};
function stellaPower(p,card){
  const shimiao=stellaIs(card,"071");
  if(!shimiao&&!stellaIs(card,"068"))return 0;
  if(!stellaStage(p).every(stellaAlly))return 0;
  return shimiao?3000:match.turn.player===p?500:1500;
}
