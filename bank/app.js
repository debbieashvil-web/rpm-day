/* The Self Love Bank Game. Today comes from plan.json. This Week comes from week.json.
   Taps stay on this phone. MUSIC_APP_URL is the music app link. An empty value stays on this page. */
var MUSIC_APP_URL = "https://debbieashvil-web.github.io/rpm-day/music/";

(function () {
  "use strict";
  var me = document.currentScript;
  var PLAN_URL = (me && me.getAttribute("data-plan")) || "plan.json";
  var WEEK_URL = (me && me.getAttribute("data-week")) || "week.json";
  var ASSET = (me && me.getAttribute("data-asset")) || "";
  var SW_URL = me && me.getAttribute("data-sw");
  var CHECKS = "slb.planchecks.v1";

  var L, ART, state, plan, week;
  var ui = {
    tab: "today",
    domainId: "",
    customOpen: false,
    customDraft: { label: "", points: "10", domainId: "home", repeat: false }
  };
  var dropQ = [];
  var dropping = false;

  function $(id) { return document.getElementById(id); }
  function esc(t) {
    return String(t == null ? "" : t).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function now() { return new Date(); }
  function art(id) {
    var p = (ART && ART[id]) || "";
    return p ? ASSET + p : "";
  }
  function coinStack(dom) {
    if (!dom) return "";
    return '<span class="stack"><span class="bd">' + esc(dom.name) + '</span><span class="sub">' + esc(dom.coin) + "</span></span>";
  }
  function miniArt(dom) {
    if (!dom) return "";
    return '<span class="miniwrap"><img class="mini" alt="" src="' + esc(art(dom.id)) + '"><i class="enamel" style="background:' + esc(dom.enamel || "#C9973E") + '"></i></span>';
  }
  function tasksFor(id) {
    var list = [];
    Object.keys(SLB.byId).forEach(function (k) {
      if (SLB.byId[k].domainId === id) list.push(SLB.byId[k]);
    });
    state.customTasks.forEach(function (t) { if (t.domainId === id) list.push(t); });
    var rank = { daily: 0, weekly_or_occasional: 1, progress: 2 };
    return list.sort(function (a, b) {
      return (rank[a.cadence] || 0) - (rank[b.cadence] || 0);
    });
  }
  function taskById(id) {
    if (SLB.byId[id]) return SLB.byId[id];
    for (var i = 0; i < state.customTasks.length; i++) if (state.customTasks[i].id === id) return state.customTasks[i];
    return null;
  }
  function fullest() {
    var best = L.DOMAINS[0].id, pct = -1;
    L.DOMAINS.forEach(function (d) {
      var p = (state.meters[d.id] || 0) / d.fill;
      if (p > pct) { pct = p; best = d.id; }
    });
    return best;
  }
  function readChecks() {
    try { return JSON.parse(localStorage.getItem(CHECKS) || "{}"); } catch (e) { return {}; }
  }
  function writeChecks(map) { localStorage.setItem(CHECKS, JSON.stringify(map)); }
  function awardsFor(label, domainId) {
    var ids = [];
    if (domainId && L.domain(domainId)) ids.push(domainId);
    L.domainsInLabel(label).forEach(function (id) {
      if (ids.indexOf(id) < 0) ids.push(id);
    });
    var out = [];
    ids.forEach(function (id) {
      var points = L.catalogPoints(id, label, SLB.byId);
      if (points > 0) out.push({ domainId: id, points: points, label: L.coinLabel(id) });
    });
    return out;
  }
  function showLabel(label) {
    return String(label || "").replace(/\s*\(([^)]*)\)\s*$/, function (full, inner) {
      return L.domainsInLabel(inner).length ? "" : full;
    }).replace(/\s{2,}/g, " ").trim();
  }
  function itemDone(day, item) {
    if (awardsFor(item.label, item.domainId).length) return L.planItemOn(state, day, item.id);
    var bag = readChecks()[day] || {};
    return !!bag[item.id];
  }
  function toggleItem(day, item) {
    var domains = awardsFor(item.label, item.domainId);
    if (domains.length) {
      commit(L.togglePlanItem(state, { id: item.id, day: day, label: showLabel(item.label), domains: domains }));
      return;
    }
    var all = readChecks();
    all[day] = all[day] || {};
    all[day][item.id] = !all[day][item.id];
    if (!all[day][item.id]) delete all[day][item.id];
    writeChecks(all);
    render();
  }
  function prettyDate(key) {
    var p = String(key || "").split("-");
    if (p.length < 3) return "";
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  }
  function capture() {
    var b = document.querySelector("[data-custom-label]");
    if (b) ui.customDraft.label = b.value;
    var c = document.querySelector("[data-custom-points]");
    if (c) ui.customDraft.points = c.value;
  }
  function commit(result) {
    SLB.save(state);
    render();
    if (result && result.dropped && result.dropped.length) playDrops(result.dropped);
  }
  function render() {
    var titles = { today: "Today", bank: "Bank", week: "This Week" };
    var subs = {
      today: plan ? [prettyDate(plan.date), plan.tag].filter(Boolean).join(" · ") : "The day plan will show here.",
      bank: "Coins you earn stay here.",
      week: week ? [week.title, week.tag].filter(Boolean).join(" · ") : "A week shows up when it is written."
    };
    $("h1").textContent = titles[ui.tab] || "Today";
    $("sub").textContent = subs[ui.tab] || "";
    document.querySelectorAll("#tabs button").forEach(function (b) {
      b.setAttribute("aria-selected", b.getAttribute("data-tab") === ui.tab ? "true" : "false");
    });
    $("main").innerHTML = ui.tab === "bank" ? renderBank(now()) : ui.tab === "week" ? renderWeek() : renderToday();
    var last = null;
    for (var i = state.entries.length - 1; i >= 0; i--) if (!state.entries[i].undone) { last = state.entries[i]; break; }
    var undo = $("undo");
    if (last) {
      undo.hidden = false;
      undo.innerHTML = '<button type="button" data-undo>Undo · ' + esc(last.label) + "</button>";
    } else undo.hidden = true;
  }

  function mustListSection(sec, source) {
    var nameKey = String(sec && sec.name || "").toLowerCase().replace(/[^a-z]/g, "");
    return nameKey === "musts" && (source.musts || []).some(function (m) { return m && m.label; });
  }
  function planRows(source) {
    var rows = [];
    (source.musts || []).forEach(function (m, i) {
      if (!m || !m.label) return;
      rows.push({ id: "must-" + i, time: "", label: m.label, domainId: m.domainId || "", group: "Musts" });
    });
    (source.sections || []).forEach(function (sec) {
      if (mustListSection(sec, source)) return;
      (sec.items || []).forEach(function (it) {
        rows.push({ id: it[0], time: it[1] || "", label: it[2] || "", domainId: "", group: sec.name || "Plan" });
      });
    });
    return rows;
  }
  function planButton(item, day) {
    var domains = awardsFor(item.label, item.domainId);
    var on = itemDone(day, item);
    var pts = 0;
    domains.forEach(function (d) { pts += d.points; });
    var bits = [];
    if (item.time) bits.push(item.time);
    domains.forEach(function (d) { bits.push(d.label); });
    var html = '<button type="button" class="task' + (domains.length ? " has-art" : " has-box") + (on ? " on" : "") + '" data-plan-item="' + esc(item.id) + '" data-day="' + esc(day) + '" data-label="' + esc(item.label) + '" data-plan-domain="' + esc(item.domainId || "") + '">';
    if (domains.length) html += miniArt(L.domain(domains[0].domainId));
    else html += '<span class="box"></span>';
    html += "<b>" + esc(showLabel(item.label)) + "</b>";
    html += '<span class="pts">' + (pts ? (on ? "✓ +" + pts : "+" + pts) : (on ? "✓" : "")) + "</span>";
    html += '<span class="tag">' + esc(bits.join(" · ")) + "</span></button>";
    return html;
  }
  function musicCard() {
    var day = L.dayKey(now());
    var dom = L.domain("music-creativity");
    var html = '<section class="panel" data-music-card><p class="kicker">Music</p>';
    L.MUSIC_TAPS.forEach(function (tap) {
      var on = L.loggedToday(state, tap.id, day).length > 0;
      var blocked = !on && !L.musicTapFits(state, tap.id, day);
      html += '<button type="button" class="task has-art' + (on ? " on" : "") + (blocked ? " full" : "") + '" data-music-tap="' + esc(tap.id) + '">';
      html += miniArt(dom);
      html += "<b>" + esc(tap.label) + "</b>";
      html += '<span class="pts">' + (on ? "✓ +" : "+") + tap.points + "</span>";
      html += '<span class="tag">' + esc(blocked ? "Music full for today" : L.coinLabel(dom)) + "</span></button>";
    });
    if (L.musicCapped(state, day)) html += '<p class="hint" data-music-full>Music full for today</p>';
    if (MUSIC_APP_URL) html += '<a class="applink" href="' + esc(MUSIC_APP_URL) + '">Open music app</a>';
    else html += '<a class="applink" href="#music-app" data-music-app>Open music app</a>';
    html += "</section>";
    return html;
  }
  function renderToday() {
    if (!plan) {
      return '<section class="panel empty"><p class="kicker">Today</p><h2>No day plan yet</h2><p class="hint">Add a plan.json file and today will show up here.</p></section>' + musicCard();
    }
    var day = plan.date || L.dayKey(now());
    var rows = planRows(plan);
    var done = rows.filter(function (item) { return itemDone(day, item); }).length;
    var html = "";
    if (plan.result || plan.why) {
      html += '<section class="panel">';
      if (plan.result) {
        html += '<p class="kicker">Result</p><p class="lead">' + esc(plan.result) + "</p>";
      }
      if (plan.why) {
        if (plan.result) html += '<hr class="rule">';
        html += '<p class="kicker">Why</p><p class="copy">' + esc(plan.why) + "</p>";
      }
      html += "</section>";
    }
    if (rows.length) {
      var pct = Math.round(100 * done / rows.length);
      html += '<div class="meter" aria-hidden="true"><i style="width:' + pct + '%"></i></div>';
      html += '<p class="count">' + done + " of " + rows.length + " done</p>";
    }
    var seen = {};
    var musts = rows.filter(function (r) { return r.id.indexOf("must-") === 0; });
    if (musts.length) {
      html += '<section class="panel"><p class="kicker">Musts</p>';
      musts.forEach(function (item) { html += planButton(item, day); });
      html += "</section>";
    }
    (plan.sections || []).forEach(function (sec) {
      var items = (sec.items || []).map(function (it) {
        return { id: it[0], time: it[1] || "", label: it[2] || "", domainId: "" };
      });
      if (mustListSection(sec, plan)) return;
      if (!items.length || seen[sec.name]) return;
      seen[sec.name] = 1;
      html += '<section class="panel"><p class="kicker">' + esc(sec.name || "Plan") + "</p>";
      items.forEach(function (item) { html += planButton(item, day); });
      html += "</section>";
    });
    html += musicCard();
    return html;
  }

  function renderWeek() {
    if (!week || (!week.title && !week.result && !(week.days && week.days.length))) {
      return '<section class="panel empty"><p class="kicker">This week</p><h2>Nothing written for this week yet</h2><p class="hint">When a week.json file sits next to the day plan, the days will show up here.</p></section>';
    }
    var html = "";
    if (week.result || week.why) {
      html += '<section class="panel">';
      if (week.result) html += '<p class="kicker">Result</p><p class="lead">' + esc(week.result) + "</p>";
      if (week.why) {
        if (week.result) html += '<hr class="rule">';
        html += '<p class="kicker">Why</p><p class="copy">' + esc(week.why) + "</p>";
      }
      html += "</section>";
    }
    var mustDay = week.date || (week.days && week.days[0] && week.days[0].date) || L.dayKey(now());
    var musts = [];
    (week.musts || []).forEach(function (m, i) {
      if (m && m.label) musts.push({ id: "must-" + i, time: "", label: m.label, domainId: m.domainId || "" });
    });
    if (musts.length) {
      html += '<section class="panel"><p class="kicker">Musts</p>';
      musts.forEach(function (item) { html += planButton(item, mustDay); });
      html += "</section>";
    }
    (week.days || []).forEach(function (d) {
      var dayKey = d.date || mustDay;
      html += '<section class="panel"><p class="kicker">' + esc(d.title || d.dayName || "Day") + "</p>";
      if (d.date) html += '<p class="daydate">' + esc(prettyDate(d.date)) + "</p>";
      var dayMusts = [];
      (d.musts || []).forEach(function (m, i) {
        if (m && m.label) dayMusts.push({ id: "day-must-" + i, time: "", label: m.label, domainId: m.domainId || "" });
      });
      if (dayMusts.length) {
        html += '<p class="kicker">Musts</p>';
        dayMusts.forEach(function (item) { html += planButton(item, dayKey); });
      }
      (d.items || []).forEach(function (it) {
        html += planButton({ id: it[0], time: it[1] || "", label: it[2] || "", domainId: "" }, dayKey);
      });
      html += "</section>";
    });
    if (!(week.days && week.days.length) && !musts.length) {
      html += '<section class="panel empty"><p class="kicker">Days</p><h2>This week has no days yet</h2><p class="hint">Add a days list to week.json and they will show up here.</p></section>';
    }
    return html;
  }

  function taskButton(task, day) {
    var n = L.loggedToday(state, task.id, day).length;
    var on = !task.repeat && n > 0;
    var html = '<button type="button" class="task' + (on ? " on" : "") + '" data-task="' + esc(task.id) + '">';
    html += "<b>" + esc(task.label) + "</b>";
    html += '<span class="pts">' + (on ? "✓ +" : "+") + esc(task.points) + "</span>";
    var tag = on ? "In the coin" : (task.cadence === "progress" ? "A step counts" : "");
    if (task.repeat && n) tag = n + " today";
    if (task.note && !tag) tag = task.note;
    html += '<span class="tag">' + esc(tag) + "</span></button>";
    if (task.repeat && n) html += '<button type="button" class="undo-mini" data-undo-task="' + esc(task.id) + '">Undo one</button>';
    return html;
  }

  function renderBank(n) {
    var day = L.dayKey(n);
    if (!ui.domainId) ui.domainId = fullest();
    var html = '<div class="grid">';
    L.DOMAINS.forEach(function (d) {
      var meter = state.meters[d.id] || 0;
      var pct = Math.max(0, Math.min(100, Math.round(100 * meter / d.fill)));
      var kept = state.banked.filter(function (c) { return c.domainId === d.id; }).length;
      html += '<button type="button" class="coin' + (d.id === ui.domainId ? " on" : "") + '" data-domain="' + d.id + '" style="--p:' + pct + '">';
      html += '<span class="medallion"><span class="ring"></span><img src="' + esc(art(d.id)) + '" alt=""><i class="enamel" style="background:' + esc(d.enamel || "#C9973E") + '"></i></span>';
      html += '<span class="nm">' + coinStack(d) + "</span>";
      html += '<span class="frac">' + meter + " / " + d.fill + "</span>";
      if (kept) html += "<small>" + kept + " kept</small>";
      html += "</button>";
    });
    html += "</div>";
    html += musicCard();
    var dom = L.domain(ui.domainId);
    html += '<section class="panel" id="tasks"><div class="coinlet">' + miniArt(dom) + "<div><p class=\"kicker\">Coin</p><h2>" + esc(L.coinLabel(dom)) + "</h2></div></div>";
    html += '<p class="hint">' + esc(dom.meaning) + "</p>";
    var groups = { daily: [], weekly_or_occasional: [], progress: [] };
    tasksFor(dom.id).forEach(function (t) {
      if (t.kind === "bonus_coin") return;
      (groups[t.cadence] || groups.daily).push(t);
    });
    [["daily", "Daily"], ["weekly_or_occasional", "When it fits"], ["progress", "A step counts"]].forEach(function (g) {
      if (!groups[g[0]].length) return;
      html += '<div class="group"><h3>' + g[1] + "</h3>";
      groups[g[0]].forEach(function (t) { html += taskButton(t, day); });
      html += "</div>";
    });
    html += "</section>";
    html += '<section class="panel"><p class="kicker">Celebrations</p>';
    html += '<p class="hint">One tap banks a whole coin. Nothing is spent, and a quiet day changes nothing.</p>';
    ["body-milestone", "fin-card-paid-off", "fin-debt-milestone", "mus-finished-song"].forEach(function (id) {
      var t = SLB.byId[id];
      if (!t) return;
      var cd = L.domain(t.domainId);
      html += '<button type="button" class="bonus" data-bonus="' + id + '">' + miniArt(cd) + "<b>" + esc(t.label) + "</b>" + coinStack(cd) + "</button>";
    });
    html += "</section>";
    html += '<section class="panel"><button type="button" class="ghost" data-custom-open>' + (ui.customOpen ? "Close" : "Add a task of my own") + "</button>";
    if (ui.customOpen) {
      html += '<input class="field" data-custom-label maxlength="80" placeholder="The task, in your words" value="' + esc(ui.customDraft.label) + '">';
      html += '<input class="field" data-custom-points inputmode="numeric" min="1" max="200" value="' + esc(ui.customDraft.points) + '" aria-label="Points">';
      html += '<div class="chips">';
      L.DOMAINS.forEach(function (d) {
        html += '<button type="button" class="chip' + (d.id === ui.customDraft.domainId ? " on" : "") + '" data-custom-domain="' + d.id + '">' + esc(L.coinLabel(d)) + "</button>";
      });
      html += '</div><label class="check"><input type="checkbox" data-custom-repeat' + (ui.customDraft.repeat ? " checked" : "") + "> A step I may repeat</label>";
      html += '<button type="button" class="stamp" data-custom-save>Add it</button>';
    }
    html += "</section>";
    html += '<section class="tray"><p class="kicker">In the bank</p><h2>Kept coins</h2><p class="hint">They stay. A quiet day changes nothing.</p>';
    if (!state.banked.length) html += '<p class="hint">Your bank is ready. Coins land here and stay.</p>';
    else {
      html += '<div class="shelf">';
      state.banked.slice().reverse().forEach(function (c) {
        var domc = L.domain(c.domainId);
        html += '<div class="kept"><img src="' + esc(art(c.domainId)) + '" alt="">' + coinStack(domc) + '<span class="when">' + esc(L.prettyDay(c.day)) + (c.bonus ? "<br>celebration" : "") + "</span></div>";
      });
      html += "</div>";
    }
    html += "</section>";
    html += phoneBox();
    return html;
  }

  function phoneBox() {
    var html = '<section class="panel"><p class="kicker">This phone</p>';
    html += '<p class="hint">Taps stay on this phone. A save file is the way to move them.</p>';
    html += '<button type="button" class="ghost" data-export>Export save file</button>';
    html += '<button type="button" class="ghost" data-import-btn>Import save file</button>';
    if (L.canOfferSeed(state, "nov16")) {
      html += '<button type="button" class="stamp" data-seed>Import Nov 16 progress</button>';
      html += '<p class="hint">Points only, one time. Nothing banked yet.</p>';
      html += '<button type="button" class="ghost" data-seed-no>Not now</button>';
    }
    html += '<button type="button" class="ghost" data-install>Add to Home Screen</button>';
    html += '<p class="hint" id="installHint" hidden>On iPhone: Share, then Add to Home Screen.</p>';
    html += "</section>";
    return html;
  }

  function playDrops(list) {
    list.forEach(function (d) { dropQ.push(d); });
    pump();
  }
  function pump() {
    if (dropping || !dropQ.length) return;
    dropping = true;
    var d = dropQ.shift();
    var dom = L.domain(d.domainId);
    var veil = $("veil");
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    veil.classList.toggle("still", !!reduce);
    var extra = state.meters[d.domainId] > 0 ? state.meters[d.domainId] + " points started the next coin." : "";
    veil.innerHTML = '<div class="stage" role="status"><img class="falling" src="' + esc(art(d.domainId)) + '" alt="">' +
      '<div class="slot"></div>' +
      '<p class="fall-name">' + esc(L.coinLabel(dom)) + "</p>" +
      '<p class="fall-date">' + esc(L.prettyDay(d.day)) + "</p>" +
      (extra ? '<p class="fall-note">' + esc(extra) + "</p>" : "") +
      '<p class="fall-free">' + esc(L.CELEBRATE[d.domainId] || "") + "</p></div>";
    veil.hidden = false;
    var tabs = document.querySelector(".tabs");
    if (tabs) tabs.style.visibility = "hidden";
    if (navigator.vibrate && !reduce) navigator.vibrate(18);
    setTimeout(function () {
      veil.hidden = true;
      if (tabs) tabs.style.visibility = "";
      dropping = false;
      pump();
    }, reduce ? 1600 : 2600);
  }

  function onClick(ev) {
    if (!state) return;
    var el = ev.target.closest("button, a");
    if (!el) return;
    capture();
    var n = now();
    var day = L.dayKey(n);
    if (el.hasAttribute("data-music-app")) {
      ev.preventDefault();
      return;
    }
    if (el.hasAttribute("data-tab")) {
      ui.tab = el.getAttribute("data-tab");
      history.replaceState(null, "", "#" + ui.tab);
      render();
      window.scrollTo(0, 0);
      return;
    }
    if (el.hasAttribute("data-undo")) { L.undoLast(state); commit(); return; }
    if (el.hasAttribute("data-domain")) {
      ui.domainId = el.getAttribute("data-domain");
      render();
      var box = document.getElementById("tasks");
      if (box && box.scrollIntoView) box.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (el.hasAttribute("data-plan-item")) {
      toggleItem(el.getAttribute("data-day"), {
        id: el.getAttribute("data-plan-item"),
        label: el.getAttribute("data-label") || "",
        domainId: el.getAttribute("data-plan-domain") || ""
      });
      return;
    }
    if (el.hasAttribute("data-music-tap")) {
      commit(L.toggleMusic(state, el.getAttribute("data-music-tap"), { day: day, source: "music" }));
      return;
    }
    if (el.hasAttribute("data-task")) {
      var task = taskById(el.getAttribute("data-task"));
      if (!task) return;
      commit(L.toggleTask(state, task, { day: day, source: "task" }));
      return;
    }
    if (el.hasAttribute("data-undo-task")) {
      L.undoLatestForTask(state, el.getAttribute("data-undo-task"), day);
      commit();
      return;
    }
    if (el.hasAttribute("data-bonus")) {
      var bonus = SLB.byId[el.getAttribute("data-bonus")];
      if (bonus) commit(L.creditTask(state, bonus, { day: day, source: "bonus" }));
      return;
    }
    if (el.hasAttribute("data-custom-open")) { ui.customOpen = !ui.customOpen; render(); return; }
    if (el.hasAttribute("data-custom-domain")) { ui.customDraft.domainId = el.getAttribute("data-custom-domain"); render(); return; }
    if (el.hasAttribute("data-custom-save")) {
      var added = L.addCustom(state, {
        label: ui.customDraft.label,
        points: ui.customDraft.points,
        domainId: ui.customDraft.domainId,
        repeat: ui.customDraft.repeat
      });
      if (added) {
        ui.domainId = added.domainId;
        ui.customDraft.label = "";
        ui.customOpen = false;
        commit();
      }
      return;
    }
    if (el.hasAttribute("data-export")) {
      var blob = new Blob([JSON.stringify(L.exportBundle(state), null, 2)], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "self-love-bank.json";
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
      return;
    }
    if (el.hasAttribute("data-import-btn")) { var f = $("importFile"); if (f) f.click(); return; }
    if (el.hasAttribute("data-seed")) {
      fetch(ASSET + "seed-nov16.json").then(function (r) { return r.json(); }).then(function (seed) {
        var res = L.applySeed(state, seed);
        if (res.ok) commit();
      });
      return;
    }
    if (el.hasAttribute("data-seed-no")) { L.declineSeed(state, "nov16"); commit(); return; }
    if (el.hasAttribute("data-install")) {
      var hint = $("installHint");
      if (hint) hint.hidden = !hint.hidden;
    }
  }

  function onInput(ev) {
    var t = ev.target;
    if (t.hasAttribute("data-custom-label")) ui.customDraft.label = t.value;
    if (t.hasAttribute("data-custom-points")) ui.customDraft.points = t.value;
  }
  function onChange(ev) {
    if (ev.target.hasAttribute("data-custom-repeat")) ui.customDraft.repeat = ev.target.checked;
  }

  document.getElementById("main").addEventListener("click", onClick);
  document.getElementById("undo").addEventListener("click", onClick);
  document.getElementById("tabs").addEventListener("click", onClick);
  document.getElementById("main").addEventListener("input", onInput);
  document.getElementById("main").addEventListener("change", onChange);
  document.getElementById("importFile").addEventListener("change", function (ev) {
    var t = ev.target;
    if (!t.files || !t.files[0] || !state) return;
    var reader = new FileReader();
    reader.onload = function () {
      var parsed;
      try { parsed = JSON.parse(reader.result); } catch (e) { parsed = null; }
      var res = L.importBundle(parsed);
      t.value = "";
      if (!res.ok) return;
      state = res.state;
      commit();
    };
    reader.readAsText(t.files[0]);
  });
  document.getElementById("veil").addEventListener("click", function () {
    $("veil").hidden = true;
    var tabs = document.querySelector(".tabs");
    if (tabs) tabs.style.visibility = "";
    dropping = false;
    dropQ = [];
  });

  var start = location.hash.replace("#", "");
  if (start === "bank" || start === "week" || start === "today") ui.tab = start;

  function loadJson(url) {
    return fetch(url + (url.indexOf("?") >= 0 ? "&" : "?") + Date.now()).then(function (r) {
      if (!r.ok) throw new Error("missing");
      return r.json();
    });
  }

  SLB.ready.then(function () {
    L = SLBLogic;
    ART = COIN_ART;
    state = SLB.load();
    return Promise.all([
      loadJson(PLAN_URL).then(function (p) { plan = p; }).catch(function () { plan = null; }),
      loadJson(WEEK_URL).then(function (w) { week = w; }).catch(function () { week = null; })
    ]);
  }).then(function () {
    if (!ui.domainId) ui.domainId = fullest();
    render();
    var host = location.hostname;
    if (SW_URL && "serviceWorker" in navigator && host !== "localhost" && host !== "127.0.0.1") {
      navigator.serviceWorker.register(SW_URL).catch(function () {});
    }
  });
})();
