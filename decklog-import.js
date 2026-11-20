"use strict";
// Deck Log public website internal API. This is not a guaranteed public API.
// Do not persist a response until validated; CORS may block browser requests.
(() => {
  const proxyBase = "https://ws-decklog-proxy.spicahosino.workers.dev";
  const $ = id => document.getElementById(id);
  let pending = null;
  let transferRevision = 0;
  const storageKey=p=>"ws-manual-deck-v1-p"+p;
  const defaultDeck={title:"フリーレン（1TK8A8）",cards:[["SFN/S128-003",4],["SFN/S128-009",1],["SFN/S136-012",1],["SFN/S128-017",4],["SFN/S108-T04",4],["SFN/S136-001",3],["SFN/S136-005",3],["SFN/S136-002",2],["SFN/S136-006",4],["SFN/S136-065",1],["SFN/S136-076",3],["SFN/S108-T13",4],["SFN/S136-078",4],["SFN/S128-021",4],["SFN/S108-T09",4],["SFN/S128-022",4]].map(([id,num])=>({id,num})),total:50};
  function savedDeck(p) {
    try {
      const raw = localStorage.getItem(storageKey(p));
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!Array.isArray(data?.list) && Array.isArray(data?.cards)) {
        data.list = data.cards.map(card => ({card_number:card?.id,num:card?.num}));
      }
      return parse(data);
    } catch (e) {
      return null;
    }
  }
  function updateSavedStatus(){const d=savedDeck(side);$("savedDeckStatus").textContent="プレイヤー"+(side+1)+"の保存デッキ："+(d?d.title+"（50枚）":"なし。初回はデッキ登録が必要です")}
  function apply(deck,ask=true){
    if(ask&&!confirm("プレイヤー"+(side+1)+"の現在の盤面を破棄して、50枚のデッキに置き換えますか？"))return;
    const p=side,z=Object.fromEntries(zones.map(x=>[x,[]]));
    for(const {id,num} of deck.cards)for(let i=0;i<num;i++)z.deck.push({uid:p+"-"+id+"-"+i,id,level:cardCatalog[id]?.level??"?",orientation:0,faceUp:false});
    shuffle(z.deck);players[p]=z;selected=null;render();
    $("deckTransferStatus").textContent="";
    try{localStorage.setItem(storageKey(p),JSON.stringify({title:deck.title,list:deck.cards.map(c=>({card_number:c.id,num:c.num}))}))}catch(e){message("登録しましたが端末への保存に失敗しました: "+e.message);return}
    updateSavedStatus();message("プレイヤー"+(p+1)+"に"+deck.total+"枚を登録・保存しました。次回から自動で読み込みます");
  }
  $("loadSavedDeck").onclick=()=>{const d=savedDeck(side);if(d)apply(d);else if(confirm("保存デッキがありません。以前取得したフリーレン（1TK8A8）を登録しますか？"))apply(defaultDeck)};
  $("clearSavedDeck").onclick=()=>{if(!savedDeck(side))return;if(!confirm("プレイヤー"+(side+1)+"の保存デッキを削除しますか？（現在の盤面は維持）"))return;localStorage.removeItem(storageKey(side));updateSavedStatus();message("保存デッキを削除しました")};
  $("side").addEventListener("change",updateSavedStatus);
  $("reset").onclick = () => { if (confirm("盤面を初期化しますか？")) init(savedDeck); };
  init(savedDeck);
  updateSavedStatus();

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
      return {id, num};
    });
    const merged = new Map();
    for (const {id,num} of rows) merged.set(id,(merged.get(id)||0)+num);
    const total = [...merged.values()].reduce((a,b)=>a+b,0);
    if (total !== 50) throw Error("メインデッキが "+total+"枚です（50枚必要）");
    if ([...merged.values()].some(n=>n>4)) throw Error("同じカード番号が4枚を超えています");
    return {title: typeof data.title==="string"?data.title:"Deck Log",cards:[...merged].map(([id,num])=>({id,num})),total};
  }
  function preview(deck) {
    pending=deck;
    $("applyDeck").disabled=false;
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
    message("50枚のカード番号・枚数を確認しました。登録先のプレイヤーを確認してください");
  }
  $("importDeck").onclick=async()=>{
    pending=null;$("applyDeck").disabled=true;
    const code=codeOf($("deckCode").value);
    if(!code){message("デッキコードまたは日本語版Deck Log URLが不正です");return}
    $("importDeck").disabled=true;
    message("Deck Logから取得しています…");
    const revision = transferRevision;
    try {
      const configured = proxyBase.includes("YOUR-SUBDOMAIN") ? "" : proxyBase;
      if (!configured) throw Error("中継URL未設定：Cloudflare Workers公開後にURLを設定してください");
      const response=await fetch(configured+"/deck/"+encodeURIComponent(code),{
        method:"GET",headers:{"Accept":"application/json"},signal:AbortSignal.timeout(15000)
      });
      if(!response.ok){const err=await response.json().catch(()=>({}));throw Error(err.error||"HTTP "+response.status)}
      const data = await response.json();
      if (revision === transferRevision) preview(parse(data));
    } catch(e) {
      if (revision === transferRevision) message("デッキ取得に失敗しました: "+e.message);
    } finally {$("importDeck").disabled=false}
  };

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
  $("parseDeckText").onclick=()=>{
    try{preview(parseText($("deckText").value))}
    catch(e){pending=null;$("applyDeck").disabled=true;message("テキスト解析エラー: "+e.message)}
  };
  $("parseDeck").onclick=()=>{
    try{preview(parse(JSON.parse($("deckJson").value)))}catch(e){pending=null;$("applyDeck").disabled=true;message("JSON解析エラー: "+e.message)}
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
  $("openDeckLog").onclick=()=>{
    const code=codeOf($("deckCode").value);
    if(!code){message("デッキコードが不正です");return}
    location.href="https://decklog.bushiroad.com/view/"+encodeURIComponent(code);
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
  function receiveTransferredDeck() {
    const prefix = "#decklog=";
    if (!location.hash.startsWith(prefix)) return;
    const encoded = location.hash.slice(prefix.length);
    transferRevision++;
    pending = null;
    $("applyDeck").disabled = true;
    $("deckPreview").replaceChildren();
    const status = $("deckTransferStatus");
    try {
      const raw = decodeTransfer(encoded);
      const deck = parse(raw);
      preview(deck);
      const code = typeof raw.code === "string" ? codeOf(raw.code) : null;
      if (code) $("deckCode").value = code;
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
  receiveTransferredDeck();

})();
