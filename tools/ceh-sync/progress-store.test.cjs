const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = {setTimeout:(...args)=>{const timer=setTimeout(...args);timer.unref();return timer;},clearTimeout,crypto:require('node:crypto').webcrypto};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../../ceh/progress-store.js'),'utf8'),context);
const Store=context.CEHStore;
const copy=value=>JSON.parse(JSON.stringify(value));
function memory(initial={}) {
  const map=new Map(Object.entries(initial));
  return {get length(){return map.size;},key:i=>[...map.keys()][i],getItem:k=>map.get(k)||null,
    setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)};
}
function server() {
  const users=new Map(); let unavailable=false;
  return {users,setOffline:v=>{unavailable=v;},forUser:id=>({
    load:async()=>{if(unavailable)throw Error('Offline');return copy(users.get(id)||null);},
    save:async(payload,expected)=>{
      if(unavailable)throw Error('Offline');
      const old=users.get(id);
      if((old?.revision||0)!==expected)return {...copy(old),ok:false};
      const row={revision:expected+1,payload:copy(payload),updated_at:new Date().toISOString()};users.set(id,row);
      return {ok:true,revision:row.revision,updated_at:row.updated_at};
    }
  })};
}
function make(storage,id,server,extra={}) {return Store.create({storage,userId:id,cloud:id&&server.forUser(id),delay:1e8,...extra});}
function original() {return {progress:{ALL:{order:[1,2],answers:{1:{selected:'A',correct:true}},currentIndex:1}},
  stats:{version:1,xp:10503,questions:{1:{seen:5,correct:3,wrong:2,streak:0}},runs:[{startedAt:100,answered:2}],migrated:true}};}
function legacyMemory(data=original()) {return memory({ceh_quiz_progress_v1:JSON.stringify(data.progress),ceh_quiz_stats_v1:JSON.stringify(data.stats)});}

test('legacy progress remains intact and its first backup is immutable',async()=>{
  const storage=legacyMemory(), expected=original(), store=make(storage,null);
  await store.initialize();assert.deepEqual(copy(store.getProgress()),expected.progress);assert.deepEqual(copy(store.getStats()),expected.stats);
  const backup=storage.getItem('ceh_quiz_original_backup_v2');
  store.saveStats({...expected.stats,xp:10513});await store.initialize();
  assert.equal(storage.getItem('ceh_quiz_original_backup_v2'),backup);
  assert.equal(JSON.parse(backup).stats.xp,10503);
});
test('claim keeps every field, another computer resumes, other users start separately',async()=>{
  const cloud=server(), storage=legacyMemory(), owner=make(storage,'owner',cloud);await owner.initialize();
  assert.equal(Object.keys(owner.getProgress()).length,0);assert.equal(owner.canClaim(),true);
  await owner.claimLegacy();assert.deepEqual(cloud.users.get('owner').payload,original());
  assert.deepEqual(JSON.parse(storage.getItem('ceh_quiz_stats_v1')),original().stats);
  const laptop=make(memory(),'owner',cloud);await laptop.initialize();assert.deepEqual(copy(laptop.getStats()),original().stats);
  const other=make(storage,'other',cloud);await other.initialize();assert.equal(other.canClaim(),false);
  assert.equal(Object.keys(other.getStats()).length,0);assert.equal(cloud.users.has('other'),false);
});
test('offline answers survive reload and upload on reconnect',async()=>{
  const cloud=server(),storage=legacyMemory(),store=make(storage,'owner',cloud);await store.initialize();await store.claimLegacy();
  cloud.setOffline(true);store.saveStats({...copy(store.getStats()),xp:10513});assert.equal(await store.sync(),false);
  const restarted=make(storage,'owner',cloud);await restarted.initialize();assert.equal(restarted.getStats().xp,10513);
  assert.equal(restarted.getState().dirty,true);cloud.setOffline(false);await restarted.sync();
  assert.equal(cloud.users.get('owner').payload.stats.xp,10513);assert.equal(restarted.getState().dirty,false);
});
test('failed first download cannot create a blank replacement',async()=>{
  const cloud=server(),storage=memory();cloud.setOffline(true);const store=make(storage,'owner',cloud);
  await assert.rejects(store.initialize(),/Offline/);assert.equal(storage.getItem('ceh_quiz_user_v2:owner'),null);
});
test('two devices preserve both versions and require an explicit choice',async()=>{
  const cloud=server(),a=make(legacyMemory(),'owner',cloud);await a.initialize();await a.claimLegacy();
  const b=make(memory(),'owner',cloud);await b.initialize();
  a.saveStats({...copy(a.getStats()),xp:11000});await a.sync();
  b.saveStats({...copy(b.getStats()),xp:12000});assert.equal(await b.sync(),false);
  assert.equal(b.getConflict().payload.stats.xp,11000);assert.equal(b.getStats().xp,12000);
  assert.equal(cloud.users.get('owner').payload.stats.xp,11000);assert.equal(b.backupList().length,2);
  assert.throws(()=>b.saveStats({xp:0}),/Choose/);await b.resolve('device');
  assert.equal(cloud.users.get('owner').payload.stats.xp,12000);assert.equal(b.getConflict(),null);
  await a.sync();assert.equal(a.getStats().xp,12000);
});
test('choosing the online version leaves a recoverable device copy',async()=>{
  const cloud=server(),a=make(legacyMemory(),'owner',cloud);await a.initialize();await a.claimLegacy();
  const b=make(memory(),'owner',cloud);await b.initialize();a.saveStats({xp:2});await a.sync();b.saveStats({xp:3});await b.sync();
  await b.resolve('online');assert.equal(b.getStats().xp,2);assert.ok(b.backupList().some(x=>x.stats.xp===3));
});
test('answers arriving during an upload remain dirty for a second upload',async()=>{
  const cloud=server(),adapter=cloud.forUser('owner');let release;
  const store=make(memory(),'owner',cloud,{cloud:{load:adapter.load,save:async(...args)=>{await new Promise(r=>release=r);return adapter.save(...args);}}});
  await store.initialize();store.saveStats({xp:10});const pending=store.sync();
  await new Promise(r=>setImmediate(r));store.saveStats({xp:20});release();await pending;
  assert.equal(store.getState().dirty,true);assert.equal(cloud.users.get('owner').payload.stats.xp,10);
  const next=store.sync();await new Promise(r=>setImmediate(r));release();await next;
  assert.equal(cloud.users.get('owner').payload.stats.xp,20);assert.equal(store.getState().dirty,false);
});
test('a stale tab cannot overwrite a newer local snapshot',async()=>{
  const cloud=server(),storage=memory(),a=make(storage,'owner',cloud),b=make(storage,'owner',cloud);
  await a.initialize();await b.initialize();a.saveStats({xp:10});
  assert.throws(()=>b.saveStats({xp:0}),/Another tab/);assert.equal(JSON.parse(storage.getItem('ceh_quiz_user_v2:owner')).stats.xp,10);
});
test('a slow startup download cannot overwrite answers saved in another tab',async()=>{
  const cloud=server(),storage=legacyMemory(),a=make(storage,'owner',cloud);
  await a.initialize();await a.claimLegacy();const adapter=cloud.forUser('owner');let release;
  const b=make(storage,'owner',cloud,{cloud:{load:async()=>{const result=await adapter.load();await new Promise(r=>release=r);return result;},save:adapter.save}});
  const loading=b.initialize();await new Promise(r=>setImmediate(r));
  a.saveStats({...copy(a.getStats()),xp:10533});release();await loading;
  assert.equal(b.getStats().xp,10533);assert.equal(b.getState().dirty,true);
  assert.equal(JSON.parse(storage.getItem('ceh_quiz_user_v2:owner')).stats.xp,10533);
});
test('corrupt existing data fails without overwriting the original',async()=>{
  const storage=memory({ceh_quiz_stats_v1:'{broken'}),store=make(storage,null);
  await assert.rejects(store.initialize());assert.equal(storage.getItem('ceh_quiz_stats_v1'),'{broken');
});
test('storage failure prevents a cloud write',async()=>{
  const cloud=server(),storage=memory(),store=make(storage,'owner',cloud);await store.initialize();
  storage.setItem=()=>{throw Error('Quota exceeded');};assert.throws(()=>store.saveStats({xp:10}),/Quota/);
  assert.equal(store.getState().dirty,false);assert.equal(store.getStats().xp,undefined);
  await store.sync();
  assert.equal(cloud.users.has('owner'),false);
});

test('blocked localStorage getter uses isolated temporary storage',async()=>{
  const browser={get localStorage(){throw Object.assign(Error('Access is denied for this document'),{name:'SecurityError'});}};
  const result=Store.browserStorage(browser);assert.equal(result.persistent,false);
  const store=make(result.storage,null);await store.initialize();store.saveStats({xp:10});
  assert.equal(store.getStats().xp,10);
  assert.equal(Store.browserStorage(browser).storage.getItem('ceh_quiz_guest_v2'),null);
});
test('write-blocked storage copies readable CEH data without changing its original',()=>{
  const original=memory({ceh_quiz_stats_v1:'{"xp":10503}',ceh_account_session_v1:'existing-session',unrelated:'untouched'});
  original.setItem=()=>{throw Object.assign(Error('Writes forbidden'),{name:'SecurityError'});};
  const result=Store.browserStorage({localStorage:original});assert.equal(result.persistent,false);
  assert.equal(result.storage.getItem('ceh_quiz_stats_v1'),'{"xp":10503}');
  assert.equal(result.storage.getItem('ceh_account_session_v1'),'existing-session');
  assert.equal(result.storage.getItem('unrelated'),null);
  result.storage.setItem('ceh_quiz_stats_v1','{"xp":1}');assert.equal(original.getItem('ceh_quiz_stats_v1'),'{"xp":10503}');
});
test('quota failure never becomes an empty temporary save',()=>{
  const original=memory({ceh_quiz_stats_v1:'{"xp":10503}'});
  original.setItem=()=>{throw Object.assign(Error('Full'),{name:'QuotaExceededError'});};
  assert.throws(()=>Store.browserStorage({localStorage:original}),/Full/);
  assert.equal(original.getItem('ceh_quiz_stats_v1'),'{"xp":10503}');
});
test('partly unreadable storage never offers an incomplete legacy migration',()=>{
  const original=memory({ceh_quiz_progress_v1:'{"saved":true}',ceh_quiz_stats_v1:'{"xp":10503}'});
  original.setItem=()=>{throw Object.assign(Error('Writes forbidden'),{name:'SecurityError'});};
  const get=original.getItem;original.getItem=k=>{if(k==='ceh_quiz_stats_v1')throw Object.assign(Error('Reads forbidden'),{name:'SecurityError'});return get(k);};
  const result=Store.browserStorage({localStorage:original});assert.equal(result.storage.length,0);
  assert.equal(get('ceh_quiz_stats_v1'),'{"xp":10503}');
});
test('available browser storage is retained and the probe leaves no record',()=>{
  const original=memory({ceh_quiz_stats_v1:'{"xp":10503}'});
  const result=Store.browserStorage({localStorage:original});assert.equal(result.persistent,true);
  assert.equal(result.storage,original);assert.equal(original.length,1);
});
test('disposed account stores cannot make later cloud requests',async()=>{
  const cloud=server(),storage=memory(),store=make(storage,'owner',cloud);await store.initialize();
  store.saveStats({xp:10});store.dispose();assert.equal(await store.sync(),false);
  assert.equal(cloud.users.has('owner'),false);assert.equal(store.getState().dirty,true);
});
