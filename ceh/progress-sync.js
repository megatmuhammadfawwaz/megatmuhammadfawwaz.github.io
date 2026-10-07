(function () {
  'use strict';
  var config = window.CEH_SYNC_CONFIG || {}, client, user = null, store, panel, statusEl, messageEl;
  var initialized = false, switching = false, recovery = false, accountLoading = false, storage, persistent = true;
  var configured = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(config.url || '') && !!config.publishableKey;
  function el(id) { return document.getElementById(id); }
  function message(value, bad) { messageEl.textContent=value; messageEl.classList.toggle('sync-error',!!bad); }
  function fail(error) { message(error.message || 'Please try again.',true); }
  function changed(event) {
    if(statusEl) render();
    if(initialized && event.changed && !accountLoading) window.dispatchEvent(new Event('ceh-progress-changed'));
    saveState();
  }
  function saveState() {window.dispatchEvent(new CustomEvent('ceh-save-state',{detail:{blocked:switching || accountLoading || !!(store && store.getConflict())}}));}
  function saveStatus() {
    var value=store.getStatus();
    if(!persistent) {
      if(!user) return 'Temporary progress — sign in to save online';
      value=value.replace('saved on this browser','kept in this tab').replace('your browser save is safe','keep this tab open until saved online');
    }
    return value;
  }
  function download(payload,name) {
    var url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
    var a=document.createElement('a'); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () {URL.revokeObjectURL(url);},1000);
  }
  function backup() { var s=store.getState(); return {app:'ceh-quiz',exportedAt:new Date().toISOString(),progress:s.progress,stats:s.stats}; }
  function render() {
    statusEl.textContent=(user ? user.email+' · ' : 'This browser · ')+saveStatus();
    el('sync-account').textContent=user ? 'My account' : 'Sign in to sync';
    el('sync-identity').textContent=user ? 'Signed in as '+user.email : 'Continue your progress on any computer';
    el('sync-auth-form').hidden=!!user; el('sync-signed-in').hidden=!user;
    el('sync-not-configured').hidden=configured; el('sync-auth-fields').disabled=!configured || switching;
    el('sync-storage-notice').hidden=persistent;
    el('sync-forgot').hidden=config.passwordResetEnabled!==true;
    el('sync-reset-notice').hidden=!configured || config.passwordResetEnabled===true;
    el('sync-claim').hidden=!store.canClaim(); el('sync-existing').hidden=!store.canClaim();
    el('sync-claim').disabled=switching || accountLoading;
    el('sync-account-status').textContent=accountLoading ? 'Progress could not load. Reconnect and select Sync now to retry.' : saveStatus(); el('sync-conflict').hidden=!store.getConflict();
    statusEl.title=store.getError() ? store.getError().message : '';
  }
  function show() { render(); panel.showModal(); }
  function mount() {
    var bar=document.createElement('section'); bar.className='sync-bar'; bar.setAttribute('aria-label','Progress account');
    bar.innerHTML='<span id="sync-status" role="status" aria-live="polite"></span><button id="sync-account" type="button"></button>';
    document.querySelector('#app .topbar').after(bar); statusEl=el('sync-status');
    var notice=document.createElement('p'); notice.id='sync-storage-notice'; notice.className='sync-storage-notice'; notice.hidden=persistent;
    notice.textContent='Browser saving is blocked. Progress stays in this tab until saved online. Sign in to sync and wait for “Up to date” before leaving. You’ll need to sign in again after reopening.';
    bar.after(notice);
    var conflict=document.createElement('section'); conflict.id='sync-conflict'; conflict.className='sync-conflict'; conflict.hidden=true;
    conflict.innerHTML='<h2>Both computers have saved changes</h2><p>Choose the version you want to continue. Both versions have safety copies on this browser.</p><div class="sync-actions"><button id="sync-conflict-download">Download both saves</button><button id="sync-use-online">Continue online save</button><button id="sync-use-device">Continue this device’s save</button></div>';
    bar.after(conflict);
    panel=document.createElement('dialog'); panel.className='sync-panel'; panel.id='sync-panel'; panel.setAttribute('aria-labelledby','sync-title');
    panel.innerHTML='<div class="sync-panel-head"><h2 id="sync-title">Your CEH progress</h2><button id="sync-close" type="button" aria-label="Close account">✕</button></div>'+
      '<p id="sync-identity"></p><p class="sync-hint">The vault passphrase unlocks the questions. Your personal account keeps XP, answers, weak spots, and sessions separate for each person.</p>'+
      '<p id="sync-not-configured" class="sync-notice">Online accounts are awaiting setup. Your current browser progress is still available and safe.</p>'+
      '<form id="sync-auth-form"><fieldset id="sync-auth-fields"><label for="sync-email">Email</label><input id="sync-email" type="email" autocomplete="username" required maxlength="254">'+
      '<label for="sync-password">Account password</label><input id="sync-password" type="password" autocomplete="current-password" minlength="8" maxlength="128" required>'+
      '<div class="sync-actions"><button type="submit" id="sync-sign-in">Sign in</button><button type="button" id="sync-sign-up">Create account</button><button type="button" id="sync-forgot">Forgot password</button></div></fieldset></form>'+
      '<p id="sync-reset-notice" class="sync-hint" hidden>Keep your account password safe. Email password resets are not available yet.</p>'+
      '<div id="sync-signed-in" hidden><p id="sync-account-status"></p><div id="sync-existing"><h3>Keep the progress already on this PC</h3><p>If the existing browser progress is yours, attach it to this account. A backup is kept first.</p></div>'+
      '<div class="sync-actions"><button id="sync-claim" type="button">Keep my existing progress</button><button id="sync-now" type="button">Sync now</button><button id="sync-sign-out" type="button">Sign out</button></div></div>'+
      '<form id="sync-recovery" hidden><label for="sync-new-password">New account password</label><input id="sync-new-password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required><button type="submit">Save new password</button></form>'+
      '<p id="sync-message" role="status" aria-live="polite"></p><div class="sync-actions sync-backups"><button id="sync-export" type="button">Download current progress</button><button id="sync-safety" type="button">Download safety copies</button></div>';
    document.body.appendChild(panel); messageEl=el('sync-message');
    el('sync-account').onclick=function () {message('');show();}; el('sync-close').onclick=function () {panel.close();};
    el('sync-export').onclick=function () {download(backup(),'ceh-progress-backup.json');};
    el('sync-safety').onclick=function () {
      var copies=store.backupList();
      if(!user) {var original=storage.getItem('ceh_quiz_original_backup_v2');if(original) copies.push(JSON.parse(original));}
      download({app:'ceh-safety-copies',backups:copies},'ceh-safety-copies.json');
    };
    el('sync-conflict-download').onclick=function () {
      var remote=store.getConflict(); download({app:'ceh-sync-conflict',device:backup(),online:{app:'ceh-quiz',exportedAt:remote.updated_at,
        progress:remote.payload.progress,stats:remote.payload.stats}},'ceh-both-saves.json');
    };
    ['online','device'].forEach(function (choice) {el('sync-use-'+choice).onclick=async function () {
      try {await store.resolve(choice);render();window.dispatchEvent(new Event('ceh-progress-changed'));}catch(err) {fail(err);show();}
    };});
    el('sync-claim').onclick=async function () {
      if(switching || accountLoading) return;
      try {
        if(store.hasSavedProgress() && !confirm('Replace this account’s progress with the original progress on this PC? Both versions will be backed up first.')) return;
        await store.claimLegacy(); message(store.getState().dirty ? 'Attached on this PC. Online sync will retry when connected.' : 'Your existing progress is attached and saved online.');
        render(); window.dispatchEvent(new Event('ceh-progress-changed'));
      } catch(err) {fail(err);}
    };
    el('sync-now').onclick=async function () {
      if(switching) return;
      if(accountLoading) {await activateAccount(user);return;}
      await store.sync();message(store.getError() ? store.getError().message : saveStatus(),!!store.getError());
    };
    el('sync-auth-form').onsubmit=function (e) {e.preventDefault();authenticate(false);};
    el('sync-sign-up').onclick=function () {authenticate(true);};
    el('sync-forgot').onclick=async function () {
      if(!configured || config.passwordResetEnabled!==true) return;
      if(!el('sync-email').reportValidity()) return;
      var result=await client.auth.resetPasswordForEmail(el('sync-email').value.trim(),{redirectTo:new URL('index.html',location.href).href});
      if(result.error) fail(result.error);else message('Check your email for a password reset link.');
    };
    el('sync-sign-out').onclick=async function () {
      if(switching) return;switching=true;saveState();await store.sync();
      if((store.getState().dirty || store.getConflict()) && !confirm(persistent ? 'Some changes are saved only on this browser. They will remain under this account and sync when you sign in here again. Sign out now?' : 'Some changes are not saved online. Download a backup before closing this tab. Sign out now?')) {switching=false;saveState();return;}
      var result=await client.auth.signOut({scope:'local'});
      if(result.error) {switching=false;saveState();fail(result.error);}else if(persistent) location.reload();else {recovery=false;el('sync-recovery').hidden=true;await activateAccount(null);message('Signed out.');}
    };
    el('sync-recovery').onsubmit=async function (e) {
      e.preventDefault();var result=await client.auth.updateUser({password:el('sync-new-password').value});el('sync-new-password').value='';
      if(result.error) fail(result.error);else {recovery=false;el('sync-recovery').hidden=true;message('Account password updated.');}
    };
    render();if(recovery) {el('sync-recovery').hidden=false;show();}
  }
  async function authenticate(signUp) {
    if(!configured || switching || !el('sync-auth-form').reportValidity()) return;
    switching=true;saveState();el('sync-auth-fields').disabled=true;
    var credentials={email:el('sync-email').value.trim(),password:el('sync-password').value};
    try {
      await store.sync(); // Finish any old account save before authentication changes.
      var result=signUp ? await client.auth.signUp(Object.assign(credentials,{options:{emailRedirectTo:new URL('index.html',location.href).href}})) : await client.auth.signInWithPassword(credentials);
      if(result.error) throw result.error;el('sync-password').value='';
      if(result.data.session) {
        if(persistent) location.reload();else if(await activateAccount(result.data.session.user)) message('Signed in. Wait for “Up to date” before leaving this tab.');
      } else {switching=false;render();saveState();message('Confirm your account through the email, then sign in here.');}
    } catch(err) {switching=false;render();saveState();fail(err);}
  }
  function createStore() {
    var accountId=user && user.id;
    var cloud=accountId ? {
      load:async function () {var r=await client.from('ceh_progress').select('payload,revision,updated_at').eq('user_id',accountId).maybeSingle();if(r.error) throw r.error;return r.data;},
      save:async function (payload,revision) {var r=await client.rpc('save_ceh_progress',{p_payload:payload,p_expected_revision:revision});if(r.error) throw r.error;
        if(!r.data || typeof r.data.ok!=='boolean') throw new Error('Unexpected sync response. Your progress has been kept in this tab.');return r.data;}
    } : null;
    return window.CEHStore.create({storage:storage,userId:accountId,cloud:cloud,onChange:changed});
  }
  async function activateAccount(nextUser) {
    switching=true;accountLoading=true;saveState();
    if(store) store.dispose();
    user=nextUser;store=createStore();
    try {
      await store.initialize();accountLoading=false;switching=false;render();
      window.dispatchEvent(new Event('ceh-account-changed'));saveState();return true;
    } catch(err) {switching=false;render();saveState();fail(err);return false;}
  }
  async function init() {
    if(initialized) return;
    var browserSave=window.CEHStore.browserStorage(window);storage=browserSave.storage;persistent=browserSave.persistent;
    if(configured) {
      if(!window.supabase) throw new Error('The account library could not load. Your saved progress has not changed.');
      client=window.supabase.createClient(config.url,config.publishableKey,{auth:{storage:storage,storageKey:'ceh_account_session_v1',detectSessionInUrl:true,persistSession:true,autoRefreshToken:true}});
      client.auth.onAuthStateChange(function (event,session) {
        if(event==='PASSWORD_RECOVERY') {recovery=true;if(panel) {el('sync-recovery').hidden=false;show();}}
        var nextId=session && session.user && session.user.id;
        if(initialized && !switching && (nextId || null)!==(user && user.id)) {
          switching=true;saveState();setTimeout(function () {if(persistent) location.reload();else activateAccount(session && session.user);},0);
        }
      });
      var result=await client.auth.getSession();if(result.error) throw result.error;
      user=result.data.session && result.data.session.user;
    }
    store=createStore();
    await store.initialize();initialized=true;mount();
    window.addEventListener('storage',function (e) {try {store.acceptStorage(e);}catch(err) {fail(err);}});
    window.addEventListener('online',function () {if(!switching && !accountLoading) store.sync();});
    document.addEventListener('visibilitychange',function () {if(!switching && !accountLoading && document.visibilityState==='visible') store.sync();});
    setInterval(function () {if(user && !switching && !accountLoading && document.visibilityState==='visible') store.sync();},30000);
    if(!persistent) window.addEventListener('beforeunload',function (e) {
      if(store.hasSavedProgress() && (!user || store.getState().dirty || store.getConflict())) {e.preventDefault();e.returnValue='';}
    });
    if(user && store.canClaim() && !store.hasSavedProgress()) {message('Choose “Keep my existing progress” to attach your saved progress from this PC.');show();}
  }
  window.CEHProgress={init:init,getProgress:function () {return store.getProgress();},getStats:function () {return store.getStats();},
    saveProgress:function (p) {store.saveProgress(p);},saveStats:function (s) {store.saveStats(s);},
    isBlocked:function () {return switching || accountLoading || !!store.getConflict();},flush:function () {return store.sync();},backup:function (why) {store.backup(why);},show:show};
})();
