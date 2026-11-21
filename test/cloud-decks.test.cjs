const test=require("node:test");
const assert=require("node:assert/strict");
const {createDeckCloudStore}=require("node:vm").runInNewContext(
  require("node:fs").readFileSync(require("node:path").join(__dirname,"../cloud-decks.js"),"utf8")
  +"\n({createDeckCloudStore})"
);
const cards=Array.from({length:13},(_,i)=>({card_number:"TEST-"+i,num:i===12?2:4,cx:i<2}));
const deck=title=>({title,list:cards});
const clone=structuredClone;

function fixture() {
  const rows=new Map(),storage=new Map(),statuses=[];
  let list=[],session=null,signIns=0,requests=0,id=0,offline=false,lostInsertResponse=false;
  const client={
    auth:{
      getSession:async()=>({data:{session}}),
      signInAnonymously:async()=>{
        signIns++;
        session={user:{id:"owner"}};
        return {data:{session}};
      }
    },
    from(name){
      assert.equal(name,"decks");
      const where=[];
      let operation="select",payload;
      const q={
        eq(key,value){where.push([key,value]);return q},
        select(){return q},
        insert(value){operation="insert";payload=value;return q},
        update(value){operation="update";payload=value;return q},
        delete(){operation="delete";return q},
        then(resolve){
          requests++;
          if(offline)return resolve({error:Error("offline")});
          let selected=[...rows.values()].filter(row=>where.every(([k,v])=>row[k]===v));
          if(operation==="insert"){
            assert.equal(payload.user_id,session.user.id);
            if(rows.has(payload.id))return resolve({error:{code:"23505"}});
            rows.set(payload.id,clone(payload));
            if(lostInsertResponse){lostInsertResponse=false;return resolve({error:Error("timeout after commit")})}
            selected=[payload];
          }else if(operation==="update"){
            selected=selected.map(row=>({...row,...payload}));
            for(const row of selected)rows.set(row.id,clone(row));
          }else if(operation==="delete"){
            for(const row of selected)rows.delete(row.id);
          }
          resolve({data:clone(selected)});
        }
      };
      return q;
    }
  };
  const create=()=>createDeckCloudStore({
    loadClient:async()=>client, read:()=>clone(list),write:value=>{list=clone(value)},
    storage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},
    status:message=>statuses.push(message), lock:task=>task(),uuid:()=>`row-${++id}`,
    validate:d=>{
      assert.equal(d.list.reduce((sum,c)=>sum+c.num,0),50);
      assert.equal(d.list.filter(c=>c.cx).reduce((sum,c)=>sum+c.num,0),8);
    }
  });
  return {rows,storage,statuses,create,signIns:()=>signIns,requests:()=>requests,
    get list(){return list},phaseOffline(value){offline=value},loseInsertResponse(){lostInsertResponse=true},
    loseSession(){session=null}
  };
}

test("anonymous session is preserved and concurrent initialization signs in once",async()=>{
  const f=fixture(),store=f.create();
  await Promise.all([store.synchronize(),store.synchronize()]);
  await f.create().synchronize();
  assert.equal(f.signIns(),1);
  f.loseSession();
  await f.create().synchronize();
  assert.equal(f.signIns(),1);
  assert.match(f.statuses.at(-1),/セッションを復元できません/);
});

test("explicit migration preserves IDs, deduplicates and reloads cloud entries",async()=>{
  const f=fixture(),store=f.create();
  f.list.push({id:"legacy-0",deck:deck("first")},{id:"legacy-1",deck:deck("first")});
  await store.synchronize();
  assert.equal(f.rows.size,0);
  await store.synchronize({legacy:true});
  assert.equal(f.rows.size,1);
  assert.equal(f.list[0].id,"legacy-0");
  assert.ok(f.list[0].cloud.revision);
  f.list.push({id:"local",deck:deck("second"),cloud:store.newMetadata()});
  await store.synchronize();
  assert.equal(f.rows.size,2);
  f.list.splice(0);
  await store.synchronize();
  assert.equal(f.list.length,2);
  assert.ok(f.list.every(item=>item.cloud.createdAt && item.cloud.updatedAt));
});

test("network failure and response loss preserve local CRUD intent without duplication",async()=>{
  const f=fixture(),store=f.create();
  f.list.push({id:"local",deck:deck("saved"),cloud:store.newMetadata()});
  f.phaseOffline(true);
  await store.synchronize();
  assert.equal(f.list[0].deck.title,"saved");
  assert.match(f.statuses.at(-1),/同期失敗/);
  f.phaseOffline(false);
  f.loseInsertResponse();
  await store.synchronize();
  assert.equal(f.rows.size,1);
  await store.synchronize();
  assert.equal(f.rows.size,1);
  f.list[0].deck=deck("renamed");
  f.list[0].cloud.dirty="update";
  await store.synchronize();
  assert.equal([...f.rows.values()][0].name,"renamed");
  f.list[0].cloud.dirty="delete";
  await store.synchronize();
  assert.equal(f.rows.size,0);
  assert.equal(f.list[0].cloud.removed,true);
  await store.synchronize({legacy:true});
  assert.equal(f.rows.size,0);
});

test("server changes require confirmation and a stale confirmation cannot overwrite",async()=>{
  const f=fixture(),store=f.create();
  f.list.push({id:"local",deck:deck("initial"),cloud:store.newMetadata()});
  await store.synchronize();
  const row=[...f.rows.values()][0];
  row.name="server";row.updated_at="2025-01-01T01:00:00Z";
  f.list[0].deck=deck("pending");f.list[0].cloud.dirty="update";
  await store.synchronize();
  assert.equal(row.name,"server");
  assert.equal(f.list[0].cloud.conflict,true);
  row.name="server again";row.updated_at="2025-01-01T02:00:00Z";
  await store.resolve("local",true);
  assert.equal(row.name,"server again");
  await store.resolve("local",false);
  assert.equal(f.list[0].deck.title,"server again");
  f.list[0].deck=deck("offline update");f.list[0].cloud.dirty="update";
  f.rows.delete(row.id);
  await store.synchronize();
  assert.equal(f.list[0].cloud.conflict,true);
  await store.resolve("local",true);
  assert.equal(f.rows.size,0);
  await store.resolve("local",false);
  assert.equal(f.list[0].cloud.removed,true);
});
