/* Practice log, this-week card, current song, tired day, and voice-test log
   for the curriculum tab. Minutes stay on this phone. */
(function () {
  "use strict";
  var draftTrack = "";
  var draftNote = "";
  var tiredOpen = false;
  var tick = null;

  function esc(t) {
    return String(t == null ? "" : t).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function say(m) {
    var el = document.getElementById("pracMsg");
    if (el) el.textContent = m;
  }
  function coinTitle() {
    return window.SLBLogic && SLBLogic.coinLabel ? SLBLogic.coinLabel("music-creativity") : "";
  }
  function hardestTrack(curriculum) {
    var week = curriculum && curriculum.week;
    if (!week || !week.actions || !week.actions.length) return null;
    var actions = week.actions.slice();
    if (actions.some(function (a) { return typeof a.rank === "number"; })) {
      actions.sort(function (a, b) { return (a.rank || 99) - (b.rank || 99); });
    }
    return actions[0].track || null;
  }
  function paint(curriculum) {
    var bar = document.getElementById("minFill");
    var label = document.getElementById("minLabel");
    var list = document.getElementById("pracList");
    if (!bar || !window.SLB || !window.SLBLogic) return;
    var s = SLB.load();
    var stats = SLBLogic.weekMinutes(s, new Date(), window.SONG_SCORING);
    var pct = Math.max(0, Math.min(100, Math.round(100 * stats.minutes / stats.goal)));
    bar.style.width = pct + "%";
    label.textContent = "Sunday–Thursday · " + stats.minutes + " of about " + stats.goal + " min";
    var sunday = SLBLogic.sundayKey(new Date());
    var start = sunday.split("-");
    var days = [];
    for (var i = 0; i < 7; i++) {
      var d = new Date(+start[0], +start[1] - 1, +start[2] + i);
      days.push(SLBLogic.dayKey(d));
    }
    var rows = s.practice.filter(function (p) { return days.indexOf(p.day) >= 0; }).slice(-6).reverse();
    var names = { voice: "Voice", piano: "Piano", guitar: "Guitar", book1: "Book 1" };
    list.innerHTML = rows.map(function (p) {
      var line = esc(SLBLogic.prettyDay(p.day)) + " · " + esc(names[p.track] || p.track) + " · " + p.minutes + " min";
      if (p.note) line += " · " + esc(p.note);
      if (p.blackout) line += " · saved, no " + esc(coinTitle()) + " points";
      else if (p.points) line += " · " + p.points + " in " + esc(coinTitle());
      return '<div class="ln">' + line + (rows[0] === p ? ' <button type="button" class="tb" data-undo-prac="' + esc(p.id) + '">Undo</button>' : "") + "</div>";
    }).join("");
    var undo = list.querySelector("[data-undo-prac]");
    if (undo) undo.onclick = function () {
      SLB.undoPractice(undo.getAttribute("data-undo-prac"));
      paint(curriculum);
      say("Last session undone.");
    };
    if (window.SLB.voiceTest) {
      try {
        var hist = JSON.parse(localStorage.getItem("vl_history") || "[]");
        var last = hist[hist.length - 1];
        if (last && last.date) {
          var p = last.date.split("-");
          SLB.voiceTest(new Date(+p[0], +p[1] - 1, +p[2], 12, 0, 0));
        }
      } catch (e) {}
    }
  }
  function logSession(curriculum, track, minutes, tired) {
    if (!window.SLB) { say("The bank is still loading."); return; }
    SLB.ready.then(function () {
      var res = SLB.practice({
        track: track,
        minutes: minutes,
        note: draftNote,
        tired: !!tired,
        hardestTrack: hardestTrack(curriculum),
        at: new Date().toISOString()
      });
      draftNote = "";
      var note = document.getElementById("pracNote");
      if (note) note.value = "";
      paint(curriculum);
      if (!res || res.error) { say("Pick a length of 5, 10, 20, or 30."); return; }
      if (res.blackout) say("Saved. " + coinTitle() + " rests from Friday evening through Saturday.");
      else if (res.points) say("Saved. " + res.points + " in " + coinTitle() + ".");
      else say("Minutes saved. That " + coinTitle() + " credit was already in the coin today.");
    });
  }
  function timer(btn, seconds, done) {
    if (tick) { clearInterval(tick.id); tick.btn.textContent = tick.label; if (tick.btn === btn) { tick = null; return; } }
    var left = seconds;
    var label = btn.textContent;
    function show() { btn.textContent = "⏱ " + Math.floor(left / 60) + ":" + String(left % 60).padStart(2, "0") + " ■"; }
    show();
    tick = { id: setInterval(function () {
      left--; show();
      if (left <= 0) { clearInterval(tick.id); btn.textContent = label; tick = null; if (done) done(); }
    }, 1000), btn: btn, label: label };
  }

  function mount(host, curriculum) {
    var card = document.createElement("div");
    card.className = "sec";
    card.style.setProperty("--c", "#8C4630");
    card.style.setProperty("--t", "#F8F1E6");
    card.innerHTML = '<h2>Practice log</h2>' +
      '<div class="ln">One tap logs a session. Sunday through Thursday, the bar is about 60 minutes a day.</div>' +
      '<div class="sg">Book 1 is the next 2 pages of Thompson\'s Easiest Piano Course, Part 1.</div>' +
      '<div class="chipsel" id="pracTracks"></div>' +
      '<div class="chipsel" id="pracMins"></div>' +
      '<div style="padding:0 14px 8px"><input id="pracNote" maxlength="140" placeholder="Optional note" style="width:100%;font-size:16px;padding:10px;border-radius:12px;border:2px solid #8C4630"></div>' +
      '<div class="minbar" aria-hidden="true"><i id="minFill"></i></div>' +
      '<div class="ln" id="minLabel">Sunday–Thursday</div>' +
      '<div class="ln" id="pracMsg"></div>' +
      '<div id="pracList"></div>';
    host.appendChild(card);
    var tracks = [["voice", "Voice"], ["piano", "Piano"], ["guitar", "Guitar"], ["book1", "Book 1"]];
    var trackBox = card.querySelector("#pracTracks");
    tracks.forEach(function (pair) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = pair[1];
      b.className = draftTrack === pair[0] ? "on" : "";
      b.onclick = function () {
        draftTrack = pair[0];
        [].forEach.call(trackBox.children, function (c, i) { c.className = tracks[i][0] === draftTrack ? "on" : ""; });
      };
      trackBox.appendChild(b);
    });
    var mins = card.querySelector("#pracMins");
    [5, 10, 20, 30].forEach(function (m) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = m + " min";
      b.onclick = function () {
        if (!draftTrack) { say("Pick voice, piano, guitar, or Book 1."); return; }
        logSession(curriculum, draftTrack, m, false);
      };
      mins.appendChild(b);
    });
    var note = card.querySelector("#pracNote");
    note.value = draftNote;
    note.oninput = function () { draftNote = note.value; };
    if (curriculum.week && curriculum.week.actions && curriculum.week.actions.length) {
      var week = document.createElement("div");
      week.className = "sec";
      week.style.setProperty("--c", "#B35F00");
      week.style.setProperty("--t", "#FFF6E4");
      var actions = curriculum.week.actions.slice();
      if (actions.some(function (a) { return typeof a.rank === "number"; })) {
        actions.sort(function (a, b) { return (a.rank || 99) - (b.rank || 99); });
      }
      var body = "<h2>This week</h2>";
      if (curriculum.week.result) body += '<div class="ln"><b>Result:</b> ' + esc(curriculum.week.result) + "</div>";
      if (curriculum.week.purpose) body += '<div class="ln"><b>Why:</b> ' + esc(curriculum.week.purpose) + "</div>";
      actions.forEach(function (a, i) {
        var tempo = a.tempo == null ? "" : (typeof a.tempo === "number" ? "♩ = " + a.tempo : String(a.tempo));
        body += '<div class="ln">' + (i + 1) + ". " + esc(a.text || "") + (tempo ? " · " + esc(tempo) : "") + "</div>";
      });
      week.innerHTML = body;
      host.appendChild(week);
    }
    if (curriculum.songs && curriculum.songs.length) {
      var songs = document.createElement("div");
      songs.className = "sec";
      songs.style.setProperty("--c", "#8E44EC");
      songs.style.setProperty("--t", "#F2E8FE");
      var html = "<h2>Current song</h2>";
      curriculum.songs.forEach(function (s) {
        html += '<div class="ln"><b>' + esc(s.title || "") + "</b>" + (s.key ? " · " + esc(s.key) : "") + "</div>";
        if (s.chords) html += '<div class="sg">' + esc(s.chords) + "</div>";
        if (s.focus) html += '<div class="ln">' + esc(s.focus) + "</div>";
        if (s.status) html += '<div class="sg">' + esc(s.status) + "</div>";
      });
      songs.innerHTML = html;
      host.appendChild(songs);
    }
    var go = function () { paint(curriculum); };
    if (window.SLB && SLB.ready) SLB.ready.then(go); else go();
  }

  function voiceRows() {
    var rows = [];
    try {
      var h = JSON.parse(localStorage.getItem("vl_history") || "[]");
      if (Array.isArray(h)) h.forEach(function (r) {
        if (r && r.date && r.avg != null) rows.push(r);
      });
    } catch (e) {}
    try {
      var v = JSON.parse(localStorage.getItem("rpm_vlog") || "[]");
      if (Array.isArray(v)) v.forEach(function (r) {
        if (!r || r.cents == null || r.cents === "") return;
        var n = parseFloat(String(r.cents).replace(/[^0-9.]/g, ""));
        if (!isNaN(n)) rows.push({ date: r.date || "", avg: n, within25: null });
      });
    } catch (e) {}
    return rows.slice(-4).reverse();
  }

  function voiceExtras(card) {
    var box = document.createElement("div");
    box.className = "st";
    box.innerHTML = '<h3>Tired day · 5 min</h3><div>2 minutes of Regulate breathing, then one 30-second clef-note sprint. The rest is rest.</div>' +
      '<button type="button" class="bigb" id="tiredShow">' + (tiredOpen ? "Hide the 5 minutes" : "Show the 5 minutes") + "</button>" +
      '<div id="tiredPlan"' + (tiredOpen ? "" : " hidden") + '></div>';
    card.appendChild(box);
    var plan = box.querySelector("#tiredPlan");
    plan.innerHTML = '<p>Regulate · 2 min. In for 4, out on a long sss for 8.</p><button type="button" class="bigb" id="tReg">Start 2:00</button>' +
      '<p>Clef-note sprint · 30 sec. Name the notes, easy and quick.</p><button type="button" class="bigb" id="tClef">Start 0:30</button>' +
      '<button type="button" class="bigb" id="tCount">Count this tired day</button>';
    box.querySelector("#tiredShow").onclick = function () {
      tiredOpen = !tiredOpen;
      if (window.SLBMusic && document.getElementById("cur")) {
        /* the curriculum tab rebuilds from its own render; toggle locally */
      }
      plan.hidden = !tiredOpen;
      this.textContent = tiredOpen ? "Hide the 5 minutes" : "Show the 5 minutes";
    };
    plan.querySelector("#tReg").onclick = function () { timer(this, 120); };
    plan.querySelector("#tClef").onclick = function () { timer(this, 30); };
    plan.querySelector("#tCount").onclick = function () {
      draftTrack = "voice";
      logSession(window.RPMCurriculum || { week: null }, "voice", 5, true);
    };
    var log = document.createElement("div");
    log.className = "st";
    var rows = voiceRows();
    var html = "<h3>Voice test log</h3><div><b>Nov 5 baseline</b> · 18¢ average off · 67% within 25¢</div>";
    if (!rows.length) html += '<div class="sg" style="padding:4px 0 0">No new tests yet. The Nov 5 baseline still stands.</div>';
    rows.forEach(function (r) {
      var bit = esc(r.date) + " · " + esc(r.avg) + "¢ average off";
      if (r.within25 != null) bit += " · " + esc(r.within25) + "% within 25¢";
      html += "<div>" + bit + "</div>";
    });
    log.innerHTML = html;
    card.appendChild(log);
  }

  window.SLBMusic = { mount: mount, voiceExtras: voiceExtras };
  document.addEventListener("DOMContentLoaded", function () {
    var tabs = document.querySelector(".tabs");
    if (!tabs || document.querySelector(".bankgo")) return;
    var link = document.createElement("a");
    link.className = "bankgo";
    link.href = "bank/";
    link.textContent = "The Self Love Bank";
    tabs.insertAdjacentElement("afterend", link);
  });
})();
