"use strict";

(() => {
  const $=id=>document.getElementById(id);
  const node=(tag,text)=>{const item=document.createElement(tag);item.textContent=text;return item;};
  const numeric=text=>text.trim()===""?null:Number(text);
  const putOptions=(select,options)=>select.replaceChildren(...Object.entries(options).map(([v,label])=>new Option(label,v)));
  const nextBoard=()=>WSEffects.emptyBoard();
  const statusLabels={success:"解決",invalid:"定義エラー",unsupported:"未実装",failed:"途中停止",
    unconfirmed:"未確認",skipped:"任意効果を辞退","needs-choice":"選択が必要","condition-not-met":"条件未達"};
  const phaseLabels={conditions:"条件",costs:"支払い",target:"対象",steps:"処理"};
  let board=nextBoard(),catalog,card,scenario,serial=0;
  let choices={},expectations=[];
  for(const id of ["placeSide","expectSide"])putOptions($(id),WSEffects.sides);
  for(const id of ["placeZone","expectZone"])putOptions($(id),WSEffects.zones);

  function clearResults(){
    for(const id of ["effectResult","beforeBoard","afterBoard"])$(id).textContent="";
    for(const id of ["effectLog","compareResults"])$(id).replaceChildren();
  }

  function renderBoard(){
    const listing=$("boardEditor");
    const groups=[];
    for(const [side,sideLabel] of Object.entries(WSEffects.sides)){
      const panel=document.createElement("div");
      panel.className="effect";
      panel.append(node("h3",sideLabel));
      for(const [zone,label] of Object.entries(WSEffects.zones)){
        const pile=board[side][zone];
        const details=document.createElement("details");
        details.append(node("summary",label+" （"+pile.length+"枚）"));
        const list=document.createElement("ul");
        for(const entry of pile){
          const row=node("li",entry.cardNumber+" ／ "+entry.uid+
            " ／ パワー "+(entry.power??"未確認")+" ／ ソウル "+(entry.soul??"未確認")+" ");
          const remove=node("button","取り除く");
          remove.type="button";
          remove.onclick=()=>{pile.splice(pile.indexOf(entry),1);renderBoard();renderChoices();clearResults();};
          for(const [kind,label] of [["traits","特徴"],["keywords","キーワード能力"]]){
            const effective=WSEffects.effectiveTags(entry,kind);
            row.append(node("div",label+" "+(effective?.join("、") || (effective?"なし":"未確認"))));
          }
          row.append(remove);list.append(row);
        }
        details.append(list);panel.append(details);
      }
      groups.push(panel);
    }
    listing.replaceChildren(...groups);
  }

  function effect(){return card?.effects?.find(effect=>effect.id===$("testEffect").value);}
  function renderChoices(){
    const current=effect(),panel=$("effectChoices");
    panel.replaceChildren();
    if(!current){panel.append(node("p","効果を選択してください。"));return;}
    if(current.optional){
      const label=node("label","任意効果");
      const select=document.createElement("select");
      putOptions(select,{"":"選択してください",yes:"実行する",no:"実行しない"});
      select.value=typeof choices.activate==="boolean"?(choices.activate?"yes":"no"):"";
      select.onchange=()=>{
        if(select.value)choices.activate=select.value==="yes";
        else delete choices.activate;
        clearResults();
      };
      label.append(select);panel.append(label);
    }
    const entries=WSFormalCards.review(current).entries.filter(entry=>entry.step?.handler==="selectCards"
      && entry.implementation?.valid(entry.step.params));
    for(const {step:{params}} of entries){
      const label=node("label",params.as+" ／ "+WSEffects.sides[params.from.side]+"の"+WSEffects.zones[params.from.zone]+"から"+params.count+"枚");
      const select=document.createElement("select");
      select.multiple=true;
      for(const {side,zone,card} of WSEffects.cardsIn(board)){
        const option=new Option(card.uid+" ／ "+card.cardNumber+" ／ "+WSEffects.sides[side]+"・"+WSEffects.zones[zone],card.uid);
        option.selected=(Object.hasOwn(choices,params.as)?choices[params.as]:[]).includes(card.uid);
        select.append(option);
      }
      select.onchange=()=>{Object.defineProperty(choices,params.as,{value:[...select.selectedOptions].map(o=>o.value),writable:true,enumerable:true,configurable:true});clearResults();};
      label.append(select);panel.append(label);
    }
    if(!panel.childElementCount)panel.append(node("p","事前に指定する選択はありません。"));
  }

  function showCard(entry,selectedId){
    card=entry;
    const dropdown=$("testEffect");
    dropdown.replaceChildren(...(entry.effects??[]).map(effect=>new Option(effect.id,effect.id)));
    if(selectedId&&[...dropdown.options].some(o=>o.value===selectedId))dropdown.value=selectedId;
    dropdown.disabled=!dropdown.options.length;
    $("testCardStatus").textContent=entry.cardNumber+" ／ "+(entry.name??"名称未確認")+
      (scenario?" ／ 架空のテスト例":entry.effects==null?" ／ 効果未確認":"");
    readEffect();
  }

  function readEffect(){
    const current=effect();
    const review=current?WSFormalCards.review(current):null;
    $("testEffectStatus").textContent=review
      ? WSFormalCards.labels[review.status]+(review.issues.length?" ／ "+review.issues.map(i=>i.message).join(" ／ "):"")
      : "選択できる効果はありません。";
    $("runEffectTest").disabled=!current;
    $("manualExpect").hidden=!!scenario && scenario.effectId===current?.id;
    $("sampleInfo").hidden=!$("manualExpect").hidden;
    renderChoices();clearResults();
  }

  function openFormal(selectedId){
    const entry=WSFormalCards.find(catalog,$("testNumber").value);
    if(!entry){$("testCardStatus").textContent="指定のカード番号は正式データにありません。";return;}
    scenario=null;choices={};showCard(entry,selectedId);
  }

  $("testFind").onsubmit=event=>{event.preventDefault();if(catalog)openFormal();};
  $("testEffect").onchange=()=>{choices={};readEffect();};
  $("loadSample").onclick=async()=>{
    try {
      const response=await fetch("test/card-effects/example.json");
      if(!response.ok)throw Error("テスト例を読み込めません（HTTP "+response.status+"）");
      const data=await response.json();
      scenario=data.cases[0];
      board=structuredClone(scenario.before);choices=structuredClone(scenario.choices);
      $("testNumber").value="";
      renderBoard();showCard(data.card,scenario.effectId);
    } catch(error){$("testCardStatus").textContent=error.message;}
  };

  $("placeCard").onsubmit=event=>{
    event.preventDefault();
    const cardNumber=CardCatalog.normalizeNumber($("placeNumber").value);
    const found=catalog&&WSFormalCards.find(catalog,cardNumber);
    const power=numeric($("placePower").value)??found?.stats?.power??null;
    const soul=numeric($("placeSoul").value)??found?.stats?.soul??null;
    const ids=new Set(WSEffects.cardsIn(board).map(({card})=>card.uid));
    let uid=$("placeUid").value.trim();
    if(!uid){do{uid="test-"+(++serial)}while(ids.has(uid));}
    if(!CardCatalog.validNumber(cardNumber)||ids.has(uid)||[power,soul].some(n=>n!==null&&!Number.isSafeInteger(n))){
      $("boardStatus").textContent="カード番号、重複していない個体ID、数値を確認してください。";return;
    }
    const tags=id=>$(id).value.split(/[,、]/).map(tag=>tag.trim()).filter(Boolean);
    const traitChanges={added:tags("traitsAdded"),removed:tags("traitsRemoved")};
    const keywordChanges={added:tags("keywordsAdded"),disabled:tags("keywordsDisabled")};
    const entry={uid,cardNumber,power,soul,traits:found?.traits??null,keywords:found?.keywords??null};
    if(Object.values(traitChanges).some(list=>list.length))entry.traitChanges=traitChanges;
    if(Object.values(keywordChanges).some(list=>list.length))entry.keywordChanges=keywordChanges;
    board[$("placeSide").value][$("placeZone").value].push(entry);
    $("boardStatus").textContent=uid+" を追加しました。";
    $("placeUid").value="";
    renderBoard();renderChoices();clearResults();
  };

  $("expectKind").onchange=()=>{$("expectUidLabel").hidden=!["power","soul"].includes($("expectKind").value);};
  function renderExpected(){
    $("expectations").replaceChildren(...expectations.map((item,i)=>{
      const line=node("li",item.label+" ");
      const remove=node("button","削除");remove.onclick=()=>{expectations.splice(i,1);renderExpected();clearResults();};
      line.append(remove);return line;
    }));
  }
  $("addExpectation").onsubmit=event=>{
    event.preventDefault();
    const side=$("expectSide").value,zone=$("expectZone").value;
    const kind=$("expectKind").value,raw=$("expectValue").value.trim(),uid=$("expectUid").value.trim();
    const value=kind==="order"?(raw?raw.split(/\s+/):[]):numeric(raw);
    if((kind!=="order"&&!Number.isSafeInteger(value))||(kind==="count"&&value<0)||(["power","soul"].includes(kind)&&!uid)){
      $("expectError").textContent="期待値と個体IDを確認してください。";return;
    }
    const label=WSEffects.sides[side]+"・"+WSEffects.zones[zone]+" ／ "+$("expectKind").selectedOptions[0].textContent+" "+uid+" = "+raw;
    expectations.push({side,zone,kind,uid,value,label});
    $("expectError").textContent="";renderExpected();clearResults();
  };

  function compareManual(actual){
    const allowed=["success","skipped","condition-not-met"].includes(actual.status);
    if(!allowed)return {message:"効果を検証できません",lines:[]};
    if(!expectations.length)return {message:"未判定（比較条件を追加してください）",lines:[]};
    const lines=expectations.map(item=>{
      const pile=actual.state[item.side][item.zone];
      const observed=item.kind==="count"?pile.length:item.kind==="order"?pile.map(card=>card.uid)
        :pile.find(card=>card.uid===item.uid)?.[item.kind];
      return {label:item.label+" ／ 実際 "+(Array.isArray(observed)?observed.join(" "):observed??"未確認"),
        pass:JSON.stringify(observed)===JSON.stringify(item.value)};
    });
    const matchStatus=$("expectedStatus").value===actual.status;
    lines.unshift({label:"結果ステータス",pass:matchStatus});
    return {message:lines.every(item=>item.pass)?"一致":"不一致",lines};
  }

  $("runEffectTest").onclick=()=>{
    const current=effect();
    const review=WSFormalCards.review(current);
    if(review.status!=="ready"){
      clearResults();
      $("effectResult").textContent=WSFormalCards.labels[review.status]+" ／ 実行前に停止しました";
      $("effectLog").replaceChildren(...review.issues.map(issue=>node("li",issue.message)));
      return;
    }
    const before=structuredClone(board);
    const replay=scenario&&scenario.effectId===current.id
      ? WSEffectCases.execute(card,{...scenario,before,choices},WSEffects):null;
    const actual=replay?.actual??WSEffects.run(current,before,choices);
    const comparison=replay
      ? {message:replay.pass?"一致":"不一致",lines:[{label:"盤面全体と結果ステータス",pass:replay.pass}]}
      : compareManual(actual);
    $("effectResult").textContent=statusLabels[actual.status]+" ／ "+comparison.message+(actual.message?" ／ "+actual.message:"");
    $("compareResults").replaceChildren(...comparison.lines.map(item=>node("li",(item.pass?"一致　":"不一致　")+item.label)));
    $("beforeBoard").textContent=JSON.stringify(before,null,2);
    $("afterBoard").textContent=JSON.stringify(actual.state,null,2);
    $("effectLog").replaceChildren(...actual.log.map(entry=>node("li",phaseLabels[entry.phase]+" ／ "+entry.handler+
      " ／ "+(entry.ok?"完了":"停止")+(entry.cards?.length?" ／ "+entry.cards.join("、"):"")+(entry.message?" ／ "+entry.message:""))));
  };

  $("resetEffectTest").onclick=()=>{
    board=nextBoard();choices={};scenario=null;expectations=[];
    card=null;$("testNumber").value="";$("testEffect").replaceChildren();$("testEffect").disabled=true;
    $("testCardStatus").textContent="テスト状態をリセットしました。";
    $("placeCard").reset();
    $("boardStatus").textContent="";$("expectError").textContent="";
    renderExpected();renderBoard();readEffect();
  };

  renderBoard();readEffect();
  WSFormalCards.load().then(data=>{
    catalog=data;
    $("testNumbers").replaceChildren(...data.cards.flatMap(card=>CardCatalog.cardNumbers(card).map(number=>new Option(card.name??"",number))));
    $("testOpen").disabled=false;
    const params=new URLSearchParams(location.search);
    if(params.has("card")){$("testNumber").value=params.get("card");openFormal(params.get("effect"));}
    else $("testCardStatus").textContent=data.cards.length?"カード番号を選んでください。":"架空カードのテスト例を利用できます。正式カードはまだ登録されていません。";
  }).catch(error=>{$("testCardStatus").textContent=error.message;});
})();
