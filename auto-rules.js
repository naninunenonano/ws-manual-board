"use strict";

// The sample deck exercises the rules without assigning abilities to real cards.
const autoRuleScenario="rules";
const autoRuleTitle="共通ルール・仮カード";
const practiceScenario="practice-cards";
const practiceTitle="仮カード5種・効果確認";
const levelOneScenario="practice-level-one";
const levelOneTitle="仮カード・Lv1効果確認";
const levelTwoScenario="practice-level-two";
const levelTwoTitle="仮カード・Lv2応援確認";
const levelThreeScenario="practice-level-three";
const levelThreeTitle="仮カード・Lv3ゲート連動確認";
const entryScenario="practice-entry";
const entryTitle="仮カード・Lv0登場時効果確認";
const stockScenario="practice-stock";
const stockTitle="仮カード・早出しとストック入れ替え";
const bondScenario="practice-bond";
const bondTitle="仮カード・絆とLv3への攻撃";
const waitingScenario="practice-waiting";
const waitingTitle="仮カード・控え室誘発と特徴参照";
const backupScenario="practice-backup";
const backupTitle="仮カード・早出しと助太刀";
const practiceTrait="巡遊者";
const ruleStep=(handler,params)=>({handler,params});
const ownZone=zone=>({side:"self",zone});
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
function discardBond(cardNumbers){
  const waiting=ownZone("waiting"),hand=ownZone("hand");
  return ruleEffect("discard-bond","絆・手札1枚を捨てて控え室から回収","from_hand_to_stage",[
    ruleStep("selectCards",{from:waiting,as:"bond",count:1,cardNumbers}),
    ruleStep("move",{from:waiting,to:hand,selection:"bond"})
  ],{optional:true,conditions:[ruleStep("zoneCount",{from:hand,min:1})],costs:discardHandSteps()});
}
const practiceClimax={
  type:"climax",stats:{level:null,cost:0,power:null,soul:null},
  effects:[ruleEffect("cx-1001","パワー＋1000・ソウル＋1","while_in_cx",[
    ruleStep("continuousCxBuff",{side:"self",power:1000,soul:1})
  ],{type:"continuous"})]
};
const bondTargetNumbers=["BOT/W000-114"];
function discardHandSteps(trait){
  const hand=ownZone("hand");
  return [
    ruleStep("selectCards",{from:hand,as:"discard",count:1,...(trait?{traits:{names:[trait],mode:"any"}}:{})}),
    ruleStep("move",{from:hand,to:ownZone("waiting"),selection:"discard"})
  ];
}
const practiceCards={
  "101":{abilityText:["効果なし。"],
    name:"仮キャラ 3000",color:"red",stats:{level:0,cost:0,power:3000,soul:1}},
  "102":{abilityText:["応援：このカードの前のキャラはパワー＋500。"],
    name:"仮キャラ 応援",color:"blue",stats:{level:0,cost:0,power:1000,soul:1},assist:{power:500}},
  "103":{abilityText:["集中：1ストックとこのカードのレストで、山札の上から5枚を控え室へ。出たCXの数まで引く。"],
    name:"仮キャラ 集中",color:"blue",stats:{level:0,cost:0,power:1500,soul:1},effects:[
    ruleEffect("draw-brainstorm","集中（1ストック・自身レスト）","main",[],{
      type:"activated",brainstorm:{stock:1,reveal:5}
    })
  ]},
  "104":{...practiceClimax,abilityText:["CX置場：自分のキャラ全員にパワー＋1000、ソウル＋1。", "トリガー：控え室からキャラを1枚まで手札へ。"],
    name:"仮CX カムバック",color:"red",triggers:["カムバック"],effects:[
    ...practiceClimax.effects,salvageTrigger("カムバック","character")
  ]},
  "105":{...practiceClimax,abilityText:["CX置場：自分のキャラ全員にパワー＋1000、ソウル＋1。", "トリガー：控え室からCXを1枚まで手札へ。"],
    name:"仮CX ゲート",color:"blue",triggers:["ゲート"],effects:[
    ...practiceClimax.effects,salvageTrigger("ゲート","climax")
  ]},
  "106":{abilityText:["アタック時：赤CX「カムバック」があれば山札の上を4枚まで見る。《巡遊者》のキャラを1枚まで手札に加え、残りを控え室へ。"],
    name:"仮キャラ カムバック連動",color:"red",triggers:[],stats:{level:1,cost:0,power:5000,soul:1},
    lookOnAttack:{cxId:"BOT/W000-104",max:4,trait:practiceTrait}},
  "107":{abilityText:["他の《巡遊者》が2体以上ならパワー＋1000。", "アタック時：1ストックを払うとトリガーチェックが2回になる。"],
    name:"仮キャラ ダブルトリガー",color:"blue",triggers:[],stats:{level:1,cost:0,power:4000,soul:1},
    otherTraitBuff:{trait:practiceTrait,count:2,power:1000},extraTriggerCost:1},
  "108":{abilityText:["レベル応援：このカードの前のキャラに、そのキャラのレベル×500のパワーを加える。"],
    name:"仮キャラ レベル応援",color:"red",stats:{level:2,cost:1,power:5000,soul:1},
    triggers:["ソウル"],assist:{powerPerLevel:500}},
  "109":{abilityText:["登場時：クロックの一番上を控え室へ。", "アタック時：青CX「ゲート」があれば相手の山札下4枚を控え室へ。そこに含まれるCXの数だけダメージ。"],
    name:"仮キャラ ゲート連動",color:"blue",stats:{level:3,cost:2,power:10000,soul:2},
    triggers:["ソウル"],effects:[
      ruleEffect("heal-on-play","登場時・クロック回復","from_hand_to_stage",[
        ruleStep("move",{from:{side:"self",zone:"clock"},to:{side:"self",zone:"waiting"},count:1,end:"top"})
      ],{conditions:[ruleStep("zoneCount",{from:{side:"self",zone:"clock"},min:1})]})
    ],millOnAttack:{cxId:"BOT/W000-105",count:4}},
  "110":{abilityText:["登場時：山札の上2枚を好きな順番に並べる。", "登場時：1ストックと手札のCX1枚を払うと、控え室のCX1枚を手札へ。"],
    name:"仮キャラ 山札調整・CX回収",color:"blue",stats:{level:0,cost:0,power:500,soul:1},
    triggers:["ソウル"],effects:[
      ruleEffect("reorder-on-play","登場時・山札の上2枚","from_hand_to_stage",[],{reorderTop:true}),
      ruleEffect("cx-recover-on-play","登場時・CX回収","from_hand_to_stage",[
        ruleStep("selectCards",{from:ownZone("waiting"),as:"recoverCX",count:1,cardType:"climax"}),
        ruleStep("move",{from:ownZone("waiting"),to:ownZone("hand"),selection:"recoverCX"})
      ],{optional:true,conditions:[ruleStep("zoneCount",{from:ownZone("stock"),min:1})],costs:[
        ruleStep("payStock",{side:"self",count:1}),
        ruleStep("selectCards",{from:ownZone("hand"),as:"discardCX",count:1,cardType:"climax"}),
        ruleStep("move",{from:ownZone("hand"),to:ownZone("waiting"),selection:"discardCX"})
      ]})
    ]},
  "111":{abilityText:["登場時：1ストックを払い、山札の上1枚をクロックへ置くと、山札からLv1以下を1枚まで手札に加えられる。", "アタック時：自分の舞台の《巡遊者》のキャラ1体にパワー＋1000。"],
    name:"仮キャラ クロックサーチ",color:"red",stats:{level:0,cost:0,power:1500,soul:1},
    triggers:[],effects:[
      ruleEffect("clock-search-on-play","登場時・Lv1以下をサーチ","from_hand_to_stage",[
        ruleStep("searchDeck",{side:"self",as:"search",max:1,maxLevel:1}),
        ruleStep("revealSelection",{selection:"search"}),
        ruleStep("move",{from:ownZone("deck"),to:ownZone("hand"),selection:"search"}),
        ruleStep("shuffleDeck",{side:"self"})
      ],{clockSearchCost:1}),
      ruleEffect("trait-pump-on-attack","アタック時・《"+practiceTrait+"》にパワー＋1000","on_attack",[
        ruleStep("selectCards",{from:ownZone("stage"),as:"boost",count:1,cardType:"character",traits:{names:[practiceTrait],mode:"any"}}),
        ruleStep("modifyPower",{selection:"boost",amount:1000})
      ])
    ]},
  "112":{abilityText:["控え室のCXが2枚以下なら手札でLv2。他の《巡遊者》1体につきパワー＋500。", "登場時：手札を1枚捨てると、クロックの一番上をストックへ。"],
    name:"仮キャラ 早出し・クロックストック",color:"red",
    stats:{level:3,cost:2,power:8500,soul:2},triggers:["ソウル"],
    handLevelReduction:{maxWaitingCX:2,amount:1},otherTraitBuff:{trait:practiceTrait,powerPerCard:500},
    effects:[ruleEffect("clock-to-stock-on-play","登場時・クロックをストックへ","from_hand_to_stage",[
      ruleStep("move",{from:ownZone("clock"),to:ownZone("stock"),count:1,end:"top"})
    ],{optional:true,conditions:[
      ruleStep("zoneCount",{from:ownZone("clock"),min:1}),
      ruleStep("zoneCount",{from:ownZone("hand"),min:1})
    ],costs:[
      ruleStep("selectCards",{from:ownZone("hand"),as:"discard",count:1}),
      ruleStep("move",{from:ownZone("hand"),to:ownZone("waiting"),selection:"discard"})
    ]})]},
  "113":{abilityText:["相手のストックをすべて控え室へ。相手の山札の上から同じ枚数を相手のストックに置く。"],
    name:"仮イベント 光景",type:"event",color:"blue",
    stats:{level:2,cost:1,power:null,soul:null},triggers:[],eventEffect:"光景"},
  "114":{abilityText:["効果なし。"],
    name:"仮キャラ 赤Lv1 5500",color:"red",stats:{level:1,cost:0,power:5500,soul:1},triggers:[]},
  "115":{abilityText:["赤Lv1・5500（114）にパワー＋1000。", "登場時：手札を1枚捨てると、控え室の114を1枚手札へ。"],
    name:"仮キャラ 絆・指定キャラ強化",color:"red",stats:{level:0,cost:0,power:500,soul:1},triggers:[],
    namedStageBuff:{cardNumbers:bondTargetNumbers,power:1000},effects:[discardBond(bondTargetNumbers)]},
  "116":{abilityText:["アタック時：正面のキャラがLv3なら、そのターン中パワー＋6000。"],
    name:"仮キャラ Lv3への攻撃",color:"blue",stats:{level:2,cost:1,power:7500,soul:1},triggers:["ソウル"],
    effects:[ruleEffect("attack-opposing-level","アタック時・正面Lv3ならパワー＋6000","on_attack",[rulePower(6000)],{
      conditions:[ruleStep("opposingLevel",{level:3})]
    })]},
  "117":{abilityText:["サイドアタック不可。", "控え室に置かれた時：手札を1枚捨てると、山札の上を4枚まで見てLv1以上を1枚まで手札へ。残りは控え室へ。"],
    name:"仮キャラ サイド不可・控え室誘発",color:"blue",stats:{level:0,cost:0,power:2500,soul:1},triggers:[],
    cannotSideAttack:true,effects:[ruleEffect("waiting-look","控え室に置かれた時・Lv1以上を探す","on_enter_waiting",
      discardHandSteps(),{optional:true,conditions:[ruleStep("zoneCount",{from:ownZone("hand"),min:1})],
        lookTop:{max:4,targetLabel:"Lv1以上のカード",minLevel:1}})]},
  "118":{abilityText:["登場時：山札の上1枚を公開。《巡遊者》なら手札に加えて手札1枚を捨てる。", "登場時：手札から《巡遊者》を1枚捨てると1枚引く。"],
    name:"仮キャラ 特徴公開・手札交換",color:"red",stats:{level:0,cost:0,power:1000,soul:1},triggers:[],effects:[
    ruleEffect("trait-console-loot","登場時・《"+practiceTrait+"》公開と手札交換","from_hand_to_stage",[],{traitLoot:practiceTrait}),
    ruleEffect("trait-discard-draw","登場時・《"+practiceTrait+"》を捨ててドロー","from_hand_to_stage",
      discardHandSteps(practiceTrait),{optional:true,drawAfterCost:1,
        conditions:[ruleStep("zoneCount",{from:ownZone("hand"),min:1,traits:{names:[practiceTrait],mode:"any"}})]})
  ]},
  "119":{abilityText:["舞台に《巡遊者》が4体以上いれば手札でLv2。", "登場時：相手ターン終了までパワー＋4500。このカードとのバトル中は助太刀不可。", "バトル相手をリバースさせた時：1ストックを払うと、相手キャラをクロックへ。"],
    name:"仮キャラ 早出し・助太刀封じ",color:"red",stats:{level:3,cost:2,power:9000,soul:2},triggers:["ソウル"],
    handLevelReduction:{stageTrait:practiceTrait,count:4,amount:1},
    entryBattleBuff:{power:4500,blocksBackup:true,untilOpponentEnd:true},reverseMove:{zone:"clock",stock:1}},
  "120":{abilityText:["助太刀：1ストックと手札のこのカードを控え室に置き、フロントされた自分のキャラにパワー＋3000。", "そのキャラがバトル相手をリバースさせた時、リバースした相手を思い出へ。"],
    name:"仮キャラ 助太刀3000・思い出送り",color:"blue",stats:{level:2,cost:1,power:2500,soul:1},triggers:["ソウル"],
    backup:{power:3000,reverseMove:{zone:"memory"}}}
};

const redBlueScenario="red-blue-deck";
const redBlueDeck={
  title:"赤青デッキ",
  cards:Object.entries({
    "101":2,"102":2,"103":2,"104":4,"105":4,"106":4,"107":2,"108":2,"109":4,"110":2,
    "111":2,"112":2,"113":2,"114":4,"115":2,"116":2,"117":2,"118":2,"119":2,"120":2
  }).map(([number,num])=>({id:"BOT/W000-"+number,num,cx:practiceCards[number].type==="climax"}))
};

const practiceTitles={
  [backupScenario]:backupTitle,
  [practiceScenario]:practiceTitle,[levelOneScenario]:levelOneTitle,[levelTwoScenario]:levelTwoTitle,
  [levelThreeScenario]:levelThreeTitle,[entryScenario]:entryTitle,[stockScenario]:stockTitle,[bondScenario]:bondTitle,[waitingScenario]:waitingTitle
};
function isAutoRules(scenario=match?.bot?.scenario){
  return scenario===autoRuleScenario||isDeckMirror(scenario)||Object.hasOwn(practiceTitles,scenario);
}
function practiceDeck(deck,scenario){
  if(scenario===backupScenario)return practiceDeckWithSpecimens(deck,backupTitle,[["119",1],["120",1],["114",1]],["007","008","009"]);
  if([bondScenario,waitingScenario].includes(scenario)){
    const specimens=scenario===bondScenario?[["114",2],["115",1],["116",2]]:[["117",2],["118",1],["114",1],["113",1]];
    return practiceDeckWithSpecimens(deck,practiceTitles[scenario],specimens,["005","007","008","009","010"]);
  }
  // Single specimens for the effect test. The player deck remains independent.
  const replaced=new Set(["007","008","009","012","013"]);
  if(scenario!==practiceScenario){replaced.add("010");replaced.add("011")}
  if([levelTwoScenario,levelThreeScenario,entryScenario,stockScenario].includes(scenario))replaced.add("006");
  if([levelThreeScenario,entryScenario,stockScenario].includes(scenario))replaced.add("002");
  if(scenario===entryScenario||scenario===stockScenario){replaced.add("003");replaced.add("004")}
  if(scenario===stockScenario){replaced.add("001");replaced.add("005")}
  const entries=Object.entries(practiceCards).slice(0,replaced.size);
  return {title:practiceTitles[scenario],cards:[
    ...deck.cards.map(card=>({...card,num:card.num-Number(replaced.has(card.id.slice(-3)))})),
    ...entries.map(([number,card])=>({id:"BOT/W000-"+number,num:1,cx:card.type==="climax"}))
  ]};
}
function practiceDeckWithSpecimens(deck,title,specimens,replaced){
  const added=specimens.map(([number,num])=>({id:"BOT/W000-"+number,num,cx:false}));
  return {title,cards:[...deck.cards.map(card=>({...card,num:card.num-Number(replaced.includes(card.id.slice(-3)))})),...added]};
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
    if(p!==0||scenario!==levelOneScenario)put(p,"001","level");
    put(p,"006","stock",3);
    put(p,"004","hand");put(p,"003","hand");put(p,"005","deck");
  }
  if(scenario===practiceScenario)preparePracticeCards(boards[0]);
  else if(scenario===levelOneScenario){
    put(0,"101","level");put(0,"102","clock");put(0,"103","back0");put(0,"009","back1");
    for(const n of ["104","106","107"])put(0,n,"hand");
    for(const n of ["105","005","008","007","012","007"])put(0,n,"deck");
  }else if(scenario===levelTwoScenario){
    put(0,"101","level");put(0,"108","hand");
    put(0,"001","front0");put(0,"106","front1");
  }else if(scenario===levelThreeScenario){
    put(0,"101","level");put(0,"102","level");put(0,"103","clock",1);
    put(0,"007","clock",1);
    put(0,"105","hand");put(0,"109","hand");
  }else if(scenario===entryScenario){
    for(const n of ["105","110","111"])put(0,n,"hand");
    put(0,"104","waiting");put(0,"101","front1");put(0,"007","deck");
  }else if(scenario===stockScenario){
    put(0,"101","level");put(0,"102","clock");put(0,"007","clock");
    put(0,"103","back0");put(0,"106","front1");
    put(0,"112","hand");put(0,"113","hand");
    put(0,"104","waiting");put(0,"105","waiting");
  }else if(scenario===bondScenario){
    put(0,"114","level");put(0,"116","clock");put(0,"114","waiting");
    put(0,"115","hand");put(0,"116","hand");
    put(1,"109","front2");
  }else if(scenario===waitingScenario){
    put(0,"117","front1");put(0,"117","hand");put(0,"118","hand");
    for(const n of ["003","113","114","001"])put(0,n,"deck");
  }else if(scenario===backupScenario){
    put(0,"114","level");put(1,"007","level");
    for(const slot of ["front1","front2","back0","back1"])put(0,"007",slot);
    put(0,"119","hand");put(0,"120","hand");put(1,"120","hand");put(1,"002","front2");
  }else{
    put(0,"002","hand",2);put(0,"012","hand");put(0,"001","front0");
    // CX placement draws the top card; the next card is a soul trigger.
    put(0,"001","deck");
  }
  put(1,"003","front1");put(1,"001","front0");
  for(const p of [0,1]){
    const board=boards[p];
    const head=board.deck.splice(-(p===1?1:scenario===practiceScenario?9:scenario===levelOneScenario?6:scenario===waitingScenario?4:2));
    const rest=board.deck.filter(c=>c.cx);
    board.deck=board.deck.filter(c=>!c.cx);
    rest.forEach((card,i)=>board.deck.splice(3+i*5,0,card));
    board.deck.push(...head);
  }
  if(scenario===levelThreeScenario){
    const deck=boards[1].deck;
    // The combo finds two CXs, and its separate damage has two characters on top.
    put(1,"007","deck",4);
    const bottom=[true,false,true,false].map(cx=>deck.splice(deck.findIndex(card=>card.cx===cx),1)[0]);
    deck.unshift(...bottom);
  }
}

let waitingBoard, knownWaiting=[], waitingAbilities=[];
function autoRuleCollectWaiting(){
  if(!isAutoRules()||!isMatchActive())return;
  const current=players.map(board=>new Set(board.waiting.map(card=>card.uid)));
  if(waitingBoard!==players){
    waitingBoard=players;
    waitingAbilities=[];
  }else{
    const turn=match.turn?.player??0;
    for(const p of [turn,1-turn])for(const card of players[p].waiting){
      if(!knownWaiting[p].has(card.uid)&&botDefinition(card)?.effects?.some(effect=>effect.timing==="on_enter_waiting")){
        waitingAbilities.push({p,card,timing:"on_enter_waiting"});
      }
    }
  }
  knownWaiting=current;
}
function autoRuleResolveWaiting(done){
  autoRuleCollectWaiting();
  if(!waitingAbilities.length||!isMatchActive()){done();return}
  const batch=waitingAbilities.splice(0);
  const turn=match.turn.player;
  const actions=p=>batch.filter(entry=>entry.p===p).map(({card,timing})=>({
    label:stellaName(card)+"・控え室に置かれた時",
    run:next=>resolveBoardRules(p,()=>botDispatch(card,timing,next,p))
  }));
  botResolveTriggered(turn,actions(turn),()=>botResolveTriggered(1-turn,actions(1-turn),
    ()=>autoRuleResolveWaiting(done)));
}
function autoRuleStartWaiting(){
  if(!isAutoRules()||!isMatchActive())return false;
  autoRuleCollectWaiting();
  if(ruleBusy||!waitingAbilities.length||document.getElementById("dialog").open)return false;
  runRuleOperation(autoRuleResolveWaiting);
  return true;
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
  const totals={power:autoRuleEntryBattleBuff(card)?.power??0,soul:0};
  if(botDefinition(card)?.effects?.some(effect=>effect.type==="continuous"&&effect.timing==="on_stage")){
    totals.power+=WSEffects.continuousStatBonus(botEffectBoard(p),botEffectCard(card),"on_stage","power",findBotCard);
  }
  const level=front<0?0:Math.max(0,botEffectCard(card).level??0);
  for(const [i,slot] of ["back0","back1"].entries()){
    if(front!==i&&front!==i+1)continue;
    const source=live[slot].at(-1);
    const assist=source?.faceUp?botDefinition(source)?.assist:null;
    if(assist)totals.power+=(assist.power??0)+(assist.powerPerLevel??0)*level;
  }
  const traitBuff=botDefinition(card)?.otherTraitBuff;
  if(traitBuff&&botSlots.some(slot=>live[slot].some(c=>c.uid===card.uid))){
    const other=botSlots.flatMap(slot=>live[slot]).filter(c=>
      c.uid!==card.uid&&c.faceUp&&matchesPracticeTrait(c,traitBuff.trait));
    totals.power+=other.length*(traitBuff.powerPerCard??0);
    if(other.length>=(traitBuff.count??0))totals.power+=traitBuff.power??0;
  }
  if(botSlots.some(slot=>live[slot].at(-1)?.uid===card.uid)){
    for(const slot of botSlots){
      const source=live[slot].at(-1);
      const buff=source?.faceUp?botDefinition(source)?.namedStageBuff:null;
      if(buff?.cardNumbers.some(number=>sameBotCardNumber(number,card.id)))totals.power+=buff.power;
    }
  }
  if(!live.cx.length)return totals;
  const board=botEffectBoard(p);
  for(const cx of players[p].cx){
    for(const effect of botDefinition(cx)?.effects??[]){
      if(effect.type!=="continuous"||effect.timing!=="while_in_cx")continue;
      const result=WSEffects.run(effect,board,{sourceUid:cx.uid},findBotCard);
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

function autoRuleHandLevel(p,card,definition){
  const board=players[p];
  const bonus=definition.effects?.some(effect=>effect.type==="continuous"&&effect.timing==="in_hand")
    ? WSEffects.continuousStatBonus(botEffectBoard(p),botEffectCard(card),"in_hand","level",findBotCard):0;
  const level=bonus ? definition.stats.level+bonus : definition.stats.level;
  const reduction=definition.handLevelReduction;
  if(!reduction)return level;
  if(reduction.maxWaitingCX!==undefined&&board.waiting.filter(card=>card.cx===true).length>reduction.maxWaitingCX)return level;
  if(reduction.stageTrait&&botSlots.flatMap(slot=>board[slot]).filter(card=>
    card.faceUp&&matchesPracticeTrait(card,reduction.stageTrait)).length<reduction.count)return level;
  return Math.max(0,level-reduction.amount);
}
function autoRuleLegalPlay(p,card,phase,type,{planning=false}={}){
  const def=botDefinition(card),board=players[p];
  if(!def||def.type!==type)return "このカードは現在の操作ではプレイできません";
  if(!planning&&(match.turn.phase!==phase||(phase!=="attack"&&match.turn.player!==p)))return "現在のフェイズではプレイできません";
  const level=autoRuleHandLevel(p,card,def),cost=autoRulePlayCost(def);
  if(!Number.isInteger(cost)||board.stock.length<cost)return "ストックが不足しています（必要 "+cost+"枚）";
  if(level!=null&&board.level.length<level)return "プレイヤーのレベルが不足しています（必要 Lv"+level+"）";
  if(def.color&&(type==="climax"||level>0)&&![...board.level,...board.clock].some(c=>botDefinition(c)?.color===def.color))
    return "レベル置場かクロックに同じ色が必要です";
  return "";
}
function autoRulePlayCost(definition){
  return definition.type==="climax"?0:definition.stats.cost;
}
function autoRulePay(p,cost){
  const board=players[p];
  for(let i=0;i<cost;i++)botMove(board,"stock",board.stock.length-1,"waiting");
}
function autoRulePlace(p,uid,zone,confirmedOccupant){
  if(ruleBusy||p!==side)return false;
  const board=players[p],index=board.hand.findIndex(card=>card.uid===uid),card=board.hand[index];
  if(!card)return false;
  const climax=zone==="cx";
  if(!climax&&!isStageZone(zone))return false;
  const error=autoRuleLegalPlay(p,card,climax?"climax":"main",climax?"climax":"character");
  if(error||climax&&board.cx.length){message(error||"すでにCXをプレイしています");return false}
  if(!climax){
    const occupant=board[zone].at(-1);
    if(confirmedOccupant!==undefined&&occupant?.uid!==confirmedOccupant)return false;
    if(occupant&&confirmedOccupant===undefined){
      const body=showResolution("舞台のキャラを入れ替えますか？",[occupant,card]);
      body.append(document.createTextNode(botCardInfo(occupant).name+"を控え室に置き、"+botCardInfo(card).name+"を登場させます。"));
      deckButton(body,"キャンセル",()=>{closeResolution();clearCardSelection()});
      deckButton(body,"入れ替える",()=>{closeResolution();autoRulePlace(p,uid,zone,occupant.uid)});
      return true;
    }
  }
  selected=null;
  runRuleOperation(done=>autoRuleResolvePlay(p,index,zone,done));
  return true;
}
function autoRuleResolvePlay(p,index,zone,done){
  const board=players[p],card=board.hand[index],cost=autoRulePlayCost(botDefinition(card));
  autoRulePay(p,cost);
  if(board[zone].length)botMove(board,zone,0,"waiting");
  botMove(board,"hand",index,zone);
  autoRuleLog(botCardInfo(card).name+"をプレイ"+(cost?"（ストック−"+cost+"）":""));
  const finish=()=>resolveBoardRules(p,done);
  if(zone==="cx")botDispatch(card,"on_cx_play",finish,p);
  else botStageEntry(p,card,"hand",finish);
}
const autoRuleEventEffects=Object.freeze({"光景":resolveKoukei,"ヴェルジュ":(p,done)=>stellaVerge(p,done)});
function autoRuleEventEffect(definition){
  const name=definition?.effects?.some(effect=>effect.id==="verge-event")?"ヴェルジュ":definition?.eventEffect;
  return definition?.type==="event"&&Object.hasOwn(autoRuleEventEffects,name)?autoRuleEventEffects[name]:null;
}
function autoRulePlayEvent(p,uid){
  if(ruleBusy||p!==side)return false;
  const board=players[p],index=board.hand.findIndex(card=>card.uid===uid),card=board.hand[index];
  const definition=botDefinition(card);
  const effect=autoRuleEventEffect(definition);
  if(!effect)return false;
  const error=autoRuleLegalPlay(p,card,"main","event");
  if(error){message(error);return false}

  selected=null;
  runRuleOperation(done=>autoRuleResolveEvent(p,index,definition,effect,done));
  return true;
}
function autoRuleResolveEvent(p,index,definition,effect,done){
  const board=players[p];
  autoRulePay(p,definition.stats.cost);
  const [card]=board.hand.splice(index,1);
  effect(p,(destination="waiting")=>{
    card.faceUp=true;
    board[destination].push(card);
    done();
  });
}
function resolveKoukei(p,done){
  const target=1-p,rival=players[target];
  const count=rival.stock.length;
  for(let i=0;i<count;i++)botMove(rival,"stock",0,"waiting");
  let replaced=0;
  function finish(){
    autoRuleLog("光景・相手のストック"+count+"枚を控え室へ、相手の山札から"+replaced+"枚をストックへ");
    done();
  }
  function next(){
    if(replaced===count||rival.level.length>=4){finish();return}
    botRevealTop(target,top=>{top.faceUp=false;rival.stock.push(top)},found=>{
      if(!found){finish();return}
      replaced++;
      next();
    });
  }
  next();
}
function autoRuleHandMenu(p,index){
  if(ruleBusy||match.turn.player!==p)return false;
  const card=players[p].hand[index],definition=botDefinition(card),type=definition?.type,phase=match.turn.phase;
  const playableEvent=autoRuleEventEffect(definition);
  if(!(phase==="main"&&(type==="character"||playableEvent)||phase==="climax"&&type==="climax"))return false;
  const details=botCardDetails(card);
  const body=showResolution(botCardInfo(card).name,details?[]:[card]);
  if(details)appendBotCardDetails(body,details);
  setRuleModal(false);
  const level=autoRuleHandLevel(p,card,definition);
  if(level!==definition.stats.level)body.append(document.createTextNode("手札ではLv"+level));
  const error=type==="climax"&&players[p].cx.length?"すでにCXをプレイしています":autoRuleLegalPlay(p,card,phase,type);
  deckButton(body,"選択解除",()=>{closeResolution();clearCardSelection()});
  if(error){body.append(document.createTextNode(error));return true}
  deckButton(body,"プレイする",()=>{
    closeResolution();
    if(type==="climax"){autoRulePlace(p,card.uid,"cx");return}
    if(playableEvent){autoRulePlayEvent(p,card.uid);return}
    const targets=showResolution("登場させる枠",[card]);
    setRuleModal(false);
    deckButton(targets,"選択解除",()=>{closeResolution();clearCardSelection()});
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
  const actions=botSlots.flatMap(zone=>players[p][zone]).filter(card=>card.faceUp)
    .flatMap(card=>botTriggeredActions(p,card,timing));
  botResolveTriggered(p,actions,done);
}
function autoRuleAttackStart(done){
  autoRuleDispatchBoard(1-match.turn.player,"at_opponent_attack_start",()=>autoRuleResolveWaiting(done));
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
function autoRuleAttackTypes(card,target){
  if(!target)return ["direct"];
  return botDefinition(card)?.cannotSideAttack?["front"]:["front","side"];
}
function autoRuleAskAttack(p,zone,index){
  const card=players[p][zone][index];
  if(!autoRuleAttackAllowed(p,zone,card))return;
  const rival=players[1-p][autoRuleOpposite(zone)].at(-1);
  const body=showResolution("アタックを宣言",[card]);
  setRuleModal(false);
  for(const type of autoRuleAttackTypes(card,rival)){
    deckButton(body,({front:"フロントアタック",side:"サイドアタック",direct:"ダイレクトアタック"})[type],()=>{
      closeResolution();autoRuleAttack(p,zone,card.uid,type);
    });
  }
}

function autoRuleStageChange(card,from,to,owner){
  if(isStageZone(from)&&!isStageZone(to))delete card.gainedAbilities;
  if(!isAutoRules()||isStageZone(from)===isStageZone(to))return;
  delete card.botEntryBattleBuff;
  delete card.botBackupReverse;
  const definition=botDefinition(card);
  if(isStageZone(from)&&to==="waiting"&&definition?.effects?.some(effect=>effect.timing==="from_stage_to_waiting")){
    waitingAbilities.push({p:owner,card,timing:"from_stage_to_waiting"});
  }
  const buff=isStageZone(to)&&definition?.entryBattleBuff;
  if(buff){
    const turn=match.turn;
    const extra=Number(buff.untilOpponentEnd===true&&turn.player===owner);
    card.botEntryBattleBuff={...buff,until:turn.number+extra};
  }
}
function autoRuleEntryBattleBuff(card){
  return card?.botEntryBattleBuff?.until>=match.turn.number?card.botEntryBattleBuff:null;
}
function autoRuleCounter(p,attacker,target,done){
  const board=players[p];
  const candidates=board.hand.filter(card=>{
    const def=botDefinition(card);
    if(def?.backup){
      const blocked=autoRuleEntryBattleBuff(attacker)?.blocksBackup||autoRuleEntryBattleBuff(target)?.blocksBackup;
      return !blocked&&board.level.length>=def.stats.level&&board.stock.length>=def.stats.cost;
    }
    return def?.counter&&!autoRuleLegalPlay(p,card,"attack",def.type);
  });
  if(!target||!candidates.length){done();return}
  function play(card){
    autoRulePay(p,botDefinition(card).stats.cost);
    botMove(board,"hand",board.hand.indexOf(card),"waiting");
    const {backup,counter}=botDefinition(card);
    const bonus=(backup??counter).power;
    autoRuleAddTurnStat(target,"power",bonus);
    if(backup?.reverseMove)target.botBackupReverse={...backup.reverseMove,turn:match.turn.number};
    autoRuleLog(botCardInfo(card).name+"を使用（パワー＋"+bonus+"）");
    done();
  }
  if(p===1){play(candidates[0]);return}
  const body=showResolution("カウンター",[target]);
  for(const card of candidates)effectCardButton(body,card,botCardInfo(card).name+"を使う",()=>{closeResolution();play(card)});
  deckButton(body,"使わない",()=>{closeResolution();done()});
}
function hasPracticeTrait(card,trait){
  return WSEffects.matchTags(botEffectCard(card),"traits",{names:[trait],mode:"any"})===true;
}
function matchesPracticeTrait(card,trait){
  return botDefinition(card)?.type==="character"&&hasPracticeTrait(card,trait);
}

function autoRuleReorderTop(p,done,chooseCount=false){
  const deck=players[p].deck;
  if(!deck.length){done();return}
  if(p===1){done();return}
  function look(top){
    if(!top.length){done();return}
    const body=showResolution("山札の上"+top.length+"枚（1番が一番上）",top,effectChoiceImageUrl);
    function finish(swap){
      closeResolution();
      if(swap){
        const last=deck.length-1;
        [deck[last],deck[last-1]]=[deck[last-1],deck[last]];
      }
      autoRuleLog("山札上"+top.length+"枚を確認"+(swap?"して入れ替え":""));
      done();
    }
    deckButton(body,"この順番にする",()=>finish(false));
    if(top.length===2)deckButton(body,"上下を入れ替える",()=>finish(true));
  }
  if(chooseCount)botLookUpTo(p,2,look);
  else look(deck.slice(-2).reverse());
}
function autoRuleClockSearch(p,card,effect,done){
  const board=players[p],stock=effect.clockSearchCost;
  if(board.stock.length<stock||(!board.deck.length&&!board.waiting.length)){done();return}
  function pay(){
    autoRulePay(p,stock);
    botRevealTop(p,top=>{top.faceUp=true;board.clock.push(top)},found=>{
      if(!found||board.level.length>=4){done();return}
      autoRuleLog(stock+"ストック支払い・山札の上1枚をクロックへ");
      botGuide(card,effect,done,p,false);
    });
  }
  if(p===1){pay();return}
  const body=showResolution(effect.category,[]);
  deckButton(body,stock+"ストック払う",()=>{closeResolution();pay()});
  deckButton(body,"払わない",()=>{closeResolution();done()});
}
function autoRuleLookOnAttack(p,{cxId,max,trait},done){
  if(!players[p].cx.some(cx=>sameBotCardNumber(cx.id,cxId))){done();return}
  autoRuleLookTop(p,max,"CXコンボ","《"+trait+"》のキャラ",card=>matchesPracticeTrait(card,trait),done);
}
function autoRuleLookTop(p,max,label,targetLabel,matches,done){
  const board=players[p];
  botLookUpTo(p,max,viewed=>{
    const n=viewed.length;
    if(!n){done();return}
    function finish(chosen){
      board.deck.splice(-n);
      for(const card of viewed){
        card.faceUp=true;
        board[card===chosen?"hand":"waiting"].push(card);
      }
      autoRuleLog(label+"で"+n+"枚確認"+(chosen?"・"+botCardInfo(chosen).name+"を手札へ":"・手札に加えない"));
      resolveBoardRules(p,done);
    }
    if(p===1){finish(viewed.find(matches));return}
    const result=showResolution(label+"・"+targetLabel+"を1枚まで選ぶ",[]);
    for(const [index,card] of viewed.entries()){
      const eligible=matches(card);
      const button=effectCardButton(result,card,(index+1)+"．"+(botCardInfo(card)?.name??card.id)+(eligible?"を手札へ":""),()=>{closeResolution();finish(card)});
      button.disabled=!eligible;
    }
    deckButton(result,"加えない",()=>{closeResolution();finish(null)});
  });
}
function autoRuleTraitLoot(p,source,effect,done){
  const board=players[p];
  resolveBoardRules(p,()=>{
    const revealed=board.deck.at(-1);
    if(!revealed){done();return}
    const matched=hasPracticeTrait(revealed,effect.traitLoot);
    function apply(){
      if(!matched){done();return}
      botMove(board,"deck",board.deck.length-1,"hand");
      resolveBoardRules(p,()=>botGuide(source,{...effect,steps:discardHandSteps()},done,p,false));
    }
    if(p===1){apply();return}
    const body=showResolution(effect.category,[revealed]);
    deckButton(body,matched?"手札に加えて1枚捨てる":"山札の上に戻す",()=>{closeResolution();apply()});
  });
}
function autoRuleDrawAfterCost(p,count,done){
  if(!count){done();return}
  botRevealTop(p,card=>{card.faceUp=true;players[p].hand.push(card)},found=>{
    if(found)autoRuleDrawAfterCost(p,count-1,done);else done();
  });
}

function autoRuleMillOnAttack(p,{cxId,count},done){
  if(!players[p].cx.some(cx=>sameBotCardNumber(cx.id,cxId))){done();return}
  const target=1-p,board=players[target];
  let moved=0,climaxes=0;
  function next(){
    if(moved===count||!board.deck.length||board.level.length>=4){
      autoRuleLog("ゲートCXコンボ・山札の下から"+moved+"枚／CX "+climaxes+"枚");
      if(!climaxes||board.level.length>=4){done();return}
      botDamage(target,climaxes,done);
      return;
    }
    const card=botMove(board,"deck",0,"waiting");
    moved++;
    if(card.cx===true)climaxes++;
    resolveBoardRules(target,next);
  }
  resolveBoardRules(target,next);
}

function autoRuleTriggerCount(p,cost,done){
  if(!cost||players[p].stock.length<cost){done(1);return}
  function pay(){
    autoRulePay(p,cost);
    autoRuleLog(cost+"ストック支払い・トリガーチェック2回");
    done(2);
  }
  if(p===1){pay();return}
  const body=showResolution(cost+"ストックでトリガーチェックを2回にする？",[]);
  deckButton(body,cost+"ストック払う",()=>{closeResolution();pay()});
  deckButton(body,"払わない",()=>{closeResolution();done(1)});
}
function autoRuleResolveReversals(reversals,done){
  const pending=reversals.flatMap(({owner,source,target,slot,sourceSlot})=>{
    const backup=source.botBackupReverse;
    const effects=isAutoRules()?[botDefinition(source)?.reverseMove,backup?.turn===match.turn.number?backup:null]:[];
    const granted=(target.gainedAbilities??[]).filter(id=>id==="STS/W140-023:clock-swap");
    return [
      ...effects.filter(Boolean).map(effect=>({owner,target,slot,...effect})),
      ...granted.map(()=>({owner:1-owner,target:source,slot:sourceSlot,clockSwap:true})),
      ...(stellaIs(target,"025")?[{owner:1-owner,target:source,slot:sourceSlot,clockSwap:true,maxLevel:0}]:[]),
      ...(stellaIs(source,"T03")?[{owner,source,retreat:true}]:[])
    ];
  });
  function resolve(effect,next){
    const {owner,target,slot,zone,stock=0}=effect;
    const rival=players[1-owner];
    if(effect.retreat){stellaT03Retreat(owner,effect.source,next);return}
    if(effect.clockSwap){
      const index=rival[slot].findIndex(card=>card.uid===target.uid);
      const level=index<0?null:botEffectCard(rival[slot][index]).level;
      if(level==null||(effect.maxLevel===undefined?level<=rival.level.length:level>effect.maxLevel)||!rival.clock.length){next();return}
      function swapClock(){
        botMove(rival,"clock",rival.clock.length-1,"waiting");
        botMove(rival,slot,index,"clock");
        autoRuleLog(botCardInfo(target).name+"を相手のクロックへ");
        resolveBoardRules(1-owner,next);
      }
      if(owner===1){swapClock();return}
      const body=showResolution("相手のクロックの一番上を控え室に置き、バトル相手をクロックに置く？",[rival.clock.at(-1),target]);
      deckButton(body,"クロックを入れ替える",()=>{closeResolution();swapClock()});
      deckButton(body,"使わない",()=>{closeResolution();next()});
      return;
    }
    const targetIndex=rival[slot].findIndex(card=>card.uid===target.uid&&card.orientation===180);
    if(targetIndex<0||players[owner].stock.length<stock){next();return}
    function moveReversed(){
      autoRulePay(owner,stock);
      botMove(rival,slot,targetIndex,zone,"top");
      autoRuleLog(botCardInfo(target).name+"を"+labels[zone]+"へ"+(stock?"（"+stock+"ストック支払い）":""));
      resolveBoardRules(owner,()=>resolveBoardRules(1-owner,next));
    }
    if(!stock||owner===1){moveReversed();return}
    const body=showResolution("リバースしたキャラを"+labels[zone]+"へ置く？",[target]);
    deckButton(body,stock+"ストック払う",()=>{closeResolution();moveReversed()});
    deckButton(body,"払わない",()=>{closeResolution();next()});
  }
  const turn=match.turn.player;
  const actions=p=>pending.filter(effect=>effect.owner===p).map(effect=>({
    label:effect.retreat?stellaName(effect.source)+"・後列へ移動":
      stellaName(effect.target)+"を"+labels[effect.clockSwap?"clock":effect.zone]+"へ",
    run:next=>resolve(effect,next)
  }));
  botResolveTriggered(turn,actions(turn),()=>botResolveTriggered(1-turn,actions(1-turn),done));
}
function autoRuleAttack(p,zone,uid,type){
  const board=players[p],rival=players[1-p],opposite=autoRuleOpposite(zone);
  const attacker=board[zone].at(-1),target=rival[opposite].at(-1);
  if(ruleBusy||attacker?.uid!==uid||!autoRuleAttackAllowed(p,zone,attacker)||
    !autoRuleAttackTypes(attacker,target).includes(type))return;
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
        if(type==="front")autoRuleResolveReversals(botBattle(p,zone,uid,targetUid,opposite)??[],done);
        else done();
      });
    }
    function counter(){if(type==="front")autoRuleCounter(1-p,current(),defender(),damage);else damage()}
    function trigger(remaining){
      if(!remaining){counter();return}
      let revealed;
      botRevealTop(p,card=>{revealed=card},found=>{
        if(!found){counter();return}
        const icons=botTriggerIcons(p,revealed);
        const souls=icons.filter(icon=>icon==="ソウル").length;
        function resolve(){
          if(current())autoRuleAddTurnStat(current(),"soul",souls);
          autoRuleLog("トリガー "+botCardInfo(revealed).name+(souls?"（ソウル＋"+souls+"）":""));
          botResolveAttackTrigger(p,revealed,current,()=>{
            if(rival.level.length>=4||board.level.length>=4)done();
            else trigger(remaining-1);
          });
        }
        if(!isDeckMirror(match.bot.scenario)){resolve();return}
        const body=showResolution((p===side?"自分":"Bot")+"のトリガーチェック",[revealed]);
        const note=document.createElement("p");
        note.className="trigger-icons";
        note.textContent="トリガーアイコン："+(icons.join("・")||"なし");
        body.append(note);
        deckButton(body,"確認して進む",()=>{closeResolution();resolve()});
      });
    }
    let triggerChecks;
    const attackActions=botTriggeredActions(p,attacker,"on_attack",{
      opposingUid:targetUid,setTriggerChecks:n=>{triggerChecks=n}
    });
    attackActions.push(...botAttackTriggeredActions(p,attacker));
    function afterAttackAbilities(){
      if(rival.level.length>=4||board.level.length>=4){done();return}
      const definition=botDefinition(attacker);
      const check=()=>triggerChecks?trigger(triggerChecks):autoRuleTriggerCount(p,definition?.extraTriggerCost,trigger);
      const afterLook=()=>{
        if(!definition?.millOnAttack){check();return}
        autoRuleMillOnAttack(p,definition.millOnAttack,()=>{
          if(rival.level.length>=4)done();else check();
        });
      };
      if(definition?.lookOnAttack)autoRuleLookOnAttack(p,definition.lookOnAttack,afterLook);
      else afterLook();
    }
    botResolveTriggered(p,attackActions,()=>{
      if(type==="front"&&defender())stellaLaarRetreat(1-p,defender(),afterAttackAbilities);
      else afterAttackAbilities();
    });
  });
}
function autoRuleBotMain(p,done){
  const board=players[p];
  const slots=["back0","back1","front0","front1","front2"];
  function playNext(){
    if(players.some(b=>b.level.length>=4)){done();return}
    const slot=slots.shift();
    if(slot){
      if(board[slot].length){playNext();return}
      const back=slot.startsWith("back");
      const playable=board.hand.map((card,index)=>({card,index,definition:botDefinition(card)}))
        .filter(({card})=>!autoRuleLegalPlay(p,card,"main","character"));
      const isSupport=({definition:def})=>!!(def?.assist||def?.namedStageBuff||def?.effects?.some(effect=>effect.brainstorm));
      let candidate=playable.find(entry=>isSupport(entry)===back);
      if(isStellaDeck(match.bot.scenario)){
        const frontCount=botSlots.slice(0,3).filter(zone=>board[zone].length).length;
        if(back&&!frontCount&&playable.length===1)candidate=undefined;
        if(!back&&!candidate&&!frontCount)candidate=playable[0];
      }
      const index=candidate?.index??-1;
      if(index<0)playNext();
      else autoRuleResolvePlay(p,index,slot,playNext);
      return;
    }
    const source=[board.back0.at(-1),board.back1.at(-1)].find(card=>
      card?.orientation===0&&botDefinition(card)?.effects?.some(effect=>effect.brainstorm&&effect.brainstorm.stock<=board.stock.length));
    const brainstorm=botDefinition(source)?.effects.find(effect=>effect.brainstorm)?.brainstorm;
    if(brainstorm){resolveBrainstorm(p,source,brainstorm,playEvent);return}
    const teresa=stellaStage(p).find(card=>stellaIs(card,"077")&&card.orientation===0);
    if(teresa&&board.hand.length&&board.waiting.some(card=>botDefinition(card)?.type==="character"&&
      botDefinition(card).stats.level>=1)){stellaTeresa(p,teresa,playEvent);return}
    playEvent();
  }
  function ensureAttacker(){
    if(!isStellaDeck(match.bot.scenario)||players.some(b=>b.level.length>=4)){done();return}
    const front=botSlots.slice(0,3),ready=card=>card?.faceUp&&card.orientation===0;
    if(front.some(slot=>ready(board[slot].at(-1)))){done();return}
    const target=front.find(slot=>!board[slot].length)??front[0];
    const playable=board.hand.findIndex(card=>!autoRuleLegalPlay(p,card,"main","character"));
    if(playable>=0){autoRuleResolvePlay(p,playable,target,done);return}
    const rear=["back0","back1"].find(slot=>ready(board[slot].at(-1)));
    if(rear&&!board[target].length)botMove(board,rear,board[rear].length-1,target);
    done();
  }
  function playEvent(){
    if(players.some(b=>b.level.length>=4)){done();return}
    const frontCount=botSlots.slice(0,3).filter(slot=>board[slot].length).length;
    const hasRear=["back0","back1"].some(slot=>board[slot].length);
    const index=board.hand.findIndex(card=>{
      if(!autoRuleEventEffect(botDefinition(card))||autoRuleLegalPlay(p,card,"main","event"))return false;
      return stellaIs(card,"030")?(hasRear||frontCount>1):players[1-p].stock.length>=2;
    });
    if(index<0){ensureAttacker();return}
    const definition=botDefinition(board.hand[index]);
    autoRuleResolveEvent(p,index,definition,autoRuleEventEffect(definition),ensureAttacker);
  }
  playNext();
}
function autoRuleBotStep(){
  const p=1,board=players[p],turn=match.turn;
  switch(turn.phase){
    case "stand": setTurnPhase("draw");break;
    case "draw": setTurnPhase("clock");break;
    case "clock":{
      let index=board.hand.findIndex(card=>!card.cx);
      if(isStellaDeck(match.bot.scenario)){
        const playable=card=>!autoRuleLegalPlay(p,card,"main","character",{planning:true});
        const available=board.hand.filter(playable).length;
        const spare=board.hand.findIndex(card=>!card.cx&&!playable(card));
        if(spare>=0)index=spare;
        else if(available===1)index=board.hand.filter(card=>card.cx).length>1?board.hand.findIndex(card=>card.cx):-1;
      }
      if(!isDeckMirror(match.bot.scenario)||index<0||board.hand.length>=7||board.level.length>=3){
        setTurnPhase("main");break;
      }
      runRuleOperation(done=>{
        botMove(board,"hand",index,"clock");
        autoRuleDrawAfterCost(p,2,()=>{setTurnPhase("main");done()});
      });
      break;
    }
    case "main":{
      if(isDeckMirror(match.bot.scenario)){
        runRuleOperation(done=>autoRuleBotMain(p,()=>{setTurnPhase("climax");done()}));
        break;
      }
      for(const slot of botSlots.slice(0,3)){
        const i=board.hand.findIndex(c=>!autoRuleLegalPlay(p,c,"main","character"));
        if(i<0)break;
        if(board[slot].length)continue;
        autoRulePay(p,botDefinition(board.hand[i]).stats.cost);
        const entrant=botMove(board,"hand",i,slot);
        botResolveRecall(p,entrant,()=>{});
      }
      setTurnPhase("climax");break;
    }
    case "climax":{
      const combos=botSlots.slice(0,3).map(slot=>botDefinition(board[slot].at(-1)))
        .map(def=>def?.lookOnAttack?.cxId??def?.millOnAttack?.cxId);
      const findCx=condition=>board.hand.findIndex(card=>condition(card)&&!autoRuleLegalPlay(p,card,"climax","climax"));
      const comboIndex=findCx(card=>combos.some(number=>sameBotCardNumber(number,card.id)));
      const index=comboIndex>=0||!isStellaDeck(match.bot.scenario)?comboIndex:
        findCx(card=>board.front0.length+board.front1.length+board.front2.length>0&&card.cx);
      if(!isDeckMirror(match.bot.scenario)||index<0||board.cx.length){setTurnPhase("attack");break}
      runRuleOperation(done=>autoRuleResolvePlay(p,index,"cx",()=>{
        match.turn.phase="attack";
        autoRuleAttackStart(done);
      }));
      break;
    }
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

function activateBrainstorm(p,source,brainstorm){
  const {stock}=brainstorm;
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
  runRuleOperation(done=>resolveBrainstorm(p,source,brainstorm,done));
}
function resolveBrainstorm(p,source,{stock,reveal,salvage},done){
  const board=players[p];
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
    rememberBotReveal("Brainstorm",p,revealed,revealed.length+"枚公開・CX "+max+"枚");
    autoRuleLog("集中で"+revealed.length+"枚、CXが"+max+"枚（"+revealed.map(card=>botCardInfo(card).name).join("、")+"）");
    resolveBoardRules(p,()=>{
      const title=(p===0?"自分":"Bot")+"の集中・CX "+max+"枚";
      const afterReveal=next=>isDeckMirror(match.bot.scenario)?showBotRevealResult(title,revealed,next):next();
      if(!max){afterReveal(done);return}
      if(p===1){afterReveal(()=>salvage?resolveBrainstormSalvage(p,max,revealed,done):finishDraw(max));return}
      if(salvage){resolveBrainstormSalvage(p,max,revealed,done);return}
      const body=showResolution("集中・引く枚数を選ぶ（最大"+max+"枚）",revealed,effectChoiceImageUrl);
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
}


function resolveBrainstormSalvage(p,max,revealed,done){
  const board=players[p];
  const candidates=board.waiting.filter(card=>botDefinition(card)?.type==="character");
  const limit=Math.min(max,candidates.length);
  if(!limit){
    if(p===0&&isDeckMirror(match.bot.scenario))showBotRevealResult("集中・回収できるキャラがありません",revealed,done);
    else done();
    return;
  }
  const picks=new Set();
  function finish(){
    for(const uid of picks){
      const index=board.waiting.findIndex(card=>card.uid===uid);
      if(index>=0)botMove(board,"waiting",index,"hand");
    }
    autoRuleLog("集中でキャラ"+picks.size+"枚を手札へ");
    done();
  }
  if(p===1){for(const card of candidates.slice(0,limit))picks.add(card.uid);finish();return}
  const body=showResolution("集中・控え室からキャラを"+limit+"枚まで手札へ",[]);
  const details=document.createElement("details"),summary=document.createElement("summary");
  details.open=true;
  summary.textContent="公開カード "+revealed.length+"枚（CX "+max+"枚）";
  details.append(summary);
  appendResolutionCards(details,revealed,effectChoiceImageUrl);
  body.append(details);
  for(const card of candidates){
    const button=effectCardButton(body,card,botCardInfo(card)?.name??card.id,()=>{
      if(picks.has(card.uid))picks.delete(card.uid);
      else if(picks.size<limit)picks.add(card.uid);
      button.setAttribute("aria-pressed",String(picks.has(card.uid)));
      button.style.outline=picks.has(card.uid)?"2px solid #f4cf73":"";
    });
    button.setAttribute("aria-pressed","false");
  }
  deckButton(body,"回収を確定",()=>{closeResolution();finish()});
}
