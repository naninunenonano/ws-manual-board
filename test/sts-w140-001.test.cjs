"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const catalog = require("../card-catalog.js");
const data = require("../card-data/catalog.json");
const engine = require("../effects/engine.js");
test("STS/W140-001: metadata, variants and pending effects", () => {
  const cards = catalog.checked(data, {formal:true}).cards;
  const card = cards.find(c => c.cardNumber === "STS/W140-001");
  assert.ok(card);
  assert.deepEqual(card.variants, ["STS/W140-001","STS/W140-001S","STS/W140-001SP"]);
  assert.equal(card.color, "緑");
  assert.deepEqual(card.stats, {level:0,cost:0,power:1500,soul:1});
  assert.deepEqual(card.triggers, []);
  assert.deepEqual(card.traits, ["巡遊者","恩恵意志"]);
  assert.deepEqual(card.keywords, []);
  assert.equal(card.effects.length,2);
  assert.match(card.effects[0].sourceText,/巡遊者/);
  assert.match(card.effects[0].sourceText,/魔王/);
  assert.match(card.effects[0].sourceText,/レベル1以下/);
  assert.match(card.effects[1].sourceText,/回想/);
  assert.match(card.effects[1].sourceText,/ターン1/);
  for(const effect of card.effects) {
    assert.equal(effect.implementationStatus,"unimplemented");
    assert.equal(effect.steps,null);
    assert.ok(effect.sourceText.length>0);
  }
});
