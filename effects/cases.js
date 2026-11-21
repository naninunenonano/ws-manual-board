"use strict";

const WSEffectCases = (() => {
  const cards=typeof module==="object"?require("../card-catalog.js"):CardCatalog;
  function execute(card,scenario,engine) {
    const effect=card?.effects?.find(item=>item.id===scenario.effectId);
    if (!effect || !cards.cardNumbers(card).includes(cards.normalizeNumber(scenario.cardNumber))) throw Error("テスト対象のカード番号・効果IDが見つかりません");
    if (!scenario.expected?.state || !scenario.expected.status) throw Error("期待する盤面と結果ステータスを指定してください");
    const actual=engine.run(effect,scenario.before,scenario.choices ?? {});
    return {actual,expected:scenario.expected,pass:engine.compare(actual,scenario.expected)};
  }
  return {execute};
})();

if(typeof module==="object")module.exports=WSEffectCases;
