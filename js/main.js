/* ═══════════════════════════════════════════════════════════
   MEGAT FAWWAZ — PORTFOLIO (click-to-navigate SPA)
   1. View router with blur/slide transitions + staggered reveals
   2. Terminal boot sequence (home)
   3. Network-node ambient canvas
   4. Mobile nav
   All effects disabled for prefers-reduced-motion.
═══════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if ("scrollRestoration" in history) history.scrollRestoration = "manual";

  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  var toggle = document.getElementById("navToggle");
  var links = document.getElementById("navLinks");
  if (toggle && links) {
    toggle.addEventListener("click", function () {
      var open = links.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  if (!reduceMotion) document.body.classList.add("js-anim");

  /* ── VIEW ROUTER ──────────────────────────────────── */
  var VALID = ["home", "about", "projects", "ctf", "certs", "experience", "contact"];
  var views = {};
  document.querySelectorAll(".view").forEach(function (v) {
    views[v.getAttribute("data-view")] = v;
  });
  var navLinks = document.querySelectorAll('.nav__links a[href^="#"]');
  var current = null;

  function resolve(hash) {
    var h = (hash || "").replace(/^#/, "");
    if (h === "skills") return "about";
    if (h === "top" || h === "") return "home";
    return VALID.indexOf(h) >= 0 ? h : "home";
  }

  function setNav(id) {
    navLinks.forEach(function (a) {
      a.classList.toggle("is-current", resolve(a.getAttribute("href")) === id);
    });
  }

  function staggerReveal(view) {
    var els = view.querySelectorAll(".reveal");
    els.forEach(function (el, i) {
      el.classList.remove("is-in");
      if (reduceMotion) { el.classList.add("is-in"); return; }
      el.style.transitionDelay = (i * 75) + "ms";
      // force reflow so the removal + re-add re-triggers the transition
      void el.offsetWidth;
      requestAnimationFrame(function () { el.classList.add("is-in"); });
    });
  }

  function activate(next, id) {
    if (current) current.classList.remove("is-active", "enter");
    next.classList.add("is-active");
    setNav(id);
    window.scrollTo(0, 0);
    staggerReveal(next);
    if (!reduceMotion) {
      next.classList.add("enter");
      setTimeout(function () { next.classList.remove("enter"); }, 700);
    }
    current = next;
    var TITLES = { home: "Welcome", about: "About", projects: "Projects", ctf: "CTF", certs: "Certifications", experience: "Experience", contact: "Contact" };
    document.title = (id === "home" ? "Megat Fawwaz — Cybersecurity Portfolio" : TITLES[id] + " — Megat Fawwaz");
  }

  function showView(id) {
    id = resolve("#" + id);
    var next = views[id];
    if (!next || next === current) return;
    var prev = current;
    if (prev && !reduceMotion) {
      prev.classList.add("leave");
      setTimeout(function () {
        prev.classList.remove("leave");
        activate(next, id);
      }, 250);
    } else {
      activate(next, id);
    }
  }

  // intercept every in-page hash link (nav, brand, hero CTAs)
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener("click", function (e) {
      var id = resolve(a.getAttribute("href"));
      e.preventDefault();
      if (links) links.classList.remove("is-open");
      if (toggle) toggle.setAttribute("aria-expanded", "false");
      if (("#" + id) !== location.hash) {
        history.pushState(null, "", "#" + id);
      }
      showView(id);
    });
  });

  window.addEventListener("popstate", function () {
    showView(resolve(location.hash));
  });

  // initial view from URL
  showView(resolve(location.hash));

  /* ── TERMINAL BOOT (home) ─────────────────────────── */
  var term = document.getElementById("term");
  if (term && !reduceMotion) {
    var SCRIPT = [
      { cmd: "whoami", out: ["<span class='hl'>Megat Muhammad Fawwaz</span>"] },
      { cmd: "cat role.txt", out: ["Cybersecurity Undergraduate &middot; <span class='hl'>VAPT Intern @ Tenaga Nasional Berhad</span>"] },
      { cmd: "./focus --list", out: ["OSINT &middot; Digital Forensics &middot; Penetration Testing"] }
    ];
    var TYPE_MS = 42, lineIdx = 0;

    function typeCommand(cmdText, lineEl, done) {
      var i = 0;
      (function tick() {
        if (i <= cmdText.length) {
          lineEl.innerHTML = "<span class='p'>$</span> " + cmdText.slice(0, i) + "<span class='blink'>_</span>";
          i++;
          setTimeout(tick, TYPE_MS);
        } else {
          lineEl.innerHTML = "<span class='p'>$</span> " + cmdText;
          done();
        }
      })();
    }
    function runLine() {
      if (lineIdx >= SCRIPT.length) {
        var idle = document.createElement("p");
        idle.innerHTML = "<span class='p'>$</span> <span class='blink'>_</span>";
        term.appendChild(idle);
        return;
      }
      var step = SCRIPT[lineIdx];
      var cmdEl = document.createElement("p");
      term.appendChild(cmdEl);
      typeCommand(step.cmd, cmdEl, function () {
        setTimeout(function () {
          step.out.forEach(function (o) {
            var outEl = document.createElement("p");
            outEl.className = "out";
            outEl.innerHTML = o;
            term.appendChild(outEl);
          });
          lineIdx++;
          setTimeout(runLine, 340);
        }, 220);
      });
    }
    setTimeout(runLine, 550);
  }

  /* ── NETWORK-NODE CANVAS ──────────────────────────── */
  var canvas = document.getElementById("rain");
  if (canvas && canvas.getContext && !reduceMotion) {
    var ctx = canvas.getContext("2d");
    var nodes = [], W, H, COUNT, LINK = 130;
    function resize() {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
      COUNT = Math.min(70, Math.floor((W * H) / 26000));
      if (nodes.length > COUNT) nodes.length = COUNT;
      while (nodes.length < COUNT) {
        nodes.push({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - 0.5) * 0.22, vy: (Math.random() - 0.5) * 0.22 });
      }
    }
    resize();
    window.addEventListener("resize", resize);
    function frame() {
      ctx.clearRect(0, 0, W, H);
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        n.x += n.vx; n.y += n.vy;
        if (n.x < 0 || n.x > W) n.vx *= -1;
        if (n.y < 0 || n.y > H) n.vy *= -1;
        ctx.beginPath();
        ctx.arc(n.x, n.y, 1.3, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(61, 210, 255, 0.35)";
        ctx.fill();
        for (var j = i + 1; j < nodes.length; j++) {
          var m = nodes[j];
          var dx = n.x - m.x, dy = n.y - m.y, d = Math.sqrt(dx * dx + dy * dy);
          if (d < LINK) {
            ctx.beginPath();
            ctx.moveTo(n.x, n.y); ctx.lineTo(m.x, m.y);
            ctx.strokeStyle = "rgba(61, 210, 255," + (0.09 * (1 - d / LINK)) + ")";
            ctx.lineWidth = 1; ctx.stroke();
          }
        }
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ── CERTIFICATE VIEW-ONLY PROTECTION ─────────────── */
  /* Certificates are CSS background images (no <img> to "save as").
     These handlers add deterrents: block context menu, drag and
     copy on the certificate frames. Not DRM — a determined user can
     always screenshot — but it keeps them display-only by default. */
  var certScope = document.getElementById("certs");
  if (certScope) {
    var block = function (e) { e.preventDefault(); return false; };
    certScope.addEventListener("contextmenu", block);
    certScope.addEventListener("dragstart", block);
    certScope.addEventListener("copy", block);
    certScope.querySelectorAll(".cert__frame").forEach(function (f) {
      f.setAttribute("draggable", "false");
    });
  }
})();
