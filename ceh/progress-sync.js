(function () {
  'use strict';
  var config = window.CEH_SYNC_CONFIG || {}, client, user = null, store, panel, statusEl, messageEl;
  var initialized = false, switching = false, recovery = false;
  var configured = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(config.url || '') && !!config.publishableKey;
  function el(id) { return document.getElementById(id); }
  function message(value, bad) { messageEl.textContent=value; messageEl.classList.toggle('sync-error',!!bad); }
  function fail(error) { message(error.message || 'Please try again.',true); }
  function changed(event) {
    if(statusEl) render();
    if(initialized && event.changed) window.dispatchEvent(new Event('ceh-progress-changed'));
    window.dispatchEvent(new CustomEvent('ceh-save-state',{detail:{blocked:!!event.conflict}}));
  }
  function download(payload,name) {
    var url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
    var a=document.createElement('a'); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () {URL.revokeObjectURL(url);},1000);
  }
  function backup() { var s=store.getState(); return {app:'ceh-quiz',exportedAt:new Date().toISOString(),progress:s.progress,stats:s.stats}; }
  function render() {
    statusEl.textContent=(user ? user.email+' · ' : 'This browser · ')+store.getStatus();
    el('sync-account').textContent=user ? 'My account' : 'Sign in to sync';
    el('sync-identity').textContent=user ? 'Signed in as '+user.email : 'Continue your progress on any computer';
    el('sync-auth-form').hidden=!!user; el('sync-signed-in').hidden=!user;
    el('sync-not-configured').hidden=configured; el('sync-auth-fields').disabled=!configured;
    el('sync-claim').hidden=!store.canClaim(); el('sync-existing').hidden=!store.canClaim();
    el('sync-account-status').textContent=store.getStatus(); el('sync-conflict').hidden=!store.getConflict();
    statusEl.title=store.getError() ? store.getError().message : '';
  }
  function show() { render(); panel.showModal(); }
  function mount() {
    var bar=document.createElement('section'); bar.className='sync-bar'; bar.setAttribute('aria-label','Progress account');
    bar.innerHTML='<span id="sync-status" role="status" aria-live="polite"></span><button id="sync-account" type="button"></button>';
    document.querySelector('#app .topbar').after(bar); statusEl=el('sync-status');
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
      '<div id="sync-signed-in" hidden><p id="sync-account-status"></p><div id="sync-existing"><h3>Keep the progress already on this PC</h3><p>If the existing browser progress is yours, attach it to this account. A backup is kept first.</p></div>'+
      '<div class="sync-actions"><button id="sync-claim" type="button">Keep my existing progress</button><button id="sync-now" type="button">Sync now</button><button id="sync-sign-out" type="button">Sign out</button></div></div>'+
      '<form id="sync-recovery" hidden><label for="sync-new-password">New account password</label><input id="sync-new-password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required><button type="submit">Save new password</button></form>'+
      '<p id="sync-message" role="status" aria-live="polite"></p><div class="sync-actions sync-backups"><button id="sync-export" type="button">Download current progress</button><button id="sync-safety" type="button">Download safety copies</button></div>';
    document.body.appendChild(panel); messageEl=el('sync-message');
    el('sync-account').onclick=function () {message('');show();}; el('sync-close').onclick=function () {panel.close();};
    el('sync-export').onclick=function () {download(backup(),'ceh-progress-backup.json');};
    el('sync-safety').onclick=function () {
      var copies=store.backupList();
      if(!user) {var original=localStorage.getItem('ceh_quiz_original_backup_v2');if(original) copies.push(JSON.parse(original));}
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
      try {
        if(store.hasSavedProgress() && !confirm('Replace this account’s progress with the original progress on this PC? Both versions will be backed up first.')) return;
        await store.claimLegacy(); message(store.getState().dirty ? 'Attached on this PC. Online sync will retry when connected.' : 'Your existing progress is attached and saved online.');
        render(); window.dispatchEvent(new Event('ceh-progress-changed'));
      } catch(err) {fail(err);}
    };
    el('sync-now').onclick=async function () {await store.sync();message(store.getError() ? store.getError().message : store.getStatus(),!!store.getError());};
    el('sync-auth-form').onsubmit=function (e) {e.preventDefault();authenticate(false);};
    el('sync-sign-up').onclick=function () {authenticate(true);};
    el('sync-forgot').onclick=async function () {
      if(!el('sync-email').reportValidity()) return;
      var result=await client.auth.resetPasswordForEmail(el('sync-email').value.trim(),{redirectTo:new URL('index.html',location.href).href});
      if(result.error) fail(result.error);else message('Check your email for a password reset link.');
    };
    el('sync-sign-out').onclick=async function () {
      if(switching) return;switching=true;await store.sync();
      if((store.getState().dirty || store.getConflict()) && !confirm('Some changes are saved only on this browser. They will remain under this account and sync when you sign in here again. Sign out now?')) {switching=false;return;}
      var result=await client.auth.signOut({scope:'local'});
      if(result.error) {switching=false;fail(result.error);}else location.reload();
    };
    el('sync-recovery').onsubmit=async function (e) {
      e.preventDefault();var result=await client.auth.updateUser({password:el('sync-new-password').value});el('sync-new-password').value='';
      if(result.error) fail(result.error);else {recovery=false;el('sync-recovery').hidden=true;message('Account password updated.');}
    };
    render();if(recovery) {el('sync-recovery').hidden=false;show();}
  }
  async function authenticate(signUp) {
    if(!configured || switching || !el('sync-auth-form').reportValidity()) return;
    switching=true;el('sync-auth-fields').disabled=true;
    var credentials={email:el('sync-email').value.trim(),password:el('sync-password').value};
    try {
      var result=signUp ? await client.auth.signUp(Object.assign(credentials,{options:{emailRedirectTo:new URL('index.html',location.href).href}})) : await client.auth.signInWithPassword(credentials);
      if(result.error) throw result.error;el('sync-password').value='';
      if(result.data.session) location.reload();else {switching=false;render();message('Confirm your account through the email, then sign in here.');}
    } catch(err) {switching=false;render();fail(err);}
  }
  async function init() {
    if(initialized) return;
    if(configured) {
      if(!window.supabase) throw new Error('The account library could not load. Your saved progress has not changed.');
      client=window.supabase.createClient(config.url,config.publishableKey,{auth:{storageKey:'ceh_account_session_v1',detectSessionInUrl:true,persistSession:true,autoRefreshToken:true}});
      client.auth.onAuthStateChange(function (event,session) {
        if(event==='PASSWORD_RECOVERY') {recovery=true;if(panel) {el('sync-recovery').hidden=false;show();}}
        var nextId=session && session.user && session.user.id;
        if(initialized && !switching && (nextId || null)!==(user && user.id)) {
          switching=true;setTimeout(function () {location.reload();},0);
        }
      });
      var result=await client.auth.getSession();if(result.error) throw result.error;
      user=result.data.session && result.data.session.user;
    }
    var cloud=user ? {
      load:async function () {var r=await client.from('ceh_progress').select('payload,revision,updated_at').eq('user_id',user.id).maybeSingle();if(r.error) throw r.error;return r.data;},
      save:async function (payload,revision) {var r=await client.rpc('save_ceh_progress',{p_payload:payload,p_expected_revision:revision});if(r.error) throw r.error;
        if(!r.data || typeof r.data.ok!=='boolean') throw new Error('Unexpected sync response. Your browser save is safe.');return r.data;}
    } : null;
    store=window.CEHStore.create({storage:localStorage,userId:user && user.id,cloud:cloud,onChange:changed});
    await store.initialize();initialized=true;mount();
    window.addEventListener('storage',function (e) {try {store.acceptStorage(e);}catch(err) {fail(err);}});
    window.addEventListener('online',function () {store.sync();});
    document.addEventListener('visibilitychange',function () {if(document.visibilityState==='visible') store.sync();});
    setInterval(function () {if(user && document.visibilityState==='visible') store.sync();},30000);
    if(user && store.canClaim() && !store.hasSavedProgress()) {message('Choose “Keep my existing progress” to attach your saved progress from this PC.');show();}
  }
  window.CEHProgress={init:init,getProgress:function () {return store.getProgress();},getStats:function () {return store.getStats();},
    saveProgress:function (p) {store.saveProgress(p);},saveStats:function (s) {store.saveStats(s);},
    isBlocked:function () {return !!store.getConflict();},flush:function () {return store.sync();},backup:function (why) {store.backup(why);},show:show};
})();
