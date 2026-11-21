"use strict";

const deckCloudConfig = {
  url: "https://subgmiwfsmvecpuainss.supabase.co",
  key: "sb_publishable_qakMq_hLp4QKjnybIN9-vw_55xhrW92"
};

function createDeckCloudStore({loadClient, read, write, validate, uuid, storage, status, lock}) {
  const ownerKey = "ws-manual-cloud-owner-v1";
  const columns = "id,user_id,name,cards,created_at,updated_at";
  let clientPromise, user, busy = false, online = false;

  async function authenticate() {
    if (!clientPromise) clientPromise = loadClient().catch(error=>{ clientPromise=undefined; throw error; });
    const client = await clientPromise;
    const restored = await client.auth.getSession();
    if (restored.error) throw restored.error;
    let session = restored.data.session;
    if (!session) {
      if (storage.getItem(ownerKey)) throw Error("匿名セッションを復元できません。端末内デッキは引き続き利用できます");
      const signed = await client.auth.signInAnonymously();
      if (signed.error) throw signed.error;
      session = signed.data.session;
    }
    const previous = storage.getItem(ownerKey);
    if (!session?.user?.id || (previous && previous !== session.user.id)) {
      throw Error("以前のクラウドデッキのセッションを復元できません");
    }
    storage.setItem(ownerKey,session.user.id);
    user = session.user.id;
    return client;
  }

  function table(client) { return client.from("decks"); }

  function unpack(row) {
    if (row.user_id !== user || typeof row.id !== "string" ||
        typeof row.name !== "string" || !row.name.trim() ||
        !Number.isFinite(Date.parse(row.created_at)) || !Number.isFinite(Date.parse(row.updated_at))) {
      throw Error("クラウドのデッキ形式を確認できません");
    }
    const deck = {title:row.name,list:row.cards};
    validate(deck);
    return deck;
  }
  function cloudMetadata(row) {
    return {id:row.id,owner:user,revision:row.updated_at,createdAt:row.created_at,updatedAt:row.updated_at};
  }
  function sameDeck(a,b) {
    const fingerprint = deck=>JSON.stringify([deck.title,deck.list.map(card=>[
      card.card_number,Number(card.num),card.cx
    ]).sort(([a],[b])=>a.localeCompare(b))]);
    return fingerprint(a)===fingerprint(b);
  }
  function saveLocal(change) {
    const list=read();
    change(list);
    write(list);
  }
  function replace(expected, next) {
    saveLocal(list=>{
      const index=list.findIndex(entry=>entry.id===expected.id);
      if(index===-1 || JSON.stringify(list[index])!==JSON.stringify(expected)){
        throw Error("別のタブで端末データが変更されました。もう一度同期してください");
      }
      list[index]=next;
    });
  }

  async function rows(client) {
    const remote=new Map();
    let lastId;
    while(true){
      let query=table(client).select(columns).eq("user_id",user).order("id").limit(250);
      if(lastId)query=query.gt("id",lastId);
      const result=await query;
      if(result.error)throw result.error;
      if(!result.data.length)return remote;
      for(const row of result.data)remote.set(row.id,{row,deck:unpack(row)});
      lastId=result.data.at(-1).id;
    }
  }
  function accept(item, remote) {
    replace(item,remote
      ? {...item,deck:remote.deck,cloud:cloudMetadata(remote.row)}
      : {...item,cloud:{...item.cloud,dirty:null,conflict:false,removed:true}});
  }

  function markConflict(item,remote) {
    replace(item,{...item,cloud:{...item.cloud,conflict:true,conflictingRow:remote?.row??null}});
  }

  async function push(client,item,remote) {
    const meta=item.cloud;
    const remove=meta.dirty==="delete";
    if(remove && !remote){accept(item,null);return}
    if(!remove && remote && sameDeck(item.deck,remote.deck)){accept(item,remote);return}
    if((meta.revision && remote?.row.updated_at!==meta.revision) ||
       (!meta.revision && remote) || (meta.dirty==="update" && !remote)){
      markConflict(item,remote);
      return;
    }
    if(!remove)validate(item.deck);
    const payload={name:item.deck.title,cards:item.deck.list};
    let result;
    if(remove){
      result=await table(client).delete().eq("id",meta.id).eq("user_id",user)
        .eq("updated_at",meta.revision).select(columns);
    }else if(meta.revision){
      payload.updated_at=new Date(Math.max(Date.now(),Date.parse(meta.revision)+1)).toISOString();
      result=await table(client).update(payload).eq("id",meta.id).eq("user_id",user)
        .eq("updated_at",meta.revision).select(columns);
    }else{
      const created_at=new Date().toISOString();
      result=await table(client).insert({...payload,id:meta.id,user_id:user,created_at,updated_at:created_at}).select(columns);
    }
    if(result.error && result.error.code!=="23505")throw result.error;
    if(!result.data?.length){
      const latest=(await rows(client)).get(meta.id);
      if(remove && !latest)accept(item,null);
      else if(!remove && latest && sameDeck(item.deck,latest.deck))accept(item,latest);
      else markConflict(item,latest);
      return;
    }
    const row=result.data[0];
    accept(item,remove?null:{row,deck:unpack(row)});
  }

  async function run(task) {
    if(busy)return;
    busy=true;
    status("クラウドに接続・同期中…");
    try {
      await lock(async()=>{
        const client=await authenticate();
        await task(client);
      });
      online=true;
    }catch(error){
      online=false;
      status("クラウド同期失敗。端末内データは保持されています。"+(error.message || ""));
      return;
    }finally{
      busy=false;
    }
    const list=read();
    const queued=list.filter(item=>item.cloud?.dirty&&!item.cloud?.conflict).length;
    const conflicts=list.filter(item=>item.cloud?.conflict).length;
    const localOnly=list.filter(item=>!item.cloud).length;
    status("クラウド接続済み ／ 同期待ち "+queued+"件 ／ 競合 "+conflicts+"件 ／ 端末のみ "+localOnly+"件");
  }

  async function synchronize({legacy=false}={}) {
    return run(async client=>{
      const remote=await rows(client);
      for(let item of read()){
        let meta=item.cloud;
        if(meta?.removed || (meta?.owner && meta.owner!==user))continue;
        if(!meta){
          if(!legacy)continue;
          try{validate(item.deck)}catch{continue} // Legacy decks with unresolved CX remain local.
          const matchingLocal=read().find(entry=>entry.id!==item.id && entry.cloud?.owner===user && sameDeck(item.deck,entry.deck));
          if(matchingLocal)continue;
          const existing=[...remote.values()].find(entry=>sameDeck(item.deck,entry.deck));
          if(existing){
            if(!read().some(x=>x.cloud?.id===existing.row.id))accept(item,existing);
            continue;
          }
          meta={id:uuid(),owner:user,dirty:"insert",revision:null};
        }
        if(!meta.owner)meta={...meta,owner:user};
        if(meta!==item.cloud){
          const next={...item,cloud:meta};
          replace(item,next);
          item=next;
        }
        const remoteItem=remote.get(meta.id);
        if(meta.conflict){
          if((meta.conflictingRow?.updated_at??null)!==(remoteItem?.row.updated_at??null))markConflict(item,remoteItem);
          continue;
        }
        if(meta.dirty)await push(client,item,remoteItem);
        else accept(item,remoteItem);
      }
      const linked=new Set(read().filter(item=>item.cloud?.owner===user).map(item=>item.cloud.id));
      for(const entry of remote.values()){
        if(linked.has(entry.row.id))continue;
        saveLocal(list=>{
          if(!list.some(item=>item.cloud?.id===entry.row.id)){
            list.push({id:entry.row.id,deck:entry.deck,cloud:cloudMetadata(entry.row)});
          }
        });
      }
    });
  }

  async function resolve(id, keepLocal) {
    return run(async client=>{
      const item=read().find(entry=>entry.id===id && entry.cloud?.conflict && entry.cloud.owner===user);
      if(!item)return;
      const remote=(await rows(client)).get(item.cloud.id);
      if((item.cloud.conflictingRow?.updated_at??null)!==(remote?.row.updated_at??null)){
        markConflict(item,remote);
        throw Error("確認後にクラウド版が変わりました。新しい内容を確認してください");
      }
      if(!keepLocal){accept(item,remote);return}
      if(!remote)throw Error("クラウドで削除済みです。端末版を残す場合は新しいデッキとして保存してください");
      const next={...item,cloud:{...cloudMetadata(remote.row),dirty:item.cloud.dirty==="delete"?"delete":"update"}};
      replace(item,next);
      await push(client,next,remote);
    });
  }

  return {
    synchronize,resolve,
    busy:()=>busy,
    online:()=>online,
    newMetadata:()=>({id:uuid(),owner:user??storage.getItem(ownerKey),revision:null,dirty:"insert"})
  };
}

function loadDeckCloudClient() {
  const sdk=document.createElement("script");
  sdk.src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.90.1/dist/umd/supabase.js";
  sdk.integrity="sha384-A96WC0YlXhym5v/O6jMcQqnXprquR8locjmdIeVbVZ/tg/yqXGcljOIlxs5TUVKG";
  sdk.crossOrigin="anonymous";
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{
      sdk.remove();
      reject(Error("クラウド接続ライブラリの読み込みがタイムアウトしました"));
    },8000);
    sdk.onerror=()=>{clearTimeout(timer);sdk.remove();reject(Error("クラウド接続ライブラリを読み込めません"))};
    sdk.onload=()=>{
      clearTimeout(timer);
      try {
        const client=window.supabase.createClient(deckCloudConfig.url,deckCloudConfig.key,{
          auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false},
          global:{fetch:(input,init={})=>{
            const timeout=AbortSignal.timeout(8000);
            const signal=init.signal?AbortSignal.any([init.signal,timeout]):timeout;
            return fetch(input,{...init,signal});
          }}
        });
        resolve(client);
      }catch(error){reject(error)}
    };
    document.head.append(sdk);
  });
}
