"use strict";

let botDeckEditorOpen=false;

const connectOnlineDeckBuilder=(()=>{
  const get=id=>document.getElementById(id);
  const key="ws-stella-bot-decks-v1";
  const presets={daqbe:stellaDeck,trial:stellaTrialDeck};
  const tabs=[get("editOwnBotDeck"),get("editOpponentBotDeck")];
  const list=get("botDeckCardRows"), totals=get("botDeckTotals"), notice=get("botDeckEditorNotice");
  const start=get("startEditedBotBattle"), apply=get("applyBotDeckPreset");
  const save=get("saveBuiltOnlineDeck"), deckName=get("builtOnlineDeckName");
  let counts,cards=[],editing=0,online=false,onlineDraft={};
  const currentDeck=()=>online?onlineDraft:counts[editing];
  const rowUpdates=[];
  const variants=card=>CardCatalog.cardNumbers(card);
  const totalCopies=(deck,ids)=>ids.reduce((sum,id)=>sum+(deck[id]??0),0);
  const fromPreset=deck=>Object.fromEntries(deck.cards.map(({id,num})=>[id,num]));

  function loadCounts(){
    try{
      const saved=JSON.parse(localStorage.getItem(key));
      if(Array.isArray(saved)&&saved.length===2&&saved.every(item=>item&&typeof item==="object")){
        return saved.map(item=>Object.fromEntries(cards.flatMap(card=>{
          let left=4;
          return variants(card).flatMap(id=>{
            const savedCount=item[id];
            if(!Number.isInteger(savedCount)||savedCount<1||savedCount>4||left===0)return [];
            const num=Math.min(savedCount,left);
            left-=num;
            return [[id,num]];
          });
        })));
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
  function buildDeck(countsForDeck,title){
    return {
      title,
      cards:cards.flatMap(card=>variants(card).flatMap(id=>{
        const num=countsForDeck[id];
        return num?[{id,num,cx:card.type==="climax"}]:[];
      }))
    };
  }
  function summarize(deck){
    return buildDeck(deck).cards.reduce((sum,card)=>({
      total:sum.total+card.num,cx:sum.cx+(card.cx?card.num:0)
    }),{total:0,cx:0});
  }
  const complete=({total,cx})=>total===50&&cx===8;
  const describe=({total,cx})=>total+"/50枚（CX "+cx+"/8枚）";
  function refreshCounts(){
    if(online){
      const summary=summarize(onlineDraft);
      totals.textContent=describe(summary);
      save.disabled=!deckName.value.trim()||!complete(summary);
    }else{
      const summaries=counts.map(summarize);
      totals.textContent=summaries.map((summary,p)=>(p===0?"自分":"Bot")+" "+describe(summary)).join(" ／ ");
      start.disabled=!summaries.every(complete);
      tabs.forEach((tab,p)=>tab.setAttribute("aria-pressed",String(p===editing)));
    }
    rowUpdates.forEach(update=>update());
  }
  function renderRows(){
    list.replaceChildren();
    rowUpdates.length=0;
    for(const card of cards){
      const ids=variants(card),row=document.createElement("li");
      let selectedId=ids.find(id=>currentDeck()[id])??card.cardNumber;
      let previewId;
      row.className="bot-deck-card-row";
      const label=document.createElement("div");
      label.className="bot-deck-card-info";
      label.textContent=card.name;
      const preview=document.createElement("div");
      preview.className="bot-deck-card-preview carddetail";
      const info=document.createElement("small");
      info.textContent=card.cardNumber+" ／ "+card.color+" ／ "+(card.type==="climax"?"CX":(card.type==="event"?"イベント ":"")+"Lv"+card.stats.level);
      label.append(info);
      const editions=document.createElement("select");
      const editionNames=ids.map(id=>({S:"SR",R:"RRR"}[id.slice(card.cardNumber.length)]??(id.slice(card.cardNumber.length)||"通常")));
      if(ids.length>1){
        editions.className="bot-deck-edition";
        editions.setAttribute("aria-label",card.name+"のバージョン");
        for(const id of ids){
          const option=document.createElement("option");
          option.value=id;
          editions.append(option);
        }
        editions.value=selectedId;
        editions.onchange=()=>{
          if(!ids.includes(editions.value))return;
          selectedId=editions.value;
          updateRow();
        };
        label.append(editions);
      }
      const controls=document.createElement("div");
      controls.className="bot-deck-count";
      const amount=document.createElement("span");
      const minus=document.createElement("button"), plus=document.createElement("button");
      minus.textContent="−";
      plus.textContent="＋";
      function change(delta){
        const deck=currentDeck(),num=(deck[selectedId]??0)+delta;
        if(num<0||(delta>0&&totalCopies(deck,ids)>=4))return;
        if(num)deck[selectedId]=num;
        else delete deck[selectedId];
        if(!online)saveCounts();
        refreshCounts();
      }
      minus.onclick=()=>change(-1);
      plus.onclick=()=>change(1);
      function updateRow(){
        const deck=currentDeck(),num=deck[selectedId]??0;
        const edition=selectedId===card.cardNumber?"":"（"+editionNames[ids.indexOf(selectedId)]+"）";
        if(previewId!==selectedId){
          previewId=selectedId;
          preview.replaceChildren();
          addCardImage(preview,{id:selectedId},card.name+edition,effectChoiceImageUrl);
        }
        amount.textContent=String(num);
        minus.setAttribute("aria-label",card.name+edition+"を1枚減らす");
        plus.setAttribute("aria-label",card.name+edition+"を1枚増やす");
        minus.disabled=num===0;
        plus.disabled=totalCopies(deck,ids)>=4;
        for(const [index,id] of ids.entries()){
          if(ids.length>1)editions.children[index].textContent=editionNames[index]+" · "+(deck[id]??0)+"枚";
        }
      }
      rowUpdates.push(updateRow);
      controls.append(minus,amount,plus);
      row.append(label,controls,preview);
      list.append(row);
    }
  }

  async function openEditor(forOnline){
    if(!isDeckSetup())return;
    online=forOnline;
    botDeckEditorOpen=true;
    get("deckEditorTitle").textContent=online?"オンライン用デッキ作成":"Bot戦デッキ編集";
    get("onlineDeckBuilderFields").hidden=!online;
    start.hidden=online;
    save.hidden=!online;
    for(const tab of tabs)tab.hidden=online;
    showMatchScreen();
    if(!counts){
      notice.textContent="カードデータを読み込んでいます";
      apply.disabled=true;
      save.disabled=true;
      await botCatalogReady;
      if(!botDeckEditorOpen)return;
      if(!botCatalog){
        notice.textContent="カードデータを読み込めませんでした。ページを再読み込みしてください。";
        return;
      }
      if(!counts){
        cards=botCatalog.cards.filter(card=>card.cardNumber.startsWith("STS/")).sort((a,b)=>
          Number(a.type==="climax")-Number(b.type==="climax")||a.cardNumber.localeCompare(b.cardNumber));
        counts=loadCounts();
      }
    }
    notice.textContent="";
    renderRows();
    refreshCounts();
    apply.disabled=false;
  }
  function closeEditor(){
    botDeckEditorOpen=false;
    showMatchScreen();
  }
  get("openBotDeckEditor").onclick=()=>openEditor(false);
  get("openOnlineDeckBuilder").onclick=()=>openEditor(true);
  get("closeBotDeckEditor").onclick=closeEditor;
  deckName.oninput=()=>{if(counts&&online)refreshCounts()};
  tabs.forEach((tab,p)=>{
    tab.onclick=()=>{
      editing=p;
      if(counts)refreshCounts();
    };
  });
  apply.onclick=()=>{
    const preset=presets[get("botDeckPreset").value];
    if(!counts||!preset)return;
    if(online)onlineDraft=fromPreset(preset);
    else{
      counts[editing]=fromPreset(preset);
      saveCounts();
    }
    renderRows();
    refreshCounts();
  };
  start.onclick=()=>{
    if(start.disabled||!counts||online)return;
    if(onlineMatch?.active()){
      notice.textContent="オンラインルームを退出してから開始してください";
      return;
    }
    startBotMatch(buildDeck(counts[0],"自分のステラソラ"),stellaCustomScenario,buildDeck(counts[1],"Botのステラソラ"));
    if(isDeckSetup())notice.textContent="対戦を開始できません。端末の保存設定を確認してください。";
  };
  return storeDeck=>{
    save.onclick=()=>{
      if(!online||!botDeckEditorOpen||!counts||save.disabled)return;
      try{
        const title=deckName.value.trim();
        if(!title||!complete(summarize(onlineDraft)))return;
        const id=storeDeck(buildDeck(onlineDraft,title));
        onlineDraft={};
        deckName.value="";
        closeEditor();
        get("onlineControls").open=true;
        onlineMatch?.refreshDecks();
        get("onlineDeck").value=id;
        get("onlineStatus").textContent="「"+title+"」を保存しました。ルームでこのデッキを選べます。";
      }catch(error){
        notice.textContent=error.message;
      }
    };
  };
})();
