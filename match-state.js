"use strict";

const matchStorageKey = "ws-manual-match-v1";
let match = null;

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
  matchElement("resultScreen").hidden = match?.phase !== "ended";
  matchElement("side").value = String(side);
  matchElement("battleSide").value = String(side);
  if (isMatchActive()) {
    const first = match.firstPlayer;
    matchElement("firstPlayerResult").textContent = "先攻：プレイヤー" + (first + 1) +
      " ／ 後攻：プレイヤー" + (2 - first);
    render();
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
          level: cardCatalog[id]?.level ?? "?", orientation: 0, faceUp: false
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
    version: 1, phase: "active", screen: "battle", side, firstPlayer,
    openingHandDealt: true, decks, players: boards, result: null
  };
  if (!writeMatch(snapshot)) return;
  match = snapshot;
  players = boards;
  selected = null;
  showMatchScreen();
  message("両プレイヤーに初手5枚を配りました");
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
  match.decks.forEach((deck, p) => {
    const title = document.createElement("h4");
    const total = deck.cards.reduce((sum, card) => sum + card.num, 0);
    title.textContent = "プレイヤー" + (p + 1) + "｜" + deck.title + "｜合計" + total + "枚";
    const list = document.createElement("ul");
    for (const { id, num } of [...deck.cards].sort((a, b) => a.id.localeCompare(b.id))) {
      const row = document.createElement("li");
      const name = cardCatalog[id]?.name;
      row.textContent = id + (name ? "｜" + name : "") + " × " + num;
      list.append(row);
    }
    body.append(title, list);
  });
  dialog.showModal();
}

function initializeMatch(readDeck, refreshSetup) {
  matchElement("startBattle").onclick = () => startMatch(readDeck);
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
