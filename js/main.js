/* ═══════════════════════════════════════════════════════════
   MEGAT FAWWAZ · OPERATOR CONSOLE
   1. Setup, mobile nav, scroll-spy, reveals
   2. CTF scoreboard filters
   3. Email (assembled at runtime, never plain in the HTML)
   4. Certificate lightbox
   5. Interactive terminal
   6. Command palette (Ctrl/⌘ K)
   7. Ambient motion: grid packets, card spotlight, count-ups
   All output is built with textContent / DOM nodes: no innerHTML.
═══════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  /* ── CONFIG ─────────────────────────────────────────── */
  // Email stays hidden everywhere until both parts are filled in.
  var EMAIL = { user: "", domain: "" };
  var LINKEDIN = "https://www.linkedin.com/in/megatmuhammadfawwaz/";
  var SOURCE = "https://github.com/megatmuhammadfawwaz/megatmuhammadfawwaz.github.io";

  var root = document.documentElement;
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  var emailAddr = EMAIL.user && EMAIL.domain ? EMAIL.user + "@" + EMAIL.domain : "";

  root.classList.remove("no-js");
  if (!reduceMotion) root.classList.add("js-anim");

  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };
  var text = function (el) { return el ? el.textContent.replace(/\s+/g, " ").trim() : ""; };

  function goTo(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    // move keyboard focus with the jump so Tab continues from the new section
    if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
    el.focus({ preventScroll: true });
    if (history.replaceState) history.replaceState(null, "", "#" + id);
  }

  var yearEl = $("#year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ── 1a. MOBILE NAV ─────────────────────────────────── */
  var toggle = $("#navToggle");
  var links = $("#navLinks");
  function closeMenu() {
    links.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
  }
  if (toggle && links) {
    toggle.addEventListener("click", function () {
      var open = links.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    links.addEventListener("click", function (e) { if (e.target.closest("a")) closeMenu(); });
    document.addEventListener("click", function (e) {
      if (links.classList.contains("is-open") && !e.target.closest("#nav")) closeMenu();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && links.classList.contains("is-open")) { closeMenu(); toggle.focus(); }
    });
  }

  /* ── 1b. SCROLL-SPY ─────────────────────────────────── */
  var navLinks = $$("#navLinks a");
  if ("IntersectionObserver" in window) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var id = entry.target.id;
        navLinks.forEach(function (a) {
          var on = a.getAttribute("href") === "#" + id;
          a.classList.toggle("is-current", on);
          if (on) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
        });
      });
    }, { rootMargin: "-40% 0px -55% 0px" });
    $$("main > section[id]").forEach(function (s) { spy.observe(s); });
  }

  /* ── 1c. REVEALS ────────────────────────────────────── */
  var reveals = $$(".reveal");
  if (reduceMotion || !("IntersectionObserver" in window)) {
    reveals.forEach(function (el) { el.classList.add("is-in"); });
  } else {
    reveals.forEach(function (el) {
      var sibs = $$(":scope > .reveal", el.parentElement);
      var i = sibs.indexOf(el);
      if (i > 0) el.style.transitionDelay = Math.min(i, 6) * 70 + "ms";
    });
    var rev = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { entry.target.classList.add("is-in"); rev.unobserve(entry.target); }
      });
    }, { threshold: 0.08, rootMargin: "0px 0px -6% 0px" });
    reveals.forEach(function (el) { rev.observe(el); });
  }

  /* ── 2. CTF FILTERS ─────────────────────────────────── */
  var filters = $("#ctfFilters");
  var ctfRows = $$("#ctfTable tbody tr");
  function applyFilter(f) {
    $$("button", filters).forEach(function (b) {
      b.setAttribute("aria-pressed", b.getAttribute("data-filter") === f ? "true" : "false");
    });
    ctfRows.forEach(function (r) {
      var show = f === "all" ||
        (f === "top" && r.hasAttribute("data-top")) ||
        r.getAttribute("data-year") === f;
      r.classList.toggle("is-hidden", !show);
    });
  }
  if (filters) {
    filters.hidden = false;
    filters.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-filter]");
      if (b) applyFilter(b.getAttribute("data-filter"));
    });
  }

  /* ── 3. EMAIL ───────────────────────────────────────── */
  var copyNote = $("#copyNote");
  function copyEmail() {
    if (!emailAddr) return;
    var done = function () { if (copyNote) copyNote.textContent = "✔ " + emailAddr + " copied to clipboard"; };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(emailAddr).then(done, function () {
        if (copyNote) copyNote.textContent = emailAddr;
      });
    } else if (copyNote) {
      copyNote.textContent = emailAddr;
    }
  }
  if (emailAddr) {
    $("#mail").hidden = false;
    $("#mailLink").href = "mailto:" + emailAddr;
    $("#mailText").textContent = emailAddr;
    $("#mailCopy").addEventListener("click", copyEmail);
  }

  /* ── 4. CERTIFICATE LIGHTBOX ────────────────────────── */
  var lightbox = $("#lightbox");
  var lightImg = $("#lightboxImg");
  if (lightbox && typeof lightbox.showModal === "function") {
    $$(".cert__shot[data-full]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var thumb = $("img", btn);
        lightImg.src = btn.getAttribute("data-full");
        lightImg.alt = thumb ? thumb.alt : "";
        lightbox.showModal();
      });
    });
    $("#lightboxClose").addEventListener("click", function () { lightbox.close(); });
    lightbox.addEventListener("click", function (e) { if (e.target === lightbox) lightbox.close(); });
  } else {
    // no <dialog> support: fall back to opening the preview directly
    $$(".cert__shot[data-full]").forEach(function (btn) {
      btn.addEventListener("click", function () { window.open(btn.getAttribute("data-full"), "_blank", "noopener"); });
    });
  }

  /* ── 5. TERMINAL ────────────────────────────────────── */
  var out = $("#termOut");
  var form = $("#termForm");
  var input = $("#termInput");
  var chips = $("#termChips");
  var termBody = $("#termBody");
  var PROMPT = "fawwaz@sec:~$";

  function span(t, cls) { var s = document.createElement("span"); if (cls) s.className = cls; s.textContent = t; return s; }
  function link(t, href) {
    var a = document.createElement("a");
    a.textContent = t;
    a.href = href;
    if (/^https?:/.test(href)) { a.target = "_blank"; a.rel = "noopener noreferrer"; }
    else if (href.charAt(0) === "#") {
      a.addEventListener("click", function (e) { e.preventDefault(); goTo(href.slice(1)); });
    }
    return a;
  }
  function print(parts, cls) {
    var p = document.createElement("p");
    if (cls) p.className = cls;
    (Array.isArray(parts) ? parts : [parts]).forEach(function (part) {
      p.appendChild(typeof part === "string" ? document.createTextNode(part) : part);
    });
    out.appendChild(p);
    out.scrollTop = out.scrollHeight;
    return p;
  }
  function grid(rows) {
    var g = document.createElement("div");
    g.className = "grid";
    rows.forEach(function (r) {
      r.forEach(function (cell) { g.appendChild(typeof cell === "string" ? span(cell) : cell); });
    });
    out.appendChild(g);
    out.scrollTop = out.scrollHeight;
  }
  function echoCmd(cmd) { print([span(PROMPT, "pr"), " " + cmd]); }

  // data read from the page itself, so the terminal never drifts from the content
  function ctfData() {
    return ctfRows.map(function (r) {
      var c = r.children;
      return { result: text(c[0]), event: text(c[1]), org: text(c[2]), standing: text(c[3]), top: r.hasAttribute("data-top") };
    });
  }
  function certData() {
    return $$(".cert").map(function (c) {
      return { issuer: text($(".cert__issuer", c)), name: text($(".cert__name", c)), pending: c.classList.contains("cert--pending") };
    });
  }
  function timeline(col) {
    return $$(".tl li", col).map(function (li) {
      return { date: text($(".tl__date", li)), role: text($(".tl__role", li)), org: text($(".tl__org", li)) };
    });
  }
  var PROJECTS = [
    ["[1]", "SURIA · attack surface management", "2,000+ assets"],
    ["[2]", "Explainable deepfake detection", "0.9988 AUC"],
    ["[3]", "DIV:IDE CTF · RE track author", "2026"],
    ["[4]", "This portfolio · hardened SPA", "CSP + SRI"]
  ];
  var SECTIONS = { home: "home", about: "about", skills: "skills", projects: "projects", ctf: "ctf", certs: "certs", experience: "experience", education: "experience", contact: "contact" };
  var FILES = { "about.md": "about", "ctf.log": "ctf", "experience.log": "experience", "contact.sh": "contact", "skills.json": "skills" };

  var COMMANDS = {
    help: { desc: "list available commands", run: function () {
      grid(Object.keys(COMMANDS).filter(function (k) { return COMMANDS[k].desc; }).map(function (k) {
        return [span(k, "ok"), span(COMMANDS[k].desc, "dim"), span("")];
      }));
      print([span("tip: ", "dim"), "Tab completes · ↑ ↓ history · Ctrl K jumps anywhere"]);
    } },
    whoami: { desc: "who is Fawwaz", run: function () {
      print([span("Megat Muhammad Fawwaz", "hl")]);
      print("Final-year BSc Cyber Security @ UNITEN · Yayasan Khazanah Watan Scholar");
      print("VAPT intern @ Tenaga Nasional Berhad · CGPA 3.90");
    } },
    about: { desc: "short summary", run: function () {
      print("Offensive by instinct, methodical by training.");
      print([span("17", "hl"), " CTFs · ", span("2×", "hl"), " champion · international ", span("top 5", "hl"), "."]);
      print("Moved from solving challenges to authoring them, and from finding exposures to building the platform that tracks them.");
      print([span("→ ", "dim"), link("read the full summary", "#about")]);
    } },
    skills: { desc: "loaded skill modules", run: function () {
      var mods = $$(".mod");
      grid(mods.map(function (m) {
        return [span("[+]", "dim"), span(text($(".mod__name", m)), "ok"), span($$("li", m).length + " items", "dim")];
      }));
      print([span("→ ", "dim"), link("see all skills", "#skills")]);
    } },
    projects: { desc: "things I've built", run: function (args) {
      var n = PROJECTS.length;
      var i = args.indexOf("--top");
      if (i >= 0 && parseInt(args[i + 1], 10) > 0) n = Math.min(n, parseInt(args[i + 1], 10));
      grid(PROJECTS.slice(0, n).map(function (p) { return [span(p[0], "dim"), p[1], span(p[2], "hl")]; }));
      print([span("→ ", "dim"), link("open projects", "#projects")]);
    } },
    ctf: { desc: "CTF record  (--wins, --all)", run: function (args) {
      var data = ctfData();
      var rows = args.indexOf("--all") >= 0 ? data : data.filter(function (d) { return d.top; });
      print([span(String(data.length), "hl"), " events · ", span("2", "hl"), " championships · ", span("2", "hl"), " finals · 5th @ HACK10 intl"]);
      grid(rows.map(function (d) { return [span(d.result, d.top ? "ok" : "dim"), d.event, span(d.org, "dim")]; }));
      if (args.indexOf("--all") < 0) print([span("→ ", "dim"), "ctf --all for all ", String(data.length), " · ", link("open scoreboard", "#ctf")]);
    } },
    certs: { desc: "credentials", run: function () {
      grid(certData().map(function (c) { return [span(c.pending ? "[~]" : "[✔]", c.pending ? "dim" : "ok"), c.name, span(c.issuer, "dim")]; }));
      print([span("→ ", "dim"), link("view certificates", "#certs")]);
    } },
    experience: { desc: "work & education log", run: function () {
      var cols = $$(".hist__col");
      [["experience", cols[0]], ["education", cols[1]]].forEach(function (pair) {
        if (!pair[1]) return;
        print(span("# " + pair[0], "dim"));
        grid(timeline(pair[1]).map(function (t) { return [span(t.date, "dim"), t.role, span(t.org, "hl")]; }));
      });
    } },
    contact: { desc: "get in touch", run: function () {
      print([span("linkedin  ", "dim"), link("in/megatmuhammadfawwaz ↗", LINKEDIN)]);
      if (emailAddr) print([span("email     ", "dim"), link(emailAddr, "mailto:" + emailAddr)]);
      print([span("or try: ", "dim"), span("sudo hire-me", "ok")]);
    } },
    neofetch: { desc: "system summary", run: function () {
      grid([
        [span("fawwaz", "ok"), span("@", "dim"), span("sec")],
        [span("os", "dim"), "FawwazOS 2026 (final-year build)", span("")],
        [span("role", "dim"), "VAPT intern · Tenaga Nasional Berhad", span("")],
        [span("uptime", "dim"), "4 years in computer science", span("")],
        [span("cgpa", "dim"), "3.90 · Dean's List every semester", span("")],
        [span("packages", "dim"), "17 CTFs · 2 championships", span("")],
        [span("shell", "dim"), "python, c++, java, sql, js", span("")]
      ]);
    } },
    clear: { desc: "clear the screen", run: function () { out.textContent = ""; } },

    /* hidden */
    ls: { run: function () { print([span("about.md  ", "ok"), span("projects/  ", "hl"), span("ctf.log  experience.log  skills.json  ", "ok"), span("contact.sh", "ok")]); } },
    cat: { run: function (args) {
      var f = args[0];
      if (!f) return print(span("cat: missing file operand", "err"));
      if (/^projects\/?$/.test(f)) return print(span("cat: " + f + ": Is a directory", "err"));
      if (FILES[f]) return (FILES[f] === "skills" ? COMMANDS.skills : COMMANDS[FILES[f]]).run([]);
      print(span("cat: " + f + ": No such file or directory", "err"));
    } },
    cd: { run: function (args) {
      var target = (args[0] || "home").replace(/\/$/, "").replace(/^~\/?/, "") || "home";
      if (SECTIONS[target]) { print(span("→ " + target, "dim")); goTo(SECTIONS[target]); }
      else print(span("cd: " + args[0] + ": No such file or directory", "err"));
    } },
    open: { run: function (args) { COMMANDS.cd.run(args); } },
    sudo: { run: function (args) {
      if (args.join(" ") === "hire-me") {
        print(span("[sudo] password for recruiter: ********", "dim"));
        print(span("✔ access granted", "ok"));
        print("→ opening a secure channel to Fawwaz…");
        setTimeout(function () { goTo("contact"); }, reduceMotion ? 0 : 900);
      } else {
        print(span("fawwaz is not in the sudoers file. This incident will be reported.", "err"));
      }
    } },
    rm: { run: function () { print(span("rm: permission denied. Nice try though.", "err")); } },
    exit: { run: function () { print(["There is no exit. Try ", span("contact", "ok"), " instead."]); } },
    date: { run: function () { print(new Date().toString()); } },
    echo: { run: function (args) { print(args.join(" ")); } },
    history: { run: function () { grid(hist.map(function (h, i) { return [span(String(i + 1), "dim"), h, span("")]; })); } },
    hello: { run: function () { print(["Hi there! Type ", span("help", "ok"), " to look around."]); } }
  };
  // aliases: same behaviour, hidden from help and tab-completion
  COMMANDS.exp = { run: COMMANDS.experience.run };
  COMMANDS.education = { run: COMMANDS.experience.run };
  COMMANDS.hi = { run: COMMANDS.hello.run };
  COMMANDS.man = { run: COMMANDS.help.run };
  COMMANDS.cls = { run: COMMANDS.clear.run };

  var hist = [];
  var histIdx = 0;
  var booting = false;
  var skipBoot = false;
  var bootDone = Promise.resolve();

  // anything run while the intro is typing fast-forwards it, then runs in order
  function exec(v) {
    if (booting) skipBoot = true;
    bootDone.then(function () { run(v); });
  }

  function run(raw) {
    var line = raw.trim().slice(0, 120);
    echoCmd(line);
    if (!line) return;
    hist.push(line); histIdx = hist.length;
    var parts = line.split(/\s+/);
    var name = parts[0].toLowerCase();
    var cmd = COMMANDS[name];
    if (cmd) cmd.run(parts.slice(1));
    else print([span("command not found: " + parts[0], "err"), span(" · try ", "dim"), span("help", "ok")]);
  }

  function complete() {
    var v = input.value.trimStart();
    if (!v || /\s/.test(v)) return;
    var names = Object.keys(COMMANDS).filter(function (k) { return COMMANDS[k].desc && k.indexOf(v.toLowerCase()) === 0; });
    if (names.length === 1) input.value = names[0] + " ";
    else if (names.length > 1) { echoCmd(v); print(span(names.join("  "), "dim")); }
  }

  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, skipBoot ? 0 : ms); }); };

  function typeLine(cmd) {
    var p = print([span(PROMPT, "pr"), " "]);
    var t = document.createTextNode("");
    p.appendChild(t);
    return cmd.split("").reduce(function (chain, ch) {
      return chain.then(function () { t.data += ch; return sleep(38); });
    }, Promise.resolve());
  }

  function boot() {
    booting = true;
    out.textContent = "";
    var steps = [["whoami", []], ["projects --top 3", ["--top", "3"]]];
    var chain = sleep(450);
    steps.forEach(function (s) {
      chain = chain.then(function () { return typeLine(s[0]); })
        .then(function () { return sleep(180); })
        .then(function () { COMMANDS[s[0].split(" ")[0]].run(s[1]); return sleep(420); });
    });
    return chain.then(function () {
      print([span("type ", "dim"), span("help", "ok"), span(" or tap a command below", "dim")]);
      booting = false;
    });
  }

  if (out && form && input) {
    form.hidden = false;
    chips.hidden = false;
    input.setAttribute("maxlength", "120");

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var v = input.value;
      input.value = "";
      exec(v);
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Tab") { e.preventDefault(); complete(); }
      else if (e.key === "ArrowUp") { if (histIdx > 0) { histIdx--; input.value = hist[histIdx]; } e.preventDefault(); }
      else if (e.key === "ArrowDown") { histIdx = Math.min(hist.length, histIdx + 1); input.value = hist[histIdx] || ""; e.preventDefault(); }
      else if (e.key === "l" && e.ctrlKey) { e.preventDefault(); out.textContent = ""; }
    });
    chips.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-cmd]");
      if (b) exec(b.getAttribute("data-cmd"));
    });
    termBody.addEventListener("click", function (e) {
      if (e.target.closest("a, button") || window.getSelection().toString()) return;
      input.focus({ preventScroll: true });
    });

    if (reduceMotion) skipBoot = true;
    bootDone = boot();
  }

  /* ── 6. COMMAND PALETTE ─────────────────────────────── */
  var palette = $("#palette");
  var pInput = $("#paletteInput");
  var pList = $("#paletteList");
  var pOpen = $("#paletteOpen");
  var pKbd = $("#paletteKbd");

  var ITEMS = [
    { group: "Go to", icon: "#", label: "Home", keys: "top start hero", act: function () { goTo("home"); } },
    { group: "Go to", icon: "#", label: "About", keys: "summary bio who", act: function () { goTo("about"); } },
    { group: "Go to", icon: "#", label: "Skills", keys: "arsenal modules tools languages", act: function () { goTo("skills"); } },
    { group: "Go to", icon: "#", label: "Projects", keys: "suria deepfake work built", act: function () { goTo("projects"); } },
    { group: "Go to", icon: "#", label: "CTF scoreboard", keys: "ctf competitions results champion", act: function () { goTo("ctf"); } },
    { group: "Go to", icon: "#", label: "Certifications", keys: "certs credentials api-rta ceh ccna", act: function () { goTo("certs"); } },
    { group: "Go to", icon: "#", label: "Experience & education", keys: "work history internship tnb uniten", act: function () { goTo("experience"); } },
    { group: "Go to", icon: "#", label: "Contact", keys: "hire email linkedin reach", act: function () { goTo("contact"); } },
    { group: "Actions", icon: "↗", label: "Open LinkedIn", keys: "connect profile", hint: "new tab", act: function () { window.open(LINKEDIN, "_blank", "noopener"); } },
    { group: "Actions", icon: "@", label: "Copy email address", keys: "mail contact", hint: emailAddr, act: function () { goTo("contact"); copyEmail(); }, when: function () { return !!emailAddr; } },
    { group: "Actions", icon: "★", label: "Show top CTF placings", keys: "wins champion filter", act: function () { goTo("ctf"); if (filters) applyFilter("top"); } },
    { group: "Actions", icon: "$", label: "Run sudo hire-me", keys: "terminal easter egg", act: function () { goTo("home"); setTimeout(function () { exec("sudo hire-me"); }, 500); } },
    { group: "Actions", icon: "<>", label: "View site source", keys: "github code repo", hint: "GitHub", act: function () { window.open(SOURCE, "_blank", "noopener"); } }
  ];
  var shown = [];
  var active = 0;

  function renderPalette() {
    var q = pInput.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
    shown = ITEMS.filter(function (it) {
      if (it.when && !it.when()) return false;
      var hay = (it.label + " " + it.keys + " " + it.group).toLowerCase();
      return q.every(function (w) { return hay.indexOf(w) >= 0; });
    });
    active = Math.min(active, Math.max(shown.length - 1, 0));
    pList.textContent = "";
    if (!shown.length) {
      var empty = document.createElement("li");
      empty.className = "palette__empty";
      empty.setAttribute("role", "presentation");
      empty.textContent = "No match. Try ‘ctf’, ‘projects’ or ‘contact’.";
      pList.appendChild(empty);
      pInput.removeAttribute("aria-activedescendant");
      return;
    }
    var lastGroup = "";
    shown.forEach(function (it, i) {
      if (it.group !== lastGroup) {
        lastGroup = it.group;
        var g = document.createElement("li");
        g.className = "palette__group";
        g.setAttribute("role", "presentation");
        g.textContent = it.group;
        pList.appendChild(g);
      }
      var li = document.createElement("li");
      li.className = "palette__item";
      li.id = "pal-" + i;
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", i === active ? "true" : "false");
      li.appendChild(span(it.icon, "ic"));
      li.appendChild(span(it.label));
      if (it.hint) li.appendChild(span(it.hint, "hint"));
      li.addEventListener("mousemove", function () { if (active !== i) { active = i; markActive(); } });
      li.addEventListener("click", function () { choose(i); });
      pList.appendChild(li);
    });
    markActive();
  }
  function markActive() {
    $$(".palette__item", pList).forEach(function (li, i) {
      li.setAttribute("aria-selected", i === active ? "true" : "false");
      if (i === active) li.scrollIntoView({ block: "nearest" });
    });
    pInput.setAttribute("aria-activedescendant", "pal-" + active);
  }
  function choose(i) {
    var it = shown[i];
    if (!it) return;
    palette.close();
    it.act();
  }
  function openPalette() {
    if (palette.open) return;
    if (links) closeMenu();
    pInput.value = "";
    active = 0;
    renderPalette();
    palette.showModal();
    pInput.focus();
  }

  if (palette && typeof palette.showModal === "function") {
    pOpen.hidden = false;
    if (isMac) pKbd.textContent = "⌘ K";
    pOpen.addEventListener("click", openPalette);
    pInput.addEventListener("input", function () { active = 0; renderPalette(); });
    pInput.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); active = (active + 1) % Math.max(shown.length, 1); markActive(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); active = (active - 1 + shown.length) % Math.max(shown.length, 1); markActive(); }
      else if (e.key === "Enter") { e.preventDefault(); choose(active); }
    });
    palette.addEventListener("click", function (e) { if (e.target === palette) palette.close(); });
    document.addEventListener("keydown", function (e) {
      var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) || document.activeElement.isContentEditable;
      if ((e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (palette.open) palette.close(); else openPalette();
      } else if (e.key === "/" && !typing && !palette.open) {
        e.preventDefault();
        openPalette();
      }
    });
  }

  /* ── 7a. GRID PACKETS (background canvas) ───────────── */
  // A few dots travel along the 64px background grid like network
  // traffic, occasionally turning at an intersection.
  var net = $("#bgNet");
  if (net && net.getContext && !reduceMotion) {
    var nctx = net.getContext("2d");
    var CELL = 64, W = 0, H = 0, MAX = 6, packets = [];
    var sizeNet = function () {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      net.width = W * dpr; net.height = H * dpr;
      nctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      MAX = W < 640 ? 4 : 8;
    };
    var DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    var spawn = function () {
      var d = DIRS[Math.floor(Math.random() * 4)];
      return {
        x: Math.floor(Math.random() * (W / CELL + 1)) * CELL,
        y: Math.floor(Math.random() * (H / CELL + 1)) * CELL,
        dx: d[0], dy: d[1],
        v: 0.7 + Math.random() * 0.9,
        life: 0, max: 280 + Math.random() * 480,
        rgb: Math.random() < 0.78 ? "57,255,136" : "255,79,163",
        trail: []
      };
    };
    var tick = function () {
      nctx.clearRect(0, 0, W, H);
      if (packets.length < MAX && Math.random() < 0.035) packets.push(spawn());
      packets = packets.filter(function (p) {
        var px = p.x, py = p.y;
        p.x += p.dx * p.v; p.y += p.dy * p.v; p.life += p.v;
        // crossed an intersection on the moving axis: maybe turn
        var crossed = p.dx ? Math.floor(px / CELL) !== Math.floor(p.x / CELL) : Math.floor(py / CELL) !== Math.floor(p.y / CELL);
        if (crossed && Math.random() < 0.3) {
          if (p.dx) { p.x = Math.round(p.x / CELL) * CELL; p.dy = Math.random() < 0.5 ? 1 : -1; p.dx = 0; }
          else { p.y = Math.round(p.y / CELL) * CELL; p.dx = Math.random() < 0.5 ? 1 : -1; p.dy = 0; }
        }
        p.trail.push([p.x + 0.5, p.y + 0.5]);
        if (p.trail.length > 46) p.trail.shift();
        var fade = Math.min(1, p.life / 40, (p.max - p.life) / 70);
        if (fade <= 0) return false;
        for (var i = 1; i < p.trail.length; i++) {
          nctx.strokeStyle = "rgba(" + p.rgb + "," + (i / p.trail.length) * 0.75 * fade + ")";
          nctx.lineWidth = 1.2;
          nctx.beginPath();
          nctx.moveTo(p.trail[i - 1][0], p.trail[i - 1][1]);
          nctx.lineTo(p.trail[i][0], p.trail[i][1]);
          nctx.stroke();
        }
        var hx = p.x + 0.5, hy = p.y + 0.5;
        nctx.fillStyle = "rgba(" + p.rgb + "," + 0.16 * fade + ")";
        nctx.beginPath(); nctx.arc(hx, hy, 5, 0, 6.283); nctx.fill();
        nctx.fillStyle = "rgba(" + p.rgb + "," + 0.95 * fade + ")";
        nctx.beginPath(); nctx.arc(hx, hy, 1.6, 0, 6.283); nctx.fill();
        return p.x > -CELL && p.x < W + CELL && p.y > -CELL && p.y < H + CELL;
      });
      requestAnimationFrame(tick);
    };
    sizeNet();
    window.addEventListener("resize", sizeNet);
    requestAnimationFrame(tick);
  }

  /* ── 7b. CARD SPOTLIGHT ─────────────────────────────── */
  if (window.matchMedia("(hover: hover) and (pointer: fine)").matches && !reduceMotion) {
    $$(".card, .proj, .mod, .ps, .cert, .ctf-sum li").forEach(function (el) { el.classList.add("spot"); });
    document.addEventListener("pointermove", function (e) {
      var el = e.target.closest && e.target.closest(".spot");
      if (!el) return;
      var r = el.getBoundingClientRect();
      el.style.setProperty("--mx", (e.clientX - r.left) + "px");
      el.style.setProperty("--my", (e.clientY - r.top) + "px");
    }, { passive: true });
  }

  /* ── 7c. COUNT-UPS ──────────────────────────────────── */
  // Numbers tick up once, the first time they scroll into view.
  function countUp(el) {
    var node = Array.prototype.find.call(el.childNodes, function (n) { return n.nodeType === 3 && /\d/.test(n.data); });
    if (!node) return;
    var m = node.data.match(/^(\D*)([\d,]*\.?\d+)(.*)$/);
    if (!m) return;
    var raw = m[2], target = parseFloat(raw.replace(/,/g, ""));
    var dec = (raw.split(".")[1] || "").length, comma = raw.indexOf(",") >= 0;
    var fmt = function (v) {
      return comma ? v.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }) : v.toFixed(dec);
    };
    var t0 = null, DUR = 1300;
    var step = function (ts) {
      if (t0 === null) t0 = ts;
      var k = Math.min(1, (ts - t0) / DUR), e = 1 - Math.pow(1 - k, 3);
      node.data = m[1] + fmt(target * e) + m[3];
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  if (!reduceMotion && "IntersectionObserver" in window) {
    var counters = $$(".stat b, .metrics dd, .ctf-sum b");
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { countUp(entry.target); cio.unobserve(entry.target); }
      });
    }, { threshold: 0.6 });
    counters.forEach(function (el) { cio.observe(el); });
  }
})();
