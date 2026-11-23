"use strict";

(() => {
  const $=id=>document.getElementById(id);
  const region=$("formalResults");
  const node=(tag,value)=>{const el=document.createElement(tag);el.textContent=value;return el;};
  const timing={in_hand:"手札にある間",on_stage:"舞台にいる間",on_play:"登場時",on_attack:"アタック時",on_reverse:"リバース時",manual:"任意のタイミング",from_hand_to_stage:"手札から舞台に置かれた時",main_phase:"メインフェイズ"};
  const type={auto:"自動能力",activated:"起動能力",continuous:"永続能力"};
  let catalog;
  const tags = values => values==null?"未確認":values.join("、")||"なし";
  const statsKeys=Object.entries(CardCatalog.statNames);
  const effectStatus = review => WSFormalCards.labels[review.status];
  function cardDetails(card) {
    const details=document.createElement("details");
    details.className="effect";
    const effects=(card.effects??[]).map(effect=>({effect,review:WSFormalCards.review(effect)}));
    const primaryFields=[["種別",CardCatalog.types[card.type]??"未確認"],["色",card.color??"未確認"],
      ...statsKeys.map(([key,label])=>[label,card.stats?.[key]??
        (card.type && !CardCatalog.requiredStats(card.type).includes(key)?"該当なし":"未確認")]),
      ["トリガー",tags(card.triggers)],["特徴",tags(card.traits)],["キーワード能力",tags(card.keywords)]];
    const states=effects.map(({review})=>effectStatus(review));
    const overview=node("summary",card.cardNumber+(card.name?"　"+card.name:""));
    const info=node("span",primaryFields.map(([label,value])=>label+" "+value).join(" ／ ")+" ／ 効果 "+
      (card.effects==null?"未確認":states.length?[...new Set(states)].join("・"):"なし"));
    info.className="muted formal-overview";
    overview.append(info);
    details.append(overview);
    const list=document.createElement("dl");
    const variants=CardCatalog.cardNumbers(card).filter(number=>number!==card.cardNumber);
    for(const [label,value] of [...primaryFields,["別バージョン番号",variants.join("、")||
      (card.variants==null?"未確認":"なし")],["タイトル",card.title],["収録商品",card.product]]){
      list.append(node("dt",label),node("dd",value??"未確認"));
    }
    details.append(list);
    if(card.effects==null)details.append(node("p","効果は未確認です。"));
    if(card.effects?.length===0)details.append(node("p","効果なし"));
    for(const {effect,review} of effects){
      const label=effectStatus(review);
      const effectBox=document.createElement("div");
      const link=node("a","この効果をテスト");
      link.href="card-effect-test.html?"+new URLSearchParams({card:card.cardNumber,effect:effect.id});
      effectBox.className="effect";
      effectBox.append(node("h3",effect.id+" ／ "+label),
        node("p",(type[effect.type]??effect.type??"種別未確認")+" ／ "+(timing[effect.timing]??effect.timing??"タイミング未確認")+
          " ／ "+(effect.optional==null?"任意・強制未確認":effect.optional?"任意":"強制")));
      const original=node("p",effect.sourceText??"未確認");
      original.className="effect-original";
      effectBox.append(node("p","能力分類　"+(effect.category??"未確認")),node("h4","効果原文"),original);
      if(effect.description)effectBox.append(node("p",effect.description));
      const steps=document.createElement("ol");
      const phases={conditions:"条件",costs:"コスト",target:"対象",steps:"処理"};
      for(const entry of review.entries)steps.append(node("li",phases[entry.phase]+" ／ "+WSEffects.describe(entry)));
      if(steps.childElementCount)effectBox.append(steps);
      for(const issue of review.issues)effectBox.append(node("p",issue.message));
      effectBox.append(link);
      details.append(effectBox);
    }
    return details;
  }
  function update(){
    const cards=CardCatalog.selectCards(catalog.cards,{number:$("formalNumber").value,name:$("formalName").value,product:$("formalProduct").value||null});
    $("formalStatus").textContent=catalog.cards.length ? cards.length+"件 ／ 全"+catalog.cards.length+"件" : "正式カードはまだ登録されていません。";
    region.replaceChildren(...cards.map(cardDetails));
  }
  for(const id of ["formalNumber","formalName"])$(id).addEventListener("input",()=>{if(catalog)update();});
  $("formalProduct").addEventListener("change",()=>{if(catalog)update();});
  WSFormalCards.load().then(data=>{
    catalog=data;
    $("formalProduct").append(...CardCatalog.products(data.cards).map(product=>new Option(product,product)));
    $("formalProduct").disabled=false;
    update();
  }).catch(error=>{
    $("formalStatus").textContent=error.message+(error.issues?.length?" ／ "+error.issues.map(i=>i.path+" "+i.message).join(" ／ "):"");
  });
})();
