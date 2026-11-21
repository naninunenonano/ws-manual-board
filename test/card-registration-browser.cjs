"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const {chromium,devices} = require("playwright");

const files = new Map([
  ["card-registration.html","text/html"],["card-registration.css","text/css"],
  ["card-registration.js","application/javascript"],["card-images.js","application/javascript"],
  ["card-catalog.js","application/javascript"]
]);

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
