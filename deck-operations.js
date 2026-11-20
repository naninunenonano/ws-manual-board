"use strict";
/* Transient WS deck actions. Card images are never stored; only in-match CX flags are kept. */
window.WSDeck = (() => {
  const $ = id => document.getElementById(id);
  const destinations = [["hand","手札"],["clock","クロック"],["stock","ストック"],["waiting","控え室"],["memory","思い出"],["deck","山札"]];
  const button = (label,fn,parent) => {const b=document.createElement("button");b.textContent=label;b.type="button";b.onclick=fn;parent.append(b);return b};
  const select = (values,parent,initial) => {const s=document.createElement("select");for(const [value,label] of values){const o=document.createElement("option");o.value=String(value);o.textContent=label;s.append(o)}if(initial!==undefined)s.value=String(initial);parent.append(s);return s};
  const count = (max,parent,initial=1) => select(Array.from({length:max},(_,i)=>[i+1,(i+1)+"枚"]),parent,Math.min(initial,max));
  const modal = title => {const d=$("dialog"),body=$("dialogBody");d.classList.remove("zoom-mode");$("dialogTitle").textContent=title;body.replaceChildren();d.showModal();return {d,body}};
  const img = (card,parent) => {const url=officialImageUrl(card.id);if(url){const i=document.createElement("img");i.src=url;i.alt=card.id;i.style.cssText="width:65px;height:94px;object-fit:contain";parent.append(i)}else parent.append(document.createTextNode(card.id))};
  const moveCard = (p,c,to) => {c.faceUp=!["deck","stock"].includes(to);players[p][to].push(c)};
  function refresh(p){
    const b=players[p];if(b.deck.length || !b.waiting.length)return false;
    b.deck.push(...b.waiting.splice(0));for(const c of b.deck)c.faceUp=false;shuffle(b.deck);
    // Refresh point is paid immediately, and never goes into the deck being refreshed.
    if(b.deck.length){const point=b.deck.pop();point.faceUp=true;b.clock.push(point)}
    updateBoard();message("リフレッシュしてリフレッシュポイントをクロックに置きました");
    return true;
  }
  function draw(p,n,to="hand"){
    let done=0;for(let i=0;i<n;i++){if(!players[p].deck.length&&!refresh(p))break;
      const c=players[p].deck.pop();moveCard(p,c,to);done++;
      if(!players[p].deck.length)refresh(p);
    }updateBoard();return done;
  }
  function direct(p,n,to){
    let done=0;for(let i=0;i<n;i++){if(!players[p].deck.length&&!refresh(p))break;
      moveCard(p,players[p].deck.pop(),to);done++;
      if(!players[p].deck.length)refresh(p);
    }updateBoard();return done;
  }
  function inspect(p,n,publicView){
    const b=players[p],held=[];for(let i=0;i<n&&b.deck.length;i++)held.push(b.deck.pop());
    let finished=false;
    const {d,body}=modal(publicView?"山札を捲る":"山札を確認");
    const info=document.createElement("p");info.className="muted";info.textContent=publicView?"公開したカードを選択して移動できます":"操作側だけが確認してください。相手には画面を見せないでください";body.append(info);
    const list=document.createElement("div");list.className="modalcards";body.append(list);
    const target=select(destinations.filter(([v])=>v!=="deck"),body);
    const rest=select([["shuffle","山札に戻してシャッフル"],["top","山札の上に戻す"],["bottom","山札の下に戻す"],["waiting","控え室に置く"]],body);
    const order=select([["original","元の順序"],["reversed","逆順"]],body);
    const chosen=new Set();
    function renderHeld(){list.replaceChildren();held.forEach((c,i)=>{const b=document.createElement("button");b.type="button";b.className="modal-card";b.style.border=chosen.has(i)?"3px solid #f4cf73":"";img(c,b);const t=document.createElement("span");t.textContent=c.id+(chosen.has(i)?" ✓":"");b.append(t);b.onclick=()=>{chosen.has(i)?chosen.delete(i):chosen.add(i);renderHeld()};list.append(b)})}
    renderHeld();
    button("確定",()=>{
      const keep=[];held.forEach((c,i)=>chosen.has(i)?moveCard(p,c,target.value):keep.push(c));
      const ordered=order.value==="reversed"?keep.reverse():keep;
      if(rest.value==="waiting")ordered.forEach(c=>moveCard(p,c,"waiting"));
      else if(rest.value==="bottom"){for(const c of ordered){c.faceUp=false;b.deck.unshift(c)}}
      else {for(let i=ordered.length-1;i>=0;i--){ordered[i].faceUp=false;b.deck.push(ordered[i])}if(rest.value==="shuffle")shuffle(b.deck)}
      finished=true;d.close();if(!b.deck.length)refresh(p);updateBoard();
    },body);
    d.addEventListener("close",()=>{if(!finished){for(let i=held.length-1;i>=0;i--){held[i].faceUp=false;b.deck.push(held[i])}updateBoard()}},{once:true});
  }
  async function damage(p,n){
    const b=players[p],held=[];let cancelled=false,unknown=false;
    for(let i=0;i<n;i++){
      if(!b.deck.length&&!refresh(p))break;
      const c=b.deck.pop();held.push(c);
      // Refresh must interrupt after each card is moved into the temporary resolution area.
      if(!b.deck.length)refresh(p);
      if(typeof c.cx!=="boolean"){unknown=true;break}
      if(c.cx){cancelled=true;break}
    }
    if(unknown){for(const c of held)moveCard(p,c,"waiting");updateBoard();message("CX判定不明のカードがあります。自動処理を停止しました");return}
    for(const c of held)moveCard(p,c,cancelled?"waiting":"clock");
    updateBoard();message(cancelled?"CXでキャンセルしました":"ダメージ "+held.length+"枚をクロックに置きました");
  }
  function concentrate(p,n){
    const b=players[p],cards=[];
    for(let i=0;i<n;i++){if(!b.deck.length&&!refresh(p))break;const c=b.deck.pop();moveCard(p,c,"waiting");cards.push(c);if(!b.deck.length)refresh(p)}
    updateBoard();const {body}=modal("集中：控え室に置いたカード");
    const list=document.createElement("div");list.className="modalcards";cards.forEach(c=>{const box=document.createElement("div");box.className="modal-card";img(c,box);const text=document.createElement("span");text.textContent=c.id;box.append(text);list.append(box)});body.append(list);
  }
  function open(p){
    const {d,body}=modal("山札コマンド");
    const ops=[["reveal","山札を公開"],["flip","山札を捲る"],["inspect","山札を確認"],["draw","山札を引く"],["move","山札から移動"],["focus","集中"],["damage","ダメージ"]];
    const action=select(ops,body),options=document.createElement("div");body.append(options);
    function controls(){options.replaceChildren();const op=action.value,max=players[p].deck.length;
      if((op==="reveal"||op==="flip"||op==="inspect")&&!max){options.textContent="山札がありません";return}
      const cap=["flip","inspect"].includes(op)?max:op==="focus"?6:50;
      const n=op==="reveal"?null:count(cap,options,op==="focus"?4:1);
      if(op==="focus") {n.replaceChildren();for(let k=2;k<=6;k++){const o=document.createElement("option");o.value=k;o.textContent=k+"枚";n.append(o)}n.value="4"}
      const to=op==="move"?select(destinations.filter(([v])=>v!=="deck"),options):null;
      button("実行",()=>{const amount=op==="reveal"?1:Number(n.value);d.close();
        if(op==="reveal"){inspect(p,1,true)}
        else if(op==="flip"||op==="inspect")inspect(p,amount,op==="flip");
        else if(op==="draw")draw(p,amount);
        else if(op==="move")direct(p,amount,to.value);
        else if(op==="focus")concentrate(p,amount);
        else if(op==="damage")damage(p,amount);
      },options);
    }action.onchange=controls;controls();
  }
  function imageOrientation(id){return new Promise(resolve=>{const url=officialImageUrl(id);if(!url){resolve(null);return}const i=new Image();i.onload=()=>resolve(i.naturalWidth>i.naturalHeight);i.onerror=()=>resolve(null);i.src=url})}
  async function classify(deck){
    const result=new Map();await Promise.all(deck.cards.map(async c=>result.set(c.id,await imageOrientation(c.id))));
    return result;
  }
  function confirmCX(deck,flags){
    return new Promise(resolve=>{
      const {d,body}=modal("CX判定を確認してください");
      const note=document.createElement("p");body.append(note);
      const list=document.createElement("div");list.className="modalcards";body.append(list);
      const toggles=new Map([...flags].map(([id,v])=>[id,v===true]));
      function renderFlags(){
        const total=deck.cards.reduce((n,c)=>n+(toggles.get(c.id)?c.num:0),0);
        note.textContent="CX "+total+"/8枚。カード画像を押すとCX指定を切り替えます。";
        list.replaceChildren();for(const c of deck.cards){const b=document.createElement("button");b.className="modal-card";img(c,b);const t=document.createElement("span");t.textContent=c.id+" ×"+c.num+(toggles.get(c.id)?" [CX]":"");b.append(t);b.style.border=toggles.get(c.id)?"3px solid #f4cf73":"";b.onclick=()=>{toggles.set(c.id,!toggles.get(c.id));renderFlags()};list.append(b)}
        ok.disabled=total!==8;
      }
      const ok=button("CX8枚を確定",()=>{finished=true;d.close();resolve(toggles)},body);
      let finished=false;d.addEventListener("close",()=>{if(!finished)resolve(null)},{once:true});renderFlags();
    });
  }
  return {open,refresh,draw,direct,damage,concentrate,classify,confirmCX};
})();