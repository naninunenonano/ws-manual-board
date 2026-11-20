const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const { existsSync } = require("node:fs");
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
  ["/decklog-import.js",["decklog-import.js","text/javascript"]]
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
    browser = await chromium.launch(existsSync("/usr/bin/google-chrome") ? {channel:"chrome"} : {});
    const page = await browser.newPage({...devices["iPhone 13"],deviceScaleFactor:1});
    const errors = [];
    page.on("pageerror",error=>errors.push(error.message));
    await page.addInitScript(deck=>{
      for(const p of [0,1])localStorage.setItem("ws-manual-deck-v1-p"+p,JSON.stringify(deck));
    },fixture);
    await page.goto("http://127.0.0.1:"+server.address().port);
    await page.locator("#startBattle").click();
    await page.locator("#confirmMulligan").click();
    await page.locator("#confirmMulligan").click();
    await page.locator("#boards .board").first().waitFor();
    fs.mkdirSync("layout-screenshots",{recursive:true});
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
        for(const z of destinations) {
          const cards = players[p];
          if (z === "cx") {
            const index = cards.deck.findIndex(card => /-(T09|022)$/.test(card.id));
            if (index !== -1) cards.deck.push(...cards.deck.splice(index,1));
          }
          takeTop(p,"deck","hand");
          move(p,"hand",cards.hand.length-1,z);
        }
      }
      const change = document.querySelector("#battleSide");
      change.value = "0";
      change.dispatchEvent(new Event("change"));
    });
    await page.locator("#boards img").evaluateAll(images=>Promise.allSettled(
      images.map(img=>{img.loading="eager";return Promise.race([img.decode(),new Promise(resolve=>setTimeout(resolve,8000))]);})
    ));
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
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify(geometry));
  } finally {
    if(browser)await browser.close();
    server.close();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1});
