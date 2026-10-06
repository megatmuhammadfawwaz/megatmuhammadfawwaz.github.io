(function () {
  'use strict';

  var DATA = window.CEH_DATA || { categories: [], questions: [] };
  var QUESTIONS_BY_NUMBER = new Map(DATA.questions.map(function (q) { return [q.number, q]; }));

  var PREFERRED_ORDER = [
    'Introduction to Ethical Hacking',
    'Footprinting and Reconnaissance',
    'Scanning Networks',
    'Enumeration',
    'Vulnerability Analysis',
    'System Hacking',
    'Malware Threats',
    'Sniffing',
    'Social Engineering',
    'Denial-of-Service',
    'Session Hijacking',
    'Evading IDS, Firewalls, and Honeypots',
    'Hacking Web Servers',
    'Hacking Web Applications',
    'SQL Injection',
    'Hacking Wireless Networks',
    'Hacking Mobile Platforms',
    'IoT and OT Hacking',
    'Cloud Computing',
    'Cryptography',
    'Uncategorized',
  ];

  var STORAGE_KEY = 'ceh_quiz_progress_v1';
  var STATS_KEY = 'ceh_quiz_stats_v1';

  // A missed question leaves Weak Spots once it's answered correctly this many times in a row.
  var MASTER_STREAK = 2;
  var DRILL_SIZE = 20;
  var TARGET_PCT = 70;
  var MAX_RUNS_KEPT = 500;

  // Special session keys live alongside category names in PROGRESS; categories never start with '@'.
  var MODES = {
    '@quick10': { label: 'Quick 10', size: 10 },
    '@quick25': { label: 'Quick 25', size: 25 },
    '@weak': { label: 'Weak Spots Drill' },
    '@retry': { label: 'Retry Missed' },
  };

  var XP = { correct: 10, wrong: 2, comboStep: 2, comboCap: 20, clearBonus: 15, setComplete: 50, perfectRun: 50 };

  var LEVEL_TITLES = [
    [1, 'Script Kiddie'],
    [3, 'Packet Sniffer'],
    [5, 'Port Scanner'],
    [7, 'Recon Specialist'],
    [9, 'Exploit Developer'],
    [12, 'Red Teamer'],
    [15, 'Penetration Tester'],
    [18, 'Elite Hacker'],
    [22, 'CEH Master'],
  ];

  var BADGES = [
    { id: 'first_blood', icon: '🩸', name: 'First Blood', desc: 'Answer a question correctly', test: function (t) { return t.correct >= 1; } },
    { id: 'combo5', icon: '🔥', name: 'On Fire', desc: '5 correct in a row', test: function () { return STATS.bestCombo >= 5; } },
    { id: 'combo10', icon: '⚡', name: 'Unstoppable', desc: '10 correct in a row', test: function () { return STATS.bestCombo >= 10; } },
    { id: 'combo25', icon: '👑', name: 'Godlike', desc: '25 correct in a row', test: function () { return STATS.bestCombo >= 25; } },
    { id: 'answered100', icon: '💯', name: 'Century', desc: 'Answer 100 questions', test: function (t) { return t.answered >= 100; } },
    { id: 'answered500', icon: '📚', name: 'Grinder', desc: 'Answer 500 questions', test: function (t) { return t.answered >= 500; } },
    { id: 'coverage', icon: '🗺️', name: 'Full Coverage', desc: 'See every question at least once', test: function (t) { return t.distinct >= DATA.questions.length; } },
    { id: 'perfect', icon: '🎯', name: 'Flawless', desc: 'Finish a run of 10+ with zero mistakes', test: function () { return STATS.runs.some(function (r) { return r.perfect; }); } },
    { id: 'clear1', icon: '🩹', name: 'Redemption', desc: 'Clear a question from Weak Spots', test: function () { return STATS.cleared >= 1; } },
    { id: 'clear25', icon: '🛡️', name: 'Patched Up', desc: 'Clear 25 weak spots', test: function () { return STATS.cleared >= 25; } },
    { id: 'streak3', icon: '📅', name: 'Habit Forming', desc: 'Practice 3 days in a row', test: function () { return STATS.dayStreak.best >= 3; } },
    { id: 'streak7', icon: '🗓️', name: 'Dedicated', desc: 'Practice 7 days in a row', test: function () { return STATS.dayStreak.best >= 7; } },
    { id: 'domain', icon: '🏆', name: 'Domain Expert', desc: 'See every question in a domain with 85%+ accuracy', test: function (t, cats) {
      return Array.from(cats.values()).some(function (cs) { return cs.seen === cs.total && cs.correct / cs.attempts >= 0.85; });
    } },
    { id: 'level10', icon: '🎖️', name: 'Double Digits', desc: 'Reach level 10', test: function () { return levelFromXp(STATS.xp) >= 10; } },
  ];

  function loadProgress() {
    if (window.CEHProgress) return window.CEHProgress.getProgress();
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch (e) {
      return {};
    }
  }
  function saveProgress() {
    if (window.CEHProgress) { window.CEHProgress.saveProgress(PROGRESS); return; }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(PROGRESS));
    } catch (e) { /* ignore quota/private-mode errors */ }
  }

  function freshStats() {
    return {
      version: 1,
      xp: 0,
      questions: {},   // qNum -> { seen, correct, wrong, streak, lastPick, lastResult, lastSeenAt, lastWrongAt, flagged }
      runs: [],        // finished runs, oldest first
      activeRun: null,
      days: {},        // 'YYYY-MM-DD' -> { answered, correct }
      dayStreak: { current: 0, best: 0, lastDay: null },
      bestCombo: 0,
      cleared: 0,
      badges: {},      // badge id -> unlocked timestamp
      migrated: false,
    };
  }
  function normalizeStats(s) {
    var base = freshStats();
    if (!s || typeof s !== 'object') return base;
    Object.keys(base).forEach(function (k) {
      if (s[k] === undefined || (s[k] === null && k !== 'activeRun')) s[k] = base[k];
    });
    return s;
  }
  function loadStats() {
    if (window.CEHProgress) return normalizeStats(window.CEHProgress.getStats());
    try {
      return normalizeStats(JSON.parse(localStorage.getItem(STATS_KEY)));
    } catch (e) {
      return freshStats();
    }
  }
  function saveStats() {
    if (window.CEHProgress) { window.CEHProgress.saveStats(STATS); return; }
    try {
      localStorage.setItem(STATS_KEY, JSON.stringify(STATS));
    } catch (e) { /* ignore quota/private-mode errors */ }
  }

  var PROGRESS = loadProgress();
  var STATS = loadStats();
  var CURRENT = { catKey: null, screen: 'home', feedback: null, celebrations: [], lastRun: null, weakTab: 'weak', weakCat: 'ALL' };

  // ---------- helpers ----------
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, '&quot;');
  }
  function stripFences(s) {
    return String(s == null ? '' : s).replace(/```[\s\S]*?```/g, ' [code] ').replace(/`/g, '');
  }
  function renderRichText(raw) {
    if (!raw) return '';
    var parts = String(raw).split('```');
    var html = '';
    for (var i = 0; i < parts.length; i++) {
      if (i % 2 === 0) {
        var seg = escapeHtml(parts[i]);
        seg = seg.replace(/`([^`]+)`/g, '<code>$1</code>');
        html += seg;
      } else {
        var code = parts[i].replace(/^[a-zA-Z0-9_+-]*\n/, '');
        html += '<pre><code>' + escapeHtml(code.trim()) + '</code></pre>';
      }
    }
    return html;
  }
  function snippet(q, max) {
    var text = stripFences(q.question).replace(/\s+/g, ' ').trim();
    return text.length > max ? text.slice(0, max) + '…' : text;
  }
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }
  function fmt(n) { return Number(n || 0).toLocaleString(); }
  function pct(part, whole) { return whole ? Math.round((part / whole) * 100) : 0; }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function dayKey(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function shiftDays(ts, delta) {
    var d = new Date(ts);
    d.setDate(d.getDate() + delta);
    return d.getTime();
  }
  function fmtDate(ts) {
    return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }
  function fmtWhen(ts) {
    var time = new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    var key = dayKey(ts);
    if (key === dayKey(Date.now())) return 'Today ' + time;
    if (key === dayKey(shiftDays(Date.now(), -1))) return 'Yesterday ' + time;
    return fmtDate(ts) + ', ' + time;
  }
  function fmtDuration(ms) {
    var s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return s + 's';
    if (s < 3600) return Math.floor(s / 60) + 'm ' + pad2(s % 60) + 's';
    return Math.floor(s / 3600) + 'h ' + pad2(Math.floor((s % 3600) / 60)) + 'm';
  }
  function labelFor(key) {
    if (key === 'ALL') return 'All Categories';
    if (MODES[key]) return MODES[key].label;
    return key;
  }

  function buildCategoryList() {
    var counts = new Map();
    DATA.questions.forEach(function (q) {
      counts.set(q.category, (counts.get(q.category) || 0) + 1);
    });
    var cats = Array.from(counts.keys());
    cats.sort(function (a, b) {
      var ia = PREFERRED_ORDER.indexOf(a);
      var ib = PREFERRED_ORDER.indexOf(b);
      var sa = ia === -1 ? 999 : ia;
      var sb = ib === -1 ? 999 : ib;
      if (sa !== sb) return sa - sb;
      return a.localeCompare(b);
    });
    return cats.map(function (name) { return { name: name, count: counts.get(name) }; });
  }

  // ---------- per-question stats (the source for Weak Spots) ----------
  function qstat(n) {
    var st = STATS.questions[n];
    if (!st) {
      st = STATS.questions[n] = {
        seen: 0, correct: 0, wrong: 0, streak: 0,
        lastPick: null, lastResult: null, lastSeenAt: 0, lastWrongAt: 0, flagged: false,
      };
    }
    return st;
  }
  function isWeak(st) { return !!st && st.wrong > 0 && st.streak < MASTER_STREAK; }
  function isCleared(st) { return !!st && st.wrong > 0 && st.streak >= MASTER_STREAK; }
  function isMastered(st) { return !!st && st.lastResult === 'correct' && !isWeak(st); }
  function accuracyOf(st) { return st && st.seen ? st.correct / st.seen : 1; }

  function recordQuestionResult(n, pick, correct, ts) {
    var st = qstat(n);
    var wasWeak = isWeak(st);
    st.seen += 1;
    if (correct) {
      st.correct += 1;
      st.streak += 1;
      st.lastResult = 'correct';
    } else {
      st.wrong += 1;
      st.streak = 0;
      st.lastResult = 'wrong';
      st.lastPick = pick;
      if (ts) st.lastWrongAt = ts;
    }
    if (ts) st.lastSeenAt = ts;
    var cleared = wasWeak && !isWeak(st);
    if (cleared) STATS.cleared += 1;
    return { wasWeak: wasWeak, cleared: cleared };
  }

  // Most-missed first, then lowest accuracy, then most recently missed.
  function weakRank(a, b) {
    if (b.st.wrong !== a.st.wrong) return b.st.wrong - a.st.wrong;
    var accA = accuracyOf(a.st);
    var accB = accuracyOf(b.st);
    if (accA !== accB) return accA - accB;
    return (b.st.lastWrongAt || 0) - (a.st.lastWrongAt || 0);
  }
  function listQuestions(filterFn) {
    var out = [];
    Object.keys(STATS.questions).forEach(function (k) {
      var q = QUESTIONS_BY_NUMBER.get(Number(k));
      var st = STATS.questions[k];
      if (q && filterFn(st)) out.push({ q: q, st: st });
    });
    return out.sort(weakRank);
  }
  function getWeakList() { return listQuestions(isWeak); }
  function getFlaggedList() { return listQuestions(function (st) { return st.flagged; }); }
  function getClearedList() { return listQuestions(isCleared); }
  function getDrillPool() {
    var picked = new Set();
    return getWeakList().concat(getFlaggedList()).filter(function (x) {
      if (picked.has(x.q.number)) return false;
      picked.add(x.q.number);
      return true;
    });
  }

  // One-time import of answers saved before the scoreboard existed, so earlier mistakes land in Weak Spots.
  function migrateFromProgress() {
    if (STATS.migrated) return;
    Object.keys(PROGRESS).forEach(function (key) {
      var s = PROGRESS[key];
      if (!s || !s.answers || !s.order) return;
      s.order.forEach(function (n) {
        var a = s.answers[n];
        if (!a || !QUESTIONS_BY_NUMBER.has(n)) return;
        recordQuestionResult(n, a.selected, a.correct, null);
        STATS.xp += a.correct ? XP.correct : XP.wrong;
      });
    });
    STATS.migrated = true;
    saveStats();
  }

  function computeTotals() {
    var t = { answered: 0, correct: 0, distinct: 0, mastered: 0, weak: 0, cleared: 0, flagged: 0 };
    Object.keys(STATS.questions).forEach(function (k) {
      if (!QUESTIONS_BY_NUMBER.has(Number(k))) return;
      var st = STATS.questions[k];
      t.answered += st.seen;
      t.correct += st.correct;
      if (st.seen) t.distinct += 1;
      if (isMastered(st)) t.mastered += 1;
      if (isWeak(st)) t.weak += 1;
      if (isCleared(st)) t.cleared += 1;
      if (st.flagged) t.flagged += 1;
    });
    t.accuracy = pct(t.correct, t.answered);
    return t;
  }

  function categoryStats() {
    var map = new Map();
    DATA.questions.forEach(function (q) {
      var cs = map.get(q.category);
      if (!cs) map.set(q.category, cs = { total: 0, seen: 0, attempts: 0, correct: 0, weak: 0, mastered: 0 });
      cs.total += 1;
      var st = STATS.questions[q.number];
      if (st && st.seen) {
        cs.seen += 1;
        cs.attempts += st.seen;
        cs.correct += st.correct;
      }
      if (isWeak(st)) cs.weak += 1;
      if (isMastered(st)) cs.mastered += 1;
    });
    return map;
  }

  // ---------- XP, levels, streaks ----------
  // Level n starts at 50 * n * (n - 1) XP: 0, 100, 300, 600, 1000, ...
  function levelStartXp(lvl) { return 50 * lvl * (lvl - 1); }
  function levelFromXp(xp) {
    var lvl = 1;
    while (levelStartXp(lvl + 1) <= xp) lvl++;
    return lvl;
  }
  function levelTitle(lvl) {
    var title = LEVEL_TITLES[0][1];
    LEVEL_TITLES.forEach(function (p) { if (lvl >= p[0]) title = p[1]; });
    return title;
  }
  function grantXp(amount) {
    var before = levelFromXp(STATS.xp);
    STATS.xp += amount;
    if (STATS.activeRun) STATS.activeRun.xp += amount;
    var after = levelFromXp(STATS.xp);
    if (after > before) {
      queueCelebration('<span class="t-icon">⬆️</span><div><b>Level up! Lv ' + after + '</b><div>You are now a ' + levelTitle(after) + '</div></div>', 'level', true);
    }
  }

  function touchDay(ts, correct) {
    var key = dayKey(ts);
    var day = STATS.days[key] || (STATS.days[key] = { answered: 0, correct: 0 });
    day.answered += 1;
    if (correct) day.correct += 1;
    var ds = STATS.dayStreak;
    if (ds.lastDay !== key) {
      ds.current = ds.lastDay === dayKey(shiftDays(ts, -1)) ? ds.current + 1 : 1;
      ds.lastDay = key;
      ds.best = Math.max(ds.best, ds.current);
    }
  }
  function currentDayStreak() {
    var ds = STATS.dayStreak;
    var now = Date.now();
    return ds.lastDay === dayKey(now) || ds.lastDay === dayKey(shiftDays(now, -1)) ? ds.current : 0;
  }

  function checkBadges() {
    var t = computeTotals();
    var cats = categoryStats();
    BADGES.forEach(function (b) {
      if (STATS.badges[b.id] || !b.test(t, cats)) return;
      STATS.badges[b.id] = Date.now();
      queueCelebration('<span class="t-icon">' + b.icon + '</span><div><b>Badge unlocked: ' + b.name + '</b><div>' + b.desc + '</div></div>', 'badge', false);
    });
    saveStats();
  }

  // ---------- runs (one row on the scoreboard per sitting) ----------
  function startRun(key) {
    if (STATS.activeRun) endRun();
    var now = Date.now();
    STATS.activeRun = {
      key: key, label: labelFor(key), startedAt: now, lastAt: now,
      answered: 0, correct: 0, combo: 0, bestCombo: 0, xp: 0, cleared: 0, missed: [], completedSet: false, perfect: false,
    };
    saveStats();
  }
  function endRun() {
    var run = STATS.activeRun;
    if (!run) return null;
    if (run.answered >= 10 && run.correct === run.answered) {
      run.perfect = true;
      grantXp(XP.perfectRun);
    }
    STATS.activeRun = null;
    if (!run.answered) {
      saveStats();
      return null;
    }
    STATS.runs.push(run);
    if (STATS.runs.length > MAX_RUNS_KEPT) STATS.runs = STATS.runs.slice(-MAX_RUNS_KEPT);
    saveStats();
    checkBadges();
    return run;
  }
  function findRun(id) {
    for (var i = STATS.runs.length - 1; i >= 0; i--) {
      if (String(STATS.runs[i].startedAt) === String(id)) return STATS.runs[i];
    }
    return null;
  }

  // ---------- celebrations: toasts + confetti ----------
  function queueCelebration(html, kind, party) {
    CURRENT.celebrations.push({ html: html, kind: kind, party: party });
  }
  function celebrate() {
    var items = CURRENT.celebrations;
    CURRENT.celebrations = [];
    var party = false;
    items.forEach(function (c, i) {
      setTimeout(function () { toast(c.html, c.kind); }, i * 250);
      if (c.party) party = true;
    });
    if (party) confetti();
  }
  function toast(html, kind) {
    var box = document.getElementById('toasts');
    if (!box) return;
    var el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.innerHTML = html;
    box.appendChild(el);
    setTimeout(function () {
      el.classList.add('out');
      setTimeout(function () { el.remove(); }, 300);
    }, 4000);
  }
  function confetti() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var colors = ['#4f8cff', '#7c5cff', '#34c77b', '#f5b942', '#ef5a6f'];
    var layer = document.createElement('div');
    layer.className = 'confetti';
    for (var i = 0; i < 80; i++) {
      var p = document.createElement('i');
      p.style.left = Math.random() * 100 + '%';
      p.style.background = colors[i % colors.length];
      p.style.animationDelay = Math.random() * 0.5 + 's';
      p.style.animationDuration = 1.8 + Math.random() * 1.4 + 's';
      p.style.setProperty('--r', Math.round(Math.random() * 720 - 360) + 'deg');
      p.style.setProperty('--dx', Math.round(Math.random() * 160 - 80) + 'px');
      layer.appendChild(p);
    }
    document.body.appendChild(layer);
    setTimeout(function () { layer.remove(); }, 3800);
  }

  // ---------- tooltips for charts ----------
  var tipEl = null;
  function hideTip() { if (tipEl) tipEl.style.display = 'none'; }
  function handleTipOver(e) {
    var t = e.target.closest ? e.target.closest('[data-tip]') : null;
    if (!t) { hideTip(); return; }
    if (!tipEl) {
      tipEl = document.createElement('div');
      tipEl.className = 'chart-tip';
      document.body.appendChild(tipEl);
    }
    tipEl.textContent = t.getAttribute('data-tip');
    tipEl.style.display = 'block';
    var r = t.getBoundingClientRect();
    var w = tipEl.offsetWidth;
    var h = tipEl.offsetHeight;
    var left = Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2));
    var top = r.top - h - 8;
    if (top < 8) top = r.bottom + 8;
    tipEl.style.left = left + 'px';
    tipEl.style.top = top + 'px';
  }

  // ---------- sessions ----------
  function buildOrder(catKey) {
    var all = DATA.questions.map(function (q) { return q.number; });
    if (catKey === 'ALL') return all;
    if (catKey === '@quick10' || catKey === '@quick25') return shuffle(all).slice(0, MODES[catKey].size);
    if (catKey === '@weak') return shuffle(getDrillPool().slice(0, DRILL_SIZE).map(function (x) { return x.q.number; }));
    if (catKey === '@retry') return [];
    return DATA.questions.filter(function (q) { return q.category === catKey; }).map(function (q) { return q.number; });
  }

  function getOrCreateSession(catKey, order) {
    var s = PROGRESS[catKey];
    if (s) {
      var validOrder = s.order.filter(function (n) { return QUESTIONS_BY_NUMBER.has(n); });
      if (validOrder.length !== s.order.length) {
        s.order = validOrder;
        if (s.currentIndex > s.order.length) s.currentIndex = s.order.length;
        saveProgress();
      }
      return s;
    }
    order = order || buildOrder(catKey);
    if (!order.length) return null;
    s = PROGRESS[catKey] = {
      order: order,
      currentIndex: 0,
      answers: {},
    };
    saveProgress();
    return s;
  }

  function resetSession(catKey) {
    delete PROGRESS[catKey];
    saveProgress();
  }

  function isInProgress(key) {
    var s = PROGRESS[key];
    return !!s && s.currentIndex < s.order.length;
  }

  function startRetry(numbers) {
    var valid = numbers.filter(function (n) { return QUESTIONS_BY_NUMBER.has(n); });
    if (!valid.length) return;
    leaveCurrentScreen();
    resetSession('@retry');
    getOrCreateSession('@retry', shuffle(valid));
    goToQuiz('@retry');
  }

  // ---------- navigation ----------
  function setActiveNav(view) {
    document.querySelectorAll('.nav-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.view === view);
    });
  }

  function leaveCurrentScreen() {
    if (CURRENT.screen !== 'quiz') return;
    var run = endRun();
    CURRENT.screen = 'leaving';
    if (run) {
      toast('<span class="t-icon">💾</span><div><b>Run saved to scoreboard</b><div>' + run.correct + '/' + run.answered + ' correct · +' + run.xp + ' XP</div></div>', 'info');
    }
  }

  function navigate(view) {
    leaveCurrentScreen();
    if (view === 'scoreboard') renderScoreboard();
    else if (view === 'weak') renderWeak();
    else renderHome();
    window.scrollTo(0, 0);
    celebrate();
  }

  // ---------- shared widgets ----------
  function renderPlayerCard(t) {
    var lvl = levelFromXp(STATS.xp);
    var start = levelStartXp(lvl);
    var next = levelStartXp(lvl + 1);
    var streak = currentDayStreak();
    var today = STATS.days[dayKey(Date.now())];
    function stat(icon, value, label) {
      return '<div class="pc-stat"><span class="pc-stat-val">' + icon + ' ' + value + '</span><span class="pc-stat-label">' + label + '</span></div>';
    }
    return '<div class="player-card">' +
      '<div class="pc-level"><span class="pc-lvl-num">' + lvl + '</span><span class="pc-lvl-label">Level</span></div>' +
      '<div class="pc-main">' +
      '<div class="pc-title">' + levelTitle(lvl) + '</div>' +
      '<div class="progress-bar xp-bar"><span style="width:' + pct(STATS.xp - start, next - start) + '%"></span></div>' +
      '<div class="pc-sub">' + fmt(STATS.xp - start) + ' / ' + fmt(next - start) + ' XP to Lv ' + (lvl + 1) + ' &middot; ' + fmt(STATS.xp) + ' XP total</div>' +
      '</div>' +
      '<div class="pc-stats">' +
      stat('🔥', streak, 'day streak') +
      stat('✅', today ? today.answered : 0, 'today') +
      stat('🎯', t.answered ? t.accuracy + '%' : '—', 'accuracy') +
      stat('🩹', t.weak, 'weak spots') +
      '</div>' +
      '</div>';
  }

  function heatChip(st) {
    var cls = st.wrong >= 3 ? 'critical' : st.wrong === 2 ? 'repeat' : 'new';
    return '<span class="heat-chip ' + cls + '">✗ ' + st.wrong + '&times; missed</span>';
  }

  function statusFor(acc) {
    if (acc === null) return { cls: 'none', label: 'Not started' };
    if (acc >= 80) return { cls: 'good', label: 'Strong' };
    if (acc >= 60) return { cls: 'warn', label: 'Getting there' };
    return { cls: 'bad', label: 'Needs work' };
  }

  // ---------- render: home ----------
  function renderHome() {
    CURRENT.screen = 'home';
    CURRENT.catKey = null;
    setActiveNav('home');
    var root = document.getElementById('view-root');

    if (!DATA.questions.length) {
      root.innerHTML =
        '<div class="empty-state">' +
        '<h2>No question data loaded yet</h2>' +
        '<p>Populate <code>data/data.js</code> with the extracted CEH question set, then reload this page.</p>' +
        '</div>';
      renderTopbarStats();
      return;
    }

    var t = computeTotals();
    var catStats = categoryStats();
    var cats = buildCategoryList();
    var totalQ = DATA.questions.length;
    var allProg = PROGRESS['ALL'];
    var allAnswered = allProg ? Object.keys(allProg.answers).length : 0;
    var drillCount = getDrillPool().length;

    var html = '';
    html += renderPlayerCard(t);

    html += '<div class="home-hero">' +
      '<h1>CEH v13 Practice Questions</h1>' +
      '<p>' + totalQ + ' exam questions, organized by domain. Every answer has been independently re-checked against CEH v13 material, with study tips for each question. Every run is logged to your <a href="#" data-action="nav" data-view="scoreboard">Scoreboard</a>, and questions you miss are collected in <a href="#" data-action="nav" data-view="weak">Weak Spots</a> until you get them right ' + MASTER_STREAK + '&times; in a row.</p>' +
      '</div>';

    html += '<div class="section-label">Quick play</div>';
    html += '<div class="mode-grid">' +
      renderModeCard('@weak', '🩹', 'Weak Spots Drill',
        drillCount ? 'Your ' + Math.min(DRILL_SIZE, drillCount) + ' most-missed questions' + (drillCount > DRILL_SIZE ? ' (of ' + drillCount + ')' : '') : 'No weak spots yet &mdash; questions you miss land here',
        !drillCount && !isInProgress('@weak'), 'hot') +
      renderModeCard('@quick10', '⚡', 'Quick 10', '10 random questions from every domain', false, '') +
      renderModeCard('@quick25', '🎲', 'Quick 25', '25 random questions &mdash; a mini mock exam', false, '') +
      '</div>';

    html += '<div class="all-card">' +
      '<div>' +
      '<div class="title">All Categories</div>' +
      '<div class="sub">' + totalQ + ' questions total' + (allProg ? ' &middot; ' + allAnswered + '/' + allProg.order.length + ' answered' : '') + ' &middot; ' + t.mastered + ' mastered</div>' +
      '</div>' +
      '<div class="cat-card-actions">' +
      (allProg ? '<button class="btn ghost small" data-action="reset" data-cat="ALL">Reset</button>' : '') +
      '<button class="btn primary" data-action="' + (allProg ? 'resume' : 'start') + '" data-cat="ALL">' + (allProg ? 'Continue' : 'Start') + '</button>' +
      '</div>' +
      '</div>';

    html += '<div class="section-label">Categories</div>';
    html += '<div class="category-grid">' + cats.map(function (c) { return renderCategoryCard(c, catStats.get(c.name)); }).join('') + '</div>';

    root.innerHTML = html;
    renderTopbarStats();
  }

  function renderModeCard(key, icon, title, desc, disabled, variant) {
    var s = PROGRESS[key];
    var inProgress = isInProgress(key);
    var answered = s ? Object.keys(s.answers).length : 0;
    return '<div class="mode-card ' + variant + (disabled ? ' disabled' : '') + '">' +
      '<div class="mode-icon">' + icon + '</div>' +
      '<div class="mode-body">' +
      '<div class="mode-title">' + title + '</div>' +
      '<div class="mode-desc">' + desc + '</div>' +
      '</div>' +
      '<div class="cat-card-actions">' +
      (inProgress ?
        '<button class="btn small primary" data-action="resume" data-cat="' + key + '">Continue ' + answered + '/' + s.order.length + '</button>' +
        '<button class="btn ghost small" data-action="new" data-cat="' + key + '">New</button>'
        : '<button class="btn small primary" data-action="new" data-cat="' + key + '"' + (disabled ? ' disabled' : '') + '>Start</button>') +
      '</div>' +
      '</div>';
  }

  function renderCategoryCard(c, cs) {
    var prog = PROGRESS[c.name];
    var answered = prog ? Object.keys(prog.answers).length : 0;
    var progPct = prog && prog.order.length ? Math.round((answered / prog.order.length) * 100) : 0;
    var acc = cs.attempts ? pct(cs.correct, cs.attempts) : null;
    var status = statusFor(acc);
    return '<div class="cat-card">' +
      '<div class="cat-name">' + escapeHtml(c.name) + '</div>' +
      '<div class="cat-count">' + c.count + ' question' + (c.count === 1 ? '' : 's') +
      (prog ? ' &middot; ' + answered + '/' + prog.order.length + ' answered' : '') + '</div>' +
      '<div class="progress-bar"><span style="width:' + progPct + '%"></span></div>' +
      '<div class="cat-meta">' +
      (acc === null ? '<span class="status-chip none">Not started</span>' :
        '<span class="status-chip ' + status.cls + '">' + acc + '% &middot; ' + status.label + '</span>') +
      (cs.weak ? '<button class="weak-link" data-action="weak-filter" data-cat="' + escapeAttr(c.name) + '">🩹 ' + cs.weak + ' weak</button>' : '') +
      '</div>' +
      '<div class="cat-card-actions">' +
      (prog ? '<button class="btn ghost small" data-action="reset" data-cat="' + escapeAttr(c.name) + '">Reset</button>' : '') +
      '<button class="btn small ' + (prog ? '' : 'primary') + '" data-action="' + (prog ? 'resume' : 'start') + '" data-cat="' + escapeAttr(c.name) + '">' + (prog ? 'Continue' : 'Start') + '</button>' +
      '</div>' +
      '</div>';
  }

  // ---------- render: quiz ----------
  function goToQuiz(catKey) {
    CURRENT.catKey = catKey;
    CURRENT.feedback = null;
    if (!STATS.activeRun || STATS.activeRun.key !== catKey) startRun(catKey);
    renderQuiz();
    window.scrollTo(0, 0);
  }

  function renderQuiz() {
    CURRENT.screen = 'quiz';
    setActiveNav(null);
    var catKey = CURRENT.catKey;
    var session = PROGRESS[catKey];
    if (!session || !session.order.length) {
      renderHome();
      return;
    }
    if (session.currentIndex >= session.order.length) {
      renderSummary(catKey);
      return;
    }

    var qNum = session.order[session.currentIndex];
    var q = QUESTIONS_BY_NUMBER.get(qNum);
    var ansState = session.answers[qNum];
    var total = session.order.length;
    var idx = session.currentIndex;
    var st = STATS.questions[qNum];
    var run = STATS.activeRun || { combo: 0, xp: 0 };
    var fb = CURRENT.feedback && CURRENT.feedback.qNum === qNum ? CURRENT.feedback : null;

    var answeredCount = Object.keys(session.answers).length;
    var correctCount = Object.values(session.answers).filter(function (a) { return a.correct; }).length;

    var letters = ['A', 'B', 'C', 'D'];
    var optionsHtml = letters.map(function (L) {
      var cls = 'option';
      var disabled = '';
      if (ansState) {
        disabled = 'disabled';
        if (L === q.correct_answer) cls += ' correct';
        else if (L === ansState.selected) cls += ' incorrect';
        else cls += ' dim';
      }
      return '<button class="' + cls + '" data-action="answer" data-letter="' + L + '" ' + disabled + '>' +
        '<span class="opt-letter">' + L + '</span>' +
        '<span class="opt-text">' + renderRichText(q.options[L]) + '</span>' +
        '</button>';
    }).join('');

    var historyHtml = '';
    if (st && st.seen) {
      historyHtml = '<span class="q-hist" title="Your history on this question">✓ ' + st.correct + ' &nbsp;✗ ' + st.wrong + '</span>';
      if (isWeak(st) && !fb) historyHtml += heatChip(st);
    }

    var revealHtml = '';
    if (ansState) {
      var isCorrect = ansState.correct;
      var progressNote = '';
      if (fb && fb.cleared) {
        progressNote = '<div class="progress-note good">🩹 Weak spot cleared &mdash; correct ' + MASTER_STREAK + '&times; in a row. +' + XP.clearBonus + ' bonus XP</div>';
      } else if (fb && isCorrect && isWeak(st)) {
        progressNote = '<div class="progress-note">🩹 Weak spot progress: ' + st.streak + '/' + MASTER_STREAK + ' &mdash; get it right once more to clear it.</div>';
      } else if (fb && !isCorrect) {
        progressNote = '<div class="progress-note bad">📌 ' + (st.wrong > 1 ? 'Missed ' + st.wrong + '&times; now &mdash; moved up your Weak Spots list.' : 'Added to Weak Spots. Answer it right ' + MASTER_STREAK + '&times; in a row to clear it.') + '</div>';
      }
      revealHtml = '<div class="reveal-panel">' +
        '<div class="reveal-row">' +
        '<span class="reveal-badge ' + (isCorrect ? 'good' : 'bad') + '">' +
        (isCorrect ? 'Correct' : 'Incorrect — correct answer is ' + q.correct_answer) +
        '</span>' +
        (fb ? '<span class="xp-pop">+' + fb.xp + ' XP</span>' : '') +
        (fb && fb.combo >= 3 ? '<span class="combo-pop">🔥 ' + fb.combo + ' in a row</span>' : '') +
        (fb && fb.brokenCombo >= 3 ? '<span class="combo-broken">Combo of ' + fb.brokenCombo + ' broken</span>' : '') +
        '</div>' +
        progressNote +
        (q.was_corrected ?
          '<div class="correction-note">Note: the original source material listed <b>' + q.original_marked_answer +
          '</b> as the answer. That was independently re-checked and found incorrect — the confirmed correct answer is <b>' + q.correct_answer + '</b>.</div>'
          : '') +
        '<div class="explanation">' + renderRichText(q.explanation || '') + '</div>' +
        (q.tips && q.tips.length ?
          '<div class="tips-block"><div class="tips-title">Study tips</div><ul class="tips-list">' +
          q.tips.map(function (t, i) {
            return '<li><span class="tip-num">Tip ' + (i + 1) + '</span><span>' + renderRichText(t) + '</span></li>';
          }).join('') +
          '</ul></div>'
          : '') +
        '</div>';
    }

    var flagged = !!(st && st.flagged);
    var modeBadge = MODES[catKey] ? '<span class="mode-badge">' + MODES[catKey].label + '</span>' : '';

    var root = document.getElementById('view-root');
    root.innerHTML =
      '<div class="quiz-header">' +
      '<div class="qh-left">' +
      '<div class="qh-badges">' + modeBadge + '<span class="cat-badge">' + escapeHtml(q.category) + '</span></div>' +
      '<div class="qh-progress-text">Question ' + (idx + 1) + ' of ' + total + '</div>' +
      '<div class="progress-bar qh-progress-bar"><span style="width:' + Math.round((idx / total) * 100) + '%"></span></div>' +
      '</div>' +
      '<div class="qh-right">' +
      '<div class="qh-score">Score: <b class="good">' + correctCount + '</b> / ' + answeredCount + ' answered</div>' +
      '<div class="qh-run">' +
      '<span class="combo' + (run.combo >= 3 ? ' hot' : '') + '">🔥 ' + run.combo + ' combo</span>' +
      '<span class="run-xp">+' + run.xp + ' XP this run</span>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '<div class="question-card">' +
      '<div class="question-top">' +
      '<div class="question-number">Question #' + q.number + historyHtml + '</div>' +
      '<button class="flag-btn' + (flagged ? ' on' : '') + '" data-action="flag" data-q="' + qNum + '" title="Flag for review (F)">⚑ ' + (flagged ? 'Flagged' : 'Flag') + '</button>' +
      '</div>' +
      '<div class="question-text">' + renderRichText(q.question) + '</div>' +
      '<div class="options">' + optionsHtml + '</div>' +
      revealHtml +
      '</div>' +
      '<div class="quiz-footer">' +
      '<div class="left-actions">' +
      '<button class="btn ghost" data-action="pause">⏸ Pause</button>' +
      '<button class="btn ghost" data-action="home">Home</button>' +
      '</div>' +
      '<div class="right-actions">' +
      (ansState ? '<button class="btn primary" data-action="next">' + (idx + 1 >= total ? 'Finish' : 'Next Question →') + '</button>' : '') +
      '</div>' +
      '</div>' +
      '<div class="kbd-hint">Keys: <kbd>A</kbd>–<kbd>D</kbd> or <kbd>1</kbd>–<kbd>4</kbd> answer &middot; <kbd>Enter</kbd> next &middot; <kbd>F</kbd> flag</div>';

    renderTopbarStats();
  }

  function handleAnswer(letter) {
    var catKey = CURRENT.catKey;
    var session = PROGRESS[catKey];
    if (!session) return;
    var qNum = session.order[session.currentIndex];
    if (session.answers[qNum]) return;
    var q = QUESTIONS_BY_NUMBER.get(qNum);
    var correct = letter === q.correct_answer;
    session.answers[qNum] = { selected: letter, correct: correct };
    saveProgress();

    var now = Date.now();
    if (!STATS.activeRun) startRun(catKey);
    var run = STATS.activeRun;
    var res = recordQuestionResult(qNum, letter, correct, now);
    touchDay(now, correct);
    run.answered += 1;
    run.lastAt = now;

    var gained;
    var brokenCombo = 0;
    if (correct) {
      run.correct += 1;
      run.combo += 1;
      run.bestCombo = Math.max(run.bestCombo, run.combo);
      STATS.bestCombo = Math.max(STATS.bestCombo, run.combo);
      gained = XP.correct + Math.min(XP.comboCap, (run.combo - 1) * XP.comboStep);
      if (res.cleared) {
        gained += XP.clearBonus;
        run.cleared += 1;
      }
    } else {
      brokenCombo = run.combo;
      run.combo = 0;
      run.missed.push(qNum);
      gained = XP.wrong;
    }
    grantXp(gained);
    CURRENT.feedback = { qNum: qNum, xp: gained, combo: run.combo, brokenCombo: brokenCombo, cleared: res.cleared };
    saveStats();
    checkBadges();
    renderQuiz();
    celebrate();
  }

  function handleNext() {
    var catKey = CURRENT.catKey;
    var session = PROGRESS[catKey];
    if (!session) return;
    session.currentIndex += 1;
    if (session.currentIndex >= session.order.length && STATS.activeRun) {
      STATS.activeRun.completedSet = true;
      grantXp(XP.setComplete);
    }
    CURRENT.feedback = null;
    saveProgress();
    saveStats();
    renderQuiz();
    window.scrollTo(0, 0);
    celebrate();
  }

  function toggleFlag(qNum) {
    var st = qstat(qNum);
    st.flagged = !st.flagged;
    saveStats();
    toast(st.flagged ? '<span class="t-icon">⚑</span><div><b>Flagged for review</b><div>It will show up in Weak Spots and your drills.</div></div>' : '<span class="t-icon">⚑</span><div><b>Flag removed</b></div>', 'info');
  }

  function handleRestart(catKey) {
    var old = PROGRESS[catKey];
    var order = catKey === '@retry' && old ? shuffle(old.order) : null;
    resetSession(catKey);
    if (!getOrCreateSession(catKey, order)) {
      renderHome();
      toast('<span class="t-icon">🎉</span><div><b>Nothing to drill</b><div>Your Weak Spots list is empty.</div></div>', 'info');
      return;
    }
    goToQuiz(catKey);
  }

  // ---------- render: summary ----------
  function renderSummary(catKey) {
    CURRENT.screen = 'summary';
    setActiveNav(null);
    var run = endRun();
    var session = PROGRESS[catKey];
    var total = session.order.length;
    var answered = Object.keys(session.answers).length;
    var correct = Object.values(session.answers).filter(function (a) { return a.correct; }).length;
    var missed = session.order
      .filter(function (n) { return session.answers[n] && !session.answers[n].correct; })
      .map(function (n) { return { q: QUESTIONS_BY_NUMBER.get(n), ans: session.answers[n] }; });

    var score = pct(correct, answered);
    var label = labelFor(catKey);
    var verdict = score >= 90 ? 'Outstanding! 🏆' : score >= TARGET_PCT ? 'Pass territory ✅' : score >= 50 ? 'Getting there 💪' : 'Keep drilling 🩹';

    var runHtml = '';
    if (run) {
      runHtml = '<div class="run-tiles">' +
        '<div class="run-tile"><span class="rt-val">+' + run.xp + '</span><span class="rt-label">XP earned</span></div>' +
        '<div class="run-tile"><span class="rt-val">🔥 ' + run.bestCombo + '</span><span class="rt-label">best combo</span></div>' +
        '<div class="run-tile"><span class="rt-val">' + fmtDuration(run.lastAt - run.startedAt) + '</span><span class="rt-label">time this sitting</span></div>' +
        '<div class="run-tile"><span class="rt-val">🩹 ' + run.cleared + '</span><span class="rt-label">weak spots cleared</span></div>' +
        '</div>';
    }

    var root = document.getElementById('view-root');
    root.innerHTML =
      '<div class="summary-card">' +
      '<div class="summary-verdict">' + verdict + '</div>' +
      '<div class="summary-score">' + score + '%</div>' +
      '<div class="summary-sub">' + correct + ' correct out of ' + answered + ' answered &middot; ' + escapeHtml(label) + ' (' + total + ' total)</div>' +
      runHtml +
      '<div class="summary-actions">' +
      (missed.length ? '<button class="btn primary" data-action="retry-missed" data-cat="' + escapeAttr(catKey) + '">🩹 Retry ' + missed.length + ' missed</button>' : '') +
      '<button class="btn ' + (missed.length ? '' : 'primary') + '" data-action="restart" data-cat="' + escapeAttr(catKey) + '">' + (MODES[catKey] && catKey !== '@retry' ? 'New Set' : 'Restart This Set') + '</button>' +
      '<button class="btn ghost" data-action="nav" data-view="scoreboard">Scoreboard</button>' +
      '<button class="btn ghost" data-action="home">Back to Categories</button>' +
      '</div>' +
      (missed.length ?
        '<div class="missed-list">' +
        '<div class="section-label" style="margin-top:0">Review missed questions</div>' +
        missed.map(function (m) {
          var st = STATS.questions[m.q.number];
          return '<div class="missed-item">' +
            '<div class="mi-q">#' + m.q.number + ' — ' + escapeHtml(snippet(m.q, 140)) + '</div>' +
            '<div class="mi-ans">Your answer: <span class="bad">' + m.ans.selected + '</span> &nbsp;|&nbsp; Correct: <span class="good">' + m.q.correct_answer + '</span>' +
            (st && st.wrong > 1 ? ' &nbsp;' + heatChip(st) : '') + '</div>' +
            '</div>';
        }).join('') +
        '</div>'
        : '') +
      '</div>';

    if (run && run.answered >= 5 && score >= 80) queueCelebration('<span class="t-icon">🎉</span><div><b>' + score + '% on ' + escapeHtml(label) + '</b><div>Nice run!</div></div>', 'level', true);
    renderTopbarStats();
  }

  // ---------- render: scoreboard ----------
  function renderScoreboard() {
    CURRENT.screen = 'scoreboard';
    setActiveNav('scoreboard');
    var t = computeTotals();
    var cats = categoryStats();
    var root = document.getElementById('view-root');

    function tile(value, label, sub) {
      return '<div class="stat-tile"><div class="st-val">' + value + '</div><div class="st-label">' + label + '</div>' + (sub ? '<div class="st-sub">' + sub + '</div>' : '') + '</div>';
    }
    function panel(title, body, extra) {
      return '<section class="panel"><div class="panel-head"><h2>' + title + '</h2>' + (extra || '') + '</div>' + body + '</section>';
    }

    var html = '<div class="page-head"><h1>Scoreboard</h1>' +
      '<p>Every sitting is logged as a run. Your stats, weak spots and badges are all built from these results.</p></div>';
    html += renderPlayerCard(t);
    html += '<div class="stat-tiles">' +
      tile(fmt(t.answered), 'answers given', fmt(t.distinct) + ' of ' + fmt(DATA.questions.length) + ' questions seen') +
      tile(t.answered ? t.accuracy + '%' : '—', 'overall accuracy', TARGET_PCT + '% is the target') +
      tile(fmt(t.mastered), 'mastered', 'right on the latest attempt') +
      tile('🔥 ' + STATS.bestCombo, 'best combo', 'correct answers in a row') +
      tile(currentDayStreak() + ' days', 'current streak', 'best: ' + STATS.dayStreak.best + ' days') +
      tile('🩹 ' + t.weak, 'active weak spots', t.cleared + ' cleared so far') +
      '</div>';

    html += panel('Accuracy trend', renderTrendChart(), '<span class="panel-note">last ' + Math.min(20, STATS.runs.length) + ' runs &middot; dashed line = ' + TARGET_PCT + '% target</span>');
    html += '<div class="two-col">' +
      panel('Personal bests', renderPersonalBests()) +
      panel('Most-missed questions', renderMostMissed(), '<button class="btn ghost small" data-action="nav" data-view="weak">All weak spots →</button>') +
      '</div>';
    html += panel('Domain mastery', '<div class="dm-list">' + renderDomainBars(cats) + '</div>', '<span class="panel-note">weakest first &middot; line marks ' + TARGET_PCT + '%</span>');
    html += panel('Activity', renderHeatmap(), '<span class="panel-note">last 17 weeks</span>');
    html += panel('Badges', renderBadges(), '<span class="panel-note">' + Object.keys(STATS.badges).length + ' / ' + BADGES.length + ' unlocked</span>');
    html += panel('Run history', renderHistory(), '<span class="panel-note">' + STATS.runs.length + ' runs logged</span>');
    html += panel('Backup',
      '<p class="muted">Your progress lives in this browser only. Export a backup now and then so clearing browser data doesn\'t wipe your scoreboard.</p>' +
      '<div class="backup-actions">' +
      '<button class="btn" data-action="export">⬇ Export backup</button>' +
      '<button class="btn" data-action="import">⬆ Import backup</button>' +
      '<button class="btn danger-ghost" data-action="reset-stats">Reset scoreboard</button>' +
      '</div>');

    root.innerHTML = html;
    renderTopbarStats();
  }

  function renderTrendChart() {
    var runs = STATS.runs.slice(-20);
    if (runs.length < 2) return '<div class="empty-mini">Finish at least two runs to see your accuracy trend.</div>';
    var root = document.getElementById('view-root');
    var W = Math.max(280, Math.min(900, (root ? root.clientWidth : 900) - 80));
    var H = 220, L = 42, R = 16, T = 16, B = 30;
    var iw = W - L - R;
    var ih = H - T - B;
    function x(i) { return L + (i * iw) / (runs.length - 1); }
    function y(p) { return T + ih - (p / 100) * ih; }

    var grid = [0, 50, 100].map(function (p) {
      return '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(p) + '" y2="' + y(p) + '"/>' +
        '<text class="axis" x="' + (L - 8) + '" y="' + (y(p) + 4) + '" text-anchor="end">' + p + '%</text>';
    }).join('');
    var target = '<line class="target" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(TARGET_PCT) + '" y2="' + y(TARGET_PCT) + '"/>' +
      '<text class="axis target-label" x="' + (L - 8) + '" y="' + (y(TARGET_PCT) + 4) + '" text-anchor="end">' + TARGET_PCT + '%</text>';
    var pts = runs.map(function (r, i) { return { x: x(i), y: y(pct(r.correct, r.answered)), r: r }; });
    var line = '<polyline class="trend-line" points="' + pts.map(function (p) { return p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(' ') + '"/>';
    var dots = pts.map(function (p) {
      var tip = fmtWhen(p.r.startedAt) + ' · ' + p.r.label + ' · ' + p.r.correct + '/' + p.r.answered + ' (' + pct(p.r.correct, p.r.answered) + '%)';
      return '<g class="pt" data-tip="' + escapeAttr(tip) + '">' +
        '<circle class="trend-hit" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="14"/>' +
        '<circle class="trend-dot" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="4"/>' +
        '</g>';
    }).join('');
    var last = pts[pts.length - 1];
    var lastLabel = '<text class="direct-label" x="' + (last.x - 8) + '" y="' + (last.y < T + 18 ? last.y + 20 : last.y - 10) + '" text-anchor="end">' + pct(last.r.correct, last.r.answered) + '%</text>';
    var xLabels = '<text class="axis" x="' + L + '" y="' + (H - 8) + '">' + fmtDate(runs[0].startedAt) + '</text>' +
      '<text class="axis" x="' + (W - R) + '" y="' + (H - 8) + '" text-anchor="end">' + fmtDate(last.r.startedAt) + '</text>';

    return '<div class="trend-wrap"><svg class="trend" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Accuracy of your last ' + runs.length + ' runs">' +
      grid + target + line + dots + lastLabel + xLabels + '</svg></div>';
  }

  function renderPersonalBests() {
    var runs = STATS.runs;
    if (!runs.length) return '<div class="empty-mini">No runs yet &mdash; go answer some questions!</div>';
    function best(list, score) {
      var top = null;
      list.forEach(function (r) { if (!top || score(r) > score(top)) top = r; });
      return top;
    }
    var bestAcc = best(runs.filter(function (r) { return r.answered >= 10; }), function (r) { return r.correct / r.answered + r.answered / 1e6; });
    var bestCombo = best(runs, function (r) { return r.bestCombo; });
    var mostAnswered = best(runs, function (r) { return r.answered; });
    var mostXp = best(runs, function (r) { return r.xp; });
    var bestDayKey = null;
    Object.keys(STATS.days).forEach(function (k) { if (!bestDayKey || STATS.days[k].answered > STATS.days[bestDayKey].answered) bestDayKey = k; });

    function row(icon, label, value, when) {
      return '<div class="pb-row"><span class="pb-icon">' + icon + '</span><span class="pb-label">' + label + '</span><span class="pb-val">' + value + '</span><span class="pb-when">' + when + '</span></div>';
    }
    return '<div class="pb-list">' +
      (bestAcc ? row('🎯', 'Best accuracy (10+ Qs)', pct(bestAcc.correct, bestAcc.answered) + '%', escapeHtml(bestAcc.label) + ' · ' + fmtDate(bestAcc.startedAt)) : row('🎯', 'Best accuracy (10+ Qs)', '—', 'answer 10+ in one run')) +
      row('🔥', 'Longest combo', bestCombo.bestCombo, escapeHtml(bestCombo.label) + ' · ' + fmtDate(bestCombo.startedAt)) +
      row('📈', 'Most answered in a run', mostAnswered.answered, escapeHtml(mostAnswered.label) + ' · ' + fmtDate(mostAnswered.startedAt)) +
      row('✨', 'Most XP in a run', '+' + mostXp.xp, escapeHtml(mostXp.label) + ' · ' + fmtDate(mostXp.startedAt)) +
      (bestDayKey ? row('📅', 'Biggest day', STATS.days[bestDayKey].answered + ' Qs', fmtDate(new Date(bestDayKey + 'T12:00:00').getTime())) : '') +
      '</div>';
  }

  function renderMostMissed() {
    var list = getWeakList().slice(0, 5);
    if (!list.length) return '<div class="empty-mini">Nothing here yet. Questions you get wrong will be ranked here.</div>';
    return '<ol class="mm-list">' + list.map(function (x) {
      return '<li><div class="mm-top">' + heatChip(x.st) + '<span class="mm-cat">' + escapeHtml(x.q.category) + '</span></div>' +
        '<div class="mm-q">#' + x.q.number + ' — ' + escapeHtml(snippet(x.q, 110)) + '</div></li>';
    }).join('') + '</ol>' +
      '<button class="btn primary small" data-action="new" data-cat="@weak">🩹 Drill weak spots</button>';
  }

  function renderDomainBars(cats) {
    var rows = buildCategoryList().map(function (c) {
      var cs = cats.get(c.name);
      return { name: c.name, cs: cs, acc: cs.attempts ? pct(cs.correct, cs.attempts) : null };
    });
    rows.sort(function (a, b) {
      if (a.acc === null || b.acc === null) return (a.acc === null) - (b.acc === null);
      return a.acc - b.acc;
    });
    return rows.map(function (r) {
      var status = statusFor(r.acc);
      var tip = r.name + ': ' + (r.acc === null ? 'not started' : r.acc + '% accuracy over ' + r.cs.attempts + ' answers') + ' · ' + r.cs.seen + '/' + r.cs.total + ' questions seen';
      return '<div class="dm-row">' +
        '<div class="dm-name">' + escapeHtml(r.name) +
        '<div class="dm-sub">' + r.cs.seen + '/' + r.cs.total + ' seen' +
        (r.cs.weak ? ' &middot; <button class="weak-link" data-action="weak-filter" data-cat="' + escapeAttr(r.name) + '">🩹 ' + r.cs.weak + ' weak</button>' : '') + '</div>' +
        '</div>' +
        '<div class="dm-bar" data-tip="' + escapeAttr(tip) + '"><span class="' + status.cls + '" style="width:' + (r.acc || 0) + '%"></span><i class="dm-target" style="left:' + TARGET_PCT + '%"></i></div>' +
        '<div class="dm-val"><b>' + (r.acc === null ? '—' : r.acc + '%') + '</b><span class="status-chip ' + status.cls + '">' + status.label + '</span></div>' +
        '</div>';
    }).join('');
  }

  function renderHeatmap() {
    var weeks = 17;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var start = new Date(today);
    start.setDate(start.getDate() - today.getDay() - (weeks - 1) * 7);
    var cells = '';
    for (var d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
      var day = STATS.days[dayKey(d.getTime())];
      var n = day ? day.answered : 0;
      var lvl = n === 0 ? 0 : n < 10 ? 1 : n < 25 ? 2 : n < 50 ? 3 : 4;
      var tip = fmtDate(d.getTime()) + ': ' + (n ? n + ' answered · ' + pct(day.correct, n) + '% correct' : 'no practice');
      cells += '<span class="hm-cell l' + lvl + '" data-tip="' + escapeAttr(tip) + '"></span>';
    }
    return '<div class="heatmap-wrap"><div class="heatmap">' + cells + '</div>' +
      '<div class="hm-legend">Less <span class="hm-cell l0"></span><span class="hm-cell l1"></span><span class="hm-cell l2"></span><span class="hm-cell l3"></span><span class="hm-cell l4"></span> More</div></div>';
  }

  function renderBadges() {
    return '<div class="badge-grid">' + BADGES.map(function (b) {
      var at = STATS.badges[b.id];
      return '<div class="badge' + (at ? ' unlocked' : '') + '">' +
        '<div class="badge-icon">' + (at ? b.icon : '🔒') + '</div>' +
        '<div class="badge-name">' + b.name + '</div>' +
        '<div class="badge-desc">' + b.desc + '</div>' +
        (at ? '<div class="badge-when">' + fmtDate(at) + '</div>' : '') +
        '</div>';
    }).join('') + '</div>';
  }

  function renderHistory() {
    if (!STATS.runs.length) return '<div class="empty-mini">No runs logged yet. Each time you practice, a row is added here.</div>';
    var bestAccRun = null;
    STATS.runs.forEach(function (r) {
      if (r.answered < 10) return;
      if (!bestAccRun || r.correct / r.answered > bestAccRun.correct / bestAccRun.answered) bestAccRun = r;
    });
    var rows = STATS.runs.slice(-50).reverse().map(function (r) {
      var acc = pct(r.correct, r.answered);
      var status = statusFor(acc);
      var missedCount = (r.missed || []).length;
      return '<tr>' +
        '<td class="nowrap">' + fmtWhen(r.startedAt) + '</td>' +
        '<td>' + escapeHtml(r.label) + (r.completedSet ? ' <span class="mini-tag">set done</span>' : '') + (r.perfect ? ' <span class="mini-tag good">flawless</span>' : '') + '</td>' +
        '<td class="num">' + r.correct + '/' + r.answered + '</td>' +
        '<td class="num"><span class="acc-cell ' + status.cls + '">' + acc + '%</span>' + (r === bestAccRun ? ' 🏅' : '') + '</td>' +
        '<td class="num">🔥 ' + r.bestCombo + '</td>' +
        '<td class="num nowrap">' + fmtDuration(r.lastAt - r.startedAt) + '</td>' +
        '<td class="num">+' + r.xp + '</td>' +
        '<td>' + (missedCount ? '<button class="btn ghost small" data-action="retry-run" data-run="' + r.startedAt + '">Retry ' + missedCount + ' missed</button>' : '') + '</td>' +
        '</tr>';
    }).join('');
    return '<div class="table-wrap"><table class="history">' +
      '<thead><tr><th>When</th><th>Mode</th><th class="num">Score</th><th class="num">Accuracy</th><th class="num">Combo</th><th class="num">Time</th><th class="num">XP</th><th></th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' +
      (STATS.runs.length > 50 ? '<div class="panel-note">Showing the latest 50 runs.</div>' : '');
  }

  // ---------- render: weak spots ----------
  function renderWeak() {
    CURRENT.screen = 'weak';
    setActiveNav('weak');
    var tab = CURRENT.weakTab;
    var cat = CURRENT.weakCat;
    var lists = { weak: getWeakList(), flagged: getFlaggedList(), cleared: getClearedList() };
    var list = lists[tab] || lists.weak;
    var catCounts = new Map();
    list.forEach(function (x) { catCounts.set(x.q.category, (catCounts.get(x.q.category) || 0) + 1); });
    if (cat !== 'ALL' && !catCounts.has(cat)) cat = 'ALL';
    var shown = cat === 'ALL' ? list : list.filter(function (x) { return x.q.category === cat; });
    var drillCount = getDrillPool().length;

    var topDomains = Array.from(categoryStats().entries())
      .filter(function (e) { return e[1].weak > 0; })
      .sort(function (a, b) { return b[1].weak - a[1].weak; })
      .slice(0, 3);

    function tabBtn(key, label) {
      return '<button class="tab' + (tab === key ? ' active' : '') + '" data-action="weak-tab" data-tab="' + key + '">' + label + ' <span class="tab-count">' + lists[key].length + '</span></button>';
    }

    var html = '<div class="page-head"><h1>Weak Spots</h1>' +
      '<p>Questions you keep getting wrong, ranked by how many times you\'ve missed them &mdash; built from every answer you\'ve given across all runs. A question is cleared once you answer it correctly ' + MASTER_STREAK + '&times; in a row, and comes back if you miss it again.</p></div>';

    html += '<div class="drill-cta">' +
      '<div><div class="title">🩹 Drill your weak spots</div>' +
      '<div class="sub">' + (drillCount ? Math.min(DRILL_SIZE, drillCount) + ' questions, most-missed first (shuffled). Includes flagged questions.' : 'Nothing to drill yet &mdash; nice!') +
      (topDomains.length ? '<div class="top-domains">Weakest domains: ' + topDomains.map(function (e) {
        return '<button class="weak-link" data-action="weak-filter" data-cat="' + escapeAttr(e[0]) + '">' + escapeHtml(e[0]) + ' (' + e[1].weak + ')</button>';
      }).join(' ') + '</div>' : '') +
      '</div></div>' +
      '<button class="btn primary" data-action="new" data-cat="@weak"' + (drillCount ? '' : ' disabled') + '>Start drill</button>' +
      '</div>';

    html += '<div class="weak-toolbar">' +
      '<div class="tabs">' + tabBtn('weak', 'Weak') + tabBtn('flagged', 'Flagged') + tabBtn('cleared', 'Cleared') + '</div>' +
      '<div class="weak-filters">' +
      '<select id="weak-cat-select" aria-label="Filter by domain">' +
      '<option value="ALL">All domains (' + list.length + ')</option>' +
      buildCategoryList().filter(function (c) { return catCounts.has(c.name); }).map(function (c) {
        return '<option value="' + escapeAttr(c.name) + '"' + (c.name === cat ? ' selected' : '') + '>' + escapeHtml(c.name) + ' (' + catCounts.get(c.name) + ')</option>';
      }).join('') +
      '</select>' +
      (shown.length ? '<button class="btn small" data-action="drill-shown">Drill these ' + Math.min(shown.length, 50) + '</button>' : '') +
      '</div>' +
      '</div>';

    if (!shown.length) {
      var empty = {
        weak: 'No weak spots right now. Miss a question and it will show up here, ranked by how often you miss it.',
        flagged: 'No flagged questions. Press ⚑ Flag (or the F key) during a quiz to save a question you want to revisit, like a lucky guess.',
        cleared: 'Nothing cleared yet. Answer a weak spot correctly ' + MASTER_STREAK + '&times; in a row to clear it.',
      };
      html += '<div class="empty-mini big">' + empty[tab] + '</div>';
    } else {
      html += '<div class="weak-list">' + shown.map(function (x, i) { return renderWeakItem(x, i + 1, tab); }).join('') + '</div>';
    }

    document.getElementById('view-root').innerHTML = html;
    renderTopbarStats();
  }

  function renderWeakItem(x, rank, tab) {
    var q = x.q;
    var st = x.st;
    var letters = ['A', 'B', 'C', 'D'];
    var opts = letters.map(function (L) {
      var cls = L === q.correct_answer ? 'correct' : L === st.lastPick ? 'incorrect' : 'dim';
      var tag = L === q.correct_answer ? '<span class="wo-tag good">correct</span>' : L === st.lastPick ? '<span class="wo-tag bad">your last wrong pick</span>' : '';
      return '<div class="option static ' + cls + '"><span class="opt-letter">' + L + '</span><span class="opt-text">' + renderRichText(q.options[L]) + tag + '</span></div>';
    }).join('');
    var progress = st.wrong > 0 && tab !== 'cleared' ? '<span class="clear-progress" title="Correct answers in a row toward clearing">' + Math.min(st.streak, MASTER_STREAK) + '/' + MASTER_STREAK + ' to clear</span>' : '';
    return '<details class="weak-item">' +
      '<summary>' +
      '<span class="wi-rank">' + rank + '</span>' +
      '<span class="wi-main">' +
      '<span class="wi-top">' + (st.wrong ? heatChip(st) : '') +
      '<span class="q-hist">✓ ' + st.correct + ' &nbsp;✗ ' + st.wrong + ' &middot; ' + (st.seen ? Math.round(accuracyOf(st) * 100) + '%' : 'not answered') + '</span>' +
      progress +
      (st.flagged ? '<span class="flag-mini">⚑</span>' : '') +
      '<span class="wi-cat">' + escapeHtml(q.category) + '</span></span>' +
      '<span class="wi-q">#' + q.number + ' — ' + escapeHtml(snippet(q, 160)) + '</span>' +
      (st.lastWrongAt ? '<span class="wi-when">Last missed ' + fmtWhen(st.lastWrongAt) + '</span>' : '') +
      '</span>' +
      '</summary>' +
      '<div class="wi-body">' +
      '<div class="question-text">' + renderRichText(q.question) + '</div>' +
      '<div class="options">' + opts + '</div>' +
      '<div class="explanation">' + renderRichText(q.explanation || '') + '</div>' +
      (q.tips && q.tips.length ?
        '<div class="tips-block"><div class="tips-title">Study tips</div><ul class="tips-list">' +
        q.tips.map(function (t, i) { return '<li><span class="tip-num">Tip ' + (i + 1) + '</span><span>' + renderRichText(t) + '</span></li>'; }).join('') +
        '</ul></div>' : '') +
      '<div class="wi-actions"><button class="btn ghost small" data-action="flag" data-q="' + q.number + '">⚑ ' + (st.flagged ? 'Unflag' : 'Flag') + '</button></div>' +
      '</div>' +
      '</details>';
  }

  function currentWeakShown() {
    var lists = { weak: getWeakList, flagged: getFlaggedList, cleared: getClearedList };
    var list = (lists[CURRENT.weakTab] || getWeakList)();
    return CURRENT.weakCat === 'ALL' ? list : list.filter(function (x) { return x.q.category === CURRENT.weakCat; });
  }

  // ---------- topbar / footer ----------
  function renderTopbarStats() {
    var el = document.getElementById('topbar-stats');
    if (el) {
      var lvl = levelFromXp(STATS.xp);
      el.innerHTML = '<span class="lvl-chip" title="' + escapeAttr(levelTitle(lvl)) + '">Lv ' + lvl + '</span>' +
        '<span title="Day streak">🔥 <b>' + currentDayStreak() + '</b></span>' +
        '<span><b>' + fmt(STATS.xp) + '</b> XP</span>';
    }
    var count = document.getElementById('nav-weak-count');
    if (count) {
      var n = getWeakList().length;
      count.textContent = n ? n : '';
      count.style.display = n ? '' : 'none';
    }
  }

  function renderFooter() {
    var el = document.getElementById('footer-meta');
    if (!el) return;
    var corrected = DATA.questions.filter(function (q) { return q.was_corrected; }).length;
    el.textContent = DATA.questions.length + ' questions processed · ' + corrected + ' answer(s) corrected after independent verification · CEH v13 domains';
  }

  // ---------- backup ----------
  function exportBackup() {
    var payload = { app: 'ceh-quiz', exportedAt: new Date().toISOString(), progress: PROGRESS, stats: STATS };
    var blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'ceh-quiz-backup-' + dayKey(Date.now()) + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  function importBackup(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var data;
      try {
        data = JSON.parse(reader.result);
      } catch (e) {
        data = null;
      }
      var valid = data && data.stats && data.progress &&
        typeof data.stats === 'object' && typeof data.progress === 'object' &&
        !Array.isArray(data.stats) && !Array.isArray(data.progress);
      if (!valid || (window.CEHStore && !window.CEHStore.valid(data))) {
        toast('<span class="t-icon">⚠️</span><div><b>Not a valid quiz backup</b></div>', 'bad');
        return;
      }
      if (!confirm('Replace your current progress and scoreboard with this backup from ' + (data.exportedAt ? fmtDate(Date.parse(data.exportedAt)) : 'an unknown date') + '?')) return;
      if (window.CEHProgress) window.CEHProgress.backup('Before importing a quiz backup');
      PROGRESS = data.progress || {};
      STATS = normalizeStats(data.stats);
      STATS.migrated = true;
      saveProgress();
      saveStats();
      renderScoreboard();
      toast('<span class="t-icon">✅</span><div><b>Backup restored</b></div>', 'info');
    };
    reader.readAsText(file);
  }

  // ---------- events ----------
  function handleGlobalClick(e) {
    var toastEl = e.target.closest('.toast');
    if (toastEl) {
      toastEl.remove();
      return;
    }
    var btn = e.target.closest('[data-action]');
    if (!btn || btn.disabled) return;
    var action = btn.dataset.action;
    if (window.CEHProgress && window.CEHProgress.isBlocked()) return;
    var cat = btn.dataset.cat;
    if (btn.tagName === 'A') e.preventDefault();
    switch (action) {
      case 'start':
      case 'resume':
        if (getOrCreateSession(cat)) goToQuiz(cat);
        break;
      case 'new':
        resetSession(cat);
        if (getOrCreateSession(cat)) {
          leaveCurrentScreen();
          goToQuiz(cat);
        } else {
          toast('<span class="t-icon">🎉</span><div><b>Nothing to drill</b><div>Your Weak Spots list is empty.</div></div>', 'info');
        }
        break;
      case 'reset': {
        var label = labelFor(cat);
        if (confirm('Reset progress for "' + label + '"? This cannot be undone. (Your scoreboard and weak spots are kept.)')) {
          resetSession(cat);
          renderHome();
        }
        break;
      }
      case 'answer':
        handleAnswer(btn.dataset.letter);
        break;
      case 'next':
        handleNext();
        break;
      case 'pause':
      case 'home':
        navigate('home');
        break;
      case 'nav':
        navigate(btn.dataset.view);
        break;
      case 'restart':
        handleRestart(cat);
        break;
      case 'retry-missed': {
        var s = PROGRESS[cat];
        if (s) startRetry(s.order.filter(function (n) { return s.answers[n] && !s.answers[n].correct; }));
        break;
      }
      case 'retry-run': {
        var run = findRun(btn.dataset.run);
        if (run) startRetry(run.missed || []);
        break;
      }
      case 'flag':
        toggleFlag(Number(btn.dataset.q));
        if (CURRENT.screen === 'quiz') renderQuiz();
        else if (CURRENT.screen === 'weak') renderWeak();
        break;
      case 'weak-tab':
        CURRENT.weakTab = btn.dataset.tab;
        CURRENT.weakCat = 'ALL';
        renderWeak();
        break;
      case 'weak-filter':
        CURRENT.weakTab = 'weak';
        CURRENT.weakCat = cat;
        navigate('weak');
        break;
      case 'drill-shown':
        startRetry(currentWeakShown().slice(0, 50).map(function (x) { return x.q.number; }));
        break;
      case 'export':
        exportBackup();
        break;
      case 'import':
        document.getElementById('import-file').click();
        break;
      case 'reset-stats':
        if (confirm('Reset the whole scoreboard? This clears XP, levels, run history, badges and your Weak Spots list. Category progress is kept. This cannot be undone.')) {
          STATS = freshStats();
          STATS.migrated = true;
          saveStats();
          renderScoreboard();
        }
        break;
    }
  }

  function handleGlobalChange(e) {
    if (e.target.id === 'weak-cat-select') {
      CURRENT.weakCat = e.target.value;
      renderWeak();
    } else if (e.target.id === 'import-file') {
      if (e.target.files && e.target.files[0]) importBackup(e.target.files[0]);
      e.target.value = '';
    }
  }

  function handleGlobalKeydown(e) {
    if (window.CEHProgress && window.CEHProgress.isBlocked()) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (e.key === 'Enter' && tag === 'BUTTON') return;
    if (CURRENT.screen !== 'quiz' || !CURRENT.catKey) return;
    var session = PROGRESS[CURRENT.catKey];
    if (!session) return;
    var qNum = session.order[session.currentIndex];
    if (qNum === undefined) return;
    var key = ({ '1': 'A', '2': 'B', '3': 'C', '4': 'D' })[e.key] || e.key.toUpperCase();
    if (['A', 'B', 'C', 'D'].includes(key)) {
      if (!session.answers[qNum]) handleAnswer(key);
    } else if (key === 'F') {
      toggleFlag(qNum);
      renderQuiz();
    } else if (e.key === 'Enter' || e.key === 'ArrowRight') {
      if (session.answers[qNum]) handleNext();
    }
  }

  // Another tab saved progress: adopt it so this tab's stale copy never overwrites it.
  function handleStorage(e) {
    if (window.CEHProgress && e.type === 'storage') return;
    if (e.key !== STORAGE_KEY && e.key !== STATS_KEY && e.key !== null) return;
    PROGRESS = loadProgress();
    STATS = loadStats();
    if (CURRENT.screen === 'quiz' && PROGRESS[CURRENT.catKey]) renderQuiz();
    else if (CURRENT.screen === 'scoreboard') renderScoreboard();
    else if (CURRENT.screen === 'weak') renderWeak();
    else if (CURRENT.screen === 'home' || CURRENT.screen === 'quiz') renderHome();
    else renderTopbarStats();
  }

  var resizeTimer = null;
  function handleResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (CURRENT.screen === 'scoreboard') renderScoreboard();
    }, 200);
  }

  document.addEventListener('click', handleGlobalClick);
  document.addEventListener('change', handleGlobalChange);
  document.addEventListener('keydown', handleGlobalKeydown);
  document.addEventListener('mouseover', handleTipOver);
  window.addEventListener('scroll', hideTip, true);
  window.addEventListener('resize', handleResize);
  window.addEventListener('storage', handleStorage);
  window.addEventListener('ceh-progress-changed', function () { handleStorage({key:null}); });
  window.addEventListener('ceh-save-state', function (e) {
    document.getElementById('app').classList.toggle('sync-blocked', e.detail.blocked);
    document.getElementById('view-root').inert = e.detail.blocked;
  });

  // ---------- init ----------
  if (window.CEHProgress && window.CEHProgress.isBlocked()) {
    document.getElementById('app').classList.add('sync-blocked');
    document.getElementById('view-root').inert = true;
  } else {
    migrateFromProgress();
    if (STATS.activeRun) endRun();
  }
  renderFooter();
  renderHome();
  celebrate();
})();
