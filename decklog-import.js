"use strict";
// Deck Log public website internal API. This is not a guaranteed public API.
// Do not persist a response until validated; CORS may block browser requests.
(() => {
  const proxyBase = "https://ws-decklog-proxy.spicahosino.workers.dev";
  const $ = id => document.getElementById(id);
  let pending = null;
  let transferRevision = 0;
  const imageTypeCache = new Map();
  function detectLandscape(id){
    if(imageTypeCache.has(id))return imageTypeCache.get(id);
    const promise=new Promise(resolve=>{const url=officialImageUrl(id);if(!url){resolve(null);return}const img=new Image();img.onload=()=>resolve(img.naturalWidth>img.naturalHeight);img.onerror=()=>resolve(null);img.src=url});
    imageTypeCache.set(id,promise);return promise;
  }
  async function classify(deck){
    const results=await Promise.all(deck.cards.map(async card=>({id:card.id,num:card.num,cx:typeof card.cx==="boolean"?card.cx:await detectLandscape(card.id)})));
    return {...deck,cards:results};
  }
  function cxCount(deck){return deck.cards.reduce((n,c)=>n+(c.cx===true?c.num:0),0)}
  function cxReady(deck){return deck.cards.every(c=>typeof c.cx==="boolean")&&cxCount(deck)===8}
  function confirmCx(deck){
    const table=$("deckPreview");const info=document.createElement("p");info.textContent="CX画像判定："+cxCount(deck)+"枚 / 8枚。画像取得失敗・縦長CXなどは下のチェックを修正してください。";table.append(info);
    for(const card of deck.cards){const label=document.createElement("label");label.style.cssText="display:flex;align-items:center;gap:6px;margin:5px 0";const check=document.createElement("input");check.type="checkbox";check.checked=card.cx===true;check.onchange=()=>{card.cx=check.checked;info.textContent="CX判定："+cxCount(deck)+"枚 / 8枚";$("applyDeck").disabled=!cxReady(deck)};const img=document.createElement("img");img.src=officialImageUrl(card.id)||"";img.style.cssText="width:45px;height:65px;object-fit:contain";label.append(check,img,document.createTextNode(card.id+" × "+card.num));table.append(label)}
    $("applyDeck").disabled=!cxReady(deck);
  }
  const storageKey=p=>"ws-manual-deck-v1-p"+p;
  const libraryKey="ws-manual-deck-library-v1";
  const selectedKey=p=>"ws-manual-deck-selected-v1-p"+p;
  function library(){try{const v=JSON.parse(localStorage.getItem(libraryKey)||"[]");return Array.isArray(v)?v:[]}catch(e){return []}}
  function normalize(v){return parse({title:v.title,list:Array.isArray(v.list)?v.list:v.cards.map(c=>({card_number:c.id,num:c.num,cx:c.cx}))})}
  function migrate(){
    const list=library();let changed=false;
    for(const p of [0,1])try{
      const raw=localStorage.getItem(storageKey(p));if(!raw)continue;
      const deck=normalize(JSON.parse(raw)),id="legacy-"+p;
      if(!list.some(x=>x.id===id)){list.push({id,deck:{title:deck.title,list:deck.cards.map(c=>({card_number:c.id,num:c.num,cx:c.cx}))}});changed=true}
      if(!localStorage.getItem(selectedKey(p)))localStorage.setItem(selectedKey(p),id);
      localStorage.removeItem(storageKey(p));
    }catch(e){}
    if(changed)localStorage.setItem(libraryKey,JSON.stringify(list));
  }
  function savedDeck(p){
    try{const id=localStorage.getItem(selectedKey(p)),item=library().find(x=>x.id===id);return item?normalize(item.deck):null}catch(e){return null}
  }
  function updateSavedStatus(){
    const list=library(),select=$("savedDeckSelect"),id=localStorage.getItem(selectedKey(side));
    select.replaceChildren();const empty=document.createElement("option");empty.value="";empty.textContent="未選択";select.append(empty);
    for(const item of list){const o=document.createElement("option");o.value=item.id;o.textContent=item.deck.title;select.append(o)}
    select.value=list.some(x=>x.id===id)?id:"";
    const deck=savedDeck(side);
    $("savedDeckStatus").textContent="登録済み "+list.length+"件／プレイヤー"+(side+1)+"："+(deck?deck.title:"未選択");
  }
  $("savedDeckSelect").onchange=()=>{
    try{localStorage.setItem(selectedKey(side),$("savedDeckSelect").value)}catch(e){message("選択を保存できません")}
    updateSavedStatus();
  };
  function apply(deck){
    if(!cxReady(deck)){message("CXを8枚に確定してください");return}
    if(!isDeckSetup())return;
    const input=prompt("デッキ名",deck.title||"新しいデッキ");if(input===null)return;
    const title=input.trim();if(!title){message("デッキ名が空です");return}
    const list=library(),id="deck-"+Date.now()+"-"+Math.random().toString(36).slice(2,8);
    list.push({id,deck:{title,list:deck.cards.map(c=>({card_number:c.id,num:c.num,cx:c.cx}))}});
    try{localStorage.setItem(libraryKey,JSON.stringify(list));localStorage.setItem(selectedKey(side),id)}
    catch(e){message("デッキを保存できません");return}
    updateSavedStatus();message("「"+title+"」を登録しました");
  }
  $("loadSavedDeck").onclick=async()=>{if(!isDeckSetup())return;const deck=savedDeck(side);if(deck)preview(await classify(deck));else message("デッキを選択してください")};
  $("clearSavedDeck").onclick=()=>{
    if(!isDeckSetup())return;
    const id=$("savedDeckSelect").value,item=library().find(x=>x.id===id);if(!item)return;
    if(!confirm("「"+item.deck.title+"」を削除しますか？"))return;
    try{
      localStorage.setItem(libraryKey,JSON.stringify(library().filter(x=>x.id!==id)));
      for(const p of [0,1])if(localStorage.getItem(selectedKey(p))===id)localStorage.removeItem(selectedKey(p));
    }catch(e){message("削除に失敗しました");return}
    pending=null;$("applyDeck").disabled=true;$("deckPreview").replaceChildren();updateSavedStatus();
  };
  $("side").addEventListener("change",updateSavedStatus);

  function codeOf(value) {
    const v = value.trim();
    const match = v.match(/^(?:https?:\/\/decklog\.bushiroad\.com\/view\/)?([A-Za-z0-9]{4,12})\/?$/i);
    return match ? match[1].toUpperCase() : null;
  }
  function parse(data) {
    if (!data || typeof data !== "object" || !Array.isArray(data.list)) throw Error("list 配列が見つかりません");
    // This importer targets WS main deck only. Other titles must be verified separately.
    const rows = data.list.map(row => {
      const id = typeof row?.card_number === "string" ? row.card_number.trim() : "";
      const count = row?.num;
      const num = typeof count === "string" && /^\d+$/.test(count.trim()) ? Number(count) : count;
      if (!id || !Number.isInteger(num) || num < 1 || num > 50) throw Error("カード番号または採用枚数が不正です");
      return {id, num, cx:typeof row.cx==="boolean"?row.cx:null};
    });
    const merged = new Map();
    for (const {id,num,cx} of rows){const old=merged.get(id);merged.set(id,{num:(old?.num||0)+num,cx:cx??old?.cx??null})}
    const total = [...merged.values()].reduce((a,b)=>a+b.num,0);
    if (total !== 50) throw Error("メインデッキが "+total+"枚です（50枚必要）");
    if ([...merged.values()].some(n=>n.num>4)) throw Error("同じカード番号が4枚を超えています");
    return {title: typeof data.title==="string"?data.title:"Deck Log",cards:[...merged].map(([id,value])=>({id,...value})),total};
  }
  function preview(deck) {
    pending=deck;
    $("applyDeck").disabled=!cxReady(deck);
    $("deckTransferStatus").textContent="";
    $("deckPreview").replaceChildren();
    const title=document.createElement("p");
    title.textContent=deck.title+" / "+deck.cards.length+"種類 / "+deck.total+"枚";
    $("deckPreview").append(title);
    const table=document.createElement("div");
    table.style.cssText="max-height:210px;overflow:auto";
    for(const card of deck.cards){
      const row=document.createElement("div");
      row.textContent=card.id+" × "+card.num;
      table.append(row);
    }
    $("deckPreview").append(table);
    if(!cxReady(deck))confirmCx(deck);
    message(cxReady(deck)?"CX8枚を確認しました。登録できます":"CX判定を確認してください（合計8枚で登録可能）");
  }
  function parseText(value) {
    const rows=[];
    const lines=value.split(/\r?\n/);
    for(let i=0;i<lines.length;i++){
      const line=lines[i].trim();
      if(!line || line.startsWith("#"))continue;
      // Format: CARD-NUMBER x 4, CARD-NUMBER,4, or CARD-NUMBER 4
      const m=line.match(/^([^\s,×xX*]+)\s*(?:[,\s]+|\s*[×xX*]\s*)([1-4])$/);
      if(!m)throw Error((i+1)+"行目の形式が不正です。例: FRI/S100-001 × 4");
      rows.push({card_number:m[1],num:Number(m[2])});
    }
    return parse({title:"手動入力デッキ",list:rows});
  }
  $("parseDeckText").onclick=async()=>{
    try{preview(await classify(parseText($("deckText").value)))}
    catch(e){pending=null;$("applyDeck").disabled=true;message("テキスト解析エラー: "+e.message)}
  };
  $("parseDeck").onclick=async()=>{
    try{preview(await classify(parse(JSON.parse($("deckJson").value))))}catch(e){pending=null;$("applyDeck").disabled=true;message("JSON解析エラー: "+e.message)}
  };
  $("applyDeck").onclick=()=>{if(pending)apply(pending)};

  // Executed as a Safari bookmarklet on the Deck Log origin.
  const transferBookmarklet="javascript:("+function(){
    (async()=>{
      try{
        const code=location.pathname.match(/^\/view\/([A-Za-z0-9]+)\/?$/)?.[1];
        if(!code)throw Error("Deck Logのデッキ詳細ページで実行してください");
        const response=await fetch("/system/app/api/view/"+encodeURIComponent(code),{credentials:"same-origin",headers:{Accept:"application/json"}});
        if(!response.ok)throw Error("HTTP "+response.status);
        const data=await response.json();
        if(!Array.isArray(data.list))throw Error("デッキデータがありません");
        const list=data.list.map(x=>({card_number:x.card_number,num:x.num}));
        const total=list.reduce((n,x)=>n+Number(x.num||0),0);
        if(total!==50)throw Error("50枚のデッキではありません（"+total+"枚）");
        const payload=JSON.stringify({title:data.title||code,list,code});
        location.href="https://naninunenonano.github.io/ws-manual-board/#decklog="+encodeURIComponent(payload);
      }catch(e){alert("転送失敗: "+e.message)}
    })()
  }.toString()+")()";
  $("transferCode").value=transferBookmarklet;
  $("copyDeckTransfer").onclick=async()=>{
    try{await navigator.clipboard.writeText(transferBookmarklet);message("転送用コードをコピーしました。SafariのブックマークURLに貼り付けてください")}
    catch(e){$("transferCode").focus();$("transferCode").select();message("コピーできないためコードを選択しました。手動でコピーしてください")}
  };
  function decodeTransfer(encoded) {
    if (!encoded) throw Error("転送データが空です");
    if (encoded.length > 16000) throw Error("転送データが大きすぎます");
    let json;
    try { json = decodeURIComponent(encoded); }
    catch (e) { throw Error("URLエンコードが不正です。転送URLが途中で切れていないか確認してください"); }
    try { return JSON.parse(json); }
    catch (e) { throw Error("転送データのJSONが不正です。転送URLが途中で切れていないか確認してください"); }
  }
  async function receiveTransferredDeck() {
    const prefix = "#decklog=";
    if (!location.hash.startsWith(prefix)) return;
    if (!isDeckSetup()) {
      if (isMatchActive()) message("受信したデッキは、この対戦を終了して「次の対戦へ」を押すと確認できます");
      return;
    }
    const encoded = location.hash.slice(prefix.length);
    transferRevision++;
    pending = null;
    $("applyDeck").disabled = true;
    $("deckPreview").replaceChildren();
    const status = $("deckTransferStatus");
    try {
      const raw = decodeTransfer(encoded);
      const deck = await classify(parse(raw));
      preview(deck);
      // The transferred deck is stored in the shared library; no code field is needed.
      status.textContent = "Deck Logから50枚を受信しました。登録先を確認し「操作側に50枚登録」を押してください";
    } catch (e) {
      status.textContent = "Deck Log転送データを読み込めません: " + e.message;
    }
    // Clearing the fragment is optional. A browser history error must not stop the transfer.
    try { window.history.replaceState(window.history.state, "", location.pathname + location.search); }
    catch (e) { console.warn("Deck Log転送URLの整理に失敗しました", e); }
    $("importer").scrollIntoView({block:"start"});
  }
  window.addEventListener("hashchange", receiveTransferredDeck);
  migrate();
  initializeMatch(savedDeck, () => {
    updateSavedStatus();
    receiveTransferredDeck();
  });

})();
