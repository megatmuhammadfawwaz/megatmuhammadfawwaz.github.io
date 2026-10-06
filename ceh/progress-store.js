(function (root) {
  'use strict';
  var LEGACY_PROGRESS = 'ceh_quiz_progress_v1';
  var LEGACY_STATS = 'ceh_quiz_stats_v1';
  var LEGACY_BACKUP = 'ceh_quiz_original_backup_v2';
  var LEGACY_OWNER = 'ceh_quiz_original_owner_v2';
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function valid(payload) {
    return object(payload) && object(payload.progress) && object(payload.stats) &&
      JSON.stringify(payload).length <= 4000000;
  }
  function parse(storage, key) {
    var raw = storage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw); // Corrupt saves are reported, never silently replaced.
  }
  function hasProgress(payload) {
    return valid(payload) && (Object.keys(payload.progress).length > 0 ||
      Number(payload.stats.xp) > 0 || Object.keys(payload.stats.questions || {}).length > 0 ||
      (payload.stats.runs || []).length > 0);
  }
  function legacy(storage) {
    return { progress: parse(storage, LEGACY_PROGRESS) || {}, stats: parse(storage, LEGACY_STATS) || {} };
  }
  function preserveOriginal(storage) {
    if (storage.getItem(LEGACY_BACKUP)) return;
    var payload = legacy(storage);
    if (hasProgress(payload)) storage.setItem(LEGACY_BACKUP, JSON.stringify({
      app: 'ceh-quiz', exportedAt: new Date().toISOString(), progress: payload.progress, stats: payload.stats
    }));
  }
  function create(options) {
    var storage = options.storage, userId = options.userId || null, cloud = options.cloud || null;
    var key = userId ? 'ceh_quiz_user_v2:' + userId : 'ceh_quiz_guest_v2';
    var state, conflict = null, busy = null, timer = null, ready = false, status = 'Loading progress';
    var lastError = null;
    function emit(changed) { if (options.onChange) options.onChange({changed: !!changed, status: status, conflict: conflict, error: lastError}); }
    function persist() { storage.setItem(key, JSON.stringify(state)); }
    function report(message, error) { status = message; lastError = error || null; emit(false); }
    function safetyCopy(payload, reason) {
      var id = (root.crypto && root.crypto.randomUUID) ? root.crypto.randomUUID() : String(Date.now()) + '-' + Math.random().toString(36).slice(2);
      // These copies are intentionally retained until the owner exports/removes them.
      storage.setItem(key + ':backup:' + id, JSON.stringify({app:'ceh-quiz', exportedAt:new Date().toISOString(), reason:reason,
        progress:payload.progress, stats:payload.stats}));
    }
    function empty(payload) {
      return {version:2, progress:payload.progress, stats:payload.stats, revision:0,
        dirty:false, sequence:0, cloudUpdatedAt:null};
    }
    function checkSibling() {
      var sibling = parse(storage, key);
      if (sibling && sibling.sequence !== state.sequence) {
        safetyCopy(state, 'This tab was behind another tab');
        state = sibling; emit(true);
        throw new Error('Another tab updated this account. Please repeat your last action. A safety copy was kept.');
      }
    }
    function adopt(remote) {
      if (!remote || !valid(remote.payload)) throw new Error('The online progress format is invalid. Your local save has been kept.');
      state.progress = clone(remote.payload.progress); state.stats = clone(remote.payload.stats);
      state.revision = Number(remote.revision); state.cloudUpdatedAt = remote.updated_at;
      state.dirty = false; state.sequence++; persist(); emit(true);
    }
    function setConflict(remote) {
      if (!valid(remote.payload)) throw new Error('The online progress format is invalid.');
      safetyCopy(state, 'Device progress before a sync conflict');
      safetyCopy(remote.payload, 'Online progress before a sync conflict');
      conflict = clone(remote); report('Two devices have changes — choose a save to continue');
    }
    async function initialize() {
      preserveOriginal(storage);
      var cached = parse(storage, key);
      if (cached && (!valid(cached) || cached.version !== 2)) throw new Error('The saved progress could not be read. Export it before making changes.');
      state = cached || empty(userId ? {progress:{}, stats:{}} : legacy(storage));
      if (!userId) {
        // Keep compatibility with the original quiz, including older open tabs.
        var old = legacy(storage); state.progress = old.progress; state.stats = old.stats;
        persist(); ready = true; report('Saved on this browser'); return;
      }
      try {
        var remote = await cloud.load();
        // Another tab can answer while this tab is downloading its first snapshot.
        var latest = parse(storage, key);
        if (latest && latest.sequence !== state.sequence) { state = latest; cached = latest; }
        if (remote) {
          if (!cached || !state.dirty) adopt(remote);
          else if (Number(remote.revision) !== state.revision) setConflict(remote);
        } else if (state.revision > 0) {
          throw new Error('The online save is missing. Your local save has been kept.');
        }
        persist(); ready = true;
        if (!conflict) report(state.dirty ? 'Changes waiting to sync' : 'Up to date');
        if (state.dirty && !conflict) schedule();
      } catch (err) {
        if (!cached) throw err; // Do not create an empty replacement after a failed first download.
        ready = true; report('Offline — saved on this browser', err);
      }
    }
    function schedule() {
      clearTimeout(timer);
      if (userId && !conflict) timer = setTimeout(function () { sync(); }, options.delay === undefined ? 900 : options.delay);
    }
    function update(part, value) {
      if (!ready) throw new Error('Progress is still loading.');
      if (conflict) throw new Error('Choose which saved progress to continue before answering.');
      checkSibling();
      var before = parse(storage, key) || clone(state);
      state[part] = value; state.sequence++; state.dirty = !!userId;
      try {
        persist(); // Save the complete snapshot before attempting any network request.
      } catch (err) {
        state = before; report('Browser storage is full — download a backup before continuing', err); emit(true);
        throw err;
      }
      if (!userId) {
        storage.setItem(part === 'progress' ? LEGACY_PROGRESS : LEGACY_STATS, JSON.stringify(value));
      }
      report(userId ? 'Changes waiting to sync' : 'Saved on this browser'); schedule();
    }
    async function synchronize() {
      if (!userId || !ready || conflict) return false;
      checkSibling();
      if (!state.dirty) {
        var remote = await cloud.load();
        checkSibling();
        // Answers may have arrived while the download was in flight.
        if (remote && Number(remote.revision) !== state.revision) {
          if (state.dirty) setConflict(remote); else adopt(remote);
        }
        if (!conflict) report(state.dirty ? 'Changes waiting to sync' : 'Up to date');
        if (state.dirty) schedule();
        return !conflict;
      }
      var sent = clone(state); report('Saving online…');
      var result = await cloud.save({progress:sent.progress, stats:sent.stats}, sent.revision);
      checkSibling();
      if (!result.ok) { setConflict(result); return false; }
      state.revision = Number(result.revision); state.cloudUpdatedAt = result.updated_at;
      state.dirty = state.sequence !== sent.sequence; state.sequence++; persist();
      report(state.dirty ? 'Changes waiting to sync' : 'Up to date');
      if (state.dirty) schedule(); return true;
    }
    function sync() {
      if (busy) return busy;
      clearTimeout(timer);
      busy = synchronize().catch(function (err) {
        report('Sync paused — your browser save is safe', err); return false;
      }).finally(function () { busy = null; });
      return busy;
    }
    async function resolve(choice) {
      if (!conflict) return;
      checkSibling(); var remote = conflict;
      // Already backed up both versions when detecting the conflict.
      if (choice === 'online') { conflict = null; adopt(remote); report('Up to date'); }
      else if (choice === 'device') {
        state.revision = Number(remote.revision); state.dirty = true; state.sequence++;
        persist(); conflict = null; await sync();
      } else throw new Error('Unknown save choice');
    }
    function canClaim() { return !!userId && !storage.getItem(LEGACY_OWNER) && hasProgress(legacy(storage)); }
    async function claimLegacy() {
      if (!canClaim()) throw new Error('The original progress already belongs to a different account.');
      if (busy) await busy;
      if (!canClaim()) throw new Error('The original progress has already been attached.');
      if (conflict) throw new Error('Resolve the sync conflict first.');
      checkSibling(); var original = legacy(storage);
      safetyCopy(state, 'Account before importing original browser progress');
      safetyCopy(original, 'Original browser progress before account import');
      state.progress = clone(original.progress); state.stats = clone(original.stats);
      state.dirty = true; state.sequence++; persist(); storage.setItem(LEGACY_OWNER, userId); emit(true); await sync();
    }
    function acceptStorage(event) {
      if (event.key !== key && !(event.key === null || (!userId && (event.key === LEGACY_PROGRESS || event.key === LEGACY_STATS)))) return false;
      var next = parse(storage, key);
      if (!userId) {
        var old = legacy(storage); next = next || empty(old); next.progress = old.progress; next.stats = old.stats;
      }
      if (!next || !valid(next)) { report('Browser storage changed. Reload to recover your save.'); return false; }
      state = next; emit(true); return true;
    }
    return {
      initialize:initialize, sync:sync, resolve:resolve, claimLegacy:claimLegacy, canClaim:canClaim,
      getProgress:function () {return state.progress;}, getStats:function () {return state.stats;},
      saveProgress:function (p) {update('progress',p);}, saveStats:function (s) {update('stats',s);},
      getState:function () {return clone(state);}, getConflict:function () {return conflict && clone(conflict);},
      getStatus:function () {return status;}, getError:function () {return lastError;},
      hasSavedProgress:function () {return hasProgress(state);}, acceptStorage:acceptStorage,
      backup:function (reason) {safetyCopy(state, reason || 'Manual backup');},
      backupList:function () {
        var out=[]; for(var i=0;i<storage.length;i++) { var k=storage.key(i); if(k.indexOf(key+':backup:')===0) out.push(parse(storage,k)); }
        return out;
      }
    };
  }
  root.CEHStore = {create:create, valid:valid, legacy:legacy, hasProgress:hasProgress};
})(typeof window === 'undefined' ? globalThis : window);
