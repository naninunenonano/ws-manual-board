"use strict";

(() => {
  const catalogKey = "ws-card-catalog-v1";
  const draftKey = "ws-card-catalog-draft-v1";
  const $ = id => document.getElementById(id);
  const pretty = data => JSON.stringify(data,null,2);
  const statNames = Object.keys(CardCatalog.statNames);
  let catalog = CardCatalog.empty();
  let draft = null;
  let imageTimer;
  let downloadName = "card-catalog.json";

  function report(issues) {
    const errors = issues.filter(issue => issue.severity === "error").length;
    $("validationSummary").textContent = "エラー "+errors+"件 ／ 未実装 "+(issues.length-errors)+"件";
    $("issueList").replaceChildren(...issues.map(issue => {
      const li = document.createElement("li");
      li.className = "issue-"+issue.severity;
      li.textContent = (issue.severity==="warning"?"未実装　":"エラー　")+issue.path+" — "+issue.message;
      return li;
    }));
  }

  function readCatalog() {
    const saved = localStorage.getItem(catalogKey);
    return saved === null ? CardCatalog.empty() : CardCatalog.checked(CardCatalog.parseJson(saved));
  }

  function storeCatalog(next) {
    localStorage.setItem(catalogKey,JSON.stringify(next));
    catalog = next;
    renderList();
  }

  function saveDraft() {
    try {
      if (draft?.dirty) localStorage.setItem(draftKey,JSON.stringify(draft));
      else localStorage.removeItem(draftKey);
      return true;
    } catch {
      $("editorStatus").textContent = "下書きをブラウザに保存できません。ページを閉じる前に保存容量を確認してください。";
      return false;
    }
  }

  function showError(element,error) {
    element.textContent = error.message;
    report(error.issues || [{path:"入力",message:error.message,severity:"error"}]);
  }

  function previewImage() {
    const number = CardCatalog.normalizeNumber($("lookupNumber").value);
    const image = $("cardImage");
    const status = $("imageStatus");
    const url = officialImageUrl(number);
    $("imagePreview").hidden = !number;
    image.hidden = true;
    image.onload = image.onerror = null;
    image.removeAttribute("src");
    clearTimeout(imageTimer);
    status.textContent = url ? "カード画像を読み込み中" : "この番号の画像URLを特定できません。情報は登録できます。";
    if (!url) return;
    imageTimer = setTimeout(() => {
      image.alt = number+" のカード画像";
      image.onload = () => {image.hidden=false;status.textContent="";};
      image.onerror = () => {image.hidden=true;status.textContent="画像を取得できません。情報は登録できます。";};
      image.src = url;
    },150);
  }

  function draftFrom(number,card = null) {
    return {
      number,base:card,dirty:false,type:card?.type ?? "", color:card?.color ?? "",
      title:card?.title ?? "",product:card?.product ?? "",
      stats:Object.fromEntries(statNames.map(key => [key,card?.stats[key] == null ? "" : String(card.stats[key])])),
      effects:(card?.effects ?? []).map(pretty)
    };
  }

  function openCard(value, fromList = false) {
    const number = CardCatalog.normalizeNumber(value);
    if (!CardCatalog.validNumber(number)) {
      $("editorStatus").textContent = "カード番号の形式を確認してください（例 TEST/S001-001）。";
      return;
    }
    if (draft?.number !== number) {
      if (draft?.dirty && !confirm("保存していない入力を破棄して、別のカードを開きますか？")) {
        $("lookupNumber").value = draft.number;
        previewImage();
        $("editor").hidden = false;
        return;
      }
      draft = draftFrom(number,catalog.cards.find(card=>card.cardNumber===number));
      saveDraft();
    }
    $("lookupNumber").value = number;
    previewImage();
    renderEditor();
    $("editorStatus").textContent = draft.base ? "登録済みカードを編集中" : "未登録のカード";
    if (fromList) $("editorHeading").scrollIntoView({block:"start"});
    $("cardType").focus({preventScroll:true});
  }

  const fields = {cardType:"type",cardColor:"color",cardTitle:"title",cardProduct:"product"};

  function updateStatFields() {
    const required = CardCatalog.requiredStats(draft.type);
    for (const key of statNames) {
      $(key).closest("label").hidden = !required.includes(key);
    }
  }

  function button(label,click,disabled=false) {
    const b = document.createElement("button");
    b.type="button";b.textContent=label;b.disabled=disabled;b.onclick=click;
    return b;
  }

  function changeEffects(change, focusIndex) {
    change(draft.effects);
    draft.dirty = true;
    saveDraft();
    renderEffects();
    if (focusIndex !== undefined) $("effect-"+focusIndex)?.focus({preventScroll:true});
  }

  function renderEffects() {
    $("effects").replaceChildren(...draft.effects.map((source,index) => {
      const section = document.createElement("section");
      section.className = "effect";
      const label = document.createElement("label");
      label.textContent = "効果 "+(index+1)+" のJSON";
      const input = document.createElement("textarea");
      input.id="effect-"+index;input.rows=8;input.spellcheck=false;input.value=source;
      input.oninput = () => {draft.effects[index]=input.value;markDirty();};
      label.append(input);
      const actions = document.createElement("div");
      actions.className = "row";
      actions.append(
        button("上へ",listMove(index,index-1),index===0),
        button("下へ",listMove(index,index+1),index===draft.effects.length-1),
        button("効果を削除",()=>{
          if(confirm("この効果定義を削除しますか？")) changeEffects(items=>items.splice(index,1));
        })
      );
      section.append(label,actions);
      return section;
    }));
  }

  function listMove(from,to) {
    return () => changeEffects(items=>{[items[from],items[to]]=[items[to],items[from]];},to);
  }

  function renderEditor() {
    $("editor").hidden = false;
    $("editingNumber").textContent = draft.number;
    $("deleteCard").hidden = !draft.base;
    for (const [id,key] of Object.entries(fields)) $(id).value = draft[key];
    for (const key of statNames) $(key).value = draft.stats[key];
    updateStatFields();
    renderEffects();
  }

  function markDirty() {
    draft.dirty = true;
    if (saveDraft()) $("editorStatus").textContent = "下書きを保存しました。登録するには「カードを保存」を押してください。";
  }

  function validateDraft() {
    const syntaxIssues = [];
    const effects = draft.effects.map((source,index) => {
      try {return CardCatalog.parseJson(source);}
      catch(error) {
        syntaxIssues.push({path:"効果 "+(index+1),message:error.message,severity:"error"});
        return null;
      }
    });
    const required = CardCatalog.requiredStats(draft.type);
    const stats = {...draft.base?.stats};
    for (const key of statNames) {
      const value = draft.stats[key].trim();
      stats[key] = !required.includes(key) || !value ? null : /^\d+$/.test(value) ? Number(value) : value;
    }
    const card = {...draft.base,cardNumber:draft.number,type:draft.type,color:draft.color.trim(),
      title:draft.title.trim(),product:draft.product.trim(),stats,effects};
    return {card,issues:[...syntaxIssues,...CardCatalog.validateCard(card)]};
  }

  function updateCard(remove=false) {
    try {
      const next = readCatalog();
      const index = next.cards.findIndex(card=>card.cardNumber===draft.number);
      if (JSON.stringify(next.cards[index] ?? null)!==JSON.stringify(draft.base)) {
        throw Error("登録データが別の操作で変更されています。下書きを保持しています。「登録内容を読み直す」で最新の内容を開けます。");
      }
      if (remove) {
        next.cards.splice(index,1);
        storeCatalog(next);
        draft = null;
        $("editor").hidden = true;
        if (saveDraft()) $("editorStatus").textContent = "カードを削除しました。";
        return;
      }
      const {card,issues} = validateDraft();
      report(issues);
      if (issues.some(issue=>issue.severity==="error")) {
        $("editorStatus").textContent = "入力にエラーがあります。検証結果を確認してください。";
        $("validation").scrollIntoView({block:"nearest"});
        return;
      }
      if (index < 0) next.cards.push(card);
      else next.cards[index] = card;
      storeCatalog(next);
      draft = draftFrom(card.cardNumber,card);
      renderEditor();
      if(saveDraft()) $("editorStatus").textContent = "カードを保存しました。";
    } catch(error) {showError($("editorStatus"),error);}
  }

  function options(id,values) {
    const select = $(id);
    const old = select.selectedOptions[0]?.dataset.value;
    const all = new Option("すべて");
    select.replaceChildren(all,...values.map(value=>{
      const option = new Option(value || "未分類");
      option.dataset.value=value;
      option.selected=value===old;
      return option;
    }));
  }

  function filters() {
    return {
      number:$("filterNumber").value,
      title:$("filterTitle").selectedOptions[0]?.dataset.value ?? null,
      product:$("filterProduct").selectedOptions[0]?.dataset.value ?? null
    };
  }

  function renderList() {
    const title = [...new Set(catalog.cards.map(card=>card.title ?? ""))].sort();
    options("filterTitle",title);
    const group = CardCatalog.selectCards(catalog.cards,{title:filters().title});
    options("filterProduct",[...new Set(group.map(card=>card.product ?? ""))].sort());
    const cards = CardCatalog.selectCards(catalog.cards,filters()).sort((a,b)=>a.cardNumber.localeCompare(b.cardNumber));
    $("cardCount").textContent = cards.length+"件 ／ 全"+catalog.cards.length+"件";
    $("emptyList").textContent = cards.length ? "" : "表示するカードがありません。";
    $("cardRows").replaceChildren(...cards.map(card=>{
      const row = document.createElement("tr");
      row.insertCell().append(button(card.cardNumber,()=>openCard(card.cardNumber,true)));
      const issues = CardCatalog.validateCard(card);
      const state = issues.some(issue=>issue.severity==="error")?"エラー":issues.length?"未実装あり":"OK";
      for (const value of [CardCatalog.types[card.type],card.stats.level,card.stats.cost,card.stats.power,card.effects.length,state]) {
        row.insertCell().textContent=value ?? "—";
      }
      return row;
    }));
  }

  function importJson() {
    try {
      const incoming = CardCatalog.parseJson($("jsonText").value.replace(/^\uFEFF/,""));
      const current = readCatalog();
      const overwrite = $("importMode").value === "overwrite";
      const result = CardCatalog.mergeCatalog(current,incoming,overwrite);
      if (result.updated && !confirm(result.updated+"件の登録を上書きしますか？")) return;
      storeCatalog(result.catalog);
      report(CardCatalog.validateCatalog(incoming));
      $("jsonStatus").textContent = "追加 "+result.added+"件 ／ 上書き "+result.updated+"件 ／ 既存保持 "+result.skipped+"件";
    } catch(error) {showError($("jsonStatus"),error);}
  }

  function exportJson(group) {
    try {
      const current = readCatalog();
      const {title,product} = filters();
      if (group && title===null && product===null) throw Error("タイトルまたは商品を選んでください。");
      const cards = group ? CardCatalog.selectCards(current.cards,{title,product}) : current.cards;
      $("jsonText").value = pretty({...current,cards});
      downloadName = "card-catalog"+(group?"-group":"")+".json";
      $("jsonStatus").textContent = cards.length+"件を出力しました。コピーまたはファイル保存ができます。";
    } catch(error) {showError($("jsonStatus"),error);}
  }

  $("lookupNumber").oninput = () => {
    previewImage();
    if (!draft) return;
    const same = CardCatalog.normalizeNumber($("lookupNumber").value) === draft.number;
    $("editor").hidden = !same;
    $("editorStatus").textContent = same ? "編集中のカードを表示しています。" : "別のカードを編集するには「開く」を押してください。";
  };
  $("lookupForm").onsubmit = event => {event.preventDefault();openCard($("lookupNumber").value);};
  $("editor").onsubmit = event => {event.preventDefault();updateCard();};
  $("reloadCard").onclick = () => {
    if (draft.dirty && !confirm("保存していない入力を破棄して読み直しますか？")) return;
    try {
      catalog = readCatalog();
      draft = draftFrom(draft.number,catalog.cards.find(card=>card.cardNumber===draft.number));
      renderEditor();
      renderList();
      if (saveDraft()) $("editorStatus").textContent = "登録内容を読み直しました。";
    } catch(error) {showError($("editorStatus"),error);}
  };
  $("deleteCard").onclick = () => {if(confirm(draft.number+" の登録を削除しますか？")) updateCard(true);};
  for (const [id,key] of Object.entries(fields)) {
    $(id).oninput = () => {draft[key]=$(id).value;updateStatFields();markDirty();};
  }
  for (const key of statNames) $(key).oninput = () => {draft.stats[key]=$(key).value;markDirty();};
  $("addEffect").onclick = () => {
    const ids = new Set(draft.effects.map(source=>{
      try {return CardCatalog.parseJson(source)?.id?.trim();} catch {return null;}
    }));
    let n = 1;
    while(ids.has("effect-"+n)) ++n;
    changeEffects(items=>items.push(pretty(CardCatalog.template("effect-"+n))),draft.effects.length);
  };
  $("validateDraft").onclick = () => {
    report(validateDraft().issues);
    $("validation").scrollIntoView({block:"nearest"});
  };
  $("validateAll").onclick = () => {
    try {report(CardCatalog.validateCatalog(readCatalog()));}
    catch(error) {showError($("editorStatus"),error);}
  };
  $("filterNumber").oninput = renderList;
  $("filterTitle").onchange = renderList;
  $("filterProduct").onchange = renderList;
  $("importFile").onchange = async () => {
    const file = $("importFile").files[0];
    if (!file) return;
    try {
      $("jsonText").value = await file.text();
      $("jsonStatus").textContent = file.name+" を読み込みました。内容を確認して登録データに読み込んでください。";
    } catch(error) {showError($("jsonStatus"),error);}
    finally {$("importFile").value = "";}
  };
  $("importJson").onclick = importJson;
  $("exportAll").onclick = () => exportJson(false);
  $("exportGroup").onclick = () => exportJson(true);
  $("copyJson").onclick = async () => {
    const input = $("jsonText");
    if (!input.value.trim()) return;
    try {
      await navigator.clipboard.writeText(input.value);
      $("jsonStatus").textContent = "JSONをコピーしました。";
    } catch {
      input.focus();
      input.select();
      $("jsonStatus").textContent = "選択したJSONを端末のメニューからコピーしてください。";
    }
  };
  $("downloadJson").onclick = () => {
    if (!$("jsonText").value.trim()) return;
    try {
      CardCatalog.checked(CardCatalog.parseJson($("jsonText").value.replace(/^\uFEFF/,"")));
      const link = document.createElement("a");
      const url = URL.createObjectURL(new Blob([$("jsonText").value],{type:"application/json"}));
      link.href=url; link.download=downloadName;
      document.body.append(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),30000);
    } catch(error) {showError($("jsonStatus"),error);}
  };

  addEventListener("storage",event=>{
    if (event.key !== catalogKey) return;
    try {catalog=readCatalog();renderList();}
    catch(error) {showError($("editorStatus"),error);}
  });

  renderList();
  try {catalog=readCatalog();renderList();}
  catch(error) {showError($("editorStatus"),error);}
  try {
    const raw = localStorage.getItem(draftKey);
    if (raw) {
      const saved = CardCatalog.parseJson(raw);
      if (!CardCatalog.validNumber(saved?.number) || !Array.isArray(saved.effects) || !saved.stats) throw Error("下書きを復元できません。");
      draft = saved;
      $("lookupNumber").value=draft.number;
      previewImage();
      renderEditor();
      $("editorStatus").textContent="下書きを復元しました。";
    }
  } catch(error) {showError($("editorStatus"),error);}
})();
