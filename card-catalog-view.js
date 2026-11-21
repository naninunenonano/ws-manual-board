"use strict";

(() => {
  const $=id=>document.getElementById(id);
  const region=$("formalResults");
  const node=(tag,value)=>{const el=document.createElement(tag);el.textContent=value;return el;};
  const timing={on_play:"登場時",on_attack:"アタック時",on_reverse:"リバース時",manual:"任意のタイミング"};
  const type={auto:"自動能力",activated:"起動能力",continuous:"永続能力"};
  let catalog;
  function cardDetails(card) {
    const details=document.createElement("details");
    details.className="effect";
    details.append(node("summary",card.cardNumber+"　"+(card.name||"名称未確認")));
    const fields=[["種別",CardCatalog.types[card.type]],["色",card.color],
      ...Object.entries(CardCatalog.statNames).map(([key,label])=>[label,card.stats?.[key]]),
      ["トリガー",card.triggers?.join("、")|| (card.triggers?"なし":null)],
      ["特徴",card.traits?.join("、") || (card.traits?"なし":null)],["タイトル",card.title],["商品",card.product]];
    const list=document.createElement("dl");
    for(const [label,value] of fields){
      if(Object.hasOwn(CardCatalog.types,card.type)
         && Object.values(CardCatalog.statNames).includes(label)
         && !CardCatalog.requiredStats(card.type).some(key=>CardCatalog.statNames[key]===label))continue;
      list.append(node("dt",label),node("dd",value??"未確認"));
    }
    details.append(list);
    if(card.effects==null)details.append(node("p","効果は未確認です。"));
    if(card.effects?.length===0)details.append(node("p","効果なし"));
    for(const effect of card.effects??[]){
      const review=WSFormalCards.review(effect);
      const label=WSFormalCards.labels[review.status];
      const effectBox=document.createElement("div");
      const link=node("a","この効果をテスト");
      link.href="card-effect-test.html?"+new URLSearchParams({card:card.cardNumber,effect:effect.id});
      effectBox.className="effect";
      effectBox.append(node("h3",effect.id+" ／ "+label),
        node("p",(type[effect.type]??effect.type??"種別未確認")+" ／ "+(timing[effect.timing]??effect.timing??"タイミング未確認")+
          " ／ "+(effect.optional==null?"任意・強制未確認":effect.optional?"任意":"強制")));
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
    const cards=CardCatalog.selectCards(catalog.cards,{number:$("formalNumber").value,name:$("formalName").value});
    $("formalStatus").textContent=catalog.cards.length ? cards.length+"件 ／ 全"+catalog.cards.length+"件" : "正式カードはまだ登録されていません。";
    region.replaceChildren(...cards.map(cardDetails));
  }
  for(const id of ["formalNumber","formalName"])$(id).addEventListener("input",()=>{if(catalog)update();});
  WSFormalCards.load().then(data=>{catalog=data;update()}).catch(error=>{
    $("formalStatus").textContent=error.message+(error.issues?.length?" ／ "+error.issues.map(i=>i.path+" "+i.message).join(" ／ "):"");
  });
})();
