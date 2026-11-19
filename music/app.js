/* Music practice app. Done states stay in localStorage.
   Bank Game hook: listen for "music-done" or set window.onMusicDoneForBank. */
(function () {
  "use strict";

  /* SHABBAT_MODE:
     'off'   — points and all cards every day
     'light' — Friday 18:00 through Saturday (US Eastern): Voice card only,
               with normal voice points. Hide piano/guitar. No penalties.
     'full'  — Friday 18:00 through Saturday: no points (practice still ok)
     Default is 'light' ("ritual with a little work"). */
  var CONFIG = {
    SHABBAT_MODE: "light",
    SHABBAT_FRIDAY_FROM_HOUR: 18,
    TIMEZONE: "America/New_York",
    POINTS: {
      voice: 35,
      piano: 25,
      guitar: 25,
      tired: 15,
      beforeNoon: 10,
      voiceTest: 25,
      dailyCap: 75
    },
    TIRED_START: { piano: 15 * 60 + 11, guitar: 15 * 60 + 27 },   /* Lesson 1 v3: piano tired-day 15:11, guitar 15:27 */
    STORAGE_KEY: "musicApp.v1"
  };

  /* Web copies (720p H.264, faststart). The full routine rotates one release pick per day: day index mod 4. */
  var MEDIA = {
    voiceFive: "media/voice_tired_day_v4.mp4",
    voiceFullPicks: [
      "media/voice_full_v4_pick1.mp4",
      "media/voice_full_v4_pick2.mp4",
      "media/voice_full_v4_pick3.mp4",
      "media/voice_full_v4_pick4.mp4"
    ],
    pickNames: ["Hyoid release", "Front-of-neck release", "Open the back of the mouth", "SCM pincer walk + scoop"],
    piano: "media/lesson1_piano_v3.mp4",
    guitar: "media/lesson1_guitar_v3.mp4"
  };

  /* Whole days since 1970-01-01 for the Eastern calendar date, so the pick changes at local midnight. */
  function dayIndex(parts) {
    return Math.floor(Date.UTC(+parts.year, +parts.month - 1, +parts.day) / 86400000);
  }
  function pickIndex(parts) {
    var n = MEDIA.voiceFullPicks.length;
    return ((dayIndex(parts) % n) + n) % n;
  }

  var state = { days: {}, skills: {}, voiceVariant: "five", curriculum: null };
  var previewOverride = null;

  function $(id) { return document.getElementById(id); }

  function easternParts(date) {
    var d = date || new Date();
    var parts = new Intl.DateTimeFormat("en-US", {
      timeZone: CONFIG.TIMEZONE,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).formatToParts(d);
    var map = {};
    parts.forEach(function (p) { map[p.type] = p.value; });
    return {
      weekday: map.weekday,
      year: map.year,
      month: map.month,
      day: map.day,
      hour: parseInt(map.hour, 10),
      minute: parseInt(map.minute, 10),
      dateKey: map.year + "-" + map.month + "-" + map.day
    };
  }

  function prettyDate(parts) {
    var d = new Date(parts.year + "-" + parts.month + "-" + parts.day + "T12:00:00");
    return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  }

  function isShabbatWindow(parts) {
    if (parts.weekday === "Fri" && parts.hour >= CONFIG.SHABBAT_FRIDAY_FROM_HOUR) return true;
    if (parts.weekday === "Sat") return true;
    return false;
  }

  function modeNow(parts) {
    if (previewOverride === "off") return { mode: "off", shabbat: false };
    if (previewOverride === "light") return { mode: "light", shabbat: true };
    if (previewOverride === "full") return { mode: "full", shabbat: true };
    var shabbat = isShabbatWindow(parts);
    var mode = CONFIG.SHABBAT_MODE;
    if (!shabbat || mode === "off") return { mode: "off", shabbat: false };
    return { mode: mode, shabbat: true };
  }

  function load() {
    try {
      var raw = localStorage.getItem(CONFIG.STORAGE_KEY);
      if (raw) {
        var saved = JSON.parse(raw);
        state.days = saved.days || {};
        state.skills = saved.skills || {};
        if (saved.voiceVariant) state.voiceVariant = saved.voiceVariant;
      }
    } catch (e) { /* start fresh */ }
  }

  function save() {
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify({
      days: state.days,
      skills: state.skills,
      voiceVariant: state.voiceVariant
    }));
  }

  function todayRecord(parts) {
    var key = parts.dateKey;
    if (!state.days[key]) {
      state.days[key] = {
        voice: false,
        piano: false,
        guitar: false,
        tired: false,
        checklist: {},
        stamps: {},
        bonusNoon: false
      };
    }
    return state.days[key];
  }

  function unitPoints(track, rec, ctx) {
    if (ctx.mode === "full" && ctx.shabbat) return 0;
    if (ctx.mode === "light" && ctx.shabbat && track !== "voice") return 0;
    if (rec.tired) return CONFIG.POINTS.tired;
    return CONFIG.POINTS[track] || 0;
  }

  function scoreDay(rec, ctx) {
    var raw = 0;
    ["voice", "piano", "guitar"].forEach(function (t) {
      if (rec[t]) raw += unitPoints(t, rec, ctx);
    });
    var bonus = 0;
    if (rec.bonusNoon && raw > 0 && !(ctx.mode === "full" && ctx.shabbat)) {
      bonus = CONFIG.POINTS.beforeNoon;
    }
    var uncapped = raw + bonus;
    var total = Math.min(CONFIG.POINTS.dailyCap, uncapped);
    return { raw: raw, bonus: bonus, uncapped: uncapped, total: total, cap: CONFIG.POINTS.dailyCap };
  }

  function summary(parts) {
    var rec = todayRecord(parts);
    var ctx = modeNow(parts);
    var score = scoreDay(rec, ctx);
    return {
      date: parts.dateKey,
      shabbatMode: CONFIG.SHABBAT_MODE,
      activeMode: ctx.mode,
      shabbat: ctx.shabbat,
      tired: !!rec.tired,
      checks: { voice: !!rec.voice, piano: !!rec.piano, guitar: !!rec.guitar },
      points: score.total,
      bonusNoon: score.bonus,
      cap: score.cap
    };
  }

  /* Hook for a future "Music done" link to the Bank Game app.
     Replace onMusicDoneForBank, or listen for the window event. */
  function notifyBank(reason, parts) {
    var detail = Object.assign({ reason: reason, at: new Date().toISOString() }, summary(parts));
    try {
      if (typeof window.onMusicDoneForBank === "function") window.onMusicDoneForBank(detail);
    } catch (e) { /* hook errors must not break practice */ }
    try {
      if (window.MusicApp && typeof window.MusicApp.onBankMusicDone === "function") {
        window.MusicApp.onBankMusicDone(detail);
      }
    } catch (e) { /* same */ }
    window.dispatchEvent(new CustomEvent("music-done", { detail: detail }));
  }

  function setCheck(track, on, parts) {
    var rec = todayRecord(parts);
    rec[track] = !!on;
    if (on) {
      rec.stamps[track] = new Date().toISOString();
      if (parts.hour < 12) rec.bonusNoon = true;
    } else {
      delete rec.stamps[track];
      rec.bonusNoon = ["voice", "piano", "guitar"].some(function (t) {
        if (!rec[t] || !rec.stamps[t]) return false;
        try {
          return easternParts(new Date(rec.stamps[t])).hour < 12;
        } catch (e) { return false; }
      });
    }
    save();
    notifyBank(on ? track + "-done" : track + "-undone", parts);
  }

  function setSrc(video, src, startAt) {
    if (!video) return;
    var want = startAt || 0;
    var currentBase = (video.getAttribute("src") || "").split("#")[0];
    function seek() {
      try {
        if (Math.abs((video.currentTime || 0) - want) > 0.5) video.currentTime = want;
      } catch (e) { /* wait for data */ }
    }
    if (currentBase !== src) {
      video.src = src;
    }
    if (video.readyState >= 1) seek();
    video.addEventListener("loadedmetadata", seek, { once: true });
    video.addEventListener("canplay", seek, { once: true });
  }

  function applyVideos(rec, parts) {
    var pk = pickIndex(parts || partsOf());
    var full = state.voiceVariant === "full" && !rec.tired;
    var voiceSrc = full ? MEDIA.voiceFullPicks[pk] : MEDIA.voiceFive;
    setSrc($("voiceVideo"), voiceSrc, 0);
    var voiceLabel = $("voiceVidLabel");
    if (voiceLabel) {
      voiceLabel.textContent = full ? "Full routine (about 14–15 min) · today's pick " + (pk + 1) + " of 4: " + MEDIA.pickNames[pk] : "5-minute routine";
    }
    var voiceNote = $("voiceNote");
    if (voiceNote) voiceNote.hidden = !full;
    document.querySelectorAll("[data-voice-choice]").forEach(function (btn) {
      btn.setAttribute("aria-pressed", btn.getAttribute("data-voice-choice") === (rec.tired ? "five" : state.voiceVariant) ? "true" : "false");
    });
    var fiveBtn = document.querySelector('[data-voice-choice="five"]');
    var fullBtn = document.querySelector('[data-voice-choice="full"]');
    if (fullBtn) fullBtn.disabled = !!rec.tired;
    if (fiveBtn && rec.tired) fiveBtn.setAttribute("aria-pressed", "true");
    if (fullBtn && rec.tired) fullBtn.setAttribute("aria-pressed", "false");

    setSrc($("pianoVideo"), MEDIA.piano, rec.tired ? CONFIG.TIRED_START.piano : 0);
    setSrc($("guitarVideo"), MEDIA.guitar, rec.tired ? CONFIG.TIRED_START.guitar : 0);
    var pLab = $("pianoVidLabel");
    var gLab = $("guitarVidLabel");
    if (pLab) pLab.textContent = rec.tired ? "Tired-day · starts at 15:11" : "Lesson 1 · Piano";
    if (gLab) gLab.textContent = rec.tired ? "Tired-day · starts at 15:27" : "Lesson 1 · Guitar";
  }

  function paint(parts) {
    var rec = todayRecord(parts);
    var ctx = modeNow(parts);
    var score = scoreDay(rec, ctx);

    $("todayLabel").textContent = prettyDate(parts);
    $("pointsNow").textContent = score.total + " / " + score.cap;
    var bonusLine = $("pointsMeta");
    if (ctx.mode === "full" && ctx.shabbat) {
      bonusLine.textContent = "Shabbat · no points today";
    } else if (score.bonus) {
      bonusLine.textContent = "includes +" + score.bonus + " before noon";
    } else {
      bonusLine.textContent = "Songbird points";
    }

    var lightBanner = $("shabbatLight");
    var fullBanner = $("shabbatFull");
    lightBanner.classList.toggle("hidden", !(ctx.mode === "light" && ctx.shabbat));
    fullBanner.classList.toggle("hidden", !(ctx.mode === "full" && ctx.shabbat));

    var hideLessons = ctx.mode === "light" && ctx.shabbat;
    $("lessonCard").classList.toggle("hidden", hideLessons);
    $("tiredBtn").classList.toggle("hidden", false);

    var voicePts = unitPoints("voice", rec, ctx);
    var pianoPts = unitPoints("piano", rec, ctx);
    var guitarPts = unitPoints("guitar", rec, ctx);
    $("voicePts").textContent = voicePts + " pts";
    $("pianoPts").textContent = pianoPts + " pts";
    $("guitarPts").textContent = guitarPts + " pts";

    $("voiceDone").classList.toggle("on", !!rec.voice);
    $("voiceDone").setAttribute("aria-pressed", rec.voice ? "true" : "false");
    $("voiceDone").textContent = rec.voice ? "Voice done ✓" : "Voice done";

    $("pianoDone").classList.toggle("on", !!rec.piano);
    $("pianoDone").setAttribute("aria-pressed", rec.piano ? "true" : "false");
    $("pianoDone").textContent = rec.piano ? "Piano done ✓" : "Piano done";

    $("guitarDone").classList.toggle("on", !!rec.guitar);
    $("guitarDone").setAttribute("aria-pressed", rec.guitar ? "true" : "false");
    $("guitarDone").textContent = rec.guitar ? "Guitar done ✓" : "Guitar done";

    $("tiredBtn").setAttribute("aria-pressed", rec.tired ? "true" : "false");
    $("tiredBtn").innerHTML = rec.tired
      ? 'Tired-day on ✓<small>5-minute versions — still counts</small>'
      : 'Tired day<small>Swap both cards to the 5-minute versions — still counts</small>';

    document.querySelectorAll("[data-check]").forEach(function (el) {
      el.checked = !!rec.checklist[el.getAttribute("data-check")];
    });

    applyVideos(rec, parts);
  }

  function bind(partsOf) {
    document.querySelectorAll("[data-voice-choice]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var rec = todayRecord(partsOf());
        if (rec.tired) return;
        state.voiceVariant = btn.getAttribute("data-voice-choice");
        save();
        paint(partsOf());
      });
    });

    $("voiceDone").addEventListener("click", function () {
      var p = partsOf();
      var rec = todayRecord(p);
      setCheck("voice", !rec.voice, p);
      paint(p);
    });
    $("pianoDone").addEventListener("click", function () {
      var p = partsOf();
      var rec = todayRecord(p);
      setCheck("piano", !rec.piano, p);
      paint(p);
    });
    $("guitarDone").addEventListener("click", function () {
      var p = partsOf();
      var rec = todayRecord(p);
      setCheck("guitar", !rec.guitar, p);
      paint(p);
    });

    $("tiredBtn").addEventListener("click", function () {
      var p = partsOf();
      var rec = todayRecord(p);
      rec.tired = !rec.tired;
      if (rec.tired) state.voiceVariant = "five";
      save();
      notifyBank(rec.tired ? "tired-on" : "tired-off", p);
      paint(p);
    });

    document.querySelectorAll("[data-check]").forEach(function (el) {
      el.addEventListener("change", function () {
        var p = partsOf();
        todayRecord(p).checklist[el.getAttribute("data-check")] = !!el.checked;
        save();
      });
    });
  }

  function renderCurriculum(data) {
    var mount = $("curriculumMount");
    if (!mount) return;
    mount.innerHTML = (data.cards || []).map(function (card) {
      var skills = (card.skills || []).map(function (s) {
        var id = s.id || s[0];
        var label = s.label || s[1];
        var on = !!state.skills[id];
        return '<label class="skill"><input type="checkbox" data-skill="' + id + '"' +
          (on ? " checked" : "") + "> <span>" + label + "</span></label>";
      }).join("");
      return '<div class="track">' +
        "<h3>" + (card.emoji || "") + " " + card.name + "</h3>" +
        '<p class="now-next"><b>Now:</b> ' + (card.now || "—") +
        "<br><b>Next:</b> " + (card.next || "—") + "</p>" +
        skills + "</div>";
    }).join("");

    mount.querySelectorAll("[data-skill]").forEach(function (el) {
      el.addEventListener("change", function () {
        state.skills[el.getAttribute("data-skill")] = !!el.checked;
        save();
      });
    });

    var week = data.week || {};
    $("rpmResult").textContent = week.result || "A clear result for the week goes here.";
    $("rpmPurpose").textContent = week.purpose || "A short purpose goes here.";
    var actions = week.actions || [];
    $("rpmActions").innerHTML = actions.map(function (a) {
      return "<li>" + (typeof a === "string" ? a : (a.text || a.track || "")) + "</li>";
    }).join("");

    var song = data.currentSong || {};
    $("songTitle").textContent = song.title || "This week's song";
    $("songFocus").textContent = song.focus || "One small focus for the week.";
    $("songKey").textContent = song.key || "Key and chords go here";
    $("songStatus").textContent = song.status || "In progress";

    var lib = $("libraryMount");
    lib.innerHTML = (data.theoryLibrary || []).map(function (item) {
      return '<div class="lib-item">' +
        "<h3>" + item.title + "</h3>" +
        "<p>" + (item.blurb || "") + "</p>" +
        '<div class="vid"><video controls playsinline preload="metadata"' +
        (item.poster ? ' poster="' + item.poster + '"' : "") +
        ' src="' + item.src + '"></video></div></div>';
    }).join("");
  }

  function parsePreview() {
    var q = new URLSearchParams(location.search);
    var v = q.get("preview");
    if (v === "shabbat") previewOverride = "light";
  }

  function partsOf() { return easternParts(new Date()); }

  window.MusicApp = {
    CONFIG: CONFIG,
    getTodaySummary: function () { return summary(partsOf()); },
    onBankMusicDone: null,
    /* Preview helpers (not for production use) */
    _setPreview: function (mode) { previewOverride = mode; paint(partsOf()); },
    _scoreDay: scoreDay,
    _isShabbatWindow: isShabbatWindow
  };

  load();
  parsePreview();

  function start(data) {
    state.curriculum = data;
    renderCurriculum(data || {});
    bind(partsOf);
    paint(partsOf());
  }

  fetch("curriculum.json")
    .then(function (r) { return r.ok ? r.json() : {}; })
    .then(start)
    .catch(function () { start({}); });
})();
