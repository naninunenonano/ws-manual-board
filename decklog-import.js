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
  function readLibrary(){
    const raw=localStorage.getItem(libraryKey);
    const list=raw===null?[]:JSON.parse(raw);
    if(!Array.isArray(list))throw Error("登録データの形式が不正です");
    const ids=new Set();
    for(const item of list){
      if(typeof item?.id!=="string" || !item.id || ids.has(item.id))throw Error("登録データのIDが不正です");
      normalize(item.deck);
      ids.add(item.id);
    }
    return list;
  }
  function library(){return readLibrary().filter(item=>!item.cloud?.removed && item.cloud?.dirty!=="delete")}
  function writeLibrary(list){localStorage.setItem(libraryKey,JSON.stringify(list))}
  let editing=null;
  let cloud;
  function showCloudStatus(text){
    $("cloudDeckStatus").textContent=text;
    try{
      updateSavedStatus();
      const panel=$("cloudDeckConflicts");
      panel.replaceChildren();
      for(const item of readLibrary().filter(item=>item.cloud?.conflict)){
        const line=document.createElement("p");
        const other=item.cloud.conflictingRow;
        line.textContent="同期競合 ／ 端末："+item.deck.title+" ／ クラウド："+(other?other.name+"（更新 "+other.updated_at+"）":"削除済み");
        panel.append(line);
        const inspect=document.createElement("details");
        const summary=document.createElement("summary");
        summary.textContent="競合したカード一覧を比較";
        inspect.append(summary);
        for(const [label,cards] of [["端末版",item.deck.list],["クラウド版",other?.cards]]){
          if(!cards)continue;
          const block=document.createElement("p");
          block.textContent=label+"："+cards.map(card=>card.card_number+" ×"+card.num+(card.cx?"（CX）":"")).join("、");
          inspect.append(block);
        }
        panel.append(inspect);
        for(const [label,keepLocal] of [["クラウド版を採用",false],["端末の変更をクラウドに反映",true]]){
          if(keepLocal&&!other)continue;
          const button=document.createElement("button");
          button.type="button";button.textContent=label;
          button.onclick=()=>{if(confirm("「"+item.deck.title+"」を「"+label+"」で解決しますか？"))cloud.resolve(item.id,keepLocal)};
          panel.append(button);
        }
      }
    }catch(e){ /* The existing library error is shown by updateSavedStatus. */ }
  }
  if(typeof createDeckCloudStore==="function"){
    cloud=createDeckCloudStore({
      loadClient:loadDeckCloudClient,read:readLibrary,write:writeLibrary,storage:localStorage,
      validate:deck=>{if(!cxReady(normalize(deck)))throw Error("CXを8枚に確定してください")},
      uuid:()=>crypto.randomUUID(),status:showCloudStatus,
      lock:task=>navigator.locks?.request("ws-manual-cloud-sync",task) ?? task()
    });
    $("syncCloudDecks").onclick=()=>cloud.synchronize();
    $("uploadLocalDecks").onclick=()=>{
      if(confirm("クラウドに未登録の端末内デッキをアップロードしますか？ CXが未確定のデッキは端末内に残ります。"))
        cloud.synchronize({legacy:true});
    };
  }
  function setEditing(item=null){
    editing=item;
    $("deckRegistrationTitle").textContent=item?"登録デッキの編集":"新規デッキ登録";
    $("applyDeck").textContent=item?"選択デッキを更新":"新しいデッキとして保存";
  }
  function normalize(v){return parse({title:v.title,list:Array.isArray(v.list)?v.list:v.cards.map(c=>({card_number:c.id,num:c.num,cx:c.cx}))})}
  function migrate(){
    const list=readLibrary(), migrated=[];
    for(const p of [0,1]){
      const raw=localStorage.getItem(storageKey(p));
      if(!raw)continue;
      let deck;
      try{deck=normalize(JSON.parse(raw))}
      catch(e){message("プレイヤー"+(p+1)+"の旧デッキを読み込めません。元データは保持されています");continue}
      const id="legacy-"+p;
      if(!list.some(item=>item.id===id))list.push({id,deck:{title:deck.title,list:deck.cards.map(c=>({card_number:c.id,num:c.num,cx:c.cx}))}});
      migrated.push({p,id});
    }
    if(!migrated.length)return;
    localStorage.setItem(libraryKey,JSON.stringify(list));
    for(const {p,id} of migrated){
      const selected=localStorage.getItem(selectedKey(p));
      if(!list.some(item=>item.id===selected))localStorage.setItem(selectedKey(p),id);
      localStorage.removeItem(storageKey(p));
    }
  }
  function savedDeck(p){
    try{const id=localStorage.getItem(selectedKey(p)),item=library().find(x=>x.id===id);return item?normalize(item.deck):null}catch(e){return null}
  }
  function updateSavedStatus(){
    const select=$("savedDeckSelect");
    let list,id;
    try{list=library();id=localStorage.getItem(selectedKey(side))}
    catch(e){
      select.replaceChildren();
      $("savedDeckStatus").textContent="登録済みデッキを読み込めません。保存データを確認してください";
      return;
    }
    select.replaceChildren();const empty=document.createElement("option");empty.value="";empty.textContent="未選択";select.append(empty);
    for(const item of list){const o=document.createElement("option");o.value=item.id;o.textContent=item.deck.title+(item.cloud?.conflict?"［競合］":item.cloud?.dirty?"［同期待ち］":item.cloud?"［同期済み］":"");select.append(o)}
    select.value=list.some(x=>x.id===id)?id:"";
    if(typeof onlineMatch!=="undefined")onlineMatch?.refreshDecks();
    const deck=savedDeck(side);
    $("savedDeckStatus").textContent="登録済み "+list.length+"件／プレイヤー"+(side+1)+"："+(deck?deck.title:"未選択");
  }
  $("savedDeckSelect").onchange=()=>{
    try{localStorage.setItem(selectedKey(side),$("savedDeckSelect").value)}catch(e){message("選択を保存できません")}
    updateSavedStatus();
  };
  function insertDeck(list,deck){
    const id="deck-"+Date.now()+"-"+Math.random().toString(36).slice(2,8);
    list.push({id,deck,...(cloud?{cloud:cloud.newMetadata()}:{})});
    return id;
  }
  function syncSavedDecks(){
    if(cloud?.online())cloud.synchronize();
    else if(cloud&&!cloud.busy())$("cloudDeckStatus").textContent="クラウド未接続。変更は端末に保存済みです。「同期・再試行」で接続できます。";
  }
  function registeredDecks(){
    try{return library().map(item=>({id:item.id,title:item.deck.title,deck:normalize(item.deck)}))}
    catch{return []}
  }
  connectDeckBuilder(registeredDecks,input=>{
    const deck=normalize(input);
    if(!cxReady(deck))throw Error("CXを8枚に確定してください");
    const list=readLibrary();
    const id=insertDeck(list,{title:deck.title,list:deck.cards.map(c=>({card_number:c.id,num:c.num,cx:c.cx}))});
    try{writeLibrary(list)}catch{throw Error("端末にデッキを保存できません。保存容量を確認してください。")}
    updateSavedStatus();
    syncSavedDecks();
    return id;
  });
  function apply(deck){
    if(!cxReady(deck)){message("CXを8枚に確定してください");return}
    if(!isDeckSetup())return;
    const input=prompt("デッキ名",deck.title||"新しいデッキ");if(input===null)return;
    const title=input.trim();if(!title){message("デッキ名が空です");return}
    try{
      const list=readLibrary();
      const index=editing?list.findIndex(item=>item.id===editing.id):-1;
      if(editing && (index===-1 || JSON.stringify(list[index])!==JSON.stringify(editing))){
        message("編集中にデッキが変更されました。選択し直してください");
        return;
      }
      const data={title,list:deck.cards.map(c=>({card_number:c.id,num:c.num,cx:c.cx}))};
      if(editing){
        const meta=editing.cloud;
        list[index]={...editing,deck:data,...(meta?{cloud:{...meta,dirty:meta.revision?"update":"insert"}}:{})};
      }else{
        insertDeck(list,data);
      }
      writeLibrary(list);
    }catch(e){message("端末にデッキを保存できません。保存容量または登録データを確認してください");return}
    pending=null;
    $("applyDeck").disabled=true;
    $("deckPreview").replaceChildren();
    setEditing();
    updateSavedStatus();
    message("「"+title+"」を端末に保存しました");
    syncSavedDecks();
  }
  $("editSavedDeck").onclick=async()=>{
    if(!isDeckSetup())return;
    let item;
    try{item=library().find(entry=>entry.id===$("savedDeckSelect").value)}
    catch(e){message("登録済みデッキを読み込めません");return}
    if(!item){message("編集するデッキを選択してください");return}
    if(item.cloud?.conflict){message("先にクラウドの競合を解決してください");return}
    const revision=++transferRevision;
    setEditing(item);
    pending=null;$("applyDeck").disabled=true;
    $("deckJson").value=JSON.stringify(item.deck,null,2);
    $("deckJson").closest("details").open=true;
    $("registrationPanel").hidden=false;
    $("toggleDeckRegistration").textContent="登録画面を閉じる";
    const deck=await classify(normalize(item.deck));
    if(revision===transferRevision && isDeckSetup())preview(deck);
  };
  $("loadSavedDeck").onclick=()=>{
    if(!isDeckSetup())return;
    const deck=savedDeck(side);
    if(deck)showDeckContents(deck,side);
    else message("デッキを選択してください");
  };
  $("clearSavedDeck").onclick=()=>{
    if(!isDeckSetup())return;
    try{
      const list=readLibrary(),id=$("savedDeckSelect").value,item=list.find(x=>x.id===id);
      if(!item || !confirm("「"+item.deck.title+"」を削除しますか？"))return;
      if(item.cloud)writeLibrary(list.map(entry=>entry.id===id?{...entry,cloud:{...entry.cloud,dirty:"delete"}}:entry));
      else writeLibrary(list.filter(x=>x.id!==id));
      for(const p of [0,1])if(localStorage.getItem(selectedKey(p))===id)localStorage.removeItem(selectedKey(p));
    }catch(e){message("削除に失敗しました");return}
    pending=null;setEditing();$("applyDeck").disabled=true;$("deckPreview").replaceChildren();updateSavedStatus();
    if(cloud?.online())cloud.synchronize();
    else if(cloud && !cloud.busy())$("cloudDeckStatus").textContent="クラウド未接続。変更は端末に保存済みです。「同期・再試行」で接続できます。";
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
      const m=line.match(/^([^\s,×*]+?)\s*(?:[,\s]+|\s*[×xX*]\s*)([1-4])$/);
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
  $("toggleDeckRegistration").onclick=()=>{
    const panel=$("registrationPanel");panel.hidden=!panel.hidden;
    if(editing && panel.hidden){
      ++transferRevision;setEditing();pending=null;$("applyDeck").disabled=true;$("deckPreview").replaceChildren();
    }
    $("toggleDeckRegistration").textContent=panel.hidden?"新しいデッキを登録":"登録画面を閉じる";
  };
  $("openDeckLog").onclick=()=>{
    const code=codeOf($("deckCode").value);
    if(!code){message($("deckCode").value.trim()?"デッキコードの形式が正しくありません":"デッキコードを入力してください");return}
    window.open("https://decklog.bushiroad.com/view/"+encodeURIComponent(code),"_blank","noopener,noreferrer");
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
    const revision=++transferRevision;
    setEditing();
    pending = null;
    $("applyDeck").disabled = true;
    $("deckPreview").replaceChildren();
    const status = $("deckTransferStatus");
    try {
      const raw = decodeTransfer(encoded);
      const deck = await classify(parse(raw));
      if(revision!==transferRevision || !isDeckSetup())return;
      preview(deck);
      // The transferred deck is stored in the shared library; no code field is needed.
      $("registrationPanel").hidden=false;$("toggleDeckRegistration").textContent="登録画面を閉じる";
      status.textContent = "Deck Logから50枚を受信しました。内容を確認して「新しいデッキとして保存」を押してください";
    } catch (e) {
      if(revision!==transferRevision || !isDeckSetup())return;
      $("registrationPanel").hidden=false;
      $("toggleDeckRegistration").textContent="登録画面を閉じる";
      status.textContent = "Deck Log転送データを読み込めません: " + e.message;
    }
    // Clearing the fragment is optional. A browser history error must not stop the transfer.
    try { window.history.replaceState(window.history.state, "", location.pathname + location.search); }
    catch (e) { console.warn("Deck Log転送URLの整理に失敗しました", e); }
    $("importer").scrollIntoView({block:"start"});
  }
  window.addEventListener("hashchange", receiveTransferredDeck);
  try{migrate()}catch(e){message("旧デッキの移行を完了できません。保存容量または登録データを確認してください");}
  initializeMatch(savedDeck, () => {
    updateSavedStatus();
    receiveTransferredDeck();
  });
  if(cloud && typeof initializeOnlineMatch==="function"){
    onlineMatch=initializeOnlineMatch({
      authenticate:cloud.authenticate,
      getDecks:registeredDecks
    });
  }
  cloud?.synchronize();

})();
