"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const http=require("node:http");
const {randomUUID}=require("node:crypto");
const {chromium}=require("playwright");
const {onlineTestDatabase}=require("./online-db.cjs");

async function main() {
  const db=await onlineTestDatabase();
  const [host,guest,late]=Array.from({length:3},()=>randomUUID());
  for(const id of [host,guest,late])await db.query("insert into auth.users values ($1)",[id]);
  const channels=new Set();
  let work=Promise.resolve();
  let dropHostReply=false;
  function query(user,name,args) {
    const result=work.then(async()=>{
      await db.exec("set role authenticated");
      try{
        await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
        const {p_action,p_room=null,p_revision=null,p_operation=null,p_data={}}=args;
        const functions={ws_attack_exchange:"ws_attack_exchange",ws_encore:"ws_encore",ws_online_room:"ws_online_room"};
        const sql="select "+functions[name]+"($1,$2,$3,$4,$5) as data";
        const response=await db.query(sql,[p_action,p_room,p_revision,p_operation,p_data]);
        return {data:response.rows[0].data,error:null};
      }catch(e){return {data:null,error:{code:e.code,message:e.message}}}
      finally{await db.exec("reset role")}
    });
    work=result.catch(()=>{});
    return result;
  }
  const asset=new Map([["/","index.html"],["/cloud-decks.js","cloud-decks.js"],["/decklog-import.js","decklog-import.js"],
    ["/card-images.js","card-images.js"],["/online-match.js","online-match.js"],["/board-layout.css","board-layout.css"],["/match-state.js","match-state.js"],
    ...["auto-rules.js","stella-effects.js","frieren-effects.js","bot-match.js","bot-deck-editor.js","card-catalog.js","effects/engine.js","card-data/load.js","card-data/catalog.json"].map(file=>["/"+file,file])]);
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,"http://localhost");
    const field=asset.get(url.pathname);
    if(!field){res.writeHead(404).end();return}
    res.setHeader("Content-Type",field.endsWith(".html")?"text/html":field.endsWith(".css")?"text/css":"application/javascript");
    let script=fs.readFileSync(field,"utf8");
    if(field==="cloud-decks.js")script+="\nloadDeckCloudClient=()=>Promise.resolve(window.fixtureCloud);";
    res.end(script);
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  let browser;
  async function pageFor(user,title) {
    const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
    await ctx.exposeBinding("testOnlineRpc",async(_source,name,args)=>{
      const result=await query(user,name,args);
      if(args.p_action!=="read" && result.data?.room && !result.error){
        for(const page of channels)page.evaluate(()=>window.testReceiveRevision?.()).catch(()=>{});
      }
      if(user===host && args.p_action==="board" && dropHostReply){
        dropHostReply=false;
        return {error:{message:"network disconnected after commit"}};
      }
      return result;
    });
    await ctx.route("https://ws-tcg.com/**",route=>route.abort());
    await ctx.addInitScript(({user,title})=>{
      const fixture={id:"fixture-"+user,deck:{title,list:Array.from({length:13},(_,n)=>({
        card_number:title+"-"+n,num:n===12?2:4,cx:n<2
      }))}};
      if(!localStorage.getItem("ws-manual-deck-library-v1"))localStorage.setItem("ws-manual-deck-library-v1",JSON.stringify([fixture]));
      const client={
        auth:{getSession:async()=>({data:{session:{user:{id:user}}}})},
        from:()=>({select(){return this},eq(){return this},order(){return this},limit(){return this},then(resolve){resolve({data:[]})}}),
        rpc:(name,args)=>window.testOnlineRpc(name,args),
        channel:()=>({
          on(_kind,_filter,cb){window.testReceiveRevision=cb;return this},
          subscribe(cb){cb("SUBSCRIBED");return this}
        }),
        removeChannel:()=>{window.testReceiveRevision=null}
      };
      window.fixtureCloud=client;
    },{user,title});
    const page=await ctx.newPage();
    channels.add(page);
    await page.goto("http://127.0.0.1:"+server.address().port);
    return page;
  }
  try{
    browser=await chromium.launch(fs.existsSync("/usr/bin/google-chrome")?{channel:"chrome"}:{});
    const a=await pageFor(host,"HOST"),b=await pageFor(guest,"GUEST"),c=await pageFor(late,"LATE");
    const $=(page,id)=>page.locator("#"+id);
    const begin=page=>page.locator("#onlineControls summary").click();
    await Promise.all([begin(a),begin(b),begin(c)]);
    await $(b,"openOnlineDeckBuilder").tap();
    await b.getByRole("heading",{name:"デッキ作成・Bot戦",exact:true}).waitFor();
    await $(b,"builtOnlineDeckName").fill("フリーレン検証");
    assert.equal(await $(b,"saveBuiltOnlineDeck").isDisabled(),true);
    await $(b,"botDeckPreset").selectOption("frierenGreen");
    await $(b,"applyBotDeckPreset").tap();
    await $(b,"saveBuiltOnlineDeck").tap();
    await $(b,"onlineStatus").filter({hasText:"フリーレン検証"}).waitFor();
    await $(a,"onlineCreate").click();
    await $(a,"onlineCodeOutput").waitFor();
    const code=await $(a,"onlineCodeOutput").textContent();
    assert.match(code,/^[0-9A-F]{12}$/);
    await $(b,"onlineCode").fill(code);
    await $(b,"onlineJoin").click();
    await $(b,"onlineReady").waitFor();
    await $(b,"onlineDeck").selectOption({label:"フリーレン検証"});
    await $(c,"onlineCode").fill(code);
    await $(c,"onlineJoin").click();
    await c.getByText("ルームの参加枠が埋まっています",{exact:true}).first().waitFor();
    await $(a,"onlineReady").click();
    await b.getByText(/相手 準備済み/).first().waitFor();
    await $(b,"onlineReady").click();
    await $(a,"onlineStart").click();
    await Promise.all([$(a,"mulliganScreen").waitFor(),$(b,"mulliganScreen").waitFor()]);
    assert.equal(await a.locator("#mulliganCards button").count(),5);
    assert.equal(await b.locator("#mulliganCards button").count(),5);
    assert.equal(await b.evaluate(()=>players[side].hand.every(card=>card.id.startsWith("SFN/"))),true);
    assert.equal(await b.evaluate(()=>match.decks[side].cards.find(card=>card.id==="SFN/S136-033").num),3);
    assert.doesNotMatch(await b.locator("#mulliganCards").innerText(),/HOST/);
    await $(a,"confirmMulligan").click();
    await a.getByText(/相手のマリガンを待っています/).first().waitFor();
    await $(b,"onlineMulliganReconnect").click();
    await $(b,"confirmMulligan").click();
    await Promise.all([$(a,"battleScreen").waitFor(),$(b,"battleScreen").waitFor()]);
    assert.equal(await $(a,"battleSide").isDisabled(),true);
    assert.equal(await $(b,"battleSide").isDisabled(),true);
    const characterInHand=async page=>page.locator("#boards .player.active .hand .card")
      .nth(await page.evaluate(()=>players[side].hand.findIndex(card=>card.cx===false)));
    const me=a.locator("#boards .player.active .hand .card").first();
    const zone=a.locator('#boards .zone[data-p="0"][data-z="front0"]');
    await (await characterInHand(a)).tap();
    await a.locator("#boards .card.selected").waitFor();
    dropHostReply=true;
    await zone.click();
    await b.locator('#boards .zone[data-p="0"][data-z="front0"].has-card').waitFor();
    assert.equal(await b.evaluate(()=>players[0].hand.every(card=>!card.id&&!card.uid)),true);
    assert.equal(await b.evaluate(()=>players[0].deck.every(card=>!card.id&&!card.uid)),true);
    assert.equal(await b.evaluate(()=>players[0].front0.length),1);
    const beforeReveal=await a.evaluate(()=>players[0].deck.map(card=>({id:card.id,uid:card.uid})));
    const top=beforeReveal.at(-1);
    await $(a,"onlineRevealDeckTop").tap();
    await $(a,"onlinePublicReveals").getByText("自分の公開カード",{exact:true}).waitFor();
    await $(b,"onlinePublicReveals").getByText("相手の公開カード",{exact:true}).waitFor();
    for(const page of [a,b]){
      const cards=$(page,"onlinePublicReveals").locator(".modal-card");
      assert.equal(await cards.count(),1);
      assert.equal((await cards.innerText()).trim(),top.id);
    }
    assert.deepEqual(await a.evaluate(()=>players[0].deck.map(card=>({id:card.id,uid:card.uid}))),beforeReveal);
    assert.equal(await b.evaluate(()=>players[0].deck.every(card=>!card.id&&!card.uid)),true);
    await $(b,"onlinePublicReveals").getByRole("button",{name:top.id,exact:true}).tap();
    await b.getByRole("heading",{name:"カード情報",exact:true}).waitFor();
    await $(b,"close").tap();
    await $(a,"onlineEndReveal").tap();
    await Promise.all([$(a,"onlinePublicReveals").waitFor({state:"hidden"}),$(b,"onlinePublicReveals").waitFor({state:"hidden"})]);
    await $(b,"onlineReveal").click();
    await b.locator("#dialogBody select option").first().evaluate(o=>o.value).then(value=>b.locator("#dialogBody select").selectOption(value));
    await b.getByRole("button",{name:"選んだカードを公開",exact:true}).click();
    await $(a,"onlineOpponentReveal").waitFor();
    await $(b,"onlineEndReveal").click();
    await $(a,"onlineOpponentReveal").waitFor({state:"hidden"});
    a.once("dialog",dialog=>dialog.accept("2"));
    await $(a,"onlineDeckRequest").click();
    await $(b,"onlineAcceptDeck").click();
    await b.getByText(/山札を確認（上から・残り2枚）/).waitFor();
    await $(a,"onlineOpponentReveal").waitFor();
    await b.locator("#dialogBody > select").selectOption("bottom");
    await b.getByRole("button",{name:"残りのカードを確定",exact:true}).click();
    await $(a,"onlineOpponentReveal").waitFor({state:"hidden"});
    await a.evaluate(()=>window.dispatchEvent(new Event("offline")));
    await a.getByText(/通信が切断されました/).last().waitFor();
    await a.evaluate(()=>window.dispatchEvent(new Event("online")));
    await a.locator("#onlineBattleStatus").filter({hasText:"接続済み"}).waitFor();
    await a.reload();
    await $(a,"battleScreen").waitFor();
    assert.equal(await a.evaluate(()=>players[0].front0.length),1);
    const clockA=a.locator('#boards .zone[data-p="0"][data-z="clock"]');
    const clockB=b.locator('#boards .zone[data-p="0"][data-z="clock"]');
    const returned=await a.evaluate(()=>players[0].hand[0].uid);
    await me.tap();
    await a.locator("#boards .card.selected").waitFor();
    await clockA.tap();
    await clockB.locator(".zone-fan-card").waitFor();
    assert.equal(await clockB.getByRole("button",{name:"一覧",exact:true}).count(),0);
    const clockCard=clockA.locator('[data-clock-index="0"]');
    await clockCard.tap();
    assert.equal(await clockCard.getAttribute("aria-pressed"),"true");
    await clockA.getByRole("button",{name:"移動先",exact:true}).tap();
    await a.locator("#dialogBody select").first().selectOption("hand");
    await a.getByRole("button",{name:"移動する",exact:true}).tap();
    await clockB.locator(".zone-fan-card").waitFor({state:"detached"});
    assert.equal(await a.evaluate(()=>players[0].hand.at(-1).uid),returned);
    assert.equal(await b.evaluate(()=>players[0].hand.every(card=>!card.id&&!card.uid)),true);
    const attackerSeat=await a.evaluate(()=>match.turn.player);
    const attacker=attackerSeat===0?a:b, defender=attacker===a?b:a;
    const attackZone=page=>page.locator('#boards .zone[data-p="'+attackerSeat+'"][data-z="front0"]');
    if(attacker===b){
      await (await characterInHand(b)).tap();
      await b.locator("#boards .card.selected").waitFor();
      await attackZone(b).tap();
      await a.waitForFunction(()=>players[1].front0.length===1);
    }
    await $(attacker,"nextPhase").tap();
    await attacker.getByRole("button",{name:"確認完了・通常ドロー",exact:true}).tap();
    await $(attacker,"nextPhase").tap();
    await $(attacker,"clockSkip").tap();
    await $(attacker,"nextPhase").tap();
    await $(attacker,"nextPhase").tap();
    await attacker.locator("#turnStatus").filter({hasText:"アタックフェイズ"}).waitFor();
    const trigger=await attacker.evaluate(()=>players[side].deck.at(-1).id);
    await attackZone(attacker).tap();
    await $(attacker,"autoAttack").tap();
    await attacker.getByRole("heading",{name:"トリガーチェック・解決領域",exact:true}).waitFor();
    await defender.waitForFunction(seat=>players[seat].front0[0]?.orientation===90,attackerSeat);
    await $(defender,"onlinePublicReveals").getByText(trigger,{exact:true}).waitFor();
    assert.equal(await defender.evaluate(seat=>players[seat].deck.every(card=>!card.id&&!card.uid),attackerSeat),true);
    await attacker.getByRole("button",{name:"ストックに置く",exact:true}).tap();
    await defender.waitForFunction(seat=>players[seat].stock.length===1,attackerSeat);
    assert.equal(await defender.evaluate(seat=>players[seat].stock.every(card=>!card.id&&!card.uid),attackerSeat),true);
    await $(defender,"onlinePublicReveals").waitFor({state:"hidden"});

    const defenderSeat=1-attackerSeat;
    const expected=await defender.evaluate(()=>{
      const {deck,stock}=players[side];
      stock.push(deck.pop());
      const ids=[deck.find(c=>c.cx),...deck.filter(c=>!c.cx).slice(0,2).reverse()];
      for(const card of ids)deck.push(...deck.splice(deck.indexOf(card),1));
      updateBoard();
      return deck.slice(-3).reverse().map(card=>card.id);
    });
    const applyDamage=async count=>{
      await defender.locator('#boards .zone[data-p="'+defenderSeat+'"][data-z="deck"]').tap();
      await defender.locator("#dialogBody select").first().selectOption("damage");
      await defender.getByLabel("枚数",{exact:true}).selectOption(String(count));
      await defender.getByRole("button",{name:"実行",exact:true}).tap();
    };
    const revealed=$(attacker,"onlinePublicReveals").locator(".modal-card span");
    assert.equal(await $(attacker,"attackExchange").isHidden(),true);
    await $(defender,"attackExchange").tap();
    const counter=await defender.evaluate(()=>players[side].hand[1].id);
    const handUid=await defender.evaluate(()=>players[side].hand[1].uid);
    await defender.getByLabel("カウンターに使う手札",{exact:true}).selectOption(handUid);
    await defender.getByLabel("ストックコスト",{exact:true}).selectOption("1");
    await defender.getByRole("button",{name:"カウンターを使う",exact:true}).tap();
    await attacker.waitForFunction(({seat,id})=>players[seat].waiting.at(-2)?.id===id && players[seat].stock.length===0,
      {seat:defenderSeat,id:counter});
    assert.equal(await $(attacker,"attackExchange").isHidden(),true);
    await defender.reload();
    await $(defender,"attackExchange").filter({hasText:"カウンター効果の処理完了"}).waitFor();
    await $(defender,"attackExchange").tap();
    await defender.getByRole("button",{name:"効果の処理を確定",exact:true}).tap();
    await $(attacker,"attackExchange").tap();
    await attacker.getByLabel("枚数",{exact:true}).selectOption("2");
    await attacker.getByRole("button",{name:"ダメージ枚数を確定",exact:true}).tap();
    await $(defender,"attackExchange").tap();
    await revealed.first().waitFor();
    assert.deepEqual(await revealed.allTextContents(),expected.slice(0,1));
    await defender.getByRole("button",{name:"次のカードを公開",exact:true}).tap();
    await revealed.nth(1).waitFor();
    assert.deepEqual(await revealed.allTextContents(),expected.slice(0,2));
    await defender.getByRole("button",{name:"キャンセルなしとしてクロック",exact:true}).tap();
    await attacker.waitForFunction(seat=>players[seat].clock.length===2,defenderSeat);
    assert.deepEqual(await attacker.evaluate(seat=>players[seat].clock.map(card=>card.id),defenderSeat),expected.slice(0,2));
    await $(attacker,"onlinePublicReveals").waitFor({state:"hidden"});
    await applyDamage(3);
    await revealed.first().waitFor();
    assert.deepEqual(await revealed.allTextContents(),expected.slice(2));
    assert.equal(await defender.getByRole("button",{name:"次のカードを公開",exact:true}).count(),0);
    await defender.getByRole("button",{name:"キャンセルとして控え室",exact:true}).tap();
    await attacker.waitForFunction(({seat,id})=>players[seat].waiting.at(-1)?.id===id,{seat:defenderSeat,id:expected[2]});
    assert.equal(await attacker.evaluate(seat=>players[seat].clock.length,defenderSeat),2);
    assert.equal(await attacker.evaluate(seat=>players[seat].deck.every(card=>!card.id&&!card.uid),defenderSeat),true);
    await attacker.evaluate(()=>{players[side].front0[0].orientation=180;updateBoard()});
    await defender.waitForFunction(p=>players[p].front0[0]?.orientation===180,attackerSeat);
    await defender.evaluate(()=>{
      const card=players[side].hand.find(c=>!c.cx);
      move(side,"hand",players[side].hand.indexOf(card),"back0");
    });
    await attacker.waitForFunction(p=>players[p].back0.length===1,defenderSeat);
    await defender.evaluate(()=>{players[side].back0[0].orientation=180;updateBoard()});
    await attacker.waitForFunction(p=>players[p].back0[0]?.orientation===180,defenderSeat);
    await $(attacker,"nextPhase").tap();
    await $(defender,"encoreStatus").filter({hasText:"アンコールステップ開始時の効果確認"}).waitFor();
    assert.equal(await $(defender,"encoreAction").isHidden(),true);
    await $(attacker,"encoreAction").tap();
    await $(defender,"encoreAction").tap();
    await $(attacker,"encoreAction").tap();
    await attacker.locator("#dialogBody button.modal-card").first().tap();
    await $(defender,"encoreStatus").filter({hasText:"アンコール方法の選択"}).waitFor();
    await attacker.getByRole("button",{name:"手札1枚を選ぶ",exact:true}).tap();
    assert.equal(await attacker.getByRole("button",{name:"選んだ手札を控え室へ",exact:true}).isEnabled(),false);
    await attacker.locator("#dialogBody button.modal-card").first().tap();
    await attacker.getByRole("button",{name:"選んだ手札を控え室へ",exact:true}).tap();
    await defender.waitForFunction(p=>players[p].front0[0]?.orientation===90,attackerSeat);
    await $(defender,"encoreStatus").filter({hasText:"アンコール処理後の効果確認"}).waitFor();
    await attacker.reload();
    await $(attacker,"encoreAction").filter({hasText:"次のキャラへ"}).tap();
    await $(attacker,"encoreAction").filter({hasText:"自分のアンコール処理を完了"}).tap();
    await $(defender,"encoreAction").tap();
    await defender.locator("#dialogBody button.modal-card").first().tap();
    await defender.getByRole("button",{name:"アンコールしない",exact:true}).tap();
    await attacker.waitForFunction(p=>players[p].back0.length===0,defenderSeat);
    await $(defender,"encoreAction").filter({hasText:"次のキャラへ"}).tap();
    await $(defender,"encoreAction").filter({hasText:"自分のアンコール処理を完了"}).tap();
    await $(attacker,"encoreStatus").filter({hasText:"アンコールステップ完了"}).waitFor();
    await $(attacker,"nextPhase").tap();
    await $(defender,"turnStatus").filter({hasText:"エンドフェイズ"}).waitFor();
    b.once("dialog",dialog=>dialog.accept());
    await $(b,"surrender").click();
    await a.getByText("プレイヤー2が降参しました。勝者：プレイヤー1",{exact:true}).waitFor();
    console.log("Chromium: independent sessions joined, started, moved once across response loss, revealed, reconnected, and ended");
  } finally {
    await browser?.close();
    await new Promise(resolve=>server.close(resolve));
    await db.close();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1});
