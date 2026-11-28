"use strict";

const matchStorageKey = "ws-manual-match-v1";
let match = null;
let mulliganSelection = new Set();

function isDeckSetup() {
  return match === null;
}

function isMatchActive() {
  return match?.phase === "active";
}

function matchElement(id) {
  return document.getElementById(id);
}

function showStorageWarning(text) {
  const warning = matchElement("storageWarning");
  warning.textContent = text;
  warning.hidden = !text;
}

function writeMatch(snapshot) {
  try {
    if (snapshot) localStorage.setItem(matchStorageKey, JSON.stringify(snapshot));
    else localStorage.removeItem(matchStorageKey);
    showStorageWarning("");
    return true;
  } catch (error) {
    showStorageWarning("対戦状態を保存できません。端末の保存設定を確認してください");
    return false;
  }
}

function saveMatchProgress() {
  if (isMatchActive()) {
    if (match.online) { onlineMatch?.commit(); return; }
    match.side = side;
    writeMatch(match);
  }
}

function isPlayer(value) {
  return value === 0 || value === 1;
}

function validDeckBoard(deck, board, player) {
  if (typeof deck?.title !== "string" || !Array.isArray(deck.cards) ||
      deck.cards.length > 50 || !board) return false;
  const expected = new Map();
  for (const card of deck.cards) {
    if (typeof card?.id !== "string" || !card.id.trim() || expected.has(card.id) ||
        !Number.isInteger(card.num) || card.num < 1 || card.num > 4) return false;
    expected.set(card.id, card.num);
  }
  const seen = new Set();
  const cards = [];
  for (const zone of zones) {
    if (!Array.isArray(board[zone]) || board[zone].length > 50) return false;
    cards.push(...board[zone]);
  }
  for (const card of cards) {
    if (!expected.has(card?.id) || typeof card.uid !== "string" ||
        typeof card.faceUp !== "boolean" || !Number.isFinite(card.orientation) ||
        !(typeof card.level === "string" || Number.isFinite(card.level))) return false;
    const count = expected.get(card.id);
    const prefix = player + "-" + card.id + "-";
    const index = Number(card.uid.slice(prefix.length));
    if (!Number.isInteger(index) || index < 0 || index >= count ||
        card.uid !== prefix + index || seen.has(card.uid)) return false;
    seen.add(card.uid);
    if (card.markers !== undefined) {
      if (!Array.isArray(card.markers) || cards.length + card.markers.length > 50) return false;
      for (const marker of card.markers) {
        if (typeof marker?.faceUp !== "boolean" || !marker.card) return false;
        cards.push(marker.card);
      }
    }
  }
  return seen.size === 50 && [...expected.values()].reduce((sum, count) => sum + count, 0) === 50;
}

function validMatch(snapshot) {
  if (snapshot?.version !== 1 || !isPlayer(snapshot.side) || !isPlayer(snapshot.firstPlayer) ||
      snapshot.openingHandDealt !== true ||
      !Array.isArray(snapshot.players) || snapshot.players.length !== 2 ||
      !Array.isArray(snapshot.decks) || snapshot.decks.length !== 2 ||
      !snapshot.decks.every((deck, p) => validDeckBoard(deck, snapshot.players[p], p))) return false;
  if (snapshot.phase === "mulligan") return snapshot.screen === "mulligan" && snapshot.result === null && [0,1].includes(snapshot.mulliganPlayer) && snapshot.players.every(board=>board.hand.length===5 && board.deck.length===45);
  if (snapshot.phase === "active") return snapshot.screen === "battle" && snapshot.result === null;
  if (snapshot.phase !== "ended" || snapshot.screen !== "result") return false;
  return (snapshot.bot && snapshot.result?.reason === "level" && isPlayer(snapshot.result.winner)) ||
    (snapshot.result?.reason === "left" && snapshot.result.winner === null) ||
    (snapshot.result?.reason === "surrender" && snapshot.result.winner === 1 - snapshot.side);
}

function restoreMatch() {
  let raw;
  try {
    raw = localStorage.getItem(matchStorageKey);
  } catch (error) {
    showStorageWarning("対戦状態を読み込めません。端末の保存設定を確認してください");
    return;
  }
  if (raw === null) return;
  try {
    const snapshot = JSON.parse(raw);
    if (!validMatch(snapshot)) throw Error("Invalid match");
    match = snapshot;
    players = snapshot.players;
    side = snapshot.side;
  } catch (error) {
    const removed = writeMatch(null);
    showStorageWarning(removed
      ? "保存した対戦状態を復元できなかったため、デッキ設定を開きました"
      : "保存した対戦状態を復元・削除できません。端末の保存設定を確認してください");
  }
}

function showMatchScreen() {
  const editorVisible=isDeckSetup()&&botDeckEditorOpen;
  matchElement("setupScreen").hidden = !isDeckSetup()||editorVisible;
  matchElement("botDeckEditorScreen").hidden = !editorVisible;
  matchElement("battleScreen").hidden = !isMatchActive();
  matchElement("botControls").hidden=!match?.bot;
  if(!match?.bot)matchElement("botRecovery").hidden=true;
  for(const id of ["battleSideControl","shuffle","manualBattleHint"])matchElement(id).hidden=!!match?.bot;
  matchElement("mulliganScreen").hidden = match?.phase !== "mulligan";
  if(match?.phase === "mulligan") renderMulligan();
  matchElement("resultScreen").hidden = match?.phase !== "ended";
  matchElement("side").value = String(side);
  matchElement("battleSide").value = String(side);
  matchElement("battleSide").disabled=!!(match?.bot||match?.online);
  if (isMatchActive()) {
    autoRuleCollectWaiting();
    ensureTurn();
    const first = match.firstPlayer;
    matchElement("firstPlayerResult").textContent = "先攻：プレイヤー" + (first + 1) +
      " ／ 後攻：プレイヤー" + (2 - first);
    render();
    if (match.turn.phase==="draw" && match.turn.drawPending) {
      if(isAutoRules())autoRuleDraw(match.turn.player);
      else if((!match.bot||match.turn.player===0)&&(!match.online||match.turn.player===side))beforeDrawConfirmation();
    }
    renderTurnControls();
    checkMandatoryLevel();
  } else if (match?.phase === "ended") {
    matchElement("resultBattleLog").hidden=!match.bot;
    const { reason, winner } = match.result;
    matchElement("battleResult").textContent = reason === "level"
      ? winner===0?"Botがレベル4になりました。あなたの勝ちです":"レベル4になりました。Botの勝ちです"
      : reason === "surrender"
      ? "プレイヤー" + (2 - winner) + "が降参しました。勝者：プレイヤー" + (winner + 1)
      : "対戦を離れました。勝敗はありません";
  }
  window.scrollTo(0, 0);
}

function buildMatchBoard(deck,p) {
    const board = Object.fromEntries(zones.map(zone => [zone, []]));
    for (const { id, num, cx } of deck.cards) {
      for (let i = 0; i < num; i++) {
        board.deck.push({
          uid: p + "-" + id + "-" + i, id,
          level: cardCatalog[id]?.level ?? "?", orientation: 0, faceUp: false, cx:typeof cx==="boolean"?cx:null
        });
      }
    }
    return board;
}

function startMatch(readDeck) {
  if (!isDeckSetup()) return;
  if (typeof onlineMatch!=="undefined" && onlineMatch?.active()) { message("オンラインルームを退出してから開始してください"); return; }
  const decks = [readDeck(0), readDeck(1)];
  const missing = decks.findIndex(deck => !deck);
  if (missing !== -1) {
    message("プレイヤー" + (missing + 1) + "の使用デッキを選択してください");
    return;
  }
  const boards = decks.map((deck,p)=>{
    const board=buildMatchBoard(deck,p);
    shuffle(board.deck);
    return board;
  });
  const firstPlayer = randomIndex(2);
  for (const board of boards) {
    for (let i = 0; i < 5; i++) {
      const card = board.deck.pop();
      card.faceUp = true;
      board.hand.push(card);
    }
  }
  const snapshot = {
    version: 1, phase: "mulligan", screen: "mulligan", side, firstPlayer, mulliganPlayer: 0,
    openingHandDealt: true, decks, players: boards, result: null
  };
  if (!writeMatch(snapshot)) return;
  match = snapshot;
  players = boards;
  selected = null;
  showMatchScreen();
  message("両プレイヤーに初手5枚を配りました");
}

function renderMulligan(){
  const p=match.mulliganPlayer, root=matchElement("mulliganCards");
  matchElement("mulliganProgress").textContent="プレイヤー"+(p+1)+"：交換 "+mulliganSelection.size+"枚";
  root.replaceChildren();
  root.classList.remove("practice-mulligan");
  match.players[p].hand.forEach((card,i)=>{
    const button=document.createElement("button");
    button.type="button";
    button.style.cssText="width:90px;min-height:140px"+(mulliganSelection.has(i)?";box-shadow:inset 0 0 0 2px #f4cf73":"");
    button.setAttribute("aria-pressed",String(mulliganSelection.has(i)));
    const details=card.id.startsWith("BOT/")?botCardDetails(card):null;
    if(details){
      button.className="practice-mulligan-card";
      button.style.cssText="";
      root.classList.add("practice-mulligan");
      const name=document.createElement("strong");
      name.textContent=details.name;
      button.append(name);
      appendBotCardDetails(button,details);
    }else{
      const img=document.createElement("img");
      img.alt=cardLabel(card);
      img.style.cssText="width:75px;height:105px;object-fit:contain";
      const fallback=()=>button.prepend(document.createTextNode(cardLabel(card)));
      if(setCardImage(img,card.id,()=>{img.remove();fallback()}))button.append(img);
      else fallback();
    }
    const label=document.createElement("span");
    if(details)label.className="practice-mulligan-status";
    label.textContent=mulliganSelection.has(i)?"交換":"残す";
    button.append(label);
    button.disabled=match.online===true && matchElement("confirmMulligan").disabled;
    button.onclick=()=>{if(mulliganSelection.has(i))mulliganSelection.delete(i);else mulliganSelection.add(i);renderMulligan();};
    root.append(button);
  });
}
function mulliganBoard(old,selection){
  const board=Object.fromEntries(zones.map(z=>[z,old[z].slice()]));
  const indices=[...selection].sort((a,b)=>b-a);
  const discarded=indices.map(index=>board.hand.splice(index,1)[0]);
  board.waiting.push(...discarded);
  for(let i=0;i<indices.length;i++)board.hand.push({...board.deck.pop(),faceUp:true});
  shuffle(board.deck);
  return {board,discarded};
}
function completeMulligan(){
  if(match?.phase!=="mulligan")return;
  if(match.online){onlineMatch.mulligan();return;}
  const p=match.mulliganPlayer;
  const {board,discarded}=mulliganBoard(match.players[p],mulliganSelection);
  const nextPlayers=match.players.map((entry,i)=>i===p?board:entry);
  const bot=isDeckMirror(match.bot?.scenario)?mulliganBoard(match.players[1],autoRuleBotMulligan(1)):null;
  if(bot)nextPlayers[1]=bot.board;
  const next={...match,players:nextPlayers,mulliganPlayer:p+1,phase:p===0&&!match.bot?"mulligan":"active",screen:p===0&&!match.bot?"mulligan":"battle"};
  if(match.bot)next.bot={...match.bot,battleLog:[...(match.bot.battleLog??[])]};
  recordBotBattleAction("マリガンで"+discarded.length+"枚交換",p,discarded,next);
  if(bot)recordBotBattleAction("マリガンで"+bot.discarded.length+"枚交換",1,bot.discarded,next);
  if(!writeMatch(next))return;
  match=next;players=next.players;mulliganSelection=new Set();
  showMatchScreen();
  if(p===1||match.bot){ensureTurn();message(match.bot?"マリガンが完了しました":"両プレイヤーのマリガンが完了しました");}
}
function finishMatch(reason) {
  if (!isMatchActive()) return;
  const surrender = reason === "surrender";
  const prompt = surrender ? "プレイヤー" + (side + 1) + "が降参しますか？" :
    "勝敗を付けずに対戦を終了しますか？";
  if (!confirm(prompt)) return;
  if (match.online) { onlineMatch.finish(reason); return; }
  const snapshot = {
    ...match, side, phase: "ended", screen: "result",
    result: { reason, winner: surrender ? 1 - side : null }
  };
  if (!writeMatch(snapshot)) return;
  drawConfirmationPending=false;
  reopenDrawReminder=null;
  pendingMarkerChoices=[];
  match = snapshot;
  selected = null;
  showMatchScreen();
}

function showRegisteredDecks() {
  if (isMatchActive()) showDeckContents(match.decks[side],side);
}

function showDeckContents(deck,p) {
  const dialog = matchElement("dialog");
  dialog.classList.remove("zoom-mode");
  matchElement("dialogTitle").textContent = "デッキ内容確認";
  const body = matchElement("dialogBody");
  body.replaceChildren();
  {
    const title = document.createElement("h4");
    const total = deck.cards.reduce((sum, card) => sum + card.num, 0);
    title.textContent = "プレイヤー" + (p + 1) + "｜" + deck.title + "｜合計" + total + "枚";
    const list = document.createElement("div");
    list.className="modalcards";
    for (const { id, num } of [...deck.cards].sort((a, b) => a.id.localeCompare(b.id))) {
      const row = document.createElement("div");
      row.style.cssText="width:105px;text-align:center";
      const img=document.createElement("img");
      if(setCardImage(img,id,()=>img.replaceWith(document.createTextNode(id)))){
        img.alt=cardCatalog[id]?.name||id;img.style.cssText="width:100%;aspect-ratio:0.71;object-fit:contain";row.append(img);
      }
      else row.append(document.createTextNode(id));
      const count=document.createElement("strong");count.textContent=" ×"+num;row.append(count);
      row.classList.add("deck-preview-entry");
      row.tabIndex=0;
      row.setAttribute("role","button");
      row.setAttribute("aria-label",id+" を拡大");
      row.style.cursor="pointer";
      const open=()=>{
        const card={id,faceUp:true};
        dialog.close();
        showCardDetail(card);
        const back=document.createElement("button");
        back.textContent="デッキ一覧に戻る";
        back.onclick=()=>{dialog.close();showRegisteredDecks()};
        matchElement("dialogBody").append(back);
      };
      row.onclick=open;
      row.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();open()}};
      list.append(row);
    }
    body.append(title, list);
  }
  dialog.showModal();
}

function initializeMatch(readDeck, refreshSetup) {
  matchElement("startBattle").onclick = () => startMatch(readDeck);
  matchElement("startBotBattle").onclick=()=>startBotMatch(readDeck(0),matchElement("botScenario").value);
  matchElement("confirmMulligan").onclick = completeMulligan;
  matchElement("surrender").onclick = () => finishMatch("surrender");
  matchElement("leaveBattle").onclick = () => finishMatch("left");
  matchElement("viewDecks").onclick = showRegisteredDecks;
  matchElement("battleSide").onchange = event => {
    if (!isMatchActive() || match.online || match.bot) return;
    side = Number(event.target.value);
    selected = null;
    updateBoard();
  };
  matchElement("nextBattle").onclick = () => {
    if (match?.phase !== "ended") return;
    if (match.online) onlineMatch.reset();
    else if (!writeMatch(null)) return;
    match = null;
    mulliganSelection = new Set();
    players = [];
    selected = null;
    const boards=matchElement("boards");
    boards.after(matchElement("playerActions"));
    boards.replaceChildren();
    matchElement("setupNotice").textContent = "";
    matchElement("notice").textContent = "カードをタップして移動先を選択。ドラッグでも移動できます。";
    showMatchScreen();
    refreshSetup();
  };
  restoreMatch();
  showMatchScreen();
  refreshSetup();
}
