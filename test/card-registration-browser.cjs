"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const {chromium,devices} = require("playwright");

const files = new Map([
  ["card-registration.html","text/html"],["card-registration.css","text/css"],
  ["card-registration.js","application/javascript"],["card-images.js","application/javascript"],
  ["card-catalog.js","application/javascript"],["card-catalog-view.js","application/javascript"],
  ["card-data/load.js","application/javascript"],["card-data/catalog.json","application/json"],
  ["effects/engine.js","application/javascript"],["effects/cases.js","application/javascript"],
  ["card-effect-test.html","text/html"],["card-effect-test.css","text/css"],["card-effect-test.js","application/javascript"],
  ["test/card-effects/example.json","application/json"]
]);

async function checkEffects(browser,url) {
  const page=await browser.newPage(devices["iPhone 13"]);
  const errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  const $=id=>page.locator("#"+id);
  const catalog={schemaVersion:1,cards:[{
    cardNumber:"TEST/S001-003",name:"検索用の架空カード",type:"character",color:"青",stats:{power:2500},
    effects:[
      {id:"draw",type:"auto",timing:"on_play",optional:false,steps:[{handler:"draw",params:{side:"self",count:1}}]},
      {id:"future",type:"auto",timing:"on_play",optional:false,steps:[{handler:"futureAction",params:{}}]}
    ]
  }]};
  await page.route("**/card-data/catalog.json",route=>route.fulfill({json:catalog}));
  await page.goto(url+"/card-registration.html");
  await $("formalName").fill("見つからない");
  await $("formalStatus").getByText(/0件 ／ 全1件/).waitFor();
  await $("formalName").fill("架空カード");
  await $("formalNumber").fill("test/s001-003");
  await $("formalResults").getByText(/検索用の架空カード/).click();
  await $("formalResults").getByText("2500",{exact:true}).waitFor();
  await $("formalResults").getByText("処理 ／ 自分が1枚引く",{exact:true}).waitFor();
  await $("formalResults").getByText(/futureAction は未実装/).waitFor();
  await $("formalResults").getByRole("link",{name:"この効果をテスト"}).first().click();
  await $("testEffectStatus").getByText("テスト実行可能",{exact:true}).waitFor();
  await page.getByText("カードを配置",{exact:true}).click();
  await $("placeNumber").selectOption("TEST/S001-003");
  await page.getByRole("button",{name:"領域の上に追加"}).click();
  await $("runEffectTest").click();
  assert.equal(await $("effectResult").innerText(),"解決");
  assert.equal(JSON.parse(await $("afterBoard").textContent()).self.hand[0].cardNumber,"TEST/S001-003");
  assert.equal(JSON.parse(await $("beforeBoard").textContent()).self.deck[0].cardNumber,"TEST/S001-003");
  await $("testEffect").selectOption("future");
  await $("runEffectTest").click();
  assert.match(await $("effectResult").innerText(),/未実装.*実行前に停止/);
  await page.getByText("開発者向け情報",{exact:true}).click();
  await $("loadSample").click();
  await $("testCardStatus").getByText(/架空のテスト例/).waitFor();
  await $("runEffectTest").click();
  await page.getByRole("button",{name:"能力を使用しない",exact:true}).click();
  assert.match(await $("effectResult").innerText(),/任意効果を辞退/);
  await $("resetEffectTest").click();
  assert.equal(await $("runEffectTest").isDisabled(),false);
  assert.equal(await page.evaluate(()=>localStorage.length),0);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(errors,[]);
  await page.close();
  console.log("Effect tester: formal number/name search, Japanese definitions, test board, expectations, sample, preflight failure and isolation passed");
}

async function checkProducts(browser,url) {
  const page=await browser.newPage(devices["iPhone 13"]);
  const $=id=>page.locator("#"+id);
  const original=require("../card-data/catalog.json");
  const wraith=original.cards.find(card=>card.cardNumber==="STS/W140-001");
  let addProduct=false;
  await page.route("**/card-data/catalog.json",route=>route.fulfill({json:{...original,cards:[
    ...original.cards,
    {cardNumber:"TEST/S001-001",product:wraith.product,traits:null,keywords:[],effects:[]},
    ...(addProduct?[{cardNumber:"TEST/S002-001",product:"自動追加の商品",effects:[]}]:[])
  ]}}));
  await page.goto(url+"/card-registration.html");
  await $("formalProduct").locator("option").filter({hasText:wraith.product}).waitFor({state:"attached"});
  assert.equal(await $("formalProduct").locator("option").filter({hasText:wraith.product}).count(),1);
  assert.equal(await $("formalProduct").locator('option[value="自動追加の商品"]').count(),0);
  addProduct=true;
  await page.reload();
  await $("formalProduct").selectOption("自動追加の商品");
  assert.equal(await $("formalResults").locator("summary").count(),1);
  await $("formalResults").getByText(/TEST\/S002-001/).waitFor();
  await $("formalProduct").selectOption(wraith.product);
  await $("formalNumber").fill("sts/w140-001sp");
  assert.equal(await $("formalResults").locator("summary").count(),1);
  await $("formalResults").locator("summary").click();
  await $("formalResults").getByText("STS/W140-001S、STS/W140-001SP",{exact:true}).waitFor();
  await $("formalResults").getByText("巡遊者、恩恵意志",{exact:true}).waitFor();
  assert.deepEqual(await $("formalResults").locator(".effect-original").allTextContents(),wraith.effects.map(effect=>effect.sourceText));
  assert.equal(await $("formalResults").getByText(/テスト実行可能/).count(),3);
  assert.equal(await $("formalResults").getByText(/未実装あり/).count(),0);
  await page.goto(url+"/card-effect-test.html?card=STS%2FW140-001SP");
  await $("testCardStatus").getByText(/STS\/W140-001 ／/).waitFor();
  await page.getByText("カードを配置",{exact:true}).click();
  await $("placeNumber").selectOption("STS/W140-001SP");
  await $("placeCard").locator("details summary").click();
  await $("keywordsAdded").fill("回想");
  await page.getByRole("button",{name:"領域の上に追加"}).click();
  await $("boardEditor").getByText("キーワード能力 回想",{exact:true}).waitFor();
  await $("loadPractice").click();
  const waiting=page.locator('#boardEditor details[data-key="self.waiting"]');
  const hand=page.locator('#boardEditor details[data-key="self.hand"]');
  await hand.locator("summary").click();
  await hand.getByRole("button",{name:/STS\/W140-001/}).click();
  await $("editZone").selectOption("waiting");
  await page.getByRole("button",{name:"選択したカードを移動",exact:true}).click();
  await waiting.locator("summary").click();
  await waiting.getByRole("button",{name:/STS\/W140-001/}).click();
  await $("editZone").selectOption("stage");
  await page.getByRole("button",{name:"選択したカードを移動",exact:true}).click();
  assert.match(await $("effectResult").innerText(),/手札以外.*誘発しません/);
  await $("undoBoard").click();
  await waiting.getByRole("button",{name:/STS\/W140-001/}).waitFor();
  await $("loadPractice").click();

  await $("runEffectTest").click();
  await page.getByRole("button",{name:"能力を使用する",exact:true}).click();
  await page.getByRole("button",{name:"コストを支払う",exact:true}).click();
  await $("effectChoices").getByRole("button",{name:/巡遊者のキャラ/}).click();
  await page.getByRole("button",{name:"選択を確定",exact:true}).click();
  await page.getByRole("button",{name:"コストを支払う",exact:true}).click();
  await $("cancelEffect").click();
  const self=page.locator("#boardEditor section").first();
  await self.getByText("ストック （1枚）",{exact:true}).waitFor();
  await self.getByText("クロック （0枚）",{exact:true}).waitFor();
  await $("repeatTest").click();
  await page.getByRole("button",{name:"能力を使用する",exact:true}).click();
  await page.getByRole("button",{name:"コストを支払う",exact:true}).click();
  await $("effectChoices").getByRole("button",{name:/巡遊者のキャラ/}).click();
  await page.getByRole("button",{name:"選択を確定",exact:true}).click();
  await page.getByRole("button",{name:"コストを支払う",exact:true}).click();
  await $("effectChoices").getByRole("button",{name:/レベル0のキャラ/}).click();
  await page.getByRole("button",{name:"選択を確定",exact:true}).click();
  await $("effectChoices").getByText("公開カードを確認",{exact:true}).waitFor();
  await page.getByRole("button",{name:"処理を続ける",exact:true}).click();
  await $("resultVerification").getByText("確認項目はすべて期待どおり（4 / 4件）",{exact:true}).waitFor();
  assert.equal(await $("resultVerification").locator(".check-pass").count(),4);
  assert.equal(await page.evaluate(()=>document.activeElement.id),"resultHeading");
  await $("resultChanges").getByText("公開したカード",{exact:true}).waitFor();
  await self.getByText("クロック （1枚）",{exact:true}).waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));

  await $("testEffect").selectOption("memory-recollection-top-reveal");
  await $("loadPractice").click();
  await $("runEffectTest").click();
  assert.equal(await $("effectChoices").locator(".lab-card").count(),1);
  await $("effectChoices").getByRole("button",{name:/回想を持つキャラ/}).click();
  await page.getByRole("button",{name:"選択を確定",exact:true}).click();
  await page.getByRole("button",{name:"コストを支払う",exact:true}).click();
  await page.getByRole("button",{name:"処理を続ける",exact:true}).click();
  await $("resultVerification").getByText("確認項目はすべて期待どおり（3 / 3件）",{exact:true}).waitFor();
  await $("turnUsed").getByText(/使用済み 1枚/).waitFor();
  await $("runEffectTest").click();
  assert.match(await $("effectResult").innerText(),/使用回数上限/);
  await $("nextTurn").click();
  assert.match(await $("turnUsed").innerText(),/使用済み 0枚/);

  await $("loadPractice").click();
  await $("placeNumber").selectOption("mock");
  await $("mockName").fill("盤面確認用マーカー");
  await $("placeZone").selectOption("markers");
  await $("placeCount").fill("2");
  await page.getByRole("button",{name:"領域の上に追加"}).click();
  await self.getByText("マーカー （2枚）",{exact:true}).waitFor();
  await $("runEffectTest").click();
  assert.match(await $("effectResult").innerText(),/思い出とマーカー.*満たしていません/);
  await $("undoBoard").click();
  await self.getByText("マーカー （0枚）",{exact:true}).waitFor();
  assert.doesNotMatch(await $("boardEditor").innerText(),/test-\d+/);
  await page.close();
  console.log("Catalog: product generation and filter, explicit variants, original source, keyword test state and pending effect passed");
}

async function checkSoloBoard(browser,url) {
  const page=await browser.newPage(devices["iPhone 13"]);
  const $=id=>page.locator("#"+id);
  await page.goto(url+"/card-effect-test.html?mode=solo&card=STS%2FW140-001");
  const hand=page.locator('[data-key="self.hand"]');
  const stage=page.locator('[data-key="self.stage"]');
  assert.equal(await $("testEffect").isVisible(),false);
  assert.equal(await $("runEffectTest").isVisible(),false);
  await hand.getByRole("button",{name:/黎明の刻 レイス/}).tap();
  await hand.getByRole("button",{name:"舞台に出す",exact:true}).tap();
  await $("operationDescription").getByText(/手札から登場して誘発.*控えオカケン/).waitFor();
  await page.getByRole("button",{name:"能力を使用する",exact:true}).tap();
  await page.getByRole("button",{name:"コストを支払う",exact:true}).tap();
  await $("effectChoices").getByRole("button",{name:/巡遊者のキャラ/}).tap();
  await page.getByRole("button",{name:"選択を確定",exact:true}).tap();
  await page.getByRole("button",{name:"コストを支払う",exact:true}).tap();
  await page.getByRole("button",{name:"選ばずに続ける",exact:true}).tap();
  await $("resultVerification").getByText(/4 \/ 4件/).waitFor();
  assert.equal(await hand.locator(".lab-card").count(),0);
  assert.equal(await stage.getByRole("button",{name:/黎明の刻 レイス/}).count(),1);
  await stage.getByRole("button",{name:/黎明の刻 レイス/}).tap();
  await stage.getByRole("button",{name:/起動能力を使う.*コンソール系/}).tap();
  await $("operationDescription").getByText(/舞台から起動.*コンソール系/).waitFor();
  await $("effectChoices").getByRole("button",{name:/回想を持つキャラ/}).tap();
  await page.getByRole("button",{name:"選択を確定",exact:true}).tap();
  await page.getByRole("button",{name:"コストを支払う",exact:true}).tap();
  await page.getByRole("button",{name:"処理を続ける",exact:true}).tap();
  await $("resultVerification").getByText(/3 \/ 3件/).waitFor();
  assert.equal(await stage.getByRole("button",{name:/起動能力を使う.*使用済み/}).isDisabled(),true);
  await $("nextTurn").tap();
  assert.equal(await stage.getByRole("button",{name:/起動能力を使う/}).isEnabled(),true);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.close();
  console.log("Solo board: hand-to-stage trigger and tap-to-activate passed on the same Wraith copy");
}

async function main() {
  const server = http.createServer((request,response)=>{
    const path = new URL(request.url,"http://localhost").pathname.slice(1);
    if (!files.has(path)) {response.writeHead(404).end();return;}
    response.setHeader("Content-Type",files.get(path)+"; charset=utf-8");
    response.end(fs.readFileSync(path));
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  let browser;
  try {
    browser = await chromium.launch(fs.existsSync("/usr/bin/google-chrome")?{channel:"chrome"}:{});
    const url="http://127.0.0.1:"+server.address().port;
    await checkEffects(browser,url);
    await checkProducts(browser,url);
    await checkSoloBoard(browser,url);
    const page = await browser.newPage({...devices["iPhone 13"],acceptDownloads:true});
    const consoleErrors = [];
    page.on("pageerror",error=>consoleErrors.push(error.message));
    await page.route("https://ws-tcg.com/**",route=>{
      if (!route.request().url().endsWith("test_s001_001.png")) return route.fulfill({status:404});
      return route.fulfill({contentType:"image/svg+xml",body:'<svg xmlns="http://www.w3.org/2000/svg" width="64" height="90"><rect width="64" height="90" fill="red"/></svg>'});
    });
    const $ = id=>page.locator("#"+id);
    await page.goto("http://127.0.0.1:"+server.address().port+"/card-registration.html");
    await page.getByRole("heading",{name:"カード情報・効果登録"}).waitFor();
    assert.equal(await page.locator('a[href="index.html"]').innerText(),"対戦盤面");
    const widthBefore = await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth);
    assert.ok(widthBefore);
    await page.locator("#localDraftTools > summary").click();
    await $("lookupNumber").fill("test/s001-001");
    await $("cardImage").waitFor();
    assert.match(await $("cardImage").getAttribute("src"),/test_s001_001\.png$/);
    await page.getByRole("button",{name:"開く",exact:true}).click();
    await $("cardType").selectOption("character");
    for (const [id,value] of Object.entries({cardColor:"青",cardTitle:"テストタイトル",cardProduct:"商品A",level:"0",cost:"0",power:"500",soul:"1"})) {
      await $(id).fill(value);
    }
    await $("addEffect").click();
    await $("addEffect").click();
    const first = JSON.parse(await $("effect-0").inputValue());
    const custom = {...JSON.parse(await $("effect-1").inputValue()),id:"試験",
      steps:[{handler:"test.inspect",params:{count:2}},{handler:"test.move",params:{zone:"stock"}}],
      future:{key:"keep me"}};
    await $("effect-1").fill(JSON.stringify(custom));
    await page.getByRole("button",{name:"上へ",exact:true}).last().click();
    await $("lookupNumber").fill("TEST/S001-002");
    assert.equal(await $("editor").isVisible(),false);
    page.once("dialog",d=>d.dismiss());
    await page.getByRole("button",{name:"開く",exact:true}).click();
    assert.equal(await $("lookupNumber").inputValue(),"TEST/S001-001");
    assert.equal(await $("editor").isVisible(),true);
    await page.reload();
    await page.getByText("下書きを復元しました。").waitFor();
    assert.equal(await $("level").inputValue(),"0");
    assert.deepEqual(JSON.parse(await $("effect-0").inputValue()),custom);
    assert.deepEqual(JSON.parse(await $("effect-1").inputValue()),first);
    await $("effect-0").fill('{\n  "id": }');
    await $("validateDraft").click();
    await $("issueList").getByText(/2行 9列/).waitFor();
    await $("effect-0").fill(JSON.stringify(custom));
    await page.getByRole("button",{name:"カードを保存",exact:true}).click();
    await page.getByText("カードを保存しました。").waitFor();
    await $("cardRows").getByText("未実装あり").waitFor();
    await page.reload();
    await page.locator("#localDraftTools > summary").click();
    await $("cardRows").getByRole("button",{name:"TEST/S001-001"}).click();
    assert.equal(await $("cost").inputValue(),"0");
    page.once("dialog",d=>d.accept());
    await page.getByRole("button",{name:"効果を削除",exact:true}).last().click();
    await page.getByRole("button",{name:"カードを保存",exact:true}).click();
    await $("exportAll").click();
    const legacy = JSON.parse(await $("jsonText").inputValue());
    assert.equal(legacy.schemaVersion,1);
    assert.deepEqual(legacy.cards[0].effects,[custom]);
    const waitingForDownload = page.waitForEvent("download");
    await $("downloadJson").click();
    const download = await waitingForDownload;
    assert.equal(download.suggestedFilename(),"card-catalog.json");
    assert.deepEqual(JSON.parse(fs.readFileSync(await download.path(),"utf8")),legacy);

    const event = {...legacy.cards[0],cardNumber:"TEST/S001-002",type:"event",product:"商品B",
      stats:{level:0,cost:0,power:null,soul:null},effects:[]};
    const overwrite = {...legacy.cards[0],color:"黄"};
    await $("importFile").setInputFiles({name:"fixtures.json",mimeType:"application/json",
      buffer:Buffer.from(JSON.stringify({schemaVersion:1,cards:[event,overwrite]}))});
    await $("jsonStatus").getByText(/fixtures.json/).waitFor();
    await $("importJson").click();
    assert.match(await $("jsonStatus").innerText(),/追加 1件.*既存保持 1件/);
    await $("importMode").selectOption("overwrite");
    page.once("dialog",d=>d.accept());
    await $("importJson").click();
    assert.match(await $("jsonStatus").innerText(),/上書き 2件/);
    await $("jsonText").fill(JSON.stringify({schemaVersion:1,cards:[event,{...event,cardNumber:"test/s001-002"}]}));
    await $("importJson").click();
    await $("issueList").getByText(/重複/).waitFor();

    await $("filterNumber").fill("s001-002");
    assert.equal(await $("cardRows").locator("tr").count(),1);
    await $("filterNumber").clear();
    await $("filterTitle").selectOption({label:"テストタイトル"});
    await $("filterProduct").selectOption({label:"商品B"});
    await $("exportGroup").click();
    assert.deepEqual(JSON.parse(await $("jsonText").inputValue()).cards,[event]);
    await $("cardRows").getByRole("button",{name:"TEST/S001-002"}).click();
    await $("imageStatus").getByText(/画像を取得できません/).waitFor();
    assert.equal(await $("power").isVisible(),false);
    await $("cardColor").fill("赤");
    await page.getByRole("button",{name:"カードを保存",exact:true}).click();
    await page.getByText("カードを保存しました。").waitFor();
    page.once("dialog",d=>d.accept());
    await $("deleteCard").click();
    await page.getByText("カードを削除しました。").waitFor();
    await $("exportAll").click();
    assert.deepEqual(JSON.parse(await $("jsonText").inputValue()).cards,[overwrite]);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(consoleErrors,[]);
    console.log("Card registration: iPhone viewport, image and fallback, draft restore, edits, file round-trip, filters and validation passed");
  } finally {
    await browser?.close();
    await new Promise(resolve=>server.close(resolve));
  }
}
main().catch(error=>{console.error(error);process.exitCode=1});
