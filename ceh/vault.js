/* ═══════════════════════════════════════════════════════════
   CEH VAULT · shared decryption (terminal + trainer page)
   Format written by tools/ceh-vault.mjs:
   "CEHV" | ver | iterations u32 | salt 16 | iv 12 | AES-GCM ciphertext
   The derived key (never the passphrase) is kept in sessionStorage,
   so it is forgotten when the tab closes.
═══════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var SLOT = "ceh-vault-key";
  var base = (document.currentScript && document.currentScript.src) || location.href;
  var VAULT_URL = new URL("vault.bin", base).href;
  var cached = null;

  function b64(bytes) {
    var s = "";
    bytes.forEach(function (b) { s += String.fromCharCode(b); });
    return btoa(s);
  }
  function unb64(str) {
    return Uint8Array.from(atob(str), function (c) { return c.charCodeAt(0); });
  }

  function read() {
    if (cached) return Promise.resolve(cached);
    return fetch(VAULT_URL, { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error("offline");
      return r.arrayBuffer();
    }).then(function (buf) {
      var u = new Uint8Array(buf);
      if (String.fromCharCode(u[0], u[1], u[2], u[3]) !== "CEHV" || u[4] !== 1) throw new Error("format");
      cached = {
        iterations: new DataView(buf).getUint32(5),
        salt: u.slice(9, 25),
        iv: u.slice(25, 37),
        body: u.slice(37)
      };
      return cached;
    });
  }

  function derive(pass, v) {
    return crypto.subtle.importKey("raw", new TextEncoder().encode(pass.normalize("NFC")), "PBKDF2", false, ["deriveKey"])
      .then(function (baseKey) {
        return crypto.subtle.deriveKey(
          { name: "PBKDF2", hash: "SHA-256", salt: v.salt, iterations: v.iterations },
          baseKey, { name: "AES-GCM", length: 256 }, true, ["decrypt"]);
      });
  }

  // Rejects if the key is wrong (GCM tag check), resolves to the question data.
  function open(key, v) {
    return crypto.subtle.decrypt({ name: "AES-GCM", iv: v.iv }, key, v.body).then(function (plain) {
      var stream = new Blob([plain]).stream().pipeThrough(new DecompressionStream("gzip"));
      return new Response(stream).text();
    }).then(JSON.parse);
  }

  function unlock(pass) {
    return read().then(function (v) {
      return derive(pass, v).then(function (key) {
        return open(key, v).then(function (data) {
          return crypto.subtle.exportKey("raw", key).then(function (raw) {
            try { sessionStorage.setItem(SLOT, b64(new Uint8Array(raw))); } catch (e) { /* private mode */ }
            return data;
          });
        });
      });
    });
  }

  // Re-open with the key saved earlier in this tab, if any.
  function resume() {
    var saved = null;
    try { saved = sessionStorage.getItem(SLOT); } catch (e) { /* ignore */ }
    if (!saved) return Promise.reject(new Error("locked"));
    return read().then(function (v) {
      return crypto.subtle.importKey("raw", unb64(saved), "AES-GCM", false, ["decrypt"]).then(function (key) {
        return open(key, v);
      });
    }).catch(function (err) {
      if (err.message !== "offline") lock();
      throw err;
    });
  }

  function lock() {
    try { sessionStorage.removeItem(SLOT); } catch (e) { /* ignore */ }
  }
  function isUnlocked() {
    try { return !!sessionStorage.getItem(SLOT); } catch (e) { return false; }
  }

  window.CEHVault = { unlock: unlock, resume: resume, lock: lock, isUnlocked: isUnlocked, read: read };
})();
