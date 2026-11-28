const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const { chromium, devices } = require("playwright");

const cardNumbers = [
  "128-003", "128-009", "136-012", "128-017", "108-T04", "136-001", "136-005",
  "136-002", "136-006", "136-065", "136-076", "108-T13", "136-078", "128-021",
  "108-T09", "128-022"
];
const counts = [4,1,1,4,4,3,3,2,4,1,3,4,4,4,4,4];
const fixture = {title:"勇者一行",list:cardNumbers.map((number,i)=>({
  card_number:"SFN/S"+number,num:counts[i]
}))};
const files = new Map([
  ["/",["index.html","text/html"]],["/board-layout.css",["board-layout.css","text/css"]],
  ["/match-state.js",["match-state.js","text/javascript"]],
  ["/decklog-import.js",["decklog-import.js","text/javascript"]],
  ["/cloud-decks.js",["cloud-decks.js","text/javascript"]],
  ["/card-images.js",["card-images.js","application/javascript"]],
  ["/online-match.js",["online-match.js","text/javascript"]],
  ...["auto-rules.js","stella-effects.js","frieren-effects.js","oshi-effects.js","bot-match.js","bot-deck-editor.js","card-catalog.js","effects/engine.js","card-data/load.js"].map(file=>["/"+file,[file,"text/javascript"]]),
  ["/card-data/catalog.json",["card-data/catalog.json","application/json"]]
]);

async function main() {
  const server = http.createServer((request,response)=>{
    const entry = files.get(new URL(request.url,"http://localhost").pathname);
    if (!entry) { response.writeHead(404).end(); return; }
    const [path,type] = entry;
    response.setHeader("Content-Type",type+"; charset=utf-8");
    response.end(fs.readFileSync(path));
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  let browser;
  try {
    browser = await chromium.launch(fs.existsSync("/usr/bin/google-chrome") ? {channel:"chrome"} :
      fs.existsSync("/usr/bin/chromium") ? {executablePath:"/usr/bin/chromium"} : {});
    const desktop = await browser.newPage({viewport:{width:1280,height:800}});
    const url="http://127.0.0.1:"+server.address().port;
    await desktop.route("https://cdn.jsdelivr.net/npm/@supabase/**",route=>route.abort());
    await desktop.addInitScript(()=>{window.open=url=>{window.deckLogURL=url}});
    await desktop.goto(url);
    assert.equal(await desktop.locator("#deckCode").inputValue(),"");
    assert.equal(await desktop.getByRole("button",{name:"デッキ取得",exact:true}).count(),0);
    await desktop.locator("#deckCode").fill("U14QG");
    await desktop.locator("#openDeckLog").click();
    assert.equal(await desktop.evaluate(()=>window.deckLogURL),"https://decklog.bushiroad.com/view/U14QG");
    await desktop.locator("#toggleDeckRegistration").click();
    await desktop.locator("details").filter({has:desktop.locator("#deckJson")}).locator("summary").click();
    const payload={...fixture,list:fixture.list.map((card,i)=>({...card,cx:i>=fixture.list.length-2}))};
    await desktop.locator("#deckJson").fill(JSON.stringify(payload));
    await desktop.locator("#parseDeck").click();
    desktop.once("dialog",dialog=>dialog.accept("PC検証デッキ"));
    await desktop.locator("#applyDeck").click();
    assert.equal(await desktop.locator("#savedDeckSelect").inputValue(),"");
    await desktop.reload();
    assert.equal(await desktop.locator("#savedDeckSelect option").last().textContent(),"PC検証デッキ［同期待ち］");
    await desktop.close();
    const page = await browser.newPage({...devices["iPhone 13"],deviceScaleFactor:1});
    await page.route("https://cdn.jsdelivr.net/npm/@supabase/**",route=>route.abort());
    await page.route("https://www.c-labo-online.jp/data/c-labo/product/wssfns108t_*.jpg",route=>route.fulfill({
      contentType:"image/svg+xml",body:'<svg xmlns="http://www.w3.org/2000/svg" width="459" height="640"><rect width="459" height="640" fill="#456"/></svg>'
    }));
    const errors = [];
    page.on("pageerror",error=>errors.push(error.message));
    await page.addInitScript(deck=>{
      for(const p of [0,1])localStorage.setItem("ws-manual-deck-v1-p"+p,JSON.stringify(deck));
    },fixture);
    await page.goto("http://127.0.0.1:"+server.address().port);
    assert.equal(await page.locator("#startBattle").isVisible(),false);
    assert.equal(await page.locator("#openBotDeckEditor").isVisible(),true);
    assert.equal(await page.locator("#onlineControls summary").isVisible(),true);
    await page.locator("#startBattle").evaluate(button=>{button.parentElement.hidden=false});
    await page.locator("#startBattle").click();
    await page.locator("#confirmMulligan").click();
    await page.locator("#confirmMulligan").click();
    await page.locator("#boards .board").first().waitFor();
    fs.mkdirSync("layout-screenshots",{recursive:true});
    const loadBoardImages = () => page.locator("#boards img").evaluateAll(images=>Promise.allSettled(
      images.map(img=>{img.loading="eager";return Promise.race([img.decode(),new Promise(resolve=>setTimeout(resolve,8000))]);})
    ));
    await loadBoardImages();
    await page.screenshot({path:"layout-screenshots/empty.png",fullPage:true});
    assert.equal(await page.locator("#boards .stage.has-card").count(),0);

    // Populate both boards through the same draw/move operations used by the UI.
    await page.evaluate(()=>{
      const destinations = ["front0","front1","front2","back0","back1","waiting",
        "clock","clock","clock","clock","clock","level","level","level","stock","stock",
        "memory","memory","cx"];
      for(const p of [0,1]) {
        const change = document.querySelector("#battleSide");
        change.value = String(p);
        change.dispatchEvent(new Event("change"));
        const cards = players[p];
        // Reserve the two exact artwork fixtures before the other draws can consume them.
        for(const suffix of ["-T09","-022"]){
          const pile=[cards.deck,cards.hand].find(zone=>zone.some(card=>card.id.endsWith(suffix)));
          const index=pile.findIndex(card=>card.id.endsWith(suffix));
          const [reserved]=pile.splice(index,1);
          reserved.faceUp=false;
          cards.deck.unshift(reserved);
        }
        for(const z of destinations) {
          if (z === "cx" || (z === "level" && cards.level.length === 0)) {
            const index = cards.deck.findIndex(card => card.id.endsWith(z==="level"?"-T09":"-022"));
            cards.deck.push(...cards.deck.splice(index,1));
          }
          takeTop(p,"deck","hand");
          move(p,"hand",cards.hand.length-1,z);
        }
      }
      const change = document.querySelector("#battleSide");
      change.value = "0";
      change.dispatchEvent(new Event("change"));
    });
    await loadBoardImages();
    await page.screenshot({path:"layout-screenshots/populated.png",fullPage:true});
    const geometry = await page.locator("#boards").evaluate(root=>{
      const [upper,lower] = [1,0].map(p=>root.querySelector('.board[data-player="'+p+'"]'));
      function measure(board) {
        const bounds = board.getBoundingClientRect();
        const rect = el=>{
          const box = el.getBoundingClientRect();
          return {x:box.x-bounds.x,y:box.y-bounds.y,w:box.width,h:box.height};
        };
        const zones = Object.fromEntries([...board.children].map(el=>[el.dataset.z,rect(el)]));
        const fan = name => [...board.querySelectorAll('[data-z="'+name+'"] .zone-fan-card')].map(rect);
        const front = zones.front0, back = zones.back0;
        const overlap = { x:(Math.max(front.x,back.x)+Math.min(front.x+front.w,back.x+back.w))/2,
          y:(Math.max(front.y,back.y)+Math.min(front.y+front.h,back.y+back.h))/2 };
        return {width:bounds.width,height:bounds.height,zones,clock:fan("clock"),level:fan("level"),
          top:document.elementFromPoint(bounds.x+overlap.x,bounds.y+overlap.y)?.closest(".zone")?.dataset.z,
          piles:["stock","memory","cx","deck","waiting"].map(z=>rect(board.querySelector('[data-z="'+z+'"] .zone-preview')))};
      }
      return {upper:measure(upper),lower:measure(lower),images:root.querySelectorAll(".stage img").length,
        scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth};
    });
    const {upper,lower} = geometry;
    const near = (a,b)=>assert.ok(Math.abs(a-b)<1,`${a} vs ${b}`);
    assert.equal(geometry.scrollWidth,geometry.viewport);
    assert.equal(upper.top,"front0");
    assert.equal(lower.top,"front0");
    for(const key of Object.keys(lower.zones)) {
      const one = lower.zones[key], two = upper.zones[key];
      near(one.x+two.x+one.w, lower.width);
      near(one.y+two.y+one.h, lower.height);
      near(one.w,two.w);
      near(one.h,two.h);
    }
    assert.ok(lower.zones.front0.y<lower.zones.back0.y);
    assert.ok(lower.zones.back0.y<lower.zones.front0.y+lower.zones.front0.h);
    assert.ok(lower.zones.front0.x<lower.zones.back0.x&&lower.zones.back0.x<lower.zones.front1.x);
    assert.ok(lower.zones.front0.w>=50);
    for(const mat of [upper,lower]) {
      near(mat.zones.memory.h,mat.zones.deck.h);
      near(mat.zones.deck.h,mat.zones.waiting.h);
      assert.equal(mat.clock.length,5);
      assert.equal(mat.level.length,3);
      for(const [i,pile] of mat.piles.entries()) assert.ok(Math.abs(pile.w/pile.h-(i<3?1/0.7:0.7))<0.035);
    }
    assert.ok(lower.clock[0].x<lower.clock[1].x&&upper.clock[0].x>upper.clock[1].x);
    assert.ok(lower.level[0].y<lower.level[1].y&&upper.level[0].y>upper.level[1].y);
    assert.ok(lower.level[0].x>lower.level[1].x&&upper.level[0].x<upper.level[1].x);
    assert.equal(geometry.images,10);
    const lowerMat = page.locator('.board[data-player="0"]');
    const front = lowerMat.locator('[data-z="front0"]');
    const back = lowerMat.locator('[data-z="back0"]');
    const assertAngle = async (locator, angle)=>{
      const [cos,sin] = await locator.evaluate(el=>{
        const matrix = new DOMMatrix(getComputedStyle(el).transform);
        return [matrix.a,matrix.b];
      });
      assert.ok(Math.abs(cos-Math.cos(angle*Math.PI/180))<0.01);
      assert.ok(Math.abs(sin-Math.sin(angle*Math.PI/180))<0.01);
    };
    const hand = page.locator("#boards .player.active .hand .card").first();
    await hand.tap();
    await hand.tap();
    await page.getByRole("heading",{name:"移動先を選択",exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>selected),null);
    await page.locator("#close").click();
    await hand.tap();
    await page.locator("#boards .player.active .hand .card.selected").waitFor();
    await hand.tap();
    await page.locator("#boards .player.active .hand .card.selected").waitFor({state:"detached"});
    for(const [zone,label,angle] of [[front,"右90°",90],[back,"180°",180]]) {
      await zone.dblclick();
      await page.getByRole("button",{name:label,exact:true}).click();
      assert.equal(await zone.getAttribute("data-orientation"),String(angle));
      await assertAngle(zone.locator(".zone-preview"),angle);
    }
    const sideways = await front.locator(".zone-preview").boundingBox();
    assert.ok(sideways.width>sideways.height);
    await page.reload();
    assert.equal(await front.getAttribute("data-orientation"),"90");
    assert.equal(await back.getAttribute("data-orientation"),"180");
    await loadBoardImages();
    const climax = lowerMat.locator('[data-z="level"] img.rotated-cx-scan').first();
    await climax.waitFor();
    await assertAngle(climax,90);
    await page.evaluate(()=>{
      const card=players[0].level.find(card=>card.id.endsWith("-T09"));
      const body=showResolution("画像の向き",[card]);
      effectCardButton(body,card,"選択肢",()=>{});
    });
    for(const selector of [".modalcards .carddetail img.rotated-cx-scan",".effect-card-choice img.rotated-cx-scan"]){
      const thumbnail=page.locator("#dialog "+selector);
      await thumbnail.waitFor();
      const rotation=await thumbnail.evaluate(img=>{
        const {b,d}=new DOMMatrix(getComputedStyle(img).transform);
        return Math.atan2(b,d)*180/Math.PI;
      });
      assert.equal(Math.round(rotation),-90);
      const bounds=await thumbnail.boundingBox();
      assert.ok(bounds.width>bounds.height);
    }
    await page.evaluate(()=>closeResolution());
    await page.evaluate(()=>showCardDetail(players[0].level.find(card=>card.id.endsWith("-T09"))));
    const zoom = page.locator("#dialog .card-zoom-image.rotated-cx-scan img");
    await zoom.waitFor();
    await assertAngle(zoom,-90);
    await page.locator("#close").click();
    await page.screenshot({path:"layout-screenshots/rotated.png",fullPage:true});
    await front.dblclick();
    await page.getByRole("button",{name:"縦向き",exact:true}).click();
    assert.equal(await front.getAttribute("data-orientation"),"0");
    const clockZone = lowerMat.locator('[data-z="clock"]');
    const firstClock = clockZone.locator('[data-clock-index="0"]');
    const secondClock = clockZone.locator('[data-clock-index="1"]');
    const beforeClock = await page.evaluate(()=>players[side].clock.map(card=>card.uid));
    await firstClock.tap({position:{x:5,y:20}});
    assert.equal(await firstClock.getAttribute("aria-pressed"),"true");
    await secondClock.tap({position:{x:5,y:20}});
    assert.equal(await firstClock.getAttribute("aria-pressed"),"false");
    assert.equal(await secondClock.getAttribute("aria-pressed"),"true");
    await secondClock.tap({position:{x:5,y:20}});
    assert.equal(await secondClock.getAttribute("aria-pressed"),"false");
    await clockZone.getByRole("button",{name:"一覧",exact:true}).tap();
    await page.locator("#dialogBody").getByRole("button",{name:/クロック 3枚目 /}).tap();
    await clockZone.locator('[data-clock-index="2"][aria-pressed="true"]').waitFor();
    await clockZone.getByRole("button",{name:"移動先",exact:true}).tap();
    const destination = page.locator("#dialogBody select").first();
    await destination.selectOption("front0");
    await page.getByRole("button",{name:"移動する",exact:true}).tap();
    await page.locator("#dialogBody").getByText(/移動先が埋まっています/).waitFor();
    await page.locator("#close").tap();
    assert.deepEqual(await page.evaluate(()=>players[side].clock.map(card=>card.uid)),beforeClock);
    await clockZone.getByRole("button",{name:"移動先",exact:true}).tap();
    await destination.selectOption("hand");
    await page.getByRole("button",{name:"移動する",exact:true}).tap();
    await page.reload();
    assert.deepEqual(await page.evaluate(()=>players[side].clock.map(card=>card.uid)),beforeClock.filter((_,i)=>i!==2));
    assert.equal(await page.evaluate(()=>players[side].hand.at(-1).uid),beforeClock[2]);

    await page.evaluate(()=>{
      const board=players[side];
      board.clock.push(...board.deck.splice(0,7-board.clock.length));
      board.waiting.push(...board.deck.splice(0));
      updateBoard();
    });
    await page.getByRole("button",{name:"レベルアップ → リフレッシュ → リフレッシュポイント",exact:true}).click();
    const compulsory = page.locator("#dialogTitle");
    assert.match(await compulsory.innerText(),/強制レベルアップ/);
    assert.equal(await page.locator("#close").isVisible(),false);
    await page.keyboard.press("Escape");
    assert.match(await compulsory.innerText(),/強制レベルアップ/);
    assert.equal(await page.locator("#dialog").isVisible(),true);
    await page.locator("#dialogBody .modal-card").first().click();
    await page.locator("#dialog").waitFor({state:"hidden"});
    const forced=await page.evaluate(()=>({
      clock:players[side].clock.length,level:players[side].level.length,
      waiting:players[side].waiting.length,busy:ruleBusy
    }));
    assert.deepEqual(forced,{clock:1,level:4,waiting:0,busy:false});
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify(geometry));
    await checkBotDeckEditor(browser,url);
    await checkBot(browser,url);
    await checkAutoRules(browser,url);
    await checkPracticeCards(browser,url);
    await checkLevelOnePractice(browser,url);
    await checkPracticeMulligan(browser,url);
    await checkMirrorAutoplay(browser,url);
  } finally {
    if(browser)await browser.close();
    server.close();
  }
}
async function checkBotDeckEditor(browser,url){
  const page=await browser.newPage({...devices["iPhone 13"],deviceScaleFactor:1});
  try {
    await page.route("https://cdn.jsdelivr.net/npm/@supabase/**",route=>route.abort());
    await page.route("https://www.c-labo-online.jp/data/c-labo/product/**",route=>route.fulfill({
      contentType:"image/svg+xml",
      body:'<svg xmlns="http://www.w3.org/2000/svg" width="459" height="640"><rect width="459" height="640" fill="#456"/></svg>'
    }));
    await page.goto(url);
    await page.locator("#openBotDeckEditor").tap();
    await page.getByRole("heading",{name:"デッキ作成・Bot戦"}).waitFor();
    const start=page.locator("#startEditedBotBattle");
    await page.locator("#editNewDeck").tap();
    for(const [preset,title,count] of [["sakurarium","OSK",34],["r6d3n","OSK",34],["vhl0","OSK",34],["aogiri","AOH",18]]){
      await page.locator("#botDeckPreset").selectOption(preset);
      await page.locator("#applyBotDeckPreset").tap();
      assert.equal(await page.locator("#builderTitleFilter").inputValue(),title);
      assert.equal(await page.locator(".bot-deck-card-row").count(),count);
      assert.equal(await page.locator("#botDeckTotals").textContent(),"50/50枚（CX 8/8枚）");
    }
    await page.locator("#builtOnlineDeckName").fill("あおぎり高校 テスト用");
    await page.locator("#saveBuiltOnlineDeck").tap();
    await page.locator("#editOwnBotDeck").tap();
    await page.getByRole("button",{name:"巡遊者 グレイを1枚減らす",exact:true}).tap();
    assert.equal(await start.isDisabled(),true);
    const kohaku=page.locator(".bot-deck-card-row").filter({hasText:"銃弾のロンド コハク"});
    await kohaku.scrollIntoViewIfNeeded();
    const preview=kohaku.locator(".bot-deck-card-preview img");
    assert.match(await preview.getAttribute("src"),/wsstsw140_138\.jpg$/);
    await kohaku.getByRole("combobox",{name:"銃弾のロンド コハクのバージョン",exact:true}).selectOption("STS/W140-038SSP");
    assert.match(await preview.getAttribute("src"),/wsstsw140_004\.jpg$/);
    await preview.evaluate(async img=>{
      img.loading="eager";
      await img.decode();
    });
    await preview.waitFor({state:"visible"});
    await page.getByRole("button",{name:"銃弾のロンド コハク（SSP）を1枚増やす",exact:true}).tap();
    assert.equal(await start.isEnabled(),true);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
    await page.reload();
    await page.locator("#openBotDeckEditor").tap();
    await page.getByRole("textbox",{name:"デッキ名"}).fill("光り物入り");
    await page.locator("#saveBuiltOnlineDeck").tap();
    await page.getByRole("button",{name:"Bot",exact:true}).tap();
    await page.locator("#loadBuilderDeck").selectOption({label:"光り物入り"});
    await page.locator("#applyBuilderDeck").tap();
    await start.tap();
    await page.locator("#mulliganScreen").waitFor();
    assert.deepEqual(await page.evaluate(()=>match.decks.map(deck=>
      deck.cards.find(card=>card.id==="STS/W140-038SSP")?.num??0)),[1,1]);
  } finally {
    await page.close();
  }
}

async function checkBot(browser,url){
  const page=await browser.newPage({...devices["iPhone 13"],deviceScaleFactor:1});
  const errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.route("https://cdn.jsdelivr.net/npm/@supabase/**",route=>route.abort());
  await page.route("https://ws-tcg.com/**",route=>route.abort());
  const practice={title:"ステラソラ検証",list:[
    {card_number:"STS/W140-001",num:4,cx:false},
    {card_number:"STS/W140-002",num:4,cx:false},
    {card_number:"STS/W140-031",num:4,cx:true},
    ...fixture.list.slice(0,8).map(({card_number})=>({card_number,num:4,cx:false})),
    {card_number:"SFN/S128-021",num:2,cx:false},
    {card_number:"SFN/S128-022",num:4,cx:true}
  ]};
  await page.addInitScript(deck=>{
    if(!sessionStorage.botFixture){
      localStorage.setItem("ws-manual-deck-v1-p0",JSON.stringify(deck));
      sessionStorage.botFixture="1";
    }
  },practice);
  await page.goto(url);
  const button=(name)=>page.getByRole("button",{name,exact:true});
  const state=(source)=>page.evaluate(source);
  const checkTotals=async()=>assert.deepEqual(await state(()=>players.map(board=>zones.reduce((n,z)=>
    n+board[z].reduce((count,c)=>count+1+(c.markers?.length??0),0),0))),[50,50]);
  const start=async scenario=>{
    const setup=page.locator("#botSetup");
    if(!await setup.evaluate(el=>el.open))await setup.locator("summary").tap();
    await page.locator("#botScenario").selectOption(scenario);
    await page.locator("#startBotBattle").tap();
  };
  const reset=async()=>{
    page.once("dialog",dialog=>dialog.accept());
    await page.locator("#leaveBattle").tap();
    await page.locator("#nextBattle").tap();
    assert.equal(await page.locator("#playerActions").count(),1);
  };
  await start("opening");
  assert.equal(await state(()=>match.phase),"mulligan");
  await page.locator("#confirmMulligan").tap();
  assert.deepEqual(await state(()=>players.map(board=>[board.hand.length,board.deck.length])),[[5,45],[5,45]]);
  await reset();
  await start("open");
  assert.deepEqual(await state(()=>[players[1].front0.length,players[1].front1.length,players[1].deck.at(-1).cx]),[0,1,false]);
  await reset();
  await start("front");
  assert.equal(await state(()=>players[1].deck.at(-1).cx),true);
  assert.equal(await page.locator("#battleSide").isVisible(),false);
  assert.equal(await page.locator("#shuffle").isVisible(),false);
  const ownZone=name=>page.locator('#boards .zone[data-p="0"][data-z="'+name+'"]');
  await ownZone("deck").tap();
  assert.equal(await page.locator("#dialog").isVisible(),false);
  await page.evaluate(()=>{
    const board=players[0];
    const i=board.deck.findIndex(card=>card.id==="STS/W140-001");
    board.front0.push(...board.deck.splice(i,1));
    board.front0[0].faceUp=true;
    board.deck.push(...board.deck.splice(board.deck.findIndex(card=>card.cx===false),1));
    match.turn.phase="attack";
    updateBoard();
    selected={p:0,z:"front0",index:0};
    renderTurnControls();
  });
  await page.locator("#autoAttack").tap();
  await button("ストックに置く").tap();
  await button("ダメージを与える").tap();
  await button("控え室へ").tap();
  assert.match(await page.locator("#botStatus").innerText(),/キャンセル/);
  assert.deepEqual(await state(()=>[players[0].front0[0].orientation,players[0].stock.length,players[1].clock.length]),[180,1,0]);
  await checkTotals();
  await page.reload();
  assert.equal(await state(()=>match.bot.scenario),"front");
  await reset();

  await page.waitForFunction(()=>typeof botCatalog!=="undefined");
  await start("firen");
  const hand=page.locator("#boards .player.active .hand");
  await hand.locator('.card[title^="鋼に宿る優しき心 フィレン"]').tap({position:{x:8,y:10}});
  await hand.locator(".card.selected").waitFor();
  await page.locator('#boards .zone[data-p="0"][data-z="front0"]').tap();
  await button("黎明の刻 レイス").tap();
  await button("後列②").tap();
  assert.deepEqual(await state(()=>[players[0].back1[0].botLevel,botStats(0,players[0].front0[0]).power]),[2,7000]);
  await page.evaluate(()=>{
    move(0,"hand",players[0].hand.findIndex(card=>card.id==="STS/W140-031"),"cx");
    match.turn.phase="attack";
    selected={p:0,z:"front0",index:0};
    updateBoard();
  });
  assert.deepEqual(await state(()=>botStats(0,players[0].front0[0])),{power:8000,soul:2});
  await page.locator("#autoAttack").tap();
  await button("黎明の刻 レイス").first().tap();
  await button("手札へ").tap();
  await button("山札の上をストックへ").tap();
  assert.equal(await state(()=>players[0].hand.some(card=>card.id==="STS/W140-031")),true);
  await button("ダメージを与える").tap();
  await button("クロックへ").tap();
  assert.equal(await state(()=>players[1].front0[0].orientation),180);
  await checkTotals();
  assert.deepEqual(errors,[]);
  await page.close();
  console.log("Bot opening, presets, attack, Firen, Treasure and reload passed at 390px");
}

async function checkAutoRules(browser,url){
  const page=await browser.newPage({...devices["iPhone 13"],deviceScaleFactor:1});
  const errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.route("https://cdn.jsdelivr.net/npm/@supabase/**",route=>route.abort());
  await page.goto(url);
  const button=name=>page.getByRole("button",{name,exact:true});
  await page.locator("#botSetup summary").tap();
  await page.locator("#botScenario").selectOption("rules");
  await page.locator("#startBotBattle").tap();
  const hand=page.locator("#boards .player.active .hand");
  const center=page.locator('#boards .zone[data-p="0"][data-z="front1"]');
  await hand.locator('.card[title^="2コストの仮キャラ"]').first().tap({position:{x:8,y:10}});
  await page.locator("#dialog").waitFor({state:"hidden"});
  assert.equal(await page.locator('#boards .zone[data-p="0"] .stage-placement-target').count(),5);
  assert.equal(await page.locator('#boards .zone[data-p="1"] .stage-placement-target').count(),0);
  await page.locator("#playerActions #clearSelection").tap();
  assert.equal(await page.locator(".stage-placement-target").count(),0);
  await hand.locator('.card[title^="2コストの仮キャラ"]').first().tap({position:{x:8,y:10}});
  const occupied=page.locator('#boards .zone[data-p="0"][data-z="front0"]');
  const stock=await page.evaluate(()=>players[0].stock.length);
  assert.equal(await occupied.locator(".zone-preview").count(),1);
  await occupied.locator(".replaces-character").tap();
  assert.equal(await page.locator("#dialogTitle").innerText(),"舞台のキャラを入れ替えますか？");
  assert.equal(await page.evaluate(()=>players[0].stock.length),stock);
  await button("キャンセル").tap();
  assert.equal(await page.locator(".stage-placement-target").count(),0);
  await hand.locator('.card[title^="2コストの仮キャラ"]').first().tap({position:{x:8,y:10}});
  await center.getByRole("button",{name:"前列②に置く",exact:true}).tap();
  assert.equal(await center.locator(".bot-power").innerText(),"4500");
  await center.tap({position:{x:14,y:10}});
  await button("起動・ストック1枚でパワー＋500").tap();
  await button("使わない").tap();
  await page.locator("#nextPhase").tap();
  await hand.locator('.card[title^="仮CX"]').tap({position:{x:8,y:10}});
  assert.equal(await center.locator(".bot-power").innerText(),"5500");
  await page.locator("#nextPhase").tap();
  await center.tap({position:{x:14,y:10}});
  await page.locator("#autoAttack").tap();
  await button("フロントアタック").tap();
  assert.match(await page.locator("#botStatus").innerText(),/CXコンボ.*トリガー.*仮カウンター.*ソウル 4.*バトル/);
  assert.equal(await center.getAttribute("data-orientation"),"180");
  await page.locator("#nextPhase").tap();
  await center.tap({position:{x:14,y:10}});
  await button("アンコールしない").tap();
  await page.locator("#nextPhase").tap();
  await page.locator("#nextPhase").tap();
  assert.equal(await page.evaluate(()=>match.turn.player),1);
  assert.equal(await page.evaluate(()=>players[0].cx.length),0);
  await page.locator("#botStep").tap();
  assert.equal(await page.locator("#dialog").isVisible(),false);
  assert.equal(await page.evaluate(()=>match.turn.phase),"draw");
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
  assert.deepEqual(errors,[]);
  await page.close();
}

async function checkPracticeCards(browser,url){
  const page=await browser.newPage({...devices["iPhone 13"],deviceScaleFactor:1});
  const errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.route("https://cdn.jsdelivr.net/npm/@supabase/**",route=>route.abort());
  await page.goto(url);
  const button=name=>page.getByRole("button",{name,exact:true});
  const zone=name=>page.locator('#boards .zone[data-p="0"][data-z="'+name+'"]');
  const tapZone=name=>zone(name).tap({position:{x:14,y:10}});
  await page.locator("#botSetup summary").tap();
  await page.locator("#botScenario").selectOption("practice-cards");
  await page.locator("#startBotBattle").tap();
  assert.equal(await zone("front0").locator(".bot-power").innerText(),"3500");
  await tapZone("back1");
  await button("集中（1ストック・自身レスト）").tap();
  assert.match(await page.locator("#dialogTitle").innerText(),/最大2枚/);
  await button("2枚引く").tap();
  assert.equal(await zone("back1").getAttribute("data-orientation"),"90");
  await page.locator("#nextPhase").tap();
  await page.locator("#nextPhase").tap();
  await tapZone("front0");
  await page.locator("#autoAttack").tap();
  await button("ダイレクトアタック").tap();
  await button("仮キャラ").first().tap();
  await button("選択を確定").tap();
  assert.equal(await page.evaluate(()=>players[0].stock.at(-1).id),"BOT/W000-104");
  await tapZone("front1");
  await page.locator("#autoAttack").tap();
  await button("サイドアタック").tap();
  await button("仮CX").first().tap();
  await button("選択を確定").tap();
  assert.equal(await page.evaluate(()=>players[0].stock.at(-1).id),"BOT/W000-105");
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
  assert.deepEqual(errors,[]);
  await page.close();
}

async function checkLevelOnePractice(browser,url){
  const page=await browser.newPage({...devices["iPhone 13"],deviceScaleFactor:1});
  const errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.route("https://cdn.jsdelivr.net/npm/@supabase/**",route=>route.abort());
  await page.goto(url);
  const button=name=>page.getByRole("button",{name,exact:true});
  const hand=name=>page.locator('#boards .player.active .hand .card[title^="'+name+'"]')
    .tap({position:{x:8,y:10}});
  await page.locator("#botSetup summary").tap();
  await page.locator("#botScenario").selectOption("practice-level-one");
  await page.locator("#startBotBattle").tap();
  await hand("仮キャラ カムバック連動");
  await button("前列①に置く").tap();
  await page.locator("#nextPhase").tap();
  await hand("仮CX カムバック");
  await page.locator("#nextPhase").tap();
  await page.locator('#boards .zone[data-p="0"][data-z="front0"]').tap({position:{x:14,y:10}});
  await page.locator("#autoAttack").tap();
  await button("ダイレクトアタック").tap();
  await button("1枚見る").tap();
  for(let n=1;n<4;n++)await button("次の1枚を見る").tap();
  await page.getByRole("button",{name:/^1．.*を手札へ$/}).tap();
  assert.match(await page.locator("#botStatus").innerText(),/CXコンボで4枚確認/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
  assert.deepEqual(errors,[]);
  await page.close();
}

async function checkPracticeMulligan(browser,url){
  const page=await browser.newPage({...devices["iPhone 13"],deviceScaleFactor:1});
  await page.route("https://cdn.jsdelivr.net/npm/@supabase/**",route=>route.abort());
  await page.goto(url);
  await page.locator("#botSetup summary").tap();
  await page.locator("#botScenario").selectOption("red-blue-deck");
  await page.locator("#startBotBattle").tap();
  const cards=page.locator("#mulliganCards .practice-mulligan-card");
  assert.equal(await cards.count(),5);
  for(const card of await cards.all()){
    assert.match(await card.locator("strong").innerText(),/^仮/);
    assert.match(await card.locator(".practice-card-stats").innerText(),/トリガー/);
    assert.ok((await card.locator(".practice-card-effect").first().innerText()).trim());
  }
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
  const first=cards.first();
  await first.tap();
  assert.equal(await first.getAttribute("aria-pressed"),"true");
  assert.match(await page.locator("#mulliganProgress").innerText(),/交換 1枚/);
  await first.tap();
  assert.equal(await first.getAttribute("aria-pressed"),"false");
  await page.locator("#confirmMulligan").tap();
  await page.locator("#boards .player.active .practice-hand-card .card-zoom").first().tap();
  assert.match(await page.locator("#dialogTitle").innerText(),/^仮/);
  assert.ok(await page.locator("#dialogBody .practice-card-effect").first().isVisible());
  await page.locator("#close").tap();
  await page.evaluate(()=>{
    const [own,rival]=players;
    for(const board of players)while(board.hand.length)botMove(board,"hand",0,"deck");
    const put=(board,id,to)=>botMove(board,"deck",board.deck.findIndex(c=>c.id.endsWith(id)),to);
    put(own,"101","front0");put(own,"104","deck");
    put(rival,"119","clock");put(rival,"120","clock");
    setTurnPhase("attack");
  });
  const clock=page.locator('#boards .zone[data-p="1"][data-z="clock"]');
  assert.equal(await clock.locator(".practice-card-face").count(),2);
  await clock.locator(".clock-actions").getByRole("button",{name:"一覧"}).tap();
  assert.equal(await page.locator("#dialogBody .practice-card-face").count(),2);
  await page.locator("#close").tap();
  await page.locator('#boards .zone[data-p="0"][data-z="front0"]').tap({position:{x:14,y:10}});
  await page.locator("#autoAttack").tap();
  await page.getByRole("button",{name:"ダイレクトアタック",exact:true}).tap();
  assert.equal(await page.locator("#dialogTitle").innerText(),"自分のトリガーチェック");
  assert.equal(await page.locator("#dialogBody .practice-card-face").getAttribute("data-card-number"),"104");
  assert.match(await page.locator(".trigger-icons").innerText(),/カムバック/);
  assert.equal(await page.evaluate(()=>players[0].stock.length),0);
  await page.getByRole("button",{name:"確認して進む",exact:true}).tap();
  await page.getByRole("button",{name:"選ばず進む",exact:true}).tap();
  assert.equal(await page.evaluate(()=>players[0].stock.at(-1).id),"BOT/W000-104");
  await page.close();
}

async function checkMirrorAutoplay(browser,url){
  const page=await browser.newPage({...devices["iPhone 13"],deviceScaleFactor:1});
  await page.route("https://cdn.jsdelivr.net/npm/@supabase/**",route=>route.abort());
  await page.goto(url);
  await page.locator("#botSetup summary").tap();
  await page.locator("#botScenario").selectOption("red-blue-deck");
  await page.locator("#startBotBattle").tap();
  await page.locator("#confirmMulligan").tap();
  await page.evaluate(()=>{
    const b=players[1];
    while(b.hand.length)botMove(b,"hand",0,"deck");
    botMove(b,"deck",b.deck.findIndex(c=>c.id.endsWith("-101")),"front0");
    finishEndTurn();
    setTurnPhase("attack");
  });
  assert.equal(await page.locator("#botStep").isVisible(),false);
  await page.locator("#dialogTitle").filter({hasText:"Botのトリガーチェック"}).waitFor();
  assert.equal(await page.evaluate(()=>players[1].stock.length),0);
  await page.getByRole("button",{name:"確認して進む",exact:true}).tap();
  await page.locator("#dialogTitle").filter({hasText:/自分の.*ダメージ/}).waitFor();
  await page.getByRole("button",{name:"確認して進む",exact:true}).tap();
  await page.waitForFunction(()=>match.turn.player===0);
  assert.equal(await page.evaluate(()=>players[1].stock.length),1);
  await page.close();
}

main().catch(error=>{console.error(error);process.exitCode=1});
