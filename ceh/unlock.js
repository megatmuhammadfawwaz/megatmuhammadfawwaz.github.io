/* Trainer page boot: decrypt the vault, hand the questions to the quiz,
   then load the quiz app (it reads window.CEH_DATA on start). */
(function () {
  "use strict";

  var vault = document.getElementById("vault");
  var form = document.getElementById("vaultForm");
  var input = document.getElementById("vaultPass");
  var btn = document.getElementById("vaultBtn");
  var msg = document.getElementById("vaultMsg");

  function start(data) {
    window.CEH_DATA = data;
    vault.remove();
    document.getElementById("app").hidden = false;
    document.getElementById("vaultLock").addEventListener("click", function () {
      window.CEHVault.lock();
      location.href = "../";
    });
    var s = document.createElement("script");
    s.src = "app.js";
    document.body.appendChild(s);
  }

  function say(text, bad) {
    msg.textContent = text;
    msg.classList.toggle("is-bad", !!bad);
  }

  if (!window.crypto || !crypto.subtle || typeof DecompressionStream === "undefined") {
    say("This browser can't decrypt the vault. Use an up-to-date Chrome, Edge, Firefox or Safari.", true);
    btn.disabled = true;
    return;
  }

  window.CEHVault.resume().then(start, function (err) {
    if (err.message === "offline") {
      say("The vault is currently offline.", true);
      btn.disabled = true;
      return;
    }
    vault.classList.add("is-ready");
    input.focus();
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    btn.disabled = true;
    say("deriving key…");
    window.CEHVault.unlock(input.value).then(start, function (err) {
      btn.disabled = false;
      input.value = "";
      input.focus();
      say(err.message === "offline" ? "The vault is currently offline." : "✗ Wrong passphrase.", true);
      vault.classList.remove("shake");
      void vault.offsetWidth;
      vault.classList.add("shake");
    });
  });
})();
