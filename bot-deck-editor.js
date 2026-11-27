"use strict";

let botDeckEditorOpen=false;

(()=>{
  const get=id=>document.getElementById(id);
  const key="ws-stella-bot-decks-v1";
  const presets={daqbe:stellaDeck,trial:stellaTrialDeck};
  const tabs=[get("editOwnBotDeck"),get("editOpponentBotDeck")];
  const list=get("botDeckCardRows"), totals=get("botDeckTotals"), notice=get("botDeckEditorNotice");
  const start=get("startEditedBotBattle"), apply=get("applyBotDeckPreset");
  let counts, cards=[], editing=0;
  const rowUpdates=[];
  const fromPreset=deck=>Object.fromEntries(deck.cards.map(({id,num})=>[id,num]));

  function loadCounts(){
    try{
      const saved=JSON.parse(localStorage.getItem(key));
      if(Array.isArray(saved)&&saved.length===2&&saved.every(item=>item&&typeof item==="object")){
        return saved.map(item=>Object.fromEntries(cards
          .map(card=>[card.cardNumber,item[card.cardNumber]])
          .filter(([,num])=>Number.isInteger(num)&&num>=1&&num<=4)));
      }
    }catch{}
    return [fromPreset(stellaDeck),fromPreset(stellaDeck)];
  }
  function saveCounts(){
    try{
      localStorage.setItem(key,JSON.stringify(counts));
      notice.textContent="";
    }catch{
      notice.textContent="端末に保存できません。この画面では編集を続けられます。";
    }
  }
  function buildDeck(p){
    return {
      title:p===0?"自分のステラソラ":"Botのステラソラ",
      cards:cards.flatMap(card=>{
        const id=card.cardNumber,num=counts[p][id];
        return num?[{id,num,cx:card.type==="climax"}]:[];
      })
    };
  }
  function refreshCounts(){
    const summaries=[0,1].map(p=>buildDeck(p).cards.reduce((sum,card)=>({
      total:sum.total+card.num,cx:sum.cx+(card.cx?card.num:0)
    }),{total:0,cx:0}));
    totals.textContent=summaries.map(({total,cx},p)=>
      (p===0?"自分":"Bot")+" "+total+"/50枚（CX "+cx+"/8枚）").join(" ／ ");
    start.disabled=!summaries.every(({total,cx})=>total===50&&cx===8);
    tabs.forEach((tab,p)=>tab.setAttribute("aria-pressed",String(p===editing)));
    rowUpdates.forEach(update=>update());
  }
  function renderRows(){
    list.replaceChildren();
    rowUpdates.length=0;
    for(const card of cards){
      const id=card.cardNumber, row=document.createElement("li");
      row.className="bot-deck-card-row";
      const label=document.createElement("div");
      label.textContent=card.name;
      const info=document.createElement("small");
      info.textContent=id+" ／ "+card.color+" ／ "+(card.type==="climax"?"CX":(card.type==="event"?"イベント ":"")+"Lv"+card.stats.level);
      label.append(info);
      const controls=document.createElement("div");
      controls.className="bot-deck-count";
      const amount=document.createElement("span");
      const minus=document.createElement("button"), plus=document.createElement("button");
      minus.textContent="−";
      minus.setAttribute("aria-label",card.name+"を1枚減らす");
      plus.textContent="＋";
      plus.setAttribute("aria-label",card.name+"を1枚増やす");
      function change(delta){
        const num=(counts[editing][id]??0)+delta;
        if(num<0||num>4)return;
        if(num)counts[editing][id]=num;
        else delete counts[editing][id];
        saveCounts();
        refreshCounts();
      }
      minus.onclick=()=>change(-1);
      plus.onclick=()=>change(1);
      rowUpdates.push(()=>{
        const num=counts[editing][id]??0;
        amount.textContent=String(num);
        minus.disabled=num===0;
        plus.disabled=num===4;
      });
      controls.append(minus,amount,plus);
      row.append(label,controls);
      list.append(row);
    }
  }

  get("openBotDeckEditor").onclick=async()=>{
    if(!isDeckSetup())return;
    botDeckEditorOpen=true;
    showMatchScreen();
    if(counts)return;
    notice.textContent="カードデータを読み込んでいます";
    apply.disabled=true;
    await botCatalogReady;
    if(!botCatalog){
      notice.textContent="カードデータを読み込めませんでした。ページを再読み込みしてください。";
      return;
    }
    if(counts)return;
    cards=botCatalog.cards.filter(card=>card.cardNumber.startsWith("STS/")).sort((a,b)=>
      Number(a.type==="climax")-Number(b.type==="climax")||a.cardNumber.localeCompare(b.cardNumber));
    counts=loadCounts();
    renderRows();
    refreshCounts();
    notice.textContent="";
    apply.disabled=false;
  };
  get("closeBotDeckEditor").onclick=()=>{
    botDeckEditorOpen=false;
    showMatchScreen();
  };
  tabs.forEach((tab,p)=>{
    tab.onclick=()=>{
      editing=p;
      if(counts)refreshCounts();
    };
  });
  apply.onclick=()=>{
    const preset=presets[get("botDeckPreset").value];
    if(!counts||!preset)return;
    counts[editing]=fromPreset(preset);
    saveCounts();
    refreshCounts();
  };
  start.onclick=()=>{
    if(start.disabled||!counts)return;
    if(onlineMatch?.active()){
      notice.textContent="オンラインルームを退出してから開始してください";
      return;
    }
    startBotMatch(buildDeck(0),stellaCustomScenario,buildDeck(1));
    if(isDeckSetup())notice.textContent="対戦を開始できません。端末の保存設定を確認してください。";
  };
})();
