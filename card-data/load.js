"use strict";

const WSFormalCards = (() => {
  const find = (catalog,number) => catalog.cards.find(card =>
    card.cardNumber===CardCatalog.normalizeNumber(number));
  async function load() {
    const response = await fetch("card-data/catalog.json",{cache:"no-cache"});
    if (!response.ok) throw Error("正式カードデータを読み込めません（HTTP "+response.status+"）");
    return CardCatalog.checked(CardCatalog.parseJson(await response.text()),{formal:true});
  }
  function review(effect) {
    if (!effect.type || !effect.timing || effect.optional==null || effect.steps==null || ["conditions","costs","choices"].some(key=>effect[key]===null)) {
      return {status:"unconfirmed",issues:[{status:"unconfirmed",message:"能力種別・タイミング・任意／強制・条件や処理の未確認項目を確認してください"}],entries:[]};
    }
    const result=WSEffects.inspect(effect);
    const status=result.issues.some(issue=>issue.status==="invalid")?"invalid":result.issues.length?"unsupported":"ready";
    return {...result,status};
  }
  const labels={unconfirmed:"未確認",invalid:"定義エラー",unsupported:"未実装あり",ready:"テスト実行可能"};
  return {load,find,review,labels};
})();
