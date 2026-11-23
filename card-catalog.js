"use strict";

const CardCatalog = (() => {
  const schemaVersion = 1;
  const types = {character:"キャラ", event:"イベント", climax:"CX"};
  const stats = {
    character:["level","cost","power","soul"],
    event:["level","cost"],
    climax:[]
  };
  const statNames = {level:"レベル",cost:"コスト",power:"パワー",soul:"ソウル"};
  const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
  const nonempty = value => typeof value === "string" && value.trim().length > 0;
  const normalizeNumber = value => typeof value === "string" ? value.trim().toUpperCase() : "";
  const baseNumber = value => normalizeNumber(value).replace(/^([A-Z0-9]+\/[A-Z0-9]+-[A-Z]*\d+)(?:SSP|SP|S|R)$/, "$1");
  const validNumber = number => /^[A-Z0-9]+\/[A-Z0-9]+-[A-Z0-9][A-Z0-9_+.*-]*$/.test(number);
  const empty = () => ({schemaVersion,cards:[]});

  // Safari's JSON.parse error can omit an offset. Scan only failed input.
  function jsonErrorOffset(text) {
    let i = 0;
    const skip = () => {while (/[ \t\r\n]/.test(text[i] ?? "")) ++i;};
    function consume(char) { if (text[i] !== char) throw i; ++i; }
    function string() {
      consume('"');
      while (i < text.length) {
        const char = text[i];
        if (char === '"') { ++i; return; }
        if (char < " ") throw i;
        if (char === "\\") {
          ++i;
          if (text[i] === "u") {
            for (let n=0;n<4;n++) {
              ++i;
              if (!/[0-9a-f]/i.test(text[i] ?? "")) throw i;
            }
          } else if (!text[i] || !'"\\/bfnrt'.includes(text[i])) throw i;
        }
        ++i;
      }
      throw i;
    }
    function value(depth) {
      skip();
      if (depth > 256) throw i;
      if (text[i] === '"') return string();
      if (text[i] === "{" || text[i] === "[") {
        const dictionary = text[i++] === "{";
        const end = dictionary ? "}" : "]";
        skip();
        if (text[i] === end) {++i; return;}
        while (true) {
          if (dictionary) {string(); skip(); consume(":");}
          value(depth+1);
          skip();
          if (text[i] === end) {++i; return;}
          consume(",");
          skip();
        }
      }
      const first = text[i];
      const literal = {t:"true",f:"false",n:"null"}[first];
      if (literal) {for (const char of literal) consume(char); return;}
      const numeric = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(i));
      if (!numeric) throw i;
      i += numeric[0].length;
    }
    try {value(0); skip();} catch (offset) {return Number.isInteger(offset) ? offset : i;}
    return i;
  }

  function parseJson(text) {
    try {
      return JSON.parse(text, (key, value) => {
        if (typeof value === "number" && (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))) {
          throw new RangeError("JSONの数値が正確に保存できる範囲を超えています。必要なら文字列で指定してください");
        }
        return value;
      });
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      const offset = jsonErrorOffset(text);
      const lines = text.slice(0,offset).split(/\r\n?|\n/);
      throw new SyntaxError("JSON構文エラー（"+lines.length+"行 "+(lines.at(-1).length+1)+"列）");
    }
  }

  const requiredStats = type => typeof type==="string" && Object.hasOwn(stats,type) ? stats[type] : [];

  function validateCard(card, path = "カード", {formal=false,supportedHandlers=null} = {}) {
    const issues = [];
    const add = (key, message, code = "invalid", severity = "error") =>
      issues.push({path:path+key,message,code,severity});
    if (!object(card)) {
      add("","オブジェクトを指定してください");
      return issues;
    }
    if (!validNumber(normalizeNumber(card.cardNumber))) add(".cardNumber","カード番号の形式を確認してください");
    if (!(formal && card.type==null) && !(typeof card.type==="string" && Object.hasOwn(types,card.type))) add(".type","カード種別を選んでください");
    if (!(formal && card.color==null) && !nonempty(card.color)) add(".color","色を入力してください");
    for (const key of formal ? ["title","product","name","sourceText"] : ["title","product"]) {
      if (card[key] != null && typeof card[key] !== "string") add("."+key,"文字列を指定してください");
    }
    for (const key of ["triggers","traits","keywords"]) {
      if (formal && card[key]!=null && !(Array.isArray(card[key]) && card[key].every(nonempty))) {
        add("."+key,"文字列の配列またはnullを指定してください");
      }
    }
    if (formal && card.variants!=null) {
      if (!Array.isArray(card.variants) || !card.variants.every(number=>validNumber(normalizeNumber(number)))) {
        add(".variants","別バージョン番号の配列を確認してください");
      } else if (new Set(card.variants.map(normalizeNumber)).size!==card.variants.length) {
        add(".variants","別バージョン番号が重複しています","duplicate-card");
      }
    }
    const required = requiredStats(card.type);
    if (!object(card.stats) && !(formal && card.stats==null)) add(".stats","基本ステータスを指定してください");
    if (object(card.stats)) for (const [key,label] of Object.entries(statNames)) {
      const value = card.stats[key];
      if (!formal && value == null && required.includes(key)) add(".stats."+key,label+"を入力してください");
      else if (value != null && (!Number.isSafeInteger(value) || value < 0)) add(".stats."+key,label+"は0以上の整数で指定してください");
      else if (value != null && card.type!=null && !required.includes(key)) add(".stats."+key,"このカード種別では空欄にしてください");
    }
    if (formal && card.effects==null) return issues;
    if (!Array.isArray(card.effects)) {
      add(".effects","効果は配列で指定してください");
      return issues;
    }
    const ids = new Set();
    card.effects.forEach((effect,index) => {
      const key = ".effects["+index+"]";
      if (!object(effect)) {add(key,"オブジェクトを指定してください"); return;}
      for (const field of ["id","type","timing"]) if (!(formal && field!=="id" && effect[field]==null) && !nonempty(effect[field])) add(key+"."+field,"文字列を入力してください");
      if (nonempty(effect.id)) {
        const id = effect.id.trim();
        if (ids.has(id)) add(key+".id","効果IDが重複しています","duplicate-effect");
        ids.add(id);
      }
      if (!(formal && effect.optional==null) && typeof effect.optional !== "boolean") add(key+".optional","任意ならtrue、強制ならfalseを指定してください");
      for (const field of ["conditions","costs","choices"]) {
        if (field in effect && !(formal && effect[field]===null) && !Array.isArray(effect[field])) add(key+"."+field,"配列を指定してください");
      }
      for (const field of ["target","duration","limit"]) {
        if (effect[field] != null && !object(effect[field])) add(key+"."+field,"オブジェクトまたはnullを指定してください");
      }
      if ("stateRefs" in effect && !(Array.isArray(effect.stateRefs) && effect.stateRefs.every(nonempty))) {
        add(key+".stateRefs","参照する状態は文字列の配列で指定してください");
      }
      for (const field of formal ? ["description","sourceText","category"] : []) {
        if (effect[field]!=null && typeof effect[field]!=="string") add(key+"."+field,"文字列を指定してください");
      }
      if (formal && effect.steps==null)return;
      if (!Array.isArray(effect.steps) || !effect.steps.length) {add(key+".steps","1件以上の処理を実行順の配列で指定してください"); return;}
      effect.steps.forEach((step,order) => {
        const at = key+".steps["+order+"]";
        if (!object(step) || typeof step.handler !== "string" || !/^[A-Za-z][A-Za-z0-9_.:-]*$/.test(step.handler)) {
          add(at+".handler","処理識別子は英字で始め、英数字・ピリオド・下線・コロン・ハイフンで指定してください");
        } else if(!formal && !supportedHandlers?.has(step.handler)) {
          add(at+".handler",step.handler+" は未実装です","unsupported-handler","warning");
        }
        if (!object(step?.params)) add(at+".params","パラメータはオブジェクトで指定してください");
      });
    });
    return issues;
  }

  function validateCatalog(catalog, options) {
    if (!object(catalog) || catalog.schemaVersion !== schemaVersion) {
      return [{path:"schemaVersion",message:"データ形式のバージョンが一致しません（対応は "+schemaVersion+"）",code:"version",severity:"error"}];
    }
    if (!Array.isArray(catalog.cards)) return [{path:"cards",message:"カード一覧は配列で指定してください",code:"invalid",severity:"error"}];
    const numbers = new Set();
    const issues = [];
    catalog.cards.forEach((card,index) => {
      const path = "cards["+index+"]";
      issues.push(...validateCard(card,path,options));
      const canonical=normalizeNumber(card?.cardNumber);
      for (const number of options?.formal?cardNumbers(card):[canonical]) {
        if (!number)continue;
        if (numbers.has(number)) issues.push({path:path+(number===canonical?".cardNumber":".variants"),
          message:number+" が重複しています",code:"duplicate-card",severity:"error"});
        numbers.add(number);
      }
    });
    return issues;
  }

  function checked(catalog, options) {
    const issues = validateCatalog(catalog,options);
    if (issues.some(issue => issue.severity === "error")) {
      throw Object.assign(new Error("登録データを確認してください"),{issues});
    }
    return {...catalog,cards:catalog.cards.map(card => ({...card,cardNumber:normalizeNumber(card.cardNumber),
      ...(options?.formal && Array.isArray(card.variants)?{variants:card.variants.map(normalizeNumber)}:{})}))};
  }

  function mergeCatalog(current, incoming, overwrite) {
    const imported = checked(incoming);
    const cards = new Map(current.cards.map(card => [card.cardNumber,card]));
    let added = 0, updated = 0, skipped = 0;
    for (const card of imported.cards) {
      if (!cards.has(card.cardNumber)) ++added;
      else if (overwrite) ++updated;
      else {++skipped; continue;}
      cards.set(card.cardNumber,card);
    }
    return {catalog:{...imported,...current,cards:[...cards.values()]},added,updated,skipped};
  }

  function cardNumbers(card) {
    return [...new Set([card?.cardNumber,...(Array.isArray(card?.variants)?card.variants:[])].map(normalizeNumber))];
  }

  function findCard(cards,number) {
    const id=normalizeNumber(number);
    if (!id) return undefined;
    const base=baseNumber(id);
    return cards.find(card=>cardNumbers(card).includes(id))
      ?? (base!==id ? cards.find(card=>cardNumbers(card).includes(base)) : undefined);
  }

  function sameCardNumber(left,right,find) {
    const a=normalizeNumber(left), b=normalizeNumber(right);
    if (!a || !b) return false;
    if (a===b) return true;
    const first=find?.(a), second=find?.(b);
    if (first || second) return (first?.cardNumber??a)===(second?.cardNumber??b);
    return baseNumber(a)===baseNumber(b);
  }

  function products(cards) {
    return [...new Set(cards.map(card=>card.product).filter(nonempty))].sort((a,b)=>a.localeCompare(b,"ja"));
  }

  function selectCards(cards,{number="",name="",title=null,product=null} = {}) {
    const id=normalizeNumber(number), byName=name.trim().toLocaleLowerCase();
    const exact=findCard(cards,id);
    return cards.filter(card => (!id || (exact?card===exact:cardNumbers(card).some(number=>number.includes(id))))
      && (typeof card.name==="string"?card.name:"").toLocaleLowerCase().includes(byName)
      && (title === null || title === (card.title ?? ""))
      && (product === null || product === (card.product ?? "")));
  }

  function template(id) {
    return {id,type:"auto",timing:"on_play",conditions:[],costs:[],target:null,
      optional:false,steps:[{handler:"example.action",params:{amount:1}}],duration:null,limit:null,choices:[],stateRefs:[]};
  }

  return {empty,types,requiredStats,statNames,normalizeNumber,validNumber,parseJson,
    validateCard,validateCatalog,checked,mergeCatalog,cardNumbers,findCard,sameCardNumber,products,selectCards,template};
})();

if (typeof module === "object") module.exports = CardCatalog;
