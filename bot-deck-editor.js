"use strict";

let botDeckEditorOpen=false;

const connectDeckBuilder=(()=>{
  const get=id=>document.getElementById(id);
  const key="ws-stella-bot-decks-v1";
  const sendaiDeck={
    cards:[
      ["004",4],["003",3],["076",1],["024",4],["023",1],["022",1],["002",4],
      ["019",1],["008",4],["001",4],["T03",4],["025",2],["035",2],["071",4],
      ["030",3],["031",4],["032",4]
    ].map(([number,num])=>({id:"STS/W140-"+number,num}))
  };
  const presets={
    daqbe:{deck:stellaDeck,url:"https://ws-tcg.com/deckrecipe/5855/"},
    sendai:{deck:sendaiDeck,url:"https://ws-tcg.com/deckrecipe/5856/"},
    trial:{deck:stellaTrialDeck},
    frierenGreen:{deck:frierenGreenDeck},
    frieren:{deck:frierenDeck,url:"https://ws-tcg.com/deckrecipe/5856/"},
    empty:{deck:{cards:[]}}
  };
  const tabs=[get("editOwnBotDeck"),get("editOpponentBotDeck"),get("editNewDeck")];
  const list=get("botDeckCardRows"), totals=get("botDeckTotals"), notice=get("botDeckEditorNotice");
  const start=get("startEditedBotBattle"), apply=get("applyBotDeckPreset");
  const save=get("saveBuiltOnlineDeck"), deckName=get("builtOnlineDeckName");
  const presetSelect=get("botDeckPreset"), savedSelect=get("loadBuilderDeck");
  const load=get("applyBuilderDeck"), titleFilter=get("builderTitleFilter");
  let counts,cards=[],editing=0,openedFromOnline=false,newDraft={},readSavedDecks;
  const newDeck=()=>editing===2;
  const currentDeck=()=>newDeck()?newDraft:counts[editing];
  function setCurrentDeck(deck){
    if(newDeck())newDraft=deck;
    else{
      counts[editing]=deck;
      saveCounts();
    }
  }
  function refreshPresetSource(){
    const preset=presets[presetSelect.value];
    get("botDeckPresetSource").hidden=!preset?.url;
    if(preset?.url)get("botDeckPresetLink").href=preset.url;
  }
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
  const groups=deck=>new Set(Object.keys(deck).map(id=>id.split("/")[0]));
  const gameTitle=deck=>groups(deck).has("SFN")?"葬送のフリーレン":"ステラソラ";
  function showDeckTitle(deck){
    titleFilter.value=groups(deck).has("SFN")?"SFN":"STS";
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
    }),{total:0,cx:0,mixed:groups(deck).size>1});
  }
  const complete=({total,cx,mixed})=>total===50&&cx===8&&!mixed;
  const describe=({total,cx,mixed})=>total+"/50枚（CX "+cx+"/8枚）"+(mixed?" ／ タイトルを1つにそろえてください":"");
  function refreshCounts(){
    const summaries=counts.map(summarize);
    totals.textContent=newDeck()?describe(summarize(newDraft)):
      summaries.map((summary,p)=>(p===0?"自分":"Bot")+" "+describe(summary)).join(" ／ ");
    save.disabled=!deckName.value.trim()||!complete(summarize(currentDeck()));
    start.disabled=!summaries.every(complete);
    start.hidden=newDeck();
    tabs.forEach((tab,p)=>tab.setAttribute("aria-pressed",String(p===editing)));
    rowUpdates.forEach(update=>update());
  }
  function renderRows(){
    list.replaceChildren();
    rowUpdates.length=0;
    for(const card of cards.filter(card=>card.cardNumber.startsWith((titleFilter.value||"STS")+"/"))){
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
        if(!newDeck())saveCounts();
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

  function supportedDecks(){
    const cardNumbers=new Set(cards.flatMap(variants));
    return readSavedDecks().filter(({deck})=>{
      if(!deck.cards.every(({id})=>cardNumbers.has(id)))return false;
      const deckCounts=fromPreset(deck);
      return complete(summarize(deckCounts))&&cards.every(card=>totalCopies(deckCounts,variants(card))<=4);
    });
  }
  function refreshSavedDecks(){
    const selected=savedSelect.value;
    const options=supportedDecks();
    savedSelect.replaceChildren();
    const empty=document.createElement("option");
    empty.value="";
    empty.textContent=options.length?"デッキを選択":"対応する保存済みデッキなし";
    savedSelect.append(empty);
    for(const {id,deck} of options){
      const option=document.createElement("option");
      option.value=id;
      option.textContent=deck.title;
      savedSelect.append(option);
    }
    savedSelect.value=options.some(({id})=>id===selected)?selected:"";
    load.disabled=!savedSelect.value;
  }
  function selectTab(index){
    editing=index;
    if(!counts)return;
    notice.textContent="";
    deckName.value="";
    showDeckTitle(currentDeck());
    renderRows();
    refreshCounts();
  }
  async function openEditor(forOnline){
    if(!isDeckSetup())return;
    openedFromOnline=forOnline;
    botDeckEditorOpen=true;
    selectTab(forOnline?2:0);
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
        cards=botCatalog.cards.filter(card=>/^(STS|SFN)\//.test(card.cardNumber)).sort((a,b)=>
          Number(a.type==="climax")-Number(b.type==="climax")||a.cardNumber.localeCompare(b.cardNumber));
        counts=loadCounts();
      }
      selectTab(editing);
    }
    refreshSavedDecks();
    refreshPresetSource();
    apply.disabled=false;
  }
  function closeEditor(){
    botDeckEditorOpen=false;
    showMatchScreen();
  }
  get("openBotDeckEditor").onclick=()=>openEditor(false);
  get("openOnlineDeckBuilder").onclick=()=>openEditor(true);
  get("closeBotDeckEditor").onclick=closeEditor;
  deckName.oninput=()=>{if(counts)refreshCounts()};
  tabs.forEach((tab,p)=>{tab.onclick=()=>selectTab(p)});
  savedSelect.onchange=()=>{load.disabled=!savedSelect.value};
  load.onclick=()=>{
    const saved=supportedDecks().find(({id})=>id===savedSelect.value);
    if(!saved){refreshSavedDecks();return}
    setCurrentDeck(fromPreset(saved.deck));
    showDeckTitle(currentDeck());
    deckName.value=saved.deck.title;
    renderRows();
    refreshCounts();
  };
  titleFilter.onchange=()=>{renderRows();refreshCounts()};
  presetSelect.onchange=refreshPresetSource;
  apply.onclick=()=>{
    const preset=presets[presetSelect.value];
    if(!counts||!preset)return;
    setCurrentDeck(fromPreset(preset.deck));
    showDeckTitle(currentDeck());
    renderRows();
    refreshCounts();
  };
  start.onclick=()=>{
    if(start.disabled||!counts||newDeck())return;
    if(onlineMatch?.active()){
      notice.textContent="オンラインルームを退出してから開始してください";
      return;
    }
    startBotMatch(buildDeck(counts[0],gameTitle(counts[0])),stellaCustomScenario,buildDeck(counts[1],gameTitle(counts[1])));
    if(isDeckSetup())notice.textContent="対戦を開始できません。端末の保存設定を確認してください。";
  };
  return (getDecks,storeDeck)=>{
    readSavedDecks=getDecks;
    save.onclick=()=>{
      if(!botDeckEditorOpen||!counts||save.disabled)return;
      try{
        const title=deckName.value.trim();
        if(!title||!complete(summarize(currentDeck())))return;
        const id=storeDeck(buildDeck(currentDeck(),title));
        if(openedFromOnline&&newDeck()){
          newDraft={};
          deckName.value="";
          closeEditor();
          get("onlineControls").open=true;
          onlineMatch?.refreshDecks();
          get("onlineDeck").value=id;
          get("onlineStatus").textContent="「"+title+"」を保存しました。ルームでこのデッキを選べます。";
        }else{
          refreshSavedDecks();
          notice.textContent="「"+title+"」を共通のデッキ一覧に保存しました。";
        }
      }catch(error){
        notice.textContent=error.message;
      }
    };
  };
})();
