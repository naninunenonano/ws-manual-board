"use strict";

const frierenDeck={
  title:"勇者一行（1TK8A8）",
  cards:[
    ["S128-003",4],["S128-009",1],["S136-012",1],["S128-017",4],["S108-T04",4],
    ["S136-001",3],["S136-005",3],["S136-002",2],["S136-006",4],["S136-065",1],
    ["S136-076",3],["S108-T13",4],["S136-078",4],["S128-021",4],["S108-T09",4,true],["S128-022",4,true]
  ].map(([number,num,cx=false])=>({id:"SFN/"+number,num,cx}))
};
const frierenGreenDeck={
  title:"お前山の上見スギ",
  cards:[
    ["S128-003",4],["S128-002",1],["S128-009",2],["S136-012",1],["S136-046",1],
    ["S136-036",2],["S128-017",4],["S108-T04",4],["S136-001",4],["S136-005",3],
    ["S136-006",4],["S136-033",3],["S136-034",3],["S136-065",1],["S108-T11",1],
    ["S136-048",1],["S128-021",3],["S108-T09",4,true],["S128-022",4,true]
  ].map(([number,num,cx=false])=>({id:"SFN/"+number,num,cx}))
};
const frierenIs=(card,number)=>card&&sameBotCardNumber(card.id,"SFN/"+number);
const frierenAlly=card=>["冒険者","魔法"].some(trait=>matchesPracticeTrait(card,trait));
const frierenOther=(p,source)=>stellaStage(p).filter(card=>card.uid!==source.uid&&frierenAlly(card));
const frierenStatues=p=>players[p].memory.filter(card=>card.faceUp&&frierenIs(card,"S128-017")).length;
const frierenEisenCount=p=>players[p].memory.filter(card=>card.faceUp&&frierenIs(card,"S136-006")).length;
const frierenChoice=cx=>botDefinition(cx)?.triggers?.includes("チョイス");
const frierenNamedCx=(p,number)=>players[p].cx.some(card=>frierenIs(card,number));

function frierenPower(p,card){
  if(!card.id.startsWith("SFN/")||!stellaStage(p).includes(card))return 0;
  let power=frierenAlly(card)?1500*frierenOther(p,card).filter(source=>frierenIs(source,"S128-009")).length:0;
  if(frierenIs(card,"S128-002")&&match.turn.player===p&&frierenOther(p,card).length)power+=2000;
  if(frierenIs(card,"S136-076")&&stellaStage(p).every(frierenAlly))power+=3000;
  if(frierenIs(card,"S128-003")&&frierenStatues(p)>=3)power+=1000*frierenEisenCount(p);
  if(frierenIs(card,"S108-T04")&&match.turn.player===p)
    power+=2000*frierenOther(p,card).filter(source=>frierenIs(source,"S136-005")).length;
  return power;
}
function frierenSearch(p,title,eligible,done){
  const board=players[p];
  stellaChoose(p,title,autoRuleBotOrderOpening(p,board.deck.filter(eligible)),card=>{
    if(card)stellaMove(board,"deck",card,"hand");
    shuffle(board.deck);
    stellaShow(p,"山札から選んだカードを公開",card?[card]:[],()=>resolveBoardRules(p,done));
  },{optional:true});
}
function frierenToMemory(p,title,eligible,done){
  const board=players[p];
  stellaChoose(p,title,board.waiting.filter(eligible),card=>{
    if(card)stellaMove(board,"waiting",card,"memory");
    done();
  },{optional:true});
}
function frierenStatue(p,source,done){
  const board=players[p],slot=stellaStageSlot(board,source);
  if(!slot||source.orientation!==0||!board.stock.length){done();return}
  autoRulePay(p,1);
  stellaMove(board,slot,source,"memory");
  stellaSalvage(p,card=>frierenIs(card,"S108-T04")||botDefinition(card)?.name==="“故郷の花” フリーレン＆ヒンメル",done);
}
function frierenRustMagic(p,done){
  frierenSearch(p,"銅像の錆を綺麗に取る魔法・黄のCX",card=>card.cx&&botDefinition(card)?.color==="黄",
    ()=>frierenToMemory(p,"勇者一行の像を思い出にする",card=>frierenIs(card,"S128-017"),()=>done()));
}
function frierenHeiterSearch(p,source,done){
  const board=players[p],slot=stellaStageSlot(board,source);
  if(!slot){done();return}
  const targets=stellaStage(p).filter(card=>card!==source);
  if(p===1)targets.sort((a,b)=>Number(a.orientation!==180)-Number(b.orientation!==180)||
    botStats(p,a).power-botStats(p,b).power);
  stellaChoose(p,"ハイターと一緒に控え室に置くキャラ",targets,card=>{
    if(!card){done();return}
    stellaMove(board,stellaStageSlot(board,card),card,"waiting");
    stellaMove(board,slot,source,"waiting");
    stellaLookAndTake(p,5,entry=>!entry.cx&&botEffectCard(entry).level>=1,false,done);
  },{optional:true});
}
function frierenChooseSlot(p,card,title,place,cancel,{botOrder=botSlots}={}){
  const board=players[p];
  if(p===1){place(botOrder.find(slot=>!board[slot].length)??botOrder[0]);return}
  const body=showResolution(title,[card]);
  for(const slot of botSlots){
    const occupant=board[slot].at(-1);
    deckButton(body,labels[slot]+(occupant?"（"+stellaName(occupant)+"と入れ替え）":""),()=>{
      closeResolution();place(slot);
    });
  }
  deckButton(body,"出さない",()=>{closeResolution();cancel()});
}
function frierenHimmelEntry(p,source,done){
  if(!frierenOther(p,source).length){done();return}
  const board=players[p];
  function deploy(){
    const choices=board.hand.filter(card=>frierenIs(card,"S128-009"));
    if(!board.stock.length||!choices.length){done();return}
    stellaChoose(p,"1ストックで舞台に出すフリーレンを選ぶ",choices,card=>{
      if(!card){done();return}
      function place(slot){
        autoRulePay(p,1);
        if(board[slot].length)botMove(board,slot,0,"waiting");
        stellaMove(board,"hand",card,slot);
        botStageEntry(p,card,"hand",done);
      }
      frierenChooseSlot(p,card,"フリーレンを置く枠を選ぶ",place,done,{botOrder:["back0","back1",...botSlots.slice(0,3)]});
    },{optional:true});
  }
  if(!board.clock.length){deploy();return}
  stellaConfirm(p,"ヒンメル・クロックの上から1枚を回復する？",use=>{
    if(use)botMove(board,"clock",board.clock.length-1,"waiting");
    deploy();
  });
}
function frierenMill(p,count,bottom,done){
  const board=players[p],milled=[];
  function next(){
    if(milled.length===count||!board.deck.length||board.level.length>=4){done(milled);return}
    milled.push(botMove(board,"deck",bottom?0:board.deck.length-1,"waiting"));
    resolveBoardRules(p,next);
  }
  resolveBoardRules(p,next);
}
function frierenHimmelComboReady(p,source){
  return frierenNamedCx(p,"S128-022")&&players[p].hand.length<=5&&frierenOther(p,source).length>=2;
}
function frierenHimmelCombo(p,source,done){
  if(!frierenHimmelComboReady(p,source)){done();return}
  frierenMill(1-p,3,true,milled=>{
    const hits=milled.filter(card=>card.cx).length;
    function damage(left){
      if(!left||players[1-p].level.length>=4){done();return}
      botAbilityDamage(1-p,2,()=>damage(left-1));
    }
    stellaShow(p,"久遠の愛情・相手の山札の下から控え室へ",milled,()=>damage(hits));
  });
}
function frierenBottomLook(p,source,done){
  if(!frierenOther(p,source).length){done();return}
  const rival=players[1-p];
  botLookUpTo(p,2,viewed=>{
    if(!viewed.length){done();return}
    function place(ordered){
      rival.deck.splice(0,viewed.length,...ordered);
      for(const card of viewed.filter(entry=>!ordered.includes(entry))){
        card.faceUp=true;rival.waiting.push(card);
      }
      resolveBoardRules(1-p,done);
    }
    if(p===1){
      place(viewed.filter(card=>card.cx));
      return;
    }
    const picks=[];
    const body=showResolution("山札の下に戻す順に選ぶ（一番下から）",[]);
    const buttons=viewed.map(card=>effectCardButton(body,card,stellaName(card),()=>{
      const i=picks.indexOf(card);
      if(i<0)picks.push(card);else picks.splice(i,1);
      for(const [index,entry] of viewed.entries()){
        const order=picks.indexOf(entry);
        buttons[index].setAttribute("aria-pressed",String(order>=0));
        (buttons[index].firstChild??buttons[index]).textContent=(order<0?"":(order+1)+"番目 ／ ")+stellaName(entry);
      }
    }));
    deckButton(body,"確定・選ばなかったカードは控え室へ",()=>{closeResolution();place(picks)});
  },{owner:1-p,bottom:true});
}
function frierenTopMove(actor,owner,canMill,done){
  const board=players[owner];
  resolveBoardRules(owner,()=>{
    const top=board.deck.at(-1);
    if(!top||board.level.length>=4){done();return}
    function move(zone){
      if(zone!=="top")botMove(board,"deck",board.deck.length-1,zone==="bottom"?"deck":zone,zone);
      resolveBoardRules(owner,done);
    }
    if(actor===1){
      move(actor!==owner&&top.cx?"bottom":canMill&&!top.cx?"waiting":"top");
      return;
    }
    const body=showResolution((actor===owner?"自分":"相手")+"の山札の上1枚",[top]);
    for(const [label,zone] of [["山札の上に戻す","top"],["山札の下に置く","bottom"],...(canMill?[["控え室に置く","waiting"]]:[])])
      deckButton(body,label,()=>{closeResolution();move(zone)});
  });
}
function frierenHimmelMemoryActions(p,attacker){
  if(!frierenIs(attacker,"S128-003")||frierenStatues(p)<4)return [];
  const action={
    label:"記憶・アイゼンの効果で相手の山札の上を確認",
    run:done=>frierenTopMove(p,1-p,false,done)
  };
  return Array(frierenEisenCount(p)).fill(action);
}
function frierenTdCombo(p,source,done){
  if(!frierenNamedCx(p,"S108-T09")||!frierenOther(p,source).length){done();return}
  stellaLookAndTake(p,4,frierenAlly,false,done);
}
function frierenVowSearch(p,source,done){
  const board=players[p];
  if(!board.stock.length||!board.deck.length){done();return}
  stellaConfirm(p,"1ストックと山札の上1枚をクロックに置いて、Lv1以下のキャラを探す？",use=>{
    if(!use){done();return}
    autoRulePay(p,1);
    botMove(board,"deck",board.deck.length-1,"clock");
    resolveBoardRules(p,()=>{
      if(board.level.length>=4){done();return}
      frierenSearch(p,"Lv1以下のキャラを山札から選ぶ",
        card=>botDefinition(card)?.type==="character"&&botDefinition(card).stats.level<=1,done);
    });
  });
}
function frierenVowLeave(p,source,done){
  const board=players[p];
  stellaChoose(p,"控え室に置く手札のイベント",board.hand.filter(card=>botDefinition(card)?.type==="event"),card=>{
    if(!card){done();return}
    stellaMove(board,"hand",card,"waiting");
    stellaLookAndTake(p,5,frierenAlly,false,done);
  },{optional:true});
}
function frierenMoonLeave(p,source,done){
  const board=players[p];
  stellaChoose(p,"クロックに置く手札を選ぶ",board.hand,card=>{
    if(!card){done();return}
    stellaMove(board,"hand",card,"clock");
    resolveBoardRules(p,()=>{
      if(board.level.length>=4){done();return}
      frierenSearch(p,"山札から《冒険者》か《魔法》のキャラを選ぶ",frierenAlly,()=>{
        if(board.memory.length>2){done();return}
        frierenToMemory(p,"蒼月草 ヒンメルを思い出にする",entry=>frierenIs(entry,"S108-T13"),done);
      });
    });
  },{optional:true});
}
function frierenBackup(p,source,done){
  const board=players[p];
  if(!board.stock.length||board.waiting.filter(card=>card.cx&&frierenChoice(card)).length<5){done();return}
  stellaConfirm(p,"1ストックで控え室を山札に戻してシャッフルする？",use=>{
    if(use){
      while(board.waiting.length)botMove(board,"waiting",board.waiting.length-1,"deck");
      shuffle(board.deck);
    }
    done();
  });
}
function frierenBriefing(p,source,done){
  stellaDiscardForAbility(p,discard=>{
    if(!discard){done();return}
    stellaRevealTop(p,top=>{
      if(!top){done();return}
      const limit=top.cx?0:botDefinition(top)?.stats.level;
      stellaSalvage(p,card=>botDefinition(card)?.type==="character"&&botDefinition(card).stats.level<=limit,done);
    });
  });
}
function frierenFernLook(p,source,done){
  if(!stellaStage(p).every(frierenAlly)){done();return}
  frierenTopMove(p,p,true,done);
}
function frierenFernLeave(p,source,done){
  if(!stellaStage(p).some(frierenAlly)){done();return}
  const board=players[p];
  frierenMill(p,2,false,milled=>{
    if(!milled.some(card=>botDefinition(card)?.type==="event")||!board.waiting.includes(source)||board.level.length>=4){done();return}
    stellaConfirm(p,"フェルンをストックの下に置く？",use=>{
      if(use)stellaMove(board,"waiting",source,"stock","bottom");
      done();
    });
  });
}
function frierenGrant(p,title,targets,{power=0,ability},done){
  stellaChoose(p,title,targets,target=>{
    if(target){
      autoRuleAddTurnStat(target,"power",power);
      if(ability)(target.gainedAbilities??=[]).push(ability);
    }
    done();
  });
}
function frierenSpellPower(p,source,done){
  frierenGrant(p,"フリーレン・パワー＋1500するキャラ",stellaStage(p).filter(frierenAlly),{power:1500},done);
}
function frierenSpellRetreat(p,source,done){
  frierenGrant(p,"リバース時に仲間を後列へ動かせるキャラ",stellaStage(p),{ability:"frieren-reverse-retreat"},done);
}
function frierenRetreat(p,source,done){
  const board=players[p];
  const empty=["back0","back1"].filter(slot=>!board[slot].length);
  if(!empty.length){done();return}
  const others=stellaStage(p).filter(card=>card.uid!==source.uid&&oshiCanMove(card));
  stellaChoose(p,"レストして後列へ動かすキャラ",others,card=>{
    if(!card){done();return}
    function place(slot){
      stellaMove(board,stellaStageSlot(board,card),card,slot);
      card.orientation=90;
      done();
    }
    if(empty.length===1||p===1){place(empty[0]);return}
    const body=showResolution("移動先の後列を選ぶ",[card]);
    for(const slot of empty)deckButton(body,labels[slot],()=>{closeResolution();place(slot)});
  });
}
function frierenTriggerActions(p,trigger,attacker){
  if(!trigger.cx&&!frierenIs(trigger,"S136-001"))return [];
  return stellaStage(p).filter(card=>frierenIs(card,"S136-001")).map(()=>({
    label:"ハロウィンの魔法・パワー＋1000とリバース時の思い出送り",
    run:done=>{
      const targets=stellaStage(p).filter(frierenAlly);
      const preferred=attacker();
      frierenGrant(p,"パワー＋1000と思い出送りを与えるキャラ",
        p===1&&targets.includes(preferred)?[preferred]:targets,{power:1000,ability:"frieren-reverse-memory"},done);
    }
  }));
}
function frierenHeiterAttackActions(p,attacker,context){
  if(!frierenIs(attacker,"S108-T04")||match.turn.player!==p)return [];
  return frierenOther(p,attacker).filter(card=>frierenIs(card,"S136-005")).map(()=>({
    label:"旅の日常 ハイター・トリガーチェック2回",
    run:done=>{
      if(p===1&&context.hasDoubleTrigger?.()){done();return}
      autoRuleTriggerCount(p,1,count=>{if(count===2)context.setTriggerChecks?.(count);done()});
    }
  }));
}
function frierenChoiceTrigger(p,done){
  const board=players[p];
  const heiter=stellaStage(p).some(card=>frierenIs(card,"S136-005"));
  const eligible=board.waiting.filter(card=>
    botDefinition(card)?.type==="character"&&botDefinition(card).triggers?.includes("ソウル")||
    heiter&&frierenIs(card,"S128-021"));
  stellaChoose(p,"チョイス・控え室から選ぶ",eligible,card=>{
    if(!card){done();return}
    function move(to){stellaMove(board,"waiting",card,to);done()}
    if(p===1){move(board.hand.length<6?"hand":"stock");return}
    const body=showResolution("チョイス・選んだカードの行き先",[card]);
    deckButton(body,"手札へ",()=>{closeResolution();move("hand")});
    deckButton(body,"ストックへ",()=>{closeResolution();move("stock")});
  },{optional:true});
}
function frierenEisenActions(p,cx){
  if(frierenEisenCount(p)||!frierenIs(cx,"S128-022")&&!frierenIs(cx,"S108-T09"))return [];
  const board=players[p];
  const triggered=board.waiting.filter(card=>frierenIs(card,"S136-006")).map(card=>card.uid);
  if(!triggered.length)return [];
  return [{
    label:"旅の日常 アイゼン・控え室から思い出へ（"+triggered.length+"枚）",
    run:done=>{
      // Each copy met the condition when the CX was placed. Moving one does not cancel the others.
      const copies=triggered.map(uid=>board.waiting.find(card=>card.uid===uid)).filter(Boolean);
      function resolve(selected){
        for(const card of selected)stellaMove(board,"waiting",card,"memory");
        done();
      }
      if(!copies.length){done();return}
      if(p===1){resolve(copies);return}
      if(copies.length===1){
        stellaChoose(p,"旅の日常 アイゼンを思い出にする",copies,card=>resolve(card?[card]:[]),{optional:true});
        return;
      }
      const selected=new Set();
      const body=showResolution("思い出にするアイゼンを選ぶ",[]);
      for(const [index,card] of copies.entries()){
        const button=effectCardButton(body,card,(index+1)+"．"+stellaName(card),()=>{
          if(selected.has(card))selected.delete(card);else selected.add(card);
          button.setAttribute("aria-pressed",String(selected.has(card)));
          button.style.outline=selected.has(card)?"2px solid #f4cf73":"";
          confirm.disabled=!selected.size;
        });
        button.setAttribute("aria-pressed","false");
      }
      function finish(cards){closeResolution();resolve(cards)}
      const confirm=deckButton(body,"選んだカードを思い出にする",()=>finish(copies.filter(card=>selected.has(card))));
      confirm.disabled=true;
      deckButton(body,"すべて思い出にする",()=>finish(copies));
      deckButton(body,"思い出にしない",()=>finish([]));
    }
  }];
}

function frierenFlowersHeal(p,source,done){
  const board=players[p];
  if(!board.clock.length){done();return}
  stellaConfirm(p,"故郷の花・クロックの上から1枚を回復する？",use=>{
    if(use)botMove(board,"clock",board.clock.length-1,"waiting");
    done();
  });
}
function frierenFlowersDamage(p,source,done){
  const board=players[p];
  function pay(cards){
    autoRulePay(p,3);
    for(const card of cards)stellaMove(board,"hand",card,"waiting");
    botAbilityDamage(1-p,4,done);
  }
  if(p===1){
    if(board.hand.length<3&&players[0].level.length<3){done();return}
    pay([...board.hand].sort((a,b)=>Number(b.cx)-Number(a.cx)).slice(0,2));
    return;
  }
  const body=showResolution("故郷の花・3ストックと手札2枚で4ダメージ",[]);
  const picks=new Set();
  for(const [index,card] of board.hand.entries()){
    const button=effectCardButton(body,card,(index+1)+"．"+stellaName(card),()=>{
      if(picks.has(card))picks.delete(card);
      else if(picks.size<2)picks.add(card);
      button.setAttribute("aria-pressed",String(picks.has(card)));
      button.style.outline=picks.has(card)?"2px solid #f4cf73":"";
      confirm.disabled=picks.size!==2;
    });
    button.setAttribute("aria-pressed","false");
  }
  const confirm=deckButton(body,"コストを払う",()=>{closeResolution();pay(picks)});
  confirm.disabled=true;
  deckButton(body,"使わない",()=>{closeResolution();done()});
}
const frierenPartner=source=>frierenIs(source,"S136-033")?"S136-034":"S136-033";
const frierenHasPartner=(p,source)=>stellaStage(p).some(card=>card!==source&&frierenIs(card,frierenPartner(source)));
function frierenPartnerDeploy(p,source,done){
  const board=players[p],partner=frierenPartner(source);
  const choices=board.deck.filter(card=>frierenIs(card,partner));
  if(p===1&&(!choices.length||frierenHasPartner(p,source)||botSlots.every(slot=>board[slot].length))){done();return}
  stellaDiscardForAbility(p,discarded=>{
    if(!discarded){done();return}
    function finish(){
      shuffle(board.deck);
      resolveBoardRules(p,done);
    }
    stellaChoose(p,"山札から舞台に出す相方を選ぶ",choices,card=>{
      if(!card){finish();return}
      frierenChooseSlot(p,card,"相方を置く舞台の枠を選ぶ",slot=>{
        if(board[slot].length)botMove(board,slot,0,"waiting");
        stellaMove(board,"deck",card,slot);
        shuffle(board.deck);
        botStageEntry(p,card,"deck",()=>resolveBoardRules(p,done));
      },finish);
    },{optional:true});
  });
}
const frierenLawineAttackPower=4000;
const frierenKanneAttackPower=2000;
function frierenLawineAttack(p,source,done){
  const board=players[p];
  botLookUpTo(p,2,viewed=>{
    stellaChoose(p,"山札の上に戻すカードを1枚選ぶ",viewed,top=>{
      for(const card of viewed){
        if(card!==top)stellaMove(board,"deck",card,"waiting");
      }
      if(top)stellaMove(board,"deck",top,"deck");
      autoRuleAddTurnStat(source,"power",frierenLawineAttackPower);
      resolveBoardRules(p,done);
    });
  });
}
function frierenKanneAttack(p,source,done){
  frierenTopMove(p,p,true,()=>{
    autoRuleAddTurnStat(source,"power",frierenKanneAttackPower);
    autoRuleAddTurnStat(source,"soul",1);
    done();
  });
}
function frierenMethodeEntry(p,source,done){
  autoRuleAddTurnStat(source,"power",1500*stellaStage(1-p).length);
  done();
}
function frierenMethodeReverse(p,done){
  frierenMill(1-p,5,true,milled=>{
    stellaShow(p,"猛攻 メトーデ・相手の山札の下から控え室へ",milled,()=>{
      if(players[1-p].level.length<4&&milled.some(card=>card.cx))botAbilityDamage(1-p,1,done);
      else done();
    });
  });
}
function frierenProphecy(p,done){
  botLookUpTo(p,3,()=>botLookUpTo(p,3,()=>done("stock"),{owner:1-p,review:true}),{review:true});
}
function frierenProphecyRecover(p,source,done){
  const board=players[p],eligible=card=>frierenIs(card,"S136-048");
  if(!board.waiting.some(eligible)&&!board.hand.some(eligible)){done();return}
  if(p===1&&!board.waiting.some(eligible)){done();return}
  stellaDiscardForAbility(p,discarded=>{
    if(!discarded){done();return}
    stellaChoose(p,"控え室の「未来を予知できる能力」を回収",board.waiting.filter(eligible),card=>{
      if(card)stellaMove(board,"waiting",card,"hand");
      done();
    });
  });
}
function frierenMageSwap(p,source,done){
  const board=players[p];
  if(!board.stock.length){done();return}
  if(p===1&&!(board.waiting.some(card=>card.cx)&&board.hand.filter(card=>card.cx).length>=2)){done();return}
  stellaChoose(p,"1ストックと手札のCXを払う",board.hand.filter(card=>card.cx),discarded=>{
    if(!discarded){done();return}
    autoRulePay(p,1);
    stellaMove(board,"hand",discarded,"waiting");
    stellaChoose(p,"控え室から手札に戻すCX",board.waiting.filter(card=>card.cx),card=>{
      if(card)stellaMove(board,"waiting",card,"hand");
      done();
    });
  },{optional:true});
}

const frierenConditions={
  "frieren-flowers-damage":(p,card)=>match.turn.player===p&&frierenOther(p,card).length>0&&
    players[p].stock.length>=3&&players[p].hand.length>=2,
  "frieren-lawine-attack":frierenHasPartner,
  "frieren-kanne-attack":frierenHasPartner,
  "frieren-himmel-combo":frierenHimmelComboReady,
  "frieren-vow-search":p=>players[p].stock.length>0&&players[p].deck.length>0
};
const frierenActions={
  "frieren-flowers-heal":frierenFlowersHeal,
  "frieren-flowers-damage":frierenFlowersDamage,
  "frieren-pair-deploy":frierenPartnerDeploy,
  "frieren-lawine-attack":frierenLawineAttack,
  "frieren-kanne-attack":frierenKanneAttack,
  "frieren-methode-entry":frierenMethodeEntry,
  "frieren-prophecy-recover":frierenProphecyRecover,
  "frieren-mage-swap":frierenMageSwap,
  "frieren-statue":frierenStatue,
  "frieren-heiter-search":frierenHeiterSearch,
  "frieren-himmel-entry":frierenHimmelEntry,
  "frieren-himmel-combo":frierenHimmelCombo,
  "frieren-bottom-look":frierenBottomLook,
  "frieren-td-entry":(p,card,done)=>{autoRuleAddTurnStat(card,"power",3000);done()},
  "frieren-td-combo":frierenTdCombo,
  "frieren-vow-search":frierenVowSearch,
  "frieren-vow-leave":frierenVowLeave,
  "frieren-moon-leave":frierenMoonLeave,
  "frieren-heiter-backup":frierenBackup,
  "frieren-briefing":frierenBriefing,
  "frieren-fern-top":frierenFernLook,
  "frieren-fern-leave":frierenFernLeave,
  "frieren-spell-power":frierenSpellPower,
  "frieren-spell-retreat":frierenSpellRetreat
};
