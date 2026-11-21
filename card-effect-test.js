"use strict";

(() => {
  const $ = id => document.getElementById(id);
  const {sides,zones} = WSEffects;
  const displayZones = {...zones,markers:"マーカー"};
  const typeNames = {character:"キャラ",event:"イベント",climax:"CX"};
  const phaseNames = {conditions:"条件",costs:"支払い",target:"対象",steps:"処理",limit:"使用回数"};
  const results = {success:"解決",invalid:"定義エラー",unsupported:"未実装",failed:"途中停止",
    unconfirmed:"未確認",skipped:"任意効果を辞退","needs-choice":"再選択が必要","condition-not-met":"使用できません"};
  const params=new URLSearchParams(location.search);
  const solo=params.get("mode")==="solo";
  let firenPractice=false, practiceSide="self";
  let catalog, card, sample;
  let board = WSEffects.emptyBoard(), turn = 1, used = new Map(), serial = 0, selected = null;
  let undo = null, lastStart = null, session = null;

  function node(tag,text=""){
    const el=document.createElement(tag);
    el.textContent=text;
    return el;
  }
  function button(text,action){
    const el=node("button",text);
    el.type="button";
    el.onclick=action;
    return el;
  }
  function options(el,entries){
    el.replaceChildren(...entries.map(([value,label])=>new Option(label,value)));
  }
  const makeOptions=(el,items)=>options(el,Object.entries(items));
  const effect=()=>card?.effects?.find(item=>item.id===$("testEffect").value);
  const name=entry=>entry.name??(solo&&entry.cardNumber==="STS/W140-001"?"黎明の刻 レイス":entry.cardNumber);
  const tags=id=>[...new Set($(id).value.split(/[,、]/).map(item=>item.trim()).filter(Boolean))];
  const numeric=id=>$(id).value.trim()===""?null:Number($(id).value);
  const label=(side,zone)=>sides[side]+"の"+displayZones[zone];
  const copy=structuredClone;
  const snapshot=()=>({board:copy(board),turn,used:new Map(used)});
  function restore(state){
    ({board,turn,used}=copy(state));
    selected=null;
    undo=null;
    render();
  }
  function allCards(state){
    return WSEffects.cardsIn(state).flatMap(entry=>[entry,...(entry.card.markers??[])
      .map(card=>({card,side:entry.side,zone:"markers",host:entry.card}))]);
  }

  function clearResults(){
    $("resultVerification").hidden=true;
    $("resultVerification").replaceChildren();
    for(const id of ["effectResult","beforeBoard","afterBoard","resultChanges","compareResults","effectLog"])$(id).replaceChildren();
  }

  function cardButton(entry,action,pressed=false){
    const el=button("",action);
    el.className="lab-card";
    el.setAttribute("aria-pressed",String(pressed));
    el.append(node("strong",name(entry)));
    const powerShown=entry.shownPower??entry.power;
    const soulShown=entry.shownSoul??entry.soul;
    const details=[entry.name&&entry.cardNumber,typeNames[entry.type],entry.level!=null?"Lv "+entry.level:"",
      entry.cost!=null?"コスト "+entry.cost:"",powerShown!=null?"パワー "+powerShown:"",soulShown!=null?"ソウル "+soulShown:"",
      entry.triggers?.length?"トリガー "+entry.triggers.join("、"):""].filter(Boolean);
    if(details.length) el.append(node("small",details.join(" ／ ")));
    for(const [key,title] of [["traits","特徴"],["keywords","キーワード能力"]]){
      const values=WSEffects.effectiveTags(entry,key);
      if(values?.length) el.append(node("small",title+" "+values.join("、")));
    }
    return el;
  }

  function displayedCard(entry,side,zone,modifiers){
    if(zone!=="stage"||entry.type!=="character")return entry;
    const cx=modifiers.get(entry.uid);
    let power=cx?.power??entry.power;
    const definition=catalog&&WSFormalCards.find(catalog,entry.cardNumber);
    if(practiceSide===side&&power!=null){
      for(const ability of definition?.effects?.filter(item=>item.type==="continuous"&&item.timing==="own_turn")??[]){
        const selection=ability.steps.find(step=>step.handler==="selectCards")?.params.as;
        if(!selection)continue;
        const relativeBoard=side==="self"?board:{self:board.opponent,opponent:board.self};
        const result=WSEffects.run(ability,relativeBoard,{sourceUid:entry.uid,[selection]:[entry.uid]});
        if(result.status==="success")power+=result.state.self.stage.find(card=>card.uid===entry.uid).power-entry.power;
      }
    }
    return {...entry,shownPower:power,shownSoul:cx?.soul??entry.soul};
  }

  function renderBoard(){
    const el=$("boardEditor"),open=new Set([...el.querySelectorAll("details[open]")].map(d=>d.dataset.key));
    el.replaceChildren();
    el.classList.toggle("firen-practice",firenPractice);
    for(const [side,sideName] of Object.entries(sides)){
      if(firenPractice&&side==="opponent")continue;
      const section=node("section");section.className="effect";
      const modifiers=new Map(WSEffects.continuousModifiers(board,side).map(stat=>[stat.uid,stat]));
      section.append(node("h3",sideName));
      for(const [zone,title] of Object.entries(displayZones)){
        const entries=zone==="markers"?allCards(board).filter(x=>x.side===side&&x.zone===zone).reverse():
          board[side][zone].slice().reverse().map(card=>({card}));
        const details=node("details");details.dataset.key=side+"."+zone;
        details.open=open.has(details.dataset.key);
        details.append(node("summary",title+" （"+entries.length+"枚）"));
        const cards=node("div");cards.className="lab-cards";
        const hide=session&&(["deck","stock"].includes(zone)||side==="opponent"&&zone==="hand");
        if(hide)cards.append(node("p","非公開"));
        else for(const entry of entries){
          const pick=cardButton(displayedCard(entry.card,side,zone,modifiers),()=>{selected=entry.card.uid;renderBoard();renderEditor()},selected===entry.card.uid);
          pick.disabled=!!session;
          if(entry.host)pick.append(node("small","持ち主 "+name(entry.host)));
          cards.append(pick);
          if((solo||firenPractice)&&!session&&side==="self"&&selected===entry.card.uid)renderSoloActions(cards,entry.card,zone);
        }
        details.append(cards);
        section.append(details);
      }
      el.append(section);
    }
  }

  function refreshDestination(prefix){
    const isMarker=$(prefix+"Zone").value==="markers",side=$(prefix+"Side").value;
    const el=$(prefix+"MarkerHost"),current=el.value;
    const entries=board[side].stage.filter(card=>prefix!=="edit"||card.uid!==selected);
    options(el,entries.map((entry,i)=>[entry.uid,name(entry)+"（舞台 "+(i+1)+"）"]));
    if(entries.some(entry=>entry.uid===current))el.value=current;
    $(prefix+"MarkerLabel").hidden=!isMarker;
  }
  function destination(prefix){
    const side=$(prefix+"Side").value,zone=$(prefix+"Zone").value;
    if(zone!=="markers")return {side,zone,pile:board[side][zone]};
    const host=board[side].stage.find(entry=>entry.uid===$(prefix+"MarkerHost").value);
    if(!host)return null;
    return {side,zone,host,pile:host.markers};
  }
  function editEntry(){
    return allCards(board).find(entry=>entry.card.uid===selected);
  }
  function renderEditor(){
    const entry=editEntry();
    $("editCard").hidden=!entry||!!session;
    if(entry){
      $("editCardName").textContent=name(entry.card)+" ／ "+label(entry.side,entry.zone);
      refreshDestination("edit");
    }
  }

  function usageKey(uid,ability=effect(),definition=card){return JSON.stringify([definition.cardNumber,ability.id,uid]);}
  function render(){
    $("turnNumber").textContent=turn+"ターン目";
    const ability=effect();
    const usage=ability?.limit?.perTurn?WSEffects.cardsIn(board).filter(entry=>entry.side==="self"&&matches(entry.card)):
      [];
    const spent=usage.filter(entry=>(used.get(usageKey(entry.card.uid))??0)>=ability.limit.perTurn).length;
    $("turnUsed").textContent=ability?.limit?.perTurn?"ターン"+ability.limit.perTurn+"回 ／ 使用済み "+spent+"枚":"";
    $("undoBoard").disabled=!undo||!!session;
    for(const id of ["nextTurn","resetEffectTest","loadPractice","loadFiren","loadSample","testEffect","testCard","testProduct"])$(id).disabled=!!session||(id==="testEffect"&&!ability);
    $("placeCard").querySelectorAll("input,select,button").forEach(el=>el.disabled=!!session);
    $("cancelEffect").hidden=!session;
    $("restoreStart").hidden=!lastStart||!!session;
    $("repeatTest").hidden=!lastStart||!!session;
    $("runEffectTest").hidden=solo||firenPractice;
    $("firenActions").hidden=!firenPractice;
    $("checkTrigger").disabled=!!session||!board.self.deck.length;
    $("togglePracticeTurn").disabled=!!session;
    $("togglePracticeTurn").textContent=practiceSide==="self"?"相手ターンのパワーを見る":"自分ターンのパワーに戻す";
    $("runEffectTest").disabled=!ability||!!session;
    document.querySelector("#testFind button").disabled=!!session;
    refreshDestination("place");
    renderBoard();
    renderEditor();
  }
  for(const prefix of ["place","edit"]){
    makeOptions($(prefix+"Side"),sides);
    makeOptions($(prefix+"Zone"),displayZones);
    $(prefix+"Side").onchange=$(prefix+"Zone").onchange=()=>refreshDestination(prefix);
  }

  function isOnPlay(ability){return ability?.timing==="from_hand_to_stage"}
  function matches(entry){
    return !!card&&(entry.cardNumber===card.cardNumber||CardCatalog.cardNumbers(card).includes(entry.cardNumber));
  }
  function changeBoard(next){
    undo=snapshot();
    next();
    render();
  }

  function formalCard(entry,number=entry.cardNumber){
    return {uid:"test-"+(++serial),cardNumber:number,name:entry.name??null,type:entry.type??null,
      ...Object.fromEntries(["level","cost","power","soul"].map(key=>[key,entry.stats?.[key]??null])),
      traits:entry.traits??null,keywords:entry.keywords??null,triggers:entry.triggers??null};
  }
  function temporaryCard(fields){
    return {uid:"test-"+(++serial),cardNumber:"仮カード",type:"character",level:0,traits:[],keywords:[],triggers:[],...fields};
  }
  $("placeNumber").onchange=()=>$("mockFields").hidden=$("placeNumber").value!=="mock";
  $("placeCard").onsubmit=event=>{
    event.preventDefault();
    if(session)return;
    const dest=destination("place"),amount=Number($("placeCount").value);
    const fields=Object.fromEntries(["level","cost","power","soul"].map(key=>[key,numeric("mock"+key[0].toUpperCase()+key.slice(1))]));
    const value=$("placeNumber").value,isMock=value==="mock";
    const formal=catalog&&WSFormalCards.find(catalog,value);
    if(!dest||!Number.isInteger(amount)||amount<1||amount>50||!isMock&&!formal||
       isMock&&Object.values(fields).some(n=>n!==null&&!Number.isSafeInteger(n))){
      $("boardStatus").textContent="カード、配置先、枚数と数値を確認してください。";return;
    }
    const changes={traitChanges:{added:tags("traitsAdded"),removed:tags("traitsRemoved")},
      keywordChanges:{added:tags("keywordsAdded"),disabled:tags("keywordsDisabled")}};
    changeBoard(()=>{
      const pile=dest.host?(dest.host.markers??=[]):dest.pile;
      for(let i=0;i<amount;i++){
        const entry=isMock?temporaryCard({name:$("mockName").value.trim()||"仮カード",type:$("mockType").value,
          ...fields,traits:tags("mockTraits"),keywords:tags("mockKeywords"),triggers:tags("mockTriggers")}):formalCard(formal,value);
        for(const [key,list] of Object.entries(changes))if(Object.values(list).some(values=>values.length))entry[key]=list;
        pile.push(entry);
      }
    });
    $("boardStatus").textContent=label(dest.side,dest.zone)+"に"+amount+"枚配置しました。";
    const position=$("boardEditor").querySelector('[data-key="'+dest.side+"."+dest.zone+'"]');
    if(position)position.open=true;
  };
  function moveEntry(entry,dest,position){
    const source=entry.host?.markers??board[entry.side][entry.zone];
    source.splice(source.indexOf(entry.card),1);
    const target=dest.host?(dest.host.markers??=[]):dest.pile;
    if(position==="bottom")target.unshift(entry.card);
    else target.push(entry.card);
  }
  $("editCard").onsubmit=event=>{
    event.preventDefault();
    const entry=editEntry(),dest=destination("edit");
    if(session||!entry||!dest)return;
    if(dest.host&&entry.card.markers?.length){
      $("boardStatus").textContent="先に付いているマーカーを移動してください。";return;
    }
    const before=snapshot();
    changeBoard(()=>moveEntry(entry,dest,$("editPosition").value));
    $("boardStatus").textContent=name(entry.card)+"を"+label(dest.side,dest.zone)+"に移動しました。";
    if((solo||firenPractice)&&dest.side==="self"&&dest.zone==="stage"&&entry.side==="self"&&entry.zone==="hand"){
      dispatchEntry(entry.card,before);
    }else if(dest.side==="self"&&dest.zone==="stage"&&(entry.side!==dest.side||entry.zone!==dest.zone)&&isOnPlay(effect())&&matches(entry.card)){
      if(entry.side==="self"&&entry.zone==="hand")begin(entry.card.uid,before,true);
      else $("effectResult").textContent="手札以外からの登場なので、この能力は誘発しません。";
    }
  };
  $("removeCard").onclick=()=>{
    const entry=editEntry();
    if(!entry||session)return;
    changeBoard(()=>{
      const pile=entry.host?.markers??board[entry.side][entry.zone];
      pile.splice(pile.indexOf(entry.card),1);
      selected=null;
    });
    $("boardStatus").textContent=name(entry.card)+"を削除しました。";
  };
  $("undoBoard").onclick=()=>{
    if(!undo||session)return;
    restore(undo);lastStart=null;clearResults();render();
  };
  $("resetEffectTest").onclick=()=>{
    if(session)return;
    board=WSEffects.emptyBoard();turn=1;used.clear();selected=null;undo=null;lastStart=null;clearResults();render();
    $("boardStatus").textContent="盤面をリセットしました。";
  };
  $("nextTurn").onclick=()=>{
    if(session)return;
    for(const {card} of allCards(board))if(card.turnLevelBonus){
      card.level-=card.turnLevelBonus;
      delete card.turnLevelBonus;
    }
    if(firenPractice)board.self.waiting.push(...board.self.cx.splice(0));
    practiceSide="self";
    turn++;used.clear();undo=null;clearResults();render();
  };

  function reisCheckKind(ability=effect()){
    if(card?.cardNumber!=="STS/W140-001")return null;
    if(ability?.id==="on-play-waiting-okaken")return "search";
    if(ability?.id==="memory-recollection-top-reveal")return "console";
    return null;
  }

  function readEffect(){
    if(session)return;
    lastStart=null;
    const ability=effect(),review=ability&&WSFormalCards.review(ability);
    $("testEffectStatus").textContent=review?WSFormalCards.labels[review.status]+(review.issues.length?" ／ "+review.issues.map(i=>i.message).join(" ／ "):""):"選択できる能力はありません。";
    $("effectText").hidden=!ability;
    $("effectText").textContent=ability?.sourceText??ability?.description??"";
    $("soloEffectText").hidden=!solo||!ability;
    $("soloEffectText").textContent=$("effectText").textContent;
    $("operationDescription").textContent=solo?"":!ability?"":isOnPlay(ability)?"テスト対象のカードを手札から舞台に登場させると、能力の確認に進みます。":"テスト開始から、使用するカードと必要な対象を選択できます。";
    const check=reisCheckKind();
    $("expectedOutcome").hidden=!check;
    $("expectedOutcome").textContent=check==="search"?
      "確認すること：ストックを1枚支払い、選んだ控え室のカードがクロックの一番下へ。選んだ山札のカードは公開して手札へ。":
      "確認すること：選んだ『回想』持ちのキャラが思い出へ。山札の一番上は公開し、レベル0以下のキャラなら手札へ、それ以外なら山札の上へ。";
    $("effectChoices").replaceChildren();
    clearResults();render();
  }
  function showCard(entry,abilityId){
    card=entry;
    options($("testEffect"),(entry.effects??[]).map((item,i)=>[item.id,(i+1)+"．"+(item.category??item.description??item.id)]));
    if(entry.effects?.some(item=>item.id===abilityId))$("testEffect").value=abilityId;
    $("testCardStatus").textContent=entry.cardNumber+" ／ "+(entry.name??"名称未確認")+(sample?" ／ 架空のテスト例":"");
    $("loadPractice").hidden=entry.cardNumber!=="STS/W140-001";
    readEffect();
  }
  function productCards(){
    const value=$("testProduct").value;
    return value==="all"?catalog.cards:catalog.cards.filter(entry=>(entry.product??"")===value);
  }
  function renderProduct(entry,ability){
    const cards=productCards();
    options($("testCard"),cards.map(item=>[item.cardNumber,(item.name??item.cardNumber)+(item.name?" ／ "+item.cardNumber:"")]));
    if(entry)$("testCard").value=entry.cardNumber;
    const pick=entry??cards[0];
    sample=null;
    if(pick)showCard(pick,ability);
    else {card=null;options($("testEffect"),[]);readEffect()}
  }
  $("testProduct").onchange=()=>renderProduct();
  $("testCard").onchange=()=>renderProduct(WSFormalCards.find(catalog,$("testCard").value));
  $("testEffect").onchange=readEffect;
  function openNumber(number,ability){
    const entry=WSFormalCards.find(catalog,number);
    if(!entry){$("testCardStatus").textContent="指定のカード番号は正式データにありません。";return}
    $("testProduct").value=entry.product??"all";
    renderProduct(entry,ability);
  }
  $("testFind").onsubmit=event=>{event.preventDefault();if(catalog&&!session)openNumber($("testNumber").value)};
  $("loadFiren").onclick=()=>{
    if(session||!catalog)return;
    const firen=WSFormalCards.find(catalog,"STS/W140-002");
    const cx=WSFormalCards.find(catalog,"STS/W140-031");
    if(!firen||!cx){$("boardStatus").textContent="フィレンまたは凱旋歌がカタログにありません。";return}
    firenPractice=true;practiceSide="self";
    changeBoard(()=>{
      board=WSEffects.emptyBoard();used.clear();turn=1;selected=null;
      board.self.stage.push(temporaryCard({name:"巡遊者のキャラ",power:3000,soul:1,traits:["巡遊者"]}));
      board.self.waiting.push(temporaryCard({name:"控え室の巡遊者",traits:["巡遊者"]}),formalCard(firen));
      board.self.hand.push(formalCard(firen),formalCard(cx),temporaryCard({name:"手札コスト用カード"}));
      // The deck top is the final array element in the effect engine.
      board.self.deck.push(temporaryCard({name:"山札の下"}),temporaryCard({name:"山札の中"}),formalCard(cx));
    });
    openNumber("STS/W140-002");
    for(const zone of ["hand","stage","cx"]){
      const area=$("boardEditor").querySelector('[data-key="self.'+zone+'"]');
      if(area)area.open=true;
    }
    $("boardStatus").textContent="手札のフィレンから舞台へ。凱旋歌をCX置場に出したら、舞台のフィレンでアタックできます。";
    $("testBoardHeading").tabIndex=-1;
    $("testBoardHeading").focus();
    clearResults();
  };
  $("loadPractice").onclick=()=>{
    if(session||!card)return;
    firenPractice=false;practiceSide="self";
    changeBoard(()=>{
      board=WSEffects.emptyBoard();used.clear();turn=1;selected=null;
      board.self.hand.push(formalCard(card));
      if(!solo)board.self.stage.push(formalCard(card));
      board.self.stage.push(temporaryCard({name:"回想を持つキャラ",keywords:["回想"]}));
      board.self.stock.push(temporaryCard({name:"支払い用ストック"}));
      board.self.waiting.push(temporaryCard({name:"巡遊者のキャラ",traits:["巡遊者"]}));
      board.self.deck.push(temporaryCard({name:"レベル1のキャラ",level:1}),temporaryCard({name:"レベル0のキャラ"}));
    });
    if(solo){
      for(const zone of ["hand","stage"])$("boardEditor").querySelector('[data-key="self.'+zone+'"]').open=true;
    }
    $("boardStatus").textContent="両方の能力を試せる盤面を配置しました。";
    clearResults();
  };
  $("loadSample").onclick=async()=>{
    try{
      const response=await fetch("test/card-effects/example.json");
      if(!response.ok)throw Error("テスト例を読み込めません（HTTP "+response.status+"）");
      const data=await response.json();
      sample=data.cases[0];
      board=copy(sample.before);turn=1;used.clear();selected=null;undo=null;
      showCard(data.card,sample.effectId);
    }catch(error){$("testCardStatus").textContent=error.message}
  };

  function chooseCards(request,commit){
    const panel=$("effectChoices"),area=node("div");area.className="lab-cards";
    const chosen=new Set(),widgets=[];
    panel.replaceChildren(node("p",request.text??request.label+"から"+(request.min===request.max?request.max+"枚":"最大"+request.max+"枚")+"を選んでください。"),area);
    const accept=button(request.confirm??"選択を確定",()=>commit([...chosen]));
    accept.className="primary";
    if(request.min===0)panel.append(button("選ばずに続ける",()=>commit([])));
    panel.append(accept);
    const sync=()=>{
      accept.disabled=chosen.size<Math.max(1,request.min);
      for(const [card,el] of widgets)el.setAttribute("aria-pressed",String(chosen.has(card.uid)));
    };
    for(const candidate of request.candidates){
      const el=cardButton(candidate,()=>{
        if(chosen.has(candidate.uid))chosen.delete(candidate.uid);
        else {
          if(request.max===1)chosen.clear();
          if(chosen.size<request.max)chosen.add(candidate.uid);
        }
        sync();
      });
      widgets.push([candidate,el]);area.append(el);
    }
    if(!widgets.length)area.append(node("p","選べるカードはありません。"));
    sync();
  }

  function focusOperation(){$("choiceHeading").focus()}
  function begin(uid,start=snapshot(),entered=false){
    const ability=effect(),review=WSFormalCards.review(ability);
    if(review.status!=="ready"){
      session=null;render();
      $("effectResult").textContent=WSFormalCards.labels[review.status]+" ／ 実行前に停止しました";
      return;
    }
    clearResults();
    lastStart={state:start,uid,entered};
    session={iterator:WSEffects.guide(ability,board,{sourceUid:uid,usedThisTurn:used.get(usageKey(uid))??0}),
      before:copy(board),uid,ability,chosen:{}};
    render();
    focusOperation();
    advance();
  }
  function advance(answer){
    const panel=$("effectChoices");
    const next=session.iterator.next(answer);
    panel.replaceChildren();
    if(next.done){
      const resolved=session;
      session=null;
      if(next.value.status==="success"){
        board=next.value.state;
        if(resolved.ability.limit?.perTurn){
          const key=usageKey(resolved.uid,resolved.ability);
          used.set(key,(used.get(key)??0)+1);
        }
        undo=null;
      }
      showResult(resolved.before,next.value);
      renderVerification(resolved,next.value);
      render();
      $("resultHeading").focus();
      return;
    }
    const step=next.value;
    focusOperation();
    if(step.kind==="select"){
      chooseCards(step,ids=>{
        session.chosen[step.from.zone]=ids;
        advance(ids);
      });
      return;
    }
    if(step.kind==="destination"){
      panel.append(node("p","控え室からの移動先を選びます。"),
        ...step.destinations.map(dest=>button(zones[dest.zone]+"へ",()=>advance(dest))));
      return;
    }
    if(step.kind==="treasure"){
      const stock=button("山札の上を1枚ストックへ",()=>advance(true));stock.disabled=!step.canStock;
      panel.append(node("p",name(step.card)+"をトリガーしました。凱旋歌を手札に加えます。"),
        stock,button("ストックに置かない",()=>advance(false)));
      return;
    }
    if(step.kind==="optional"){
      panel.append(node("p","この能力を使いますか？"),button("能力を使用する",()=>advance(true)),button("能力を使用しない",()=>advance(false)));
      return;
    }
    if(step.kind==="reveal"){
      const list=node("ul");
      for(const entry of step.cards)list.append(node("li",name(entry)+(step.returned.includes(entry.uid)?" ／ 山札に戻す":"")));
      panel.append(node("h3","公開カードを確認"),list,button("処理を続ける",()=>advance()));
      return;
    }
    panel.append(node("p",step.text),button("コストを支払う",()=>advance()));
  }
  function renderSoloActions(container,entry,zone){
    if(zone==="hand"&&entry.type==="character"){
      container.append(button("舞台に出す",()=>enterFromHand(entry.uid)));
      return;
    }
    if(firenPractice&&zone==="hand"&&entry.type==="climax"){
      container.append(button("CX置場に出す",()=>{
        changeBoard(()=>{
          board.self.waiting.push(...board.self.cx.splice(0));
          moveEntry({card:entry,side:"self",zone:"hand"},{side:"self",zone:"cx",pile:board.self.cx},"top");
          selected=null;
        });
        $("boardStatus").textContent=name(entry)+"をCX置場に出しました。";
      }));
      return;
    }
    if(zone!=="stage"||!catalog)return;
    const definition=WSFormalCards.find(catalog,entry.cardNumber);
    if(firenPractice){
      const attack=definition?.effects?.find(item=>item.timing==="on_attack"&&item.type==="auto");
      if(attack)container.append(button("アタック · CXコンボ確認",()=>{
        launchSoloAbility(definition,attack,entry.uid,snapshot(),false,"アタック時");
      }));
    }
    for(const ability of definition?.effects?.filter(item=>item.type==="activated")??[]){
      const usedUp=ability.limit?.perTurn&&
        (used.get(usageKey(entry.uid,ability,definition))??0)>=ability.limit.perTurn;
      const el=button("起動能力を使う · "+(ability.category??ability.id)+(usedUp?"（使用済み）":""),()=>{
        launchSoloAbility(definition,ability,entry.uid,snapshot(),false);
      });
      el.disabled=!!usedUp;
      container.append(el);
    }
  }

  function launchSoloAbility(definition,ability,uid,start,entered,timing){
    sample=null;
    showCard(definition,ability.id);
    $("operationDescription").textContent=(timing??(entered?"手札から登場して誘発":"舞台から起動"))+" ／ "+(ability.category??ability.id);
    begin(uid,start,entered);
  }

  function dispatchEntry(entry,before){
    const definition=catalog&&WSFormalCards.find(catalog,entry.cardNumber);
    const abilities=definition?.effects?.filter(ability=>ability.type==="auto"&&isOnPlay(ability))??[];
    if(!abilities.length){render();return}
    if(abilities.length===1){launchSoloAbility(definition,abilities[0],entry.uid,before,true);return}
    session={};
    render();
    $("effectChoices").replaceChildren(node("p","手札から登場したときの能力を選んでください。"),
      ...abilities.map(ability=>button(ability.category??ability.id,()=>{
        session=null;
        launchSoloAbility(definition,ability,entry.uid,before,true);
      })));
    focusOperation();
  }

  function enterFromHand(uid){
    const entry=WSEffects.cardsIn(board).find(item=>item.card.uid===uid&&item.side==="self"&&item.zone==="hand");
    if(!entry)return;
    const before=snapshot();
    moveEntry(entry,{side:"self",zone:"stage",pile:board.self.stage},"top");
    if(solo||firenPractice){
      selected=null;
      $("boardEditor").querySelector('[data-key="self.stage"]').open=true;
      $("boardStatus").textContent=name(entry.card)+"を手札から舞台に出しました。";
      dispatchEntry(entry.card,before);
    }else begin(uid,before,true);
  }
  $("runEffectTest").onclick=()=>{
    const ability=effect();
    if(!ability||session)return;
    if(WSFormalCards.review(ability).status!=="ready"){begin(null);return}
    if(sample||ability.timing==="manual"||!isOnPlay(ability)&&ability.type!=="activated"){begin(null);return}
    const entering=isOnPlay(ability),zone=entering?"hand":"stage";
    const candidates=board.self[zone].filter(matches);
    if(!candidates.length){
      $("effectChoices").replaceChildren(node("p","自分の"+zones[zone]+"にテスト対象のカードを配置してください。"));return;
    }
    if(candidates.length===1){if(entering)enterFromHand(candidates[0].uid);else begin(candidates[0].uid);return}
    session={};render();focusOperation();
    chooseCards({text:entering?"手札から舞台に出すカードを選んでください。":"能力を使う舞台のカードを選んでください。",
      candidates,min:1,max:1,confirm:entering?"舞台に登場させる":"このカードの能力を使う"},
      ([uid])=>{if(entering)enterFromHand(uid);else begin(uid)});
  };
  $("togglePracticeTurn").onclick=()=>{
    practiceSide=practiceSide==="self"?"opponent":"self";
    render();
  };
  $("checkTrigger").onclick=()=>{
    if(session||!board.self.deck.length)return;
    const start=snapshot(),entry=board.self.deck.pop(),definition=WSFormalCards.find(catalog,entry.cardNumber);
    const ability=definition?.effects?.find(item=>item.timing==="on_trigger"&&item.type==="trigger");
    if(!ability){
      board.self.stock.push(entry);render();
      $("boardStatus").textContent=name(entry)+"をトリガーしてストックへ置きました。";
      return;
    }
    board.self.waiting.push(entry);
    launchSoloAbility(definition,ability,entry.uid,start,false,"トリガー");
    if(lastStart)lastStart.trigger=true;
  };
  $("cancelEffect").onclick=()=>{
    session?.iterator?.return();
    session=null;
    if(lastStart?.trigger)restore(lastStart.state);
    $("effectChoices").replaceChildren();
    clearResults();
    $("effectResult").textContent="テストを中止しました。途中のコストや効果は盤面に反映していません。";
    render();
    $("resultHeading").focus();
  };
  $("restoreStart").onclick=()=>{
    if(!lastStart||session)return;
    restore(lastStart.state);
    clearResults();
  };
  $("repeatTest").onclick=()=>{
    if(!lastStart||session)return;
    const previous=lastStart;
    restore(previous.state);
    if(previous.trigger)$("checkTrigger").click();
    else if(previous.entered)enterFromHand(previous.uid);
    else begin(previous.uid);
  };

  function renderVerification(resolved,actual){
    const kind=reisCheckKind(resolved.ability);
    if(!kind||!["success","skipped"].includes(actual.status))return;
    const panel=$("resultVerification"),before=resolved.before.self,after=actual.state.self;
    const ids=pile=>pile.map(entry=>entry.uid);
    const same=(a,b)=>a.length===b.length&&a.every((id,i)=>id===b[i]);
    const without=(pile,uid)=>ids(pile).filter(id=>id!==uid);
    const revealed=actual.log.flatMap(step=>step.revealed??[]);
    const rows=[];
    if(actual.status==="skipped"){
      const unchanged=Object.keys(sides).every(side=>Object.keys(zones).every(zone=>
        same(ids(resolved.before[side][zone]),ids(actual.state[side][zone]))));
      rows.push(["能力を使わず、コストとカードの移動がなかった",unchanged&&!revealed.length]);
    }else if(kind==="search"){
      const paid=before.stock.at(-1),[clock]=resolved.chosen.waiting??[],[found]=resolved.chosen.deck??[];
      const clockCard=before.waiting.find(entry=>entry.uid===clock);
      const foundCard=before.deck.find(entry=>entry.uid===found);
      const remaining=without(before.deck,found);
      rows.push(["ストックの一番上を1枚、控え室へ",!!paid&&same(ids(after.stock),ids(before.stock).slice(0,-1))&&
        same(ids(after.waiting),[...without(before.waiting,clock),paid.uid])]);
      rows.push([(clockCard?name(clockCard):"選んだカード")+"をクロックの一番下へ",!!clock&&same(ids(after.clock),[clock,...ids(before.clock)])]);
      rows.push([foundCard?name(foundCard)+"を公開して手札へ":"山札からカードを選ばずに進行",
        same(revealed,found?[found]:[])&&same(ids(after.hand),found?[...ids(before.hand),found]:ids(before.hand))]);
      rows.push(["山札をシャッフルし、残りのカードを保持",actual.log.some(step=>step.handler==="shuffleDeck"&&step.ok)&&
        same(ids(after.deck).sort(),remaining.sort())]);
    }else{
      const [cost]=resolved.chosen.stage??[];
      const payer=before.stage.find(entry=>entry.uid===cost),top=before.deck.at(-1);
      const hit=top?.type==="character"&&Number.isInteger(top.level)&&top.level<=0;
      rows.push([(payer?name(payer):"選んだキャラ")+"を思い出へ",!!cost&&cost!==resolved.uid&&
        same(ids(after.stage),without(before.stage,cost))&&same(ids(after.memory),[...ids(before.memory),cost])]);
      rows.push(["山札の一番上の"+(top?name(top):"カード")+"を公開",!!top&&same(revealed,[top.uid])]);
      rows.push([hit?"公開カードを手札へ":"公開カードを山札の一番上へ戻す",!!top&&
        same(ids(after.deck),hit?ids(before.deck).slice(0,-1):ids(before.deck))&&
        same(ids(after.hand),hit?[...ids(before.hand),top.uid]:ids(before.hand))]);
    }
    const matches=rows.filter(([,pass])=>pass).length;
    const title=matches===rows.length?"確認項目はすべて期待どおり":"期待と異なる項目があります";
    panel.append(node("h3",title+"（"+matches+" / "+rows.length+"件）"));
    const list=node("ul");
    for(const [description,pass] of rows){
      const item=node("li");
      const status=node("strong",pass?"一致":"不一致");
      status.className=pass?"check-pass":"check-fail";
      item.append(status,document.createTextNode(description));
      list.append(item);
    }
    panel.append(list);
    panel.hidden=false;
  }

  function showResult(before,actual){
    const after=actual.status==="success"?actual.state:board;
    const reference=new Map([...allCards(before),...allCards(after)].map(item=>[item.card.uid,item]));
    const previous=new Map(allCards(before).map(item=>[item.card.uid,item]));
    const moves=allCards(after).flatMap(item=>{
      const old=previous.get(item.card.uid);
      if(!old||old.side===item.side&&old.zone===item.zone&&old.host?.uid===item.host?.uid)return [];
      return [name(item.card)+"（"+label(old.side,old.zone)+" → "+label(item.side,item.zone)+"）"];
    });
    const names=ids=>ids.map(uid=>reference.get(uid)?.card).filter(Boolean).map(name);
    const log=actual.status==="success"?actual.log:[];
    const costs=log.filter(entry=>entry.phase==="costs"&&!["selectCards","searchDeck"].includes(entry.handler)).flatMap(entry=>entry.cards??[]);
    const reveals=log.flatMap(entry=>entry.revealed??[]);
    const returned=log.flatMap(entry=>entry.returned??[]);
    const newHand=allCards(after).filter(item=>item.zone==="hand"&&previous.get(item.card.uid)?.zone!=="hand").map(item=>name(item.card));
    const panel=$("resultChanges");
    panel.replaceChildren();
    const groups=[["移動したカード",moves],["支払ったコスト",names(costs)],["公開したカード",names(reveals)],
      ["手札に加えたカード",newHand],["山札に戻したカード",names(returned)]];
    for(const [title,items] of groups){
      if(!items.length)continue;
      const list=node("ul");list.append(...items.map(text=>node("li",text)));
      panel.append(node("h3",title),list);
    }
    for(const [side,title] of Object.entries(sides)){
      const counts=node("p",Object.entries(displayZones).map(([zone,zName])=>{
        const size=state=>zone==="markers"?allCards(state).filter(item=>item.side===side&&item.zone===zone).length:state[side][zone].length;
        const prior=size(before),now=size(after);
        return zName+" "+(prior===now?now:prior+"→"+now);
      }).join(" ／ "));
      panel.append(node("h3",title+"の領域枚数"),counts);
    }
    $("effectResult").textContent=(results[actual.status]??actual.status)+(actual.message?" ／ "+actual.message:"");
    $("beforeBoard").textContent=JSON.stringify(before,null,2);
    $("afterBoard").textContent=JSON.stringify(after,null,2);
    $("effectLog").replaceChildren(...actual.log.map(entry=>node("li",
      phaseNames[entry.phase]+" ／ "+entry.handler+" ／ "+(entry.ok?"完了":"停止")+
      (entry.cards?.length?" ／ "+entry.cards.join("、"):""))));
    if(sample&&effect().id===sample.effectId)$("compareResults").append(node("li",
      WSEffects.compare(actual,sample.expected)?"盤面全体と結果が一致しました。":"テスト例の期待結果とは異なります。"));
  }

  if(solo){
    $("labTitle").textContent="カード効果の壁打ち";
    $("cardSelector").hidden=true;
    $("soloHelp").hidden=false;
    $("modeLink").href="card-effect-test.html?card=STS%2FW140-001";
    $("modeLink").textContent="効果単体テスト";
  }
  render();
  WSFormalCards.load().then(data=>{
    catalog=data;
    options($("testProduct"),[["all","すべて"],...CardCatalog.products(data.cards).map(product=>[product,product])]);
    const numbers=data.cards.flatMap(entry=>CardCatalog.cardNumbers(entry).map(number=>[number,entry.name??number]));
    options($("testNumbers"),numbers);
    options($("placeNumber"),[...numbers.map(([number,title])=>[number,title===number?number:title+" ／ "+number]),["mock","仮カードを作る"]]);
    $("placeNumber").onchange();
    if(solo){
      openNumber(params.get("card")??"STS/W140-001");
      if(card?.cardNumber==="STS/W140-001")$("loadPractice").click();
      if(["STS/W140-002","STS/W140-031"].includes(card?.cardNumber))$("loadFiren").click();
      $("soloEffectText").hidden=true;
      $("expectedOutcome").hidden=true;
    }else if(params.has("card"))openNumber(params.get("card"),params.get("effect"));
    else renderProduct();
  }).catch(error=>{$("testCardStatus").textContent=error.message});
})();
