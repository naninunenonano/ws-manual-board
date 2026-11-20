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
  for (const zone of zones) {
    const cards = board[zone];
    if (!Array.isArray(cards) || cards.length > 50) return false;
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
  return (snapshot.result?.reason === "left" && snapshot.result.winner === null) ||
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
  matchElement("setupScreen").hidden = !isDeckSetup();
  matchElement("battleScreen").hidden = !isMatchActive();
  matchElement("mulliganScreen").hidden = match?.phase !== "mulligan";
  if(match?.phase === "mulligan") renderMulligan();
  matchElement("resultScreen").hidden = match?.phase !== "ended";
  matchElement("side").value = String(side);
  matchElement("battleSide").value = String(side);
  if (isMatchActive()) {
    ensureTurn();
    const first = match.firstPlayer;
    matchElement("firstPlayerResult").textContent = "先攻：プレイヤー" + (first + 1) +
      " ／ 後攻：プレイヤー" + (2 - first);
    render();
    renderTurnControls();
  } else if (match?.phase === "ended") {
    const { reason, winner } = match.result;
    matchElement("battleResult").textContent = reason === "surrender"
      ? "プレイヤー" + (2 - winner) + "が降参しました。勝者：プレイヤー" + (winner + 1)
      : "対戦を離れました。勝敗はありません";
  }
  window.scrollTo(0, 0);
}

function startMatch(readDeck) {
  if (!isDeckSetup()) return;
  const decks = [readDeck(0), readDeck(1)];
  const missing = decks.findIndex(deck => !deck);
  if (missing !== -1) {
    message("プレイヤー" + (missing + 1) + "のデッキを登録してください");
    return;
  }
  const boards = decks.map((deck, p) => {
    const board = Object.fromEntries(zones.map(zone => [zone, []]));
    for (const { id, num } of deck.cards) {
      for (let i = 0; i < num; i++) {
        board.deck.push({
          uid: p + "-" + id + "-" + i, id,
          level: cardCatalog[id]?.level ?? "?", orientation: 0, faceUp: false, cx:deck.cards.find(x=>x.id===id)?.cx===true
        });
      }
    }
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
  match.players[p].hand.forEach((card,i)=>{
    const button=document.createElement("button");
    button.type="button";
    button.style.cssText="width:90px;min-height:140px;border:"+(mulliganSelection.has(i)?"3px solid #f4cf73":"1px solid #6581a5");
    button.setAttribute("aria-pressed",String(mulliganSelection.has(i)));
    const img=document.createElement("img");
    const url=officialImageUrl(card.id);
    if(url){img.src=url;img.alt=cardLabel(card);img.style.cssText="width:75px;height:105px;object-fit:contain";button.append(img);}
    else button.textContent=cardLabel(card);
    const label=document.createElement("span");
    label.textContent=mulliganSelection.has(i)?"交換":"残す";
    button.append(label);
    button.onclick=()=>{if(mulliganSelection.has(i))mulliganSelection.delete(i);else mulliganSelection.add(i);renderMulligan();};
    root.append(button);
  });
}
function completeMulligan(){
  if(match?.phase!=="mulligan")return;
  const p=match.mulliganPlayer,old=match.players[p];
  const board=Object.fromEntries(zones.map(z=>[z,old[z].slice()]));
  const indices=[...mulliganSelection].sort((a,b)=>b-a);
  for(const i of indices)board.waiting.push(board.hand.splice(i,1)[0]);
  for(let i=0;i<indices.length;i++){const c=board.deck.pop();c.faceUp=true;board.hand.push(c);}
  shuffle(board.deck);
  const next={...match,players:match.players.map((b,i)=>i===p?board:b),mulliganPlayer:p+1,phase:p===0?"mulligan":"active",screen:p===0?"mulligan":"battle"};
  if(!writeMatch(next))return;
  match=next;players=next.players;mulliganSelection=new Set();showMatchScreen();
  if(p===1){ensureTurn();message("両プレイヤーのマリガンが完了しました");}
}
function finishMatch(reason) {
  if (!isMatchActive()) return;
  const surrender = reason === "surrender";
  const prompt = surrender ? "プレイヤー" + (side + 1) + "が降参しますか？" :
    "勝敗を付けずに対戦を終了しますか？";
  if (!confirm(prompt)) return;
  const snapshot = {
    ...match, side, phase: "ended", screen: "result",
    result: { reason, winner: surrender ? 1 - side : null }
  };
  if (!writeMatch(snapshot)) return;
  match = snapshot;
  selected = null;
  showMatchScreen();
}

function showRegisteredDecks() {
  if (!isMatchActive()) return;
  const dialog = matchElement("dialog");
  dialog.classList.remove("zoom-mode");
  matchElement("dialogTitle").textContent = "デッキ内容確認";
  const body = matchElement("dialogBody");
  body.replaceChildren();
  const p = side;
  const deck = match.decks[p];
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
      const url=officialImageUrl(id);
      if(url){img.src=url;img.alt=cardCatalog[id]?.name||id;img.style.cssText="width:100%;aspect-ratio:0.71;object-fit:contain";img.onerror=()=>{img.replaceWith(document.createTextNode(id))};row.append(img)}
      else row.append(document.createTextNode(id));
      const count=document.createElement("strong");count.textContent=" ×"+num;row.append(count);
      list.append(row);
    }
    body.append(title, list);
  }
  dialog.showModal();
}

function initializeMatch(readDeck, refreshSetup) {
  matchElement("startBattle").onclick = () => startMatch(readDeck);
  matchElement("confirmMulligan").onclick = completeMulligan;
  matchElement("surrender").onclick = () => finishMatch("surrender");
  matchElement("leaveBattle").onclick = () => finishMatch("left");
  matchElement("viewDecks").onclick = showRegisteredDecks;
  matchElement("battleSide").onchange = event => {
    if (!isMatchActive()) return;
    side = Number(event.target.value);
    selected = null;
    updateBoard();
  };
  matchElement("nextBattle").onclick = () => {
    if (match?.phase !== "ended" || !writeMatch(null)) return;
    match = null;
    mulliganSelection = new Set();
    players = [];
    selected = null;
    matchElement("boards").replaceChildren();
    matchElement("setupNotice").textContent = "";
    matchElement("notice").textContent = "カードをタップして移動先を選択。ドラッグでも移動できます。";
    showMatchScreen();
    refreshSetup();
  };
  restoreMatch();
  showMatchScreen();
  refreshSetup();
}
