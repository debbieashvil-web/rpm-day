/* The Self Love Bank. Tap-first, phone-first, saved only on this device. */
(function () {
  "use strict";
  var L, ART, state;
  var ui = {
    tab: "today",
    domainId: "",
    mustOpen: false,
    easyOpen: false,
    customOpen: false,
    quietStep: 0,
    weekOffset: 0,
    mustDraft: { label: "", domainId: "body", taskId: "body-hop-walk" },
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
  function art(id) { return (ART && ART[id]) || ""; }
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
  function weekDate() {
    var d = now();
    d.setDate(d.getDate() + ui.weekOffset * 7);
    return d;
  }
  function capture() {
    var a = document.querySelector("[data-must-label]");
    if (a) ui.mustDraft.label = a.value;
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
    var n = now();
    var quiet = L.shabbatQuiet(state, n);
    var titles = { today: "Today", bank: "The Bank", week: "This week" };
    var subs = {
      today: n.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }),
      bank: "What lands here stays.",
      week: "Sunday outcomes, one for each life area."
    };
    $("h1").textContent = quiet ? "Shabbos" : titles[ui.tab];
    $("sub").textContent = quiet ? "Rest. Nothing is asked of you here." : subs[ui.tab];
    document.querySelectorAll("#tabs button").forEach(function (b) {
      b.setAttribute("aria-selected", !quiet && b.getAttribute("data-tab") === ui.tab ? "true" : "false");
    });
    $("main").innerHTML = quiet ? renderQuiet() : (ui.tab === "bank" ? renderBank(n) : ui.tab === "week" ? renderWeek(n) : renderToday(n));
    var last = null;
    if (!quiet) {
      for (var i = state.entries.length - 1; i >= 0; i--) if (!state.entries[i].undone) { last = state.entries[i]; break; }
    }
    var undo = $("undo");
    if (last) {
      undo.hidden = false;
      undo.innerHTML = '<button type="button" data-undo>Undo · ' + esc(last.label) + "</button>";
    } else undo.hidden = true;
  }

  function renderQuiet() {
    var step = ui.quietStep;
    var html = '<section class="quiet">';
    html += '<img src="' + esc(art("faith")) + '" alt="Candlelight">';
    html += "<h2>Shabbos</h2>";
    html += '<p class="hint">The coins can wait. There is nothing to catch up.</p>';
    if (step < 1) {
      html += '<button type="button" class="stamp" data-havdalah>Havdalah</button>';
      html += '<p class="hint">When Shabbos is over.</p>';
    } else {
      html += '<button type="button" class="stamp" data-log-shabbos>I kept Shabbos</button>';
      html += '<button type="button" class="ghost" data-back-day>Back to the day</button>';
    }
    html += "</section>";
    return html;
  }

  function taskButton(task, day) {
    var n = L.loggedToday(state, task.id, day).length;
    var on = !task.repeat && n > 0;
    var html = '<button type="button" class="task' + (on ? " on" : "") + '" data-task="' + esc(task.id) + '">';
    html += "<b>" + esc(task.label) + "</b>";
    html += '<span class="pts">' + (task.kind === "bonus_points" ? "+" : "") + esc(task.points) + "</span>";
    var tag = on ? "In the coin" : (task.cadence === "progress" ? "A step counts" : (task.kind === "bonus_points" ? "Bonus points" : ""));
    if (task.repeat && n) tag = n + " today";
    if (task.note && !tag) tag = task.note;
    html += '<span class="tag">' + esc(tag) + "</span>";
    html += "</button>";
    if (task.repeat && n) html += '<button type="button" class="undo-mini" data-undo-task="' + esc(task.id) + '">Undo one</button>';
    return html;
  }

  function renderToday(n) {
    var day = L.dayKey(n);
    var html = '<section class="panel"><div class="switchrow"><div><b>Easy day</b><span>Five gentle tasks still fill the coins.</span></div>';
    html += '<button type="button" class="switch' + (state.easyDay ? " on" : "") + '" data-easy aria-pressed="' + (state.easyDay ? "true" : "false") + '" aria-label="Easy day"><i></i></button></div></section>';
    if (state.easyDay) {
      html += '<section class="panel"><h2 class="nm" style="font-family:var(--serif);margin:0 0 4px">Your five</h2>';
      html += '<p class="hint">Suggested to start: meds, teeth, a walk, vocals, lights out. Change them whenever you like.</p>';
      (state.easyDayTaskIds || []).forEach(function (id) {
        var task = taskById(id);
        if (task) html += taskButton(task, day);
      });
      html += '<button type="button" class="ghost" data-easy-open>' + (ui.easyOpen ? "Close" : "Change these five") + "</button>";
      if (ui.easyOpen) {
        var pool = [];
        L.DOMAINS.forEach(function (d) { tasksFor(d.id).forEach(function (t) { if (t.kind !== "bonus_coin") pool.push(t); }); });
        for (var i = 0; i < 5; i++) {
          html += '<select class="field" data-easy-slot="' + i + '">';
          pool.forEach(function (t) {
            var sel = state.easyDayTaskIds[i] === t.id ? " selected" : "";
            html += '<option value="' + esc(t.id) + '"' + sel + ">" + esc(t.label) + "</option>";
          });
          html += "</select>";
        }
      }
      html += "</section>";
    } else {
      html += '<section class="panel"><h2 style="font-family:var(--serif);margin:0">Today\'s musts</h2>';
      html += '<p class="hint">Three to five. Each one is tagged to a coin, and checking it fills that coin once.</p>';
      if (!state.musts.length) html += '<p class="hint">Nothing chosen yet. A short list is enough.</p>';
      state.musts.forEach(function (m) {
        var task = taskById(m.taskId);
        var dom = L.domain(m.domainId);
        var on = task && L.loggedToday(state, task.id, day).length > 0;
        html += '<button type="button" class="task' + (on ? " on" : "") + '" data-must="' + esc(m.id) + '">';
        html += "<b>" + esc(m.label) + "</b>";
        html += '<span class="pts">' + (task ? esc(task.points) : "") + "</span>";
        html += '<span class="tag">' + esc(dom ? dom.coin : "") + (on ? " · in the coin" : "") + "</span></button>";
        html += '<button type="button" class="undo-mini" data-remove-must="' + esc(m.id) + '">Remove from today</button>';
      });
      if (state.musts.length < 5) {
        html += '<button type="button" class="stamp" data-add-must>' + (ui.mustOpen ? "Close" : "Add a must") + "</button>";
      }
      if (ui.mustOpen) html += mustForm();
      html += "</section>";
    }
    if (!L.shabbosLogged(state, n)) {
      html += '<button type="button" class="ghost" data-log-shabbos>Log Shabbos</button>';
    }
    if (n.getDay() === 5 && n.getHours() < 18) {
      html += '<button type="button" class="ghost" data-shabbos-hold>It\'s Shabbos</button>';
    }
    html += footer();
    return html;
  }

  function mustForm() {
    var d = ui.mustDraft;
    var html = '<label class="hint" for="mustLabel">What will you do?</label>';
    html += '<input class="field" id="mustLabel" data-must-label maxlength="80" value="' + esc(d.label) + '" placeholder="A walk, vocals, the hard call">';
    html += '<p class="hint">Which coin does it fill?</p><div class="chips">';
    L.DOMAINS.forEach(function (dom) {
      html += '<button type="button" class="chip' + (dom.id === d.domainId ? " on" : "") + '" data-pick-domain="' + dom.id + '">' + esc(dom.coin) + "</button>";
    });
    html += '</div><p class="hint">Which task is the credit? One tap, one coin.</p><div class="chips">';
    tasksFor(d.domainId).forEach(function (t) {
      if (t.kind === "bonus_coin") return;
      html += '<button type="button" class="chip' + (t.id === d.taskId ? " on" : "") + '" data-pick-task="' + esc(t.id) + '">' + esc(t.label) + " · " + t.points + "</button>";
    });
    html += '</div><button type="button" class="stamp" data-save-must>Save this must</button>';
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
      html += '<span class="medallion"><span class="ring"></span><img src="' + esc(art(d.id)) + '" alt=""></span>';
      html += '<span class="nm">' + esc(d.coin) + "</span>";
      html += '<span class="frac">' + meter + " / " + d.fill + "</span>";
      if (kept) html += "<small>" + kept + " kept</small>";
      html += "</button>";
    });
    html += "</div>";
    var dom = L.domain(ui.domainId);
    html += '<section class="panel" id="tasks"><h2 style="font-family:var(--serif);margin:0">' + esc(dom.coin) + "</h2>";
    html += '<p class="hint">' + esc(dom.name) + " · " + esc(dom.meaning) + "</p>";
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
    html += '<section class="panel"><h2 style="font-family:var(--serif);margin:0">Celebrations</h2>';
    html += '<p class="hint">One tap banks a whole coin. No number is stored, and nothing is spent.</p>';
    ["body-5lb", "fin-card-paid-off", "fin-per-1000", "mus-finished-song"].forEach(function (id) {
      var t = SLB.byId[id];
      if (!t) return;
      var coin = L.domain(t.domainId).coin;
      html += '<button type="button" class="bonus" data-bonus="' + id + '"><b>' + esc(t.label) + "</b><span>" + esc(coin) + "</span></button>";
    });
    html += "</section>";
    html += '<section class="panel"><button type="button" class="ghost" data-custom-open>' + (ui.customOpen ? "Close" : "Add a task of my own") + "</button>";
    if (ui.customOpen) {
      html += '<input class="field" data-custom-label maxlength="80" placeholder="The task, in your words" value="' + esc(ui.customDraft.label) + '">';
      html += '<input class="field" data-custom-points inputmode="numeric" min="1" max="200" value="' + esc(ui.customDraft.points) + '" aria-label="Points">';
      html += '<div class="chips">';
      L.DOMAINS.forEach(function (d) {
        html += '<button type="button" class="chip' + (d.id === ui.customDraft.domainId ? " on" : "") + '" data-custom-domain="' + d.id + '">' + esc(d.coin) + "</button>";
      });
      html += '</div><label class="check"><input type="checkbox" data-custom-repeat' + (ui.customDraft.repeat ? " checked" : "") + "> A step I may repeat</label>";
      html += '<button type="button" class="stamp" data-custom-save>Add it</button>';
    }
    html += "</section>";
    html += '<section class="tray"><h2>In the bank</h2><p class="hint">They stay. A quiet day changes nothing.</p>';
    if (!state.banked.length) html += '<p class="hint">Your bank is ready. Coins land here and stay.</p>';
    else {
      html += '<div class="shelf">';
      state.banked.slice().reverse().forEach(function (c) {
        var domc = L.domain(c.domainId);
        html += '<div class="kept"><img src="' + esc(art(c.domainId)) + '" alt=""><span>' + esc(domc.coin) + "<br>" + esc(L.prettyDay(c.day)) + (c.bonus ? "<br>celebration" : "") + "</span></div>";
      });
      html += "</div>";
    }
    html += "</section>";
    html += '<section class="panel score"><h2 style="font-family:var(--serif);margin:0 0 6px">Songbird scoring</h2>';
    html += '<p class="hint">Proposal task points are the default. The minute draft is not approved, and the two are never added together.</p>';
    html += '<label><input type="radio" name="scoring" data-scoring value="proposal"' + (state.scoring !== "melody" ? " checked" : "") + "> Proposal task points, the default</label>";
    html += '<label><input type="radio" name="scoring" data-scoring value="melody"' + (state.scoring === "melody" ? " checked" : "") + "> Draft minute scoring, not approved yet</label>";
    html += "</section>";
    html += phoneBox();
    html += footer();
    return html;
  }

  function renderWeek() {
    var when = weekDate();
    var key = L.sundayKey(when);
    var plan = state.weekPlans[key] || {};
    var html = '<div class="weeknav"><button type="button" data-week-nav="-1" aria-label="Previous week">‹</button>';
    html += "<b>Week of " + esc(L.prettyDay(key)) + '</b><button type="button" data-week-nav="1" aria-label="Next week">›</button></div>';
    L.DOMAINS.forEach(function (d) {
      var row = plan[d.id] || { result: "", purpose: "" };
      html += '<section class="panel card"><div class="coinlet"><img src="' + esc(art(d.id)) + '" alt=""><div><h2>' + esc(d.name) + "</h2><span class=\"hint\">" + esc(d.coin) + "</span></div></div>";
      html += '<label class="hint" for="r-' + d.id + '">Result</label>';
      html += '<textarea class="field" id="r-' + d.id + '" data-week-result="' + d.id + '" maxlength="280" placeholder="By the end of this week…">' + esc(row.result) + "</textarea>";
      html += '<label class="hint" for="p-' + d.id + '">Why</label>';
      html += '<textarea class="field" id="p-' + d.id + '" data-week-purpose="' + d.id + '" maxlength="280" placeholder="Because…">' + esc(row.purpose) + "</textarea>";
      html += "</section>";
    });
    var start = new Date(when.getFullYear(), when.getMonth(), when.getDate() - when.getDay());
    var days = [];
    for (var i = 0; i < 7; i++) {
      var x = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      days.push(L.dayKey(x));
    }
    var kept = state.banked.filter(function (c) { return days.indexOf(c.day) >= 0; });
    html += '<section class="tray"><h2>Banked this week</h2>';
    if (!kept.length) html += '<p class="hint">Coins you bank this week will sit here.</p>';
    else {
      html += '<div class="shelf">';
      kept.slice().reverse().forEach(function (c) {
        html += '<div class="kept"><img src="' + esc(art(c.domainId)) + '" alt=""><span>' + esc(L.domain(c.domainId).coin) + "<br>" + esc(L.prettyDay(c.day)) + "</span></div>";
      });
      html += "</div>";
    }
    html += "</section>";
    html += footer();
    return html;
  }

  function phoneBox() {
    var html = '<section class="panel"><h2 style="font-family:var(--serif);margin:0">This phone</h2>';
    html += '<p class="hint">Taps stay on this phone. A save file is the way to move them.</p>';
    html += '<button type="button" class="ghost" data-export>Export save file</button>';
    html += '<button type="button" class="ghost" data-import-btn>Import save file</button>';
    if (L.canOfferSeed(state, "nov16")) {
      html += '<button type="button" class="stamp" data-seed>Import Nov 16 progress</button>';
      html += '<p class="hint">Points only, one time: Body 140, Resilience 70, Finances 75, Music 25, Kindness 30. Nothing banked.</p>';
      html += '<button type="button" class="ghost" data-seed-no>Not now</button>';
    }
    html += '<button type="button" class="ghost" data-install>Add to Home Screen</button>';
    html += '<p class="hint" id="installHint" hidden>On iPhone: Share, then Add to Home Screen. The icon is the oak.</p>';
    html += "</section>";
    return html;
  }

  function footer() {
    return '<p class="links"><a href="../index.html">Full day list</a><a href="../index.html#curriculum">Music page</a></p>';
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
      '<p class="fall-name">' + esc(dom.coin) + "</p>" +
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
    if (el.hasAttribute("data-tab")) {
      ui.tab = el.getAttribute("data-tab");
      history.replaceState(null, "", "#" + ui.tab);
      render();
      return;
    }
    if (el.hasAttribute("data-undo")) {
      L.undoLast(state);
      commit();
      return;
    }
    if (el.hasAttribute("data-domain")) {
      ui.domainId = el.getAttribute("data-domain");
      render();
      var box = document.getElementById("tasks");
      if (box && box.scrollIntoView) box.scrollIntoView({ behavior: "smooth", block: "start" });
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
    if (el.hasAttribute("data-easy")) {
      state.easyDay = !state.easyDay;
      commit();
      return;
    }
    if (el.hasAttribute("data-easy-open")) { ui.easyOpen = !ui.easyOpen; render(); return; }
    if (el.hasAttribute("data-add-must")) { ui.mustOpen = !ui.mustOpen; render(); return; }
    if (el.hasAttribute("data-pick-domain")) {
      ui.mustDraft.domainId = el.getAttribute("data-pick-domain");
      var first = tasksFor(ui.mustDraft.domainId).filter(function (t) { return t.kind !== "bonus_coin"; })[0];
      ui.mustDraft.taskId = first ? first.id : "";
      render();
      return;
    }
    if (el.hasAttribute("data-pick-task")) { ui.mustDraft.taskId = el.getAttribute("data-pick-task"); render(); return; }
    if (el.hasAttribute("data-save-must")) {
      var made = L.addMust(state, ui.mustDraft);
      if (made) { ui.mustDraft.label = ""; ui.mustOpen = false; commit(); }
      return;
    }
    if (el.hasAttribute("data-remove-must")) { L.removeMust(state, el.getAttribute("data-remove-must")); commit(); return; }
    if (el.hasAttribute("data-must")) {
      var must = null;
      state.musts.forEach(function (m) { if (m.id === el.getAttribute("data-must")) must = m; });
      var linked = must && taskById(must.taskId);
      if (linked) commit(L.toggleMust(state, linked, { day: day }));
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
    if (el.hasAttribute("data-shabbos-hold")) { state.shabbatHold = true; ui.quietStep = 0; commit(); return; }
    if (el.hasAttribute("data-havdalah")) { ui.quietStep = 1; render(); return; }
    if (el.hasAttribute("data-log-shabbos")) {
      var faith = SLB.byId["faith-shabbos"];
      if (faith) commit(L.logShabbos(state, faith, n));
      ui.quietStep = 0;
      return;
    }
    if (el.hasAttribute("data-back-day")) {
      state.shabbatHold = false;
      state.shabbatLifted = L.shabbosKey(n);
      ui.quietStep = 0;
      commit();
      return;
    }
    if (el.hasAttribute("data-week-nav")) {
      ui.weekOffset += parseInt(el.getAttribute("data-week-nav"), 10) || 0;
      render();
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
      fetch("seed-nov16.json").then(function (r) { return r.json(); }).then(function (seed) {
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
    if (t.hasAttribute("data-week-result") || t.hasAttribute("data-week-purpose")) {
      var id = t.getAttribute("data-week-result") || t.getAttribute("data-week-purpose");
      var fields = {};
      fields[t.hasAttribute("data-week-result") ? "result" : "purpose"] = t.value;
      L.setWeek(state, L.sundayKey(weekDate()), id, fields);
      SLB.save(state);
    }
    if (t.hasAttribute("data-must-label")) ui.mustDraft.label = t.value;
    if (t.hasAttribute("data-custom-label")) ui.customDraft.label = t.value;
    if (t.hasAttribute("data-custom-points")) ui.customDraft.points = t.value;
  }

  function onChange(ev) {
    var t = ev.target;
    if (t.hasAttribute("data-easy-slot")) {
      var ids = (state.easyDayTaskIds || []).slice();
      ids[+t.getAttribute("data-easy-slot")] = t.value;
      if (L.setEasyTasks(state, ids, mergedById())) SLB.save(state);
    }
    if (t.hasAttribute("data-custom-repeat")) { ui.customDraft.repeat = t.checked; }
    if (t.hasAttribute("data-scoring")) { state.scoring = t.value === "melody" ? "melody" : "proposal"; SLB.save(state); }
  }

  function mergedById() {
    var map = {};
    Object.keys(SLB.byId).forEach(function (k) { map[k] = SLB.byId[k]; });
    state.customTasks.forEach(function (t) { map[t.id] = t; });
    return map;
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

  SLB.ready.then(function () {
    L = SLBLogic;
    ART = COIN_ART;
    state = SLB.load();
    if (!ui.domainId) ui.domainId = fullest();
    render();
    var host = location.hostname;
    if ("serviceWorker" in navigator && host !== "localhost" && host !== "127.0.0.1") {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    }
  });
})();
