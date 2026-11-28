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
    ruleStep("selectCards",{from:hand,as:"discard",count:1,...(trait?{cardType:"character",traits:{names:[trait],mode:"any"}}:{})}),
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

function autoRuleLog(text,record=true){
  if(record)recordBotBattleAction(text);
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
  const early=frierenIs(card,"S128-002")&&stellaStage(p).filter(frierenAlly).length>=4?-1:0;
  const level=bonus||early ? definition.stats.level+bonus+early : definition.stats.level;
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
  const level=autoRuleHandLevel(p,card,def),cost=autoRulePlayCost(p,def);
  if(!Number.isInteger(cost)||board.stock.length<cost)return "ストックが不足しています（必要 "+cost+"枚）";
  if(level!=null&&board.level.length<level)return "プレイヤーのレベルが不足しています（必要 Lv"+level+"）";
  if(def.color&&(type==="climax"||level>0)&&
    !(type==="event"&&stellaStage(p).some(source=>frierenIs(source,"S136-001")))&&![...board.level,...board.clock].some(c=>botDefinition(c)?.color===def.color))
    return "レベル置場かクロックに同じ色が必要です";
  return "";
}
function autoRulePlayCost(p,definition){
  if(definition.type==="climax")return 0;
  if(definition.cardNumber==="SFN/S128-003"&&!match.bot.uses["frieren-himmel-played:"+p])
    return Math.max(0,definition.stats.cost-frierenStatues(p));
  return definition.stats.cost;
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
  const board=players[p],card=board.hand[index],cost=autoRulePlayCost(p,botDefinition(card));
  if(frierenIs(card,"S128-003"))match.bot.uses["frieren-himmel-played:"+p]=true;
  autoRulePay(p,cost);
  if(board[zone].length)botMove(board,zone,0,"waiting");
  botMove(board,"hand",index,zone);
  autoRuleLog(botCardInfo(card).name+"をプレイ"+(cost?"（ストック−"+cost+"）":""));
  const finish=()=>resolveBoardRules(p,done);
  if(zone==="cx")botResolveTriggered(p,[...botTriggeredActions(p,card,"on_cx_play"),...frierenEisenActions(p,card)],finish);
  else botStageEntry(p,card,"hand",finish);
}
const autoRuleEventEffects=Object.freeze({"光景":resolveKoukei,"ヴェルジュ":(p,done)=>stellaVerge(p,done),"銅像の錆":(p,done)=>frierenRustMagic(p,done),"未来予知":(p,done)=>frierenProphecy(p,done)});
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
  recordBotBattleAction("イベントを使用・ストック−"+definition.stats.cost,p,[card]);
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
function autoRulePlayFromHand(p,index){
  if(ruleBusy||match.turn.player!==p)return;
  const board=players[p],card=board.hand[index],definition=botDefinition(card);
  const type=definition?.type,phase=match.turn.phase;
  if(phase==="climax"&&type==="climax"&&!board.cx.length){
    if(!autoRuleLegalPlay(p,card,"climax","climax"))autoRulePlace(p,card.uid,"cx");
    return;
  }
  if(phase!=="main")return;
  if(type==="character"){
    if(!autoRuleLegalPlay(p,card,"main","character"))beginHandPlacement(p,index);
  }else if(autoRuleEventEffect(definition)&&!autoRuleLegalPlay(p,card,"main","event")){
    autoRulePlayEvent(p,card.uid);
  }
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
function autoRuleReadyAttacker(card){
  if(!card?.faceUp||card.orientation!==0)return false;
  const def=botDefinition(card);
  return def?.type==="character"&&!def.cannotAttack;
}
function autoRuleAttackLimit(p){return match.turn.number===1&&p===match.firstPlayer?1:3}
function autoRuleAttackAllowed(p,zone,card){
  return zone.startsWith("front")&&autoRuleReadyAttacker(card)&&!(autoRuleAttackLimit(p)===1&&match.bot.attacked);
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
      return !blocked&&board.level.length>=def.stats.level&&board.stock.length>=(def.backup.cost??def.stats.cost);
    }
    return def?.counter&&!autoRuleLegalPlay(p,card,"attack",def.type);
  });
  if(!target||!candidates.length){done();return}
  function play(card){
    const {backup,counter,stats}=botDefinition(card);
    autoRulePay(p,backup?.cost??stats.cost);
    botMove(board,"hand",board.hand.indexOf(card),"waiting");
    const bonus=(backup??counter).power;
    autoRuleAddTurnStat(target,"power",bonus);
    if(backup?.reverseMove)target.botBackupReverse={...backup.reverseMove,turn:match.turn.number};
    autoRuleLog(botCardInfo(card).name+"を使用（パワー＋"+bonus+"）");
    if(backup)botDispatch(card,"on_backup_used",()=>autoRuleResolveWaiting(done),p,{attacker,defender:target});
    else done();
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
      botAbilityDamage(target,climaxes,done);
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
    const methode=frierenIs(source,"S136-036")&&botEffectCard(target).level>=2&&players[owner].cx.length;
    const mage=frierenIs(target,"S108-T11")&&botEffectCard(source).level!=null&&botEffectCard(source).level<=0;
    return [
      ...effects.filter(Boolean).map(effect=>({owner,target,slot,...effect})),
      ...granted.map(()=>({owner:1-owner,target:source,slot:sourceSlot,clockSwap:true})),
      ...(methode?[{owner,methode:true}]:[]),
      ...(mage?[{owner:1-owner,target:source,slot:sourceSlot,zone:"deck",position:"bottom",optional:true,anyOrientation:true}]:[]),
      ...(stellaIs(target,"025")?[{owner:1-owner,target:source,slot:sourceSlot,clockSwap:true,maxLevel:0}]:[]),
      ...(source.gainedAbilities??[]).flatMap(id=>id==="frieren-reverse-memory"?[{owner,target,slot,zone:"memory",optional:true}]:
        id==="frieren-reverse-retreat"?[{owner,source,frierenRetreat:true}]:[]),
      ...(stellaIs(source,"T03")?[{owner,source,retreat:true}]:[])
    ];
  });
  function resolve(effect,next){
    const {owner,target,slot,zone,stock=0}=effect;
    const rival=players[1-owner];
    if(effect.methode){frierenMethodeReverse(owner,next);return}
    if(effect.frierenRetreat){frierenRetreat(owner,effect.source,next);return}
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
    const targetIndex=rival[slot].findIndex(card=>card.uid===target.uid&&(card.orientation===180||effect.anyOrientation));
    if(targetIndex<0||players[owner].stock.length<stock){next();return}
    function moveReversed(){
      autoRulePay(owner,stock);
      botMove(rival,slot,targetIndex,zone,effect.position??"top");
      autoRuleLog(botCardInfo(target).name+"を"+labels[zone]+"へ"+(stock?"（"+stock+"ストック支払い）":""));
      resolveBoardRules(owner,()=>resolveBoardRules(1-owner,next));
    }
    if((!stock&&!effect.optional)||owner===1){moveReversed();return}
    const destination=effect.position==="bottom"?"山札の下":labels[zone];
    const body=showResolution(effect.anyOrientation?"バトル相手を"+destination+"に置く？":"リバースしたキャラを"+destination+"へ置く？",[target]);
    deckButton(body,stock?stock+"ストック払う":destination+"に置く",()=>{closeResolution();moveReversed()});
    deckButton(body,stock?"払わない":"置かない",()=>{closeResolution();next()});
  }
  const turn=match.turn.player;
  const actions=p=>pending.filter(effect=>effect.owner===p).map(effect=>({
    label:effect.methode?"猛攻 メトーデ・相手の山札下5枚":effect.frierenRetreat?"仲間を後列へ移動":effect.retreat?stellaName(effect.source)+"・後列へ移動":
      stellaName(effect.target)+"を"+(effect.position==="bottom"?"山札の下":labels[effect.clockSwap?"clock":effect.zone])+"へ",
    run:next=>resolve(effect,next)
  }));
  botResolveTriggered(turn,actions(turn),()=>botResolveTriggered(1-turn,actions(1-turn),done));
}
let autoRuleFrontBattle;
function autoRuleAttack(p,zone,uid,type){
  const board=players[p],rival=players[1-p],opposite=autoRuleOpposite(zone);
  const attacker=board[zone].at(-1),target=rival[opposite].at(-1);
  if(ruleBusy||attacker?.uid!==uid||!autoRuleAttackAllowed(p,zone,attacker)||
    !autoRuleAttackTypes(attacker,target).includes(type))return;
  const adjustment=type==="direct"?1:type==="side"?-Math.max(0,botEffectCard(target).level??0):0;
  const targetUid=target?.uid;
  selected=null;attacker.orientation=90;match.bot.attacked=true;
  autoRuleAddTurnStat(attacker,"soul",adjustment);
  runRuleOperation(finish=>{
    if(type==="front")autoRuleFrontBattle={[p]:{slot:zone,uid},[1-p]:{slot:opposite,uid:targetUid}};
    function done(){autoRuleFrontBattle=undefined;finish()}
    const action=({front:"フロント",side:"サイド",direct:"ダイレクト"})[type]+"アタック";
    recordBotBattleAction(labels[zone]+"から"+action,p,target?[attacker,target]:[attacker]);
    autoRuleLog(action,false);
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
          recordBotBattleAction("トリガーチェック"+(souls?"・ソウル＋"+souls:""),p,[revealed]);
          autoRuleLog("トリガー "+stellaName(revealed)+(souls?"（ソウル＋"+souls+"）":""),false);
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
    const context={opposingUid:targetUid,setTriggerChecks:n=>{triggerChecks=n},hasDoubleTrigger:()=>triggerChecks===2};
    const attackActions=botTriggeredActions(p,attacker,"on_attack",context);
    attackActions.push(...botAttackTriggeredActions(p,attacker),...frierenHeiterAttackActions(p,attacker,context));
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
function autoRuleBotAttackPlan(p,slot){
  const attacker=players[p][slot].at(-1);
  if(!autoRuleAttackAllowed(p,slot,attacker))return null;
  const target=players[1-p][autoRuleOpposite(slot)].at(-1);
  const stats=botStats(p,attacker);
  const lawine=frierenIs(attacker,"S136-033")&&frierenHasPartner(p,attacker);
  const kanne=frierenIs(attacker,"S136-034")&&frierenHasPartner(p,attacker);
  const soul=(stats.soul??0)+Number(kanne);
  const power=stats.power+(lawine?frierenLawineAttackPower:kanne?frierenKanneAttackPower:0);
  if(!target)return {slot,attacker,type:"direct",wins:0,survives:1,damage:Math.max(0,soul+1)};

  const defence=botStats(1-p,target).power;
  const wins=stats.power!=null&&defence!=null&&power>defence;
  if(wins||!autoRuleAttackTypes(attacker,target).includes("side")){
    return {slot,attacker,target,type:"front",wins:Number(wins),survives:Number(wins),damage:Math.max(0,soul)};
  }
  return {slot,attacker,target,type:"side",wins:0,survives:1,
    damage:Math.max(0,soul-Math.max(0,botEffectCard(target).level??0))};
}

function autoRuleBotAttackScore({wins,type,survives,damage}){
  // Each higher priority outweighs the next across all three front slots.
  return wins*10000+Number(type==="direct")*1000+survives*100+Math.min(damage,20);
}

function autoRuleArrangeBotFront(p){
  if(players.some(board=>board.level.length>=4))return;
  const board=players[p],slots=botSlots.slice(0,3);
  const positions=slots.map(slot=>board[slot]);
  const orders=[[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
  let best=orders[0],bestScore=-1;
  function arrange(order){slots.forEach((slot,i)=>{board[slot]=positions[order[i]]})}
  try{
    for(const order of orders){
      arrange(order);
      const plans=slots.map(slot=>autoRuleBotAttackPlan(p,slot)).filter(Boolean);
      const scores=plans.map(autoRuleBotAttackScore);
      const score=match.turn.number===1&&p===match.firstPlayer?
        Math.max(0,...scores):scores.reduce((total,value)=>total+value,0);
      if(score>bestScore){best=order;bestScore=score}
    }
  }finally{
    arrange(orders[0]);
  }
  if(best!==orders[0]){
    arrange(best);
    autoRuleLog("Botは前列を入れ替えて有利な対面を作った");
  }
}

function autoRuleBotComboCx(card){
  const def=botDefinition(card);
  return def?.preferredCx??def?.lookOnAttack?.cxId??def?.millOnAttack?.cxId??
    def?.effects?.filter(effect=>effect.timing==="on_attack").flatMap(effect=>effect.conditions??[])
      .find(condition=>condition.handler==="cxName")?.params?.cardNumbers?.[0];
}
function autoRuleBotHasCombo(card,hand){
  const cx=autoRuleBotComboCx(card);
  return Boolean(cx&&hand.some(entry=>sameBotCardNumber(entry.id,cx)));
}
function autoRuleBotOpeningPlan(deck,visible){
  const options=deck?.cards??[];
  let best=null,bestScore=-1;
  for(const card of options){
    const def=botDefinition(card);
    if(def?.type!=="character"||def.stats.level!==1)continue;
    const cx=autoRuleBotComboCx(card),cxDef=botDefinition(cx?{id:cx}:null);
    const cxCopies=options.reduce((n,entry)=>n+(sameBotCardNumber(entry.id,cx)?entry.num:0),0);
    if(!cxCopies)continue;
    const character=def.cardNumber??card.id;
    const characterCopies=options.reduce((n,entry)=>n+(sameBotCardNumber(entry.id,character)?entry.num:0),0);
    const prepared=visible.some(entry=>sameBotCardNumber(entry.id,character))+
      visible.some(entry=>sameBotCardNumber(entry.id,cx));
    const score=prepared*50+Math.min(characterCopies,cxCopies)*5+characterCopies+cxCopies;
    if(score>bestScore){
      best={character,cx,colors:[...new Set([def.color,cxDef?.color].filter(Boolean))]};
      bestScore=score;
    }
  }
  return best;
}
function autoRuleBotEarlyPlan(p){
  if(players[p].level.length>1)return null;
  return autoRuleBotOpeningPlan(match.decks[p],stellaStage(p).concat(players[p].hand));
}
function autoRuleBotOrderOpening(p,cards){
  if(p!==1||!isDeckMirror(match.bot.scenario))return cards;
  const plan=autoRuleBotEarlyPlan(p);
  if(!plan)return cards;
  const visible=players[p].hand.concat(stellaStage(p));
  const needed=[plan.character,plan.cx].filter(number=>!visible.some(card=>sameBotCardNumber(card.id,number)));
  const priority=card=>Number(needed.some(number=>sameBotCardNumber(card.id,number)));
  return [...cards].sort((a,b)=>priority(b)-priority(a));
}
function autoRuleBotMulligan(p){
  const hand=players[p].hand;
  const plan=autoRuleBotOpeningPlan(match.decks[p],hand);
  const keep=new Set();
  for(const number of [plan?.character,plan?.cx]){
    const index=hand.findIndex(card=>sameBotCardNumber(card.id,number));
    if(index>=0)keep.add(index);
  }
  const attackers=hand.filter(autoRuleReadyAttacker).filter(card=>botDefinition(card).stats.level===0).length;
  return hand.flatMap((card,index)=>{
    const def=botDefinition(card);
    const early=def?.type==="character"&&def.stats.level===0&&(!def.cannotAttack||attackers>=2);
    return early||keep.has(index)?[]:[index];
  });
}
function autoRuleBotKeepsCombo(p,card){
  const hand=players[p].hand,plan=autoRuleBotEarlyPlan(p);
  return sameBotCardNumber(card.id,plan?.character)||sameBotCardNumber(card.id,plan?.cx)||
    autoRuleBotHasCombo(card,hand)||
    stellaStage(p).concat(hand).some(source=>sameBotCardNumber(autoRuleBotComboCx(source),card.id));
}
function autoRuleBotRecoveryPriority(p,card){
  const board=players[p],def=botDefinition(card);
  if(def?.type!=="character")return 0;
  const playable=!def.cannotAttack&&!autoRuleLegalPlay(p,card,"main","character",{planning:true});
  const plan=autoRuleBotEarlyPlan(p);
  const missingCombo=plan&&sameBotCardNumber(card.id,plan.character)&&
    !board.hand.some(entry=>sameBotCardNumber(entry.id,plan.character));
  return Number(autoRuleBotHasCombo(card,board.hand))*8+Number(missingCombo)*3+Number(playable)*4+
    Number(def.stats.level<=board.level.length+1)+Number(def.stats.cost===0);
}
function autoRuleBotLevelIndex(p,clock){
  const board=players[p];
  const colors=new Set(board.level.map(card=>botDefinition(card)?.color));
  const pairs=stellaStage(p).concat(board.hand).filter(card=>
    botDefinition(card)?.stats.level===1&&autoRuleBotHasCombo(card,board.hand));
  const demands=new Map();
  const plan=board.level.length===0?autoRuleBotEarlyPlan(p):null;
  if(plan)for(const color of plan.colors)demands.set(color,1);
  for(const card of pairs){
    const color=botDefinition(card).color;
    demands.set(color,(demands.get(color)??0)+1);
  }
  return clock.reduce((best,card,index)=>{
    const score=entry=>{
      const color=botDefinition(entry)?.color;
      return colors.has(color)?0:(demands.get(color)??0)*10+
        Number(board.hand.some(hand=>botDefinition(hand)?.stats.level===1&&botDefinition(hand)?.color===color));
    };
    return score(card)>score(clock[best])?index:best;
  },0);
}
function autoRuleBotMain(p,done){
  const board=players[p];
  const slots=[...botSlots];
  const attackLimit=autoRuleAttackLimit(p);
  const readyFront=()=>botSlots.slice(0,3).filter(slot=>autoRuleAttackAllowed(p,slot,board[slot].at(-1))).length;
  function playNext(){
    if(players.some(b=>b.level.length>=4)){done();return}
    const slot=slots.shift();
    if(slot){
      const back=slot.startsWith("back"),occupant=board[slot].at(-1);
      const playable=board.hand.map((card,index)=>({card,index,definition:botDefinition(card)}))
        .filter(({card})=>!autoRuleLegalPlay(p,card,"main","character"));
      const isSupport=({definition:def})=>!!(def?.assist||def?.namedStageBuff||def?.cannotAttack||def?.cardNumber==="SFN/S136-005"||def?.effects?.some(effect=>effect.brainstorm));
      const combo=entry=>entry.definition.stats.level===1&&autoRuleBotHasCombo(entry.card,board.hand);
      let candidate;
      if(back&&!occupant){
        candidate=playable.find(isSupport)??(!readyFront()?playable.find(entry=>!entry.definition.cannotAttack):undefined);
      }else if(!back&&readyFront()<attackLimit){
        const attackers=playable.filter(entry=>!entry.definition.cannotAttack);
        const score=entry=>{
          const cost=board.level.length<=1?autoRulePlayCost(p,entry.definition):0;
          return Number(combo(entry))*100+Number(!isSupport(entry))*4+entry.definition.stats.level-cost*10;
        };
        if(!autoRuleReadyAttacker(occupant))candidate=attackers.sort((a,b)=>score(b)-score(a))[0];
      }
      if(!back&&autoRuleReadyAttacker(occupant)&&!autoRuleBotHasCombo(occupant,board.hand)){
        const openAttacks=attackLimit-readyFront();
        const spareCombos=playable.filter(entry=>!entry.definition.cannotAttack&&combo(entry));
        if(spareCombos.length>openAttacks)candidate=spareCombos[0];
      }
      const index=candidate?.index??-1;
      if(index<0)playNext();
      else autoRuleResolvePlay(p,index,slot,playNext);
      return;
    }
    const statue=stellaStage(p).find(card=>frierenIs(card,"S128-017")&&card.orientation===0);
    if(statue&&board.stock.length&&board.waiting.some(card=>frierenIs(card,"S108-T04"))){
      frierenStatue(p,statue,tryBrainstorm);return;
    }
    tryBrainstorm();
  }
  let brainstorms=0;
  function tryBrainstorm(){
    if(players.some(b=>b.level.length>=4)){done();return}
    const front=readyFront();
    const rear=botSlots.slice(3).map(slot=>board[slot].at(-1));
    const available=front+rear.filter(autoRuleReadyAttacker).length;
    const handAttacker=board.hand.some(card=>!botDefinition(card)?.cannotAttack&&
      !autoRuleLegalPlay(p,card,"main","character"));
    const needsAttacker=available<attackLimit&&!handAttacker;
    const activeCombo=botSlots.slice(0,3).some(slot=>{
      const card=board[slot].at(-1);
      const cx=autoRuleBotComboCx(card);
      return autoRuleReadyAttacker(card)&&board.hand.some(entry=>sameBotCardNumber(cx,entry.id)&&
        !autoRuleLegalPlay(p,entry,"climax","climax",{planning:true}));
    });
    const wantsHand=brainstorms===0&&board.hand.length<6&&!activeCombo;
    if(brainstorms<2&&(needsAttacker||wantsHand)){
      for(const source of rear){
        if(source?.orientation!==0)continue;
        const losesAttacker=autoRuleReadyAttacker(source);
        const canRestAttacker=available>attackLimit||needsAttacker&&(available>1||brainstorms>0);
        if(losesAttacker&&!canRestAttacker)continue;
        const brainstorm=botDefinition(source)?.effects?.find(effect=>effect.brainstorm&&effect.brainstorm.stock<=board.stock.length)?.brainstorm;
        if(!brainstorm)continue;
        brainstorms++;
        resolveBrainstorm(p,source,brainstorm,tryBrainstorm);
        return;
      }
    }
    sideEffects();
  }
  function sideEffects(){
    const heiter=stellaStage(p).find(card=>frierenIs(card,"S136-005")&&stellaStageSlot(board,card).startsWith("back"));
    if(heiter&&board.hand.length<=3&&stellaStage(p).some(card=>card.orientation===180)){
      frierenHeiterSearch(p,heiter,playEvent);return;
    }
    const teresa=stellaStage(p).find(card=>stellaIs(card,"077")&&card.orientation===0);
    if(teresa&&board.hand.length&&board.waiting.some(card=>botDefinition(card)?.type==="character"&&
      botDefinition(card).stats.level>=1)){stellaTeresa(p,teresa,playEvent);return}
    playEvent();
  }
  function ensureAttacker(){
    if(players.some(b=>b.level.length>=4)||readyFront()>=attackLimit){done();return}
    const target=botSlots.slice(0,3).find(slot=>!autoRuleReadyAttacker(board[slot].at(-1)));
    if(!target){done();return}
    const rear=["back0","back1"].find(slot=>autoRuleReadyAttacker(board[slot].at(-1)));
    if(rear){
      [board[target],board[rear]]=[board[rear],board[target]];
      recordBotBattleAction(labels[rear]+" → "+labels[target]+"（攻撃に回す）",p,[board[target].at(-1)]);
      ensureAttacker();return;
    }
    const playable=board.hand.map((card,index)=>({card,index})).filter(({card})=>
      !botDefinition(card)?.cannotAttack&&!autoRuleLegalPlay(p,card,"main","character"));
    const next=playable.find(({card})=>autoRuleBotHasCombo(card,board.hand))??playable[0];
    if(next){autoRuleResolvePlay(p,next.index,target,ensureAttacker);return}
    done();
  }
  function playEvent(){
    if(players.some(b=>b.level.length>=4)){done();return}
    const frontCount=botSlots.slice(0,3).filter(slot=>board[slot].length).length;
    const hasRear=["back0","back1"].some(slot=>board[slot].length);
    const index=board.hand.findIndex(card=>{
      if(!autoRuleEventEffect(botDefinition(card))||autoRuleLegalPlay(p,card,"main","event"))return false;
      if(frierenIs(card,"S136-048"))return true;
      if(frierenIs(card,"S128-021"))return board.waiting.some(entry=>frierenIs(entry,"S128-017"))||!board.hand.some(entry=>entry.cx);
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
      if(isStellaDeck(match.bot.scenario)||isDeckMirror(match.bot.scenario)&&board.level.length<=1){
        const playable=card=>!autoRuleLegalPlay(p,card,"main","character",{planning:true});
        const available=board.hand.filter(playable).length;
        const hasGreen=[...board.level,...board.clock].some(card=>botDefinition(card)?.color==="緑");
        const hasGreenPayoff=board.hand.some(card=>{const def=botDefinition(card);return card.id.startsWith("SFN/")&&def?.color==="緑"&&def.stats.level>=2;});
        const greenForClock=!hasGreen&&hasGreenPayoff&&board.level.length>0?
          board.hand.findIndex(card=>card.id.startsWith("SFN/")&&botDefinition(card)?.color==="緑"&&botDefinition(card).stats.level===0):-1;
        const inPlay=stellaStage(p).concat(board.hand);
        const combos=inPlay.filter(card=>botDefinition(card)?.stats.level===1&&autoRuleBotHasCombo(card,board.hand));
        const plan=autoRuleBotEarlyPlan(p);
        const colors=new Set([...board.level,...board.clock].map(card=>botDefinition(card)?.color));
        const needsColors=[...combos.map(card=>botDefinition(card).color),...(plan?.colors??[])].filter(color=>!colors.has(color));
        const keep=card=>sameBotCardNumber(card.id,plan?.character)||sameBotCardNumber(card.id,plan?.cx)||
          combos.includes(card)||combos.some(source=>sameBotCardNumber(card.id,autoRuleBotComboCx(source)));
        const comboColor=board.level.length||board.clock.length>=3?
          board.hand.findIndex(card=>!keep(card)&&needsColors.includes(botDefinition(card)?.color)&&
            (board.level.length>0||!playable(card)||available>autoRuleAttackLimit(p))):-1;
        const spare=comboColor>=0?comboColor:greenForClock>=0?greenForClock:board.hand.findIndex(card=>!keep(card)&&!card.cx&&!playable(card));
        const readyOnStage=botSlots.filter(slot=>autoRuleReadyAttacker(board[slot].at(-1))).length;
        const costs=board.hand.filter(card=>playable(card)&&!botDefinition(card)?.cannotAttack)
          .map(card=>autoRulePlayCost(p,botDefinition(card))).sort((a,b)=>a-b);
        const missing=Math.max(0,autoRuleAttackLimit(p)-readyOnStage);
        const canFillFront=costs.length>=missing&&costs.slice(0,missing).reduce((sum,cost)=>sum+cost,0)<=board.stock.length;
        const hasOpeningPair=plan&&[plan.character,plan.cx].every(number=>inPlay.some(card=>sameBotCardNumber(card.id,number)));
        const canDrawForCombo=plan&&!hasOpeningPair&&spare>=0;
        if(comboColor<0&&greenForClock<0&&canFillFront&&!canDrawForCombo){
          autoRuleLog("Botは必要な攻撃回数を確保できるためクロックをスキップ");
          setTurnPhase("main");break;
        }
        const extraCx=board.hand.filter(card=>card.cx).length>1?board.hand.findIndex(card=>card.cx&&
          (!keep(card)||board.hand.some(entry=>entry!==card&&sameBotCardNumber(card.id,entry.id)))):-1;
        index=spare>=0?spare:extraCx>=0?extraCx:available>1?
          board.hand.findIndex(card=>!keep(card)&&!card.cx):-1;
      }
      if(!isDeckMirror(match.bot.scenario)||index<0||(!isStellaDeck(match.bot.scenario)&&board.hand.length>=7)||board.level.length>=3){
        setTurnPhase("main");break;
      }
      runRuleOperation(done=>{
        botMove(board,"hand",index,"clock");
        recordBotBattleAction("クロックで2枚ドロー",p);
        autoRuleDrawAfterCost(p,2,()=>{setTurnPhase("main");done()});
      });
      break;
    }
    case "main":{
      if(isDeckMirror(match.bot.scenario)){
        runRuleOperation(done=>autoRuleBotMain(p,()=>{
          autoRuleArrangeBotFront(p);
          const ready=botSlots.slice(0,3).filter(slot=>autoRuleAttackAllowed(p,slot,board[slot].at(-1))).length;
          recordBotBattleAction("メイン終了・攻撃可能 "+ready+"枚／手札 "+board.hand.length+"枚／ストック "+board.stock.length+"枚",p);
          setTurnPhase("climax");done();
        }));
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
      const attackers=botSlots.slice(0,3).map(slot=>board[slot].at(-1)).filter(autoRuleReadyAttacker);
      const combos=attackers.map(source=>({cx:autoRuleBotComboCx(source),level:botDefinition(source).stats.level}));
      const choices=board.hand.map((card,index)=>({card,index})).filter(({card})=>!autoRuleLegalPlay(p,card,"climax","climax"));
      const score=card=>combos.reduce((sum,{cx,level})=>
        sum+(sameBotCardNumber(cx,card.id)?(level===1?4:1):0),0);
      choices.sort((a,b)=>score(b.card)-score(a.card));
      const plan=autoRuleBotEarlyPlan(p);
      const choice=choices.find(({card})=>score(card)>0||isStellaDeck(match.bot.scenario)&&attackers.length&&
        (!sameBotCardNumber(card.id,plan?.cx)||board.hand.filter(entry=>sameBotCardNumber(entry.id,plan.cx)).length>1));
      const index=choice?.index??-1;
      if(!isDeckMirror(match.bot.scenario)||index<0||board.cx.length){setTurnPhase("attack");break}
      runRuleOperation(done=>autoRuleResolvePlay(p,index,"cx",()=>{
        match.turn.phase="attack";
        autoRuleAttackStart(done);
      }));
      break;
    }
    case "attack":{
      const [plan]=botSlots.slice(0,3).map(slot=>autoRuleBotAttackPlan(p,slot)).filter(Boolean)
        .sort((a,b)=>autoRuleBotAttackScore(b)-autoRuleBotAttackScore(a));
      if(!plan){recordBotBattleAction("アタック終了",p);encoreAction("enter");break}
      if(plan.wins)autoRuleLog("Botは"+stellaName(plan.target)+"を倒せるフロントを優先");
      if(plan.type==="direct")autoRuleLog("Botは空いている枠からダイレクトを優先");
      if(plan.type==="side")autoRuleLog("Botはサイドで"+stellaName(plan.attacker)+"を残す");
      autoRuleAttack(p,plan.slot,plan.attacker.uid,plan.type);
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
      while(board.hand.length>7){
        const index=board.hand.findIndex(card=>!autoRuleBotKeepsCombo(p,card));
        botMove(board,"hand",Math.max(index,0),"waiting");
      }
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
function resolveBrainstorm(p,source,{stock,reveal,salvage,traits},done){
  const board=players[p];
  autoRulePay(p,stock);
  source.orientation=90;
  const revealed=[],drawn=[];
  recordBotBattleAction("集中を使用・ストック−"+stock,p,[source]);
  function finishDraw(n){
    if(!n){
      recordBotBattleAction("集中で"+drawn.length+"枚ドロー",p,p===0?drawn:[]);
      if(p===0&&isDeckMirror(match.bot.scenario))showBotRevealResult("自分の集中・引いたカード",drawn,done);
      else done();
      return;
    }
    botRevealTop(p,card=>{card.faceUp=true;board.hand.push(card);drawn.push(card)},found=>{
      finishDraw(found?n-1:0);
    });
  }
  function confirm(){
    const max=revealed.filter(card=>card.cx===true).length;
    for(const card of revealed){card.faceUp=true;board.waiting.push(card)}
    recordBotBattleAction("集中・"+revealed.length+"枚公開・CX "+max+"枚",p,revealed);
    autoRuleLog(botPlayerLabel(p)+"・集中で"+revealed.length+"枚、CXが"+max+"枚（"+revealed.map(stellaName).join("、")+"）",false);
    resolveBoardRules(p,()=>{
      const title=(p===0?"自分":"Bot")+"の集中・CX "+max+"枚";
      const afterReveal=next=>isDeckMirror(match.bot.scenario)?showBotRevealResult(title,revealed,next):next();
      if(!max){afterReveal(done);return}
      if(p===1){afterReveal(()=>salvage?resolveBrainstormSalvage(p,max,revealed,done,traits):finishDraw(max));return}
      if(salvage){resolveBrainstormSalvage(p,max,revealed,done,traits);return}
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


function resolveBrainstormSalvage(p,max,revealed,done,traits){
  const board=players[p];
  const candidates=board.waiting.filter(card=>botDefinition(card)?.type==="character"&&(!traits||traits.some(trait=>matchesPracticeTrait(card,trait))));
  const limit=Math.min(max,candidates.length);
  if(!limit){
    if(p===0&&isDeckMirror(match.bot.scenario))showBotRevealResult("集中・回収できるキャラがありません",revealed,done);
    else done();
    return;
  }
  const picks=new Set();
  function finish(){
    const recovered=[];
    for(const uid of picks){
      const index=board.waiting.findIndex(card=>card.uid===uid);
      if(index>=0)recovered.push(botMove(board,"waiting",index,"hand"));
    }
    const entry=recordBotBattleAction("集中で"+recovered.length+"枚を手札に回収",p,recovered);
    if(recovered.length)match.bot.latestRecovery=entry;
    autoRuleLog("集中でキャラ"+recovered.length+"枚を手札へ",false);
    if(isDeckMirror(match.bot.scenario))showBotRevealResult(botPlayerLabel(p)+"の集中・手札に回収",recovered,done);
    else done();
  }
  if(p===1){
    candidates.sort((a,b)=>autoRuleBotRecoveryPriority(p,b)-autoRuleBotRecoveryPriority(p,a));
    for(const card of candidates.slice(0,limit))picks.add(card.uid);
    finish();return;
  }
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
