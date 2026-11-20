"use strict";
// Deck Log public website internal API. This is not a guaranteed public API.
// Do not persist a response until validated; CORS may block browser requests.
(() => {
  const endpoint = "https://decklog.bushiroad.com/system/app/api/view/";
  const $ = id => document.getElementById(id);
  let pending = null;
  function codeOf(value) {
    const v = value.trim();
    const match = v.match(/^(?:https?:\/\/decklog\.bushiroad\.com\/view\/)?([A-Za-z0-9]{4,12})\/?$/i);
    return match ? match[1].toUpperCase() : null;
  }
  function parse(data) {
    if (!data || typeof data !== "object" || !Array.isArray(data.list)) throw Error("list 配列が見つかりません");
    // This importer targets WS main deck only. Other titles must be verified separately.
    const rows = data.list.map(row => {
      const id = typeof row.card_number === "string" ? row.card_number.trim() : "";
      const num = row.num;
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
    try {
      const response=await fetch(endpoint+encodeURIComponent(code),{
        method:"POST",headers:{"Accept":"application/json","Content-Type":"application/json"},
        body:"null",signal:AbortSignal.timeout(12000)
      });
      if(!response.ok)throw Error("HTTP "+response.status);
      preview(parse(await response.json()));
    } catch(e) {
      message("直接取得できませんでした（CORS/通信制限など）。JSON貼り付け方式かサーバー中継が必要です: "+e.message);
    } finally {$("importDeck").disabled=false}
  };
  $("parseDeck").onclick=()=>{
    try{preview(parse(JSON.parse($("deckJson").value)))}catch(e){pending=null;$("applyDeck").disabled=true;message("JSON解析エラー: "+e.message)}
  };
  $("applyDeck").onclick=()=>{
    if(!pending)return;
    if(!confirm("プレイヤー"+(side+1)+"の現在の盤面を破棄して、取得した50枚のデッキに置き換えますか？"))return;
    const p=side,z=Object.fromEntries(zones.map(x=>[x,[]]));
    for(const {id,num} of pending.cards)for(let i=0;i<num;i++)z.deck.push({
      uid:p+"-"+id+"-"+i,id,level:"?",orientation:0,faceUp:false
    });
    shuffle(z.deck);players[p]=z;selected=null;render();
    message("プレイヤー"+(p+1)+"に"+pending.total+"枚を登録しました。レベル・カード名・能力は未照合です");
  };
})();
