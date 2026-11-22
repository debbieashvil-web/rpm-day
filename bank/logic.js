/* Pure rules for The Self Love Bank. No storage, no personal totals. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SLBLogic = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var DOMAINS = [
    { id: "resilience", name: "Resilience", coin: "The Oak", fill: 200, enamel: "#A84828", meaning: "Things that cost courage." },
    { id: "body", name: "Body", coin: "The Ember", fill: 150, enamel: "#C85008", meaning: "Moving, lifting, fueling, and stretching." },
    { id: "finances", name: "Finances", coin: "The Copper Key", fill: 150, enamel: "#005850", meaning: "Moves toward debt-free, savings, and a place of your own." },
    { id: "career", name: "Career", coin: "The Teacher's Bell", fill: 150, enamel: "#182840", meaning: "Teaching, the studio, the game, and making things." },
    { id: "self-care", name: "Self-Care", coin: "Still Water", fill: 100, enamel: "#90A8B8", meaning: "Rest, care, sleep, and feeding the mind." },
    { id: "music-creativity", name: "Music & Creativity", coin: "The Songbird", fill: 100, enamel: "#889070", meaning: "Voice, instruments, songs, and any creating." },
    { id: "kindness-connection", name: "Kindness & Connection", coin: "Warm Bread", fill: 100, enamel: "#B86820", meaning: "Caring for people and being with them." },
    { id: "faith", name: "Faith", coin: "Candlelight", fill: 100, enamel: "#481028", meaning: "Shabbos, learning, prayer, and gratitude." },
    { id: "home", name: "Home", coin: "The Hearth", fill: 75, enamel: "#703820", meaning: "A space and things kept in order." }
  ];

  var EASY_DEFAULT = ["sc-daily-care", "sc-teeth", "body-hop-walk", "mus-vocals", "sc-lights-out"];

  var CELEBRATE = {
    resilience: "Tell someone you did the hard thing.",
    body: "Step outside for one easy minute.",
    finances: "Write down what this opens.",
    career: "Leave a kind note for a family you teach.",
    "self-care": "Sit a minute with something warm.",
    "music-creativity": "Hum one line, just for you.",
    "kindness-connection": "Send one kind message.",
    faith: "Name three things you are glad for.",
    home: "Stand in the room and enjoy it."
  };

  var TRACKS = { voice: "Voice", piano: "Piano", guitar: "Guitar", book1: "Book 1" };

  /* Voice, piano, guitar, and tired-day voice. Each once a day.
     Tired-day voice stands in for Voice that day.
     An older Music done entry still counts toward the same daily cap. */
  var MUSIC_CAP = 75;
  var MUSIC_LEGACY_ID = "music-done";
  var MUSIC_TAPS = [
    { id: "music-voice", label: "Voice", points: 35, pair: "music-tired-voice" },
    { id: "music-piano", label: "Piano", points: 25 },
    { id: "music-guitar", label: "Guitar", points: 25 },
    { id: "music-tired-voice", label: "Tired-day voice", points: 15, pair: "music-voice" }
  ];

  function uid() {
    return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  }

  function domain(id) {
    for (var i = 0; i < DOMAINS.length; i++) if (DOMAINS[i].id === id) return DOMAINS[i];
    return null;
  }

  /* "Resilience · The Oak". Pass a domain object or an id. Names stay on DOMAINS. */
  function coinLabel(domOrId) {
    var dom = domOrId && typeof domOrId === "object" ? domOrId : domain(domOrId);
    if (!dom || !dom.name || !dom.coin) return "";
    return dom.name + " · " + dom.coin;
  }

  function dayKey(d) {
    var dt = d instanceof Date ? d : new Date();
    return dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0") + "-" + String(dt.getDate()).padStart(2, "0");
  }

  function prettyDay(key) {
    var p = String(key || "").split("-");
    if (p.length < 3) return "";
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return d.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  }

  function blank() {
    var meters = {};
    DOMAINS.forEach(function (d) { meters[d.id] = 0; });
    return {
      version: 1,
      scoring: "proposal",
      meters: meters,
      banked: [],
      entries: [],
      customTasks: [],
      easyDay: false,
      easyDayTaskIds: EASY_DEFAULT.slice(),
      musts: [],
      practice: [],
      weekPlans: {},
      seeds: {},
      shabbatHold: false,
      shabbatLifted: ""
    };
  }

  function active(state) {
    return state.entries.filter(function (e) { return !e.undone; });
  }

  function recompute(state) {
    var meters = {};
    DOMAINS.forEach(function (d) { meters[d.id] = 0; });
    var banked = [];
    active(state).forEach(function (e) {
      var dom = domain(e.domainId);
      if (!dom) return;
      if (e.kind === "bonus_coin") {
        var n = e.coins || 1;
        for (var i = 0; i < n; i++) {
          banked.push({
            id: e.id + (n > 1 ? "#" + i : ""),
            entryId: e.id,
            domainId: e.domainId,
            at: e.at,
            day: e.day,
            bonus: true,
            label: e.label
          });
        }
        return;
      }
      var left = e.points || 0;
      if (left <= 0) return;
      var meter = meters[e.domainId] || 0;
      var fill = dom.fill;
      while (left > 0) {
        var room = fill - meter;
        if (left >= room) {
          left -= room;
          meter = 0;
          banked.push({
            id: e.id + "#" + banked.length,
            entryId: e.id,
            domainId: e.domainId,
            at: e.at,
            day: e.day,
            bonus: false,
            label: e.label
          });
        } else {
          meter += left;
          left = 0;
        }
      }
      meters[e.domainId] = meter;
    });
    state.meters = meters;
    state.banked = banked;
    return state;
  }

  function droppedFor(state, entryId) {
    return state.banked.filter(function (c) { return c.entryId === entryId; });
  }

  function creditRaw(state, spec) {
    var entry = {
      id: spec.id || uid(),
      group: spec.group || uid(),
      at: spec.at || new Date().toISOString(),
      day: spec.day || dayKey(new Date()),
      domainId: spec.domainId,
      taskId: spec.taskId || "",
      label: spec.label || "",
      points: spec.kind === "bonus_coin" ? 0 : (spec.points || 0),
      kind: spec.kind || "points",
      source: spec.source || "task",
      coins: spec.kind === "bonus_coin" ? (spec.coins || spec.points || 1) : 0,
      shabbosKey: spec.shabbosKey || ""
    };
    state.entries.push(entry);
    recompute(state);
    return { duplicate: false, entry: entry, dropped: droppedFor(state, entry.id) };
  }

  function loggedToday(state, taskId, day) {
    return active(state).filter(function (e) { return e.taskId === taskId && e.day === day; });
  }

  function creditTask(state, task, opts) {
    opts = opts || {};
    var day = opts.day || dayKey(new Date());
    var at = opts.at || new Date().toISOString();
    if (!task || !domain(task.domainId)) return { error: "task", dropped: [] };
    if (!task.repeat) {
      var existing = loggedToday(state, task.id, day);
      if (existing.length) return { duplicate: true, entry: existing[0], dropped: [] };
    }
    return creditRaw(state, {
      group: opts.group,
      at: at,
      day: day,
      domainId: task.domainId,
      taskId: task.id,
      label: task.label,
      points: task.kind === "bonus_coin" ? 0 : task.points,
      kind: task.kind || "points",
      source: opts.source || "task",
      coins: task.kind === "bonus_coin" ? (task.points || 1) : 0,
      shabbosKey: opts.shabbosKey || ""
    });
  }

  function toggleTask(state, task, opts) {
    opts = opts || {};
    var day = opts.day || dayKey(new Date());
    if (task.repeat) return creditTask(state, task, opts);
    var existing = loggedToday(state, task.id, day);
    if (existing.length) {
      existing.forEach(function (e) { e.undone = true; });
      recompute(state);
      return { removed: true, entry: existing[0], dropped: [] };
    }
    return creditTask(state, task, opts);
  }

  function musicTap(id) {
    for (var i = 0; i < MUSIC_TAPS.length; i++) if (MUSIC_TAPS[i].id === id) return MUSIC_TAPS[i];
    return null;
  }

  function musicPointsOn(state, day) {
    var sum = 0;
    active(state).forEach(function (e) {
      if (e.day !== day) return;
      if (e.taskId !== MUSIC_LEGACY_ID && !musicTap(e.taskId)) return;
      sum += e.points || 0;
    });
    return sum;
  }

  function pairPoints(state, tap, day) {
    if (!tap || !tap.pair) return 0;
    var sum = 0;
    loggedToday(state, tap.pair, day).forEach(function (e) { sum += e.points || 0; });
    return sum;
  }

  /* True when this tap can be turned on, or is already on so a tap will un-tap it.
     Turning a tap on counts the points it adds after its pair is cleared. */
  function musicTapFits(state, tapId, day) {
    var tap = musicTap(tapId);
    if (!tap) return false;
    day = day || dayKey(new Date());
    if (loggedToday(state, tap.id, day).length) return true;
    return musicPointsOn(state, day) - pairPoints(state, tap, day) + tap.points <= MUSIC_CAP;
  }

  function musicCapped(state, day) {
    day = day || dayKey(new Date());
    if (musicPointsOn(state, day) >= MUSIC_CAP) return true;
    for (var i = 0; i < MUSIC_TAPS.length; i++) {
      var tap = MUSIC_TAPS[i];
      if (loggedToday(state, tap.id, day).length) continue;
      if (musicTapFits(state, tap.id, day)) return false;
    }
    return musicPointsOn(state, day) > 0;
  }

  function toggleMusic(state, tapId, opts) {
    opts = opts || {};
    var tap = musicTap(tapId);
    var day = opts.day || dayKey(new Date());
    if (!tap) return { error: "tap", dropped: [] };
    var existing = loggedToday(state, tap.id, day);
    if (existing.length) {
      existing.forEach(function (e) { e.undone = true; });
      recompute(state);
      return { removed: true, entry: existing[0], dropped: [], points: musicPointsOn(state, day), capped: musicCapped(state, day) };
    }
    if (!musicTapFits(state, tap.id, day)) {
      return { capped: true, dropped: [], points: musicPointsOn(state, day) };
    }
    var cleared = "";
    if (tap.pair) {
      var pairEntries = loggedToday(state, tap.pair, day);
      if (pairEntries.length) {
        pairEntries.forEach(function (e) { e.undone = true; });
        cleared = tap.pair;
      }
    }
    var res = creditRaw(state, {
      group: opts.group,
      at: opts.at,
      day: day,
      domainId: "music-creativity",
      taskId: tap.id,
      label: tap.label,
      points: tap.points,
      kind: "points",
      source: opts.source || "music"
    });
    res.cleared = cleared;
    res.points = musicPointsOn(state, day);
    res.capped = musicCapped(state, day);
    return res;
  }

  function toggleMust(state, task, opts) {
    opts = opts || {};
    var day = opts.day || dayKey(new Date());
    var existing = loggedToday(state, task.id, day);
    if (existing.length) {
      var pick = existing[existing.length - 1];
      for (var i = existing.length - 1; i >= 0; i--) if (existing[i].source === "rpm") pick = existing[i];
      pick.undone = true;
      recompute(state);
      return { removed: true, still: loggedToday(state, task.id, day).length, dropped: [] };
    }
    return creditTask(state, task, { day: day, at: opts.at, source: "rpm", group: opts.group });
  }

  function undoLatestForTask(state, taskId, day) {
    var list = loggedToday(state, taskId, day);
    if (!list.length) return null;
    var entry = list[list.length - 1];
    entry.undone = true;
    state.practice = state.practice.filter(function (p) { return p.group !== entry.group; });
    recompute(state);
    return entry;
  }

  function undoLast(state) {
    var entry = null;
    for (var i = state.entries.length - 1; i >= 0; i--) {
      if (!state.entries[i].undone) { entry = state.entries[i]; break; }
    }
    if (!entry) {
      if (state.practice.length) {
        state.practice.pop();
        return { practiceOnly: true };
      }
      return null;
    }
    var group = entry.group;
    state.entries.forEach(function (e) { if (e.group === group) e.undone = true; });
    state.practice = state.practice.filter(function (p) { return p.group !== group; });
    recompute(state);
    return entry;
  }

  function undoPractice(state, practiceId) {
    var session = null;
    state.practice.forEach(function (p) { if (p.id === practiceId) session = p; });
    if (!session) return null;
    state.entries.forEach(function (e) { if (e.group === session.group) e.undone = true; });
    state.practice = state.practice.filter(function (p) { return p.id !== practiceId; });
    recompute(state);
    return session;
  }

  function addCustom(state, spec) {
    var label = String(spec.label || "").trim().slice(0, 80);
    var points = Math.round(Number(spec.points));
    if (!label || !domain(spec.domainId) || !(points >= 1)) return null;
    if (points > 200) points = 200;
    var task = {
      id: "custom-" + uid(),
      domainId: spec.domainId,
      label: label,
      points: points,
      repeat: !!spec.repeat,
      kind: "points",
      cadence: spec.repeat ? "progress" : "daily",
      custom: true
    };
    state.customTasks.push(task);
    return task;
  }

  function addMust(state, spec) {
    if (state.musts.length >= 5) return null;
    var label = String(spec.label || "").trim().slice(0, 80);
    if (!label || !domain(spec.domainId) || !spec.taskId) return null;
    var must = { id: "must-" + uid(), label: label, domainId: spec.domainId, taskId: spec.taskId };
    state.musts.push(must);
    return must;
  }

  function removeMust(state, id) {
    state.musts = state.musts.filter(function (m) { return m.id !== id; });
  }

  function setEasyTasks(state, ids, byId) {
    if (!ids || ids.length !== 5) return false;
    var seen = {};
    for (var i = 0; i < ids.length; i++) {
      if (!byId[ids[i]] || seen[ids[i]]) return false;
      seen[ids[i]] = 1;
    }
    state.easyDayTaskIds = ids.slice();
    return true;
  }

  function setWeek(state, weekKey, domainId, fields) {
    if (!domain(domainId) || !weekKey) return;
    state.weekPlans[weekKey] = state.weekPlans[weekKey] || {};
    var cur = state.weekPlans[weekKey][domainId] || { result: "", purpose: "" };
    if (fields && "result" in fields) cur.result = String(fields.result || "").slice(0, 280);
    if (fields && "purpose" in fields) cur.purpose = String(fields.purpose || "").slice(0, 280);
    state.weekPlans[weekKey][domainId] = cur;
  }

  /* Friday evening and Saturday earn coins like any other day.
     A skipped day never takes points away. */
  function isMusicBlackout() {
    return false;
  }

  function sundayKey(date) {
    var d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() - d.getDay());
    return dayKey(d);
  }

  function sunThuKeys(date) {
    var d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() - d.getDay());
    var keys = [];
    for (var i = 0; i < 5; i++) {
      var x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i);
      keys.push(dayKey(x));
    }
    return keys;
  }

  function shabbosKey(date) {
    var d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    var day = d.getDay();
    if (day === 6) { /* Saturday itself */ }
    else if (day === 0) d.setDate(d.getDate() - 1);
    else if (day === 5) d.setDate(d.getDate() + 1);
    else d.setDate(d.getDate() - (day + 1));
    return dayKey(d);
  }

  function shabbatQuiet() {
    return false;
  }

  var COIN_NAMES = [
    ["the teacher's bell", "career"],
    ["teacher's bell", "career"],
    ["teachers bell", "career"],
    ["the copper key", "finances"],
    ["copper key", "finances"],
    ["still water", "self-care"],
    ["warm bread", "kindness-connection"],
    ["the songbird", "music-creativity"],
    ["songbird", "music-creativity"],
    ["candlelight", "faith"],
    ["the hearth", "home"],
    ["hearth", "home"],
    ["the ember", "body"],
    ["ember", "body"],
    ["the oak", "resilience"],
    ["oak", "resilience"],
    ["music and creativity", "music-creativity"],
    ["kindness and connection", "kindness-connection"],
    ["self care", "self-care"],
    ["resilience", "resilience"],
    ["finances", "finances"],
    ["career", "career"],
    ["faith", "faith"],
    ["home", "home"],
    ["body", "body"]
  ];

  function domainsInLabel(label) {
    var text = " " + String(label || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9']+/g, " ").replace(/\s+/g, " ") + " ";
    var found = [];
    COIN_NAMES.forEach(function (pair) {
      if (text.indexOf(" " + pair[0] + " ") >= 0 && domain(pair[1]) && found.indexOf(pair[1]) < 0) found.push(pair[1]);
    });
    return found;
  }

  var PLAN_STOP = { with: 1, this: 1, that: 1, from: 1, your: 1, have: 1, been: 1, when: 1, just: 1, into: 1, over: 1, after: 1, before: 1, them: 1, they: 1, will: 1, each: 1, more: 1, than: 1, about: 1, once: 1, time: 1, today: 1, example: 1 };

  function catalogPoints(domainId, label, byId) {
    var text = String(label || "").toLowerCase();
    var best = null;
    var bestScore = 0;
    var keys = Object.keys(byId || {});
    var i;
    for (i = 0; i < keys.length; i++) {
      var task = byId[keys[i]];
      if (!task || task.domainId !== domainId || task.kind === "bonus_coin") continue;
      var words = String(task.label || "").toLowerCase().match(/[a-z][a-z']{3,}/g) || [];
      var score = 0;
      for (var w = 0; w < words.length; w++) {
        if (PLAN_STOP[words[w]]) continue;
        if (text.indexOf(words[w]) >= 0) score += words[w].length;
      }
      if (score > bestScore) { bestScore = score; best = task; }
    }
    if (best && bestScore >= 5) return best.points;
    for (i = 0; i < keys.length; i++) {
      var daily = byId[keys[i]];
      if (daily && daily.domainId === domainId && daily.kind === "points" && daily.cadence === "daily") return daily.points;
    }
    return 0;
  }

  function weekItemId(id) {
    return "wk-" + String(id == null ? "" : id);
  }

  function weekMustAward() {
    return [];
  }

  function weekItemAward() {
    return [];
  }

  function planItemOn(state, day, itemId) {
    var prefix = "plan:" + day + ":" + itemId + ":";
    return active(state).some(function (e) {
      return e.taskId && e.taskId.indexOf(prefix) === 0;
    });
  }

  function togglePlanItem(state, spec) {
    spec = spec || {};
    var day = spec.day || dayKey(new Date());
    var itemId = String(spec.id || "");
    if (!itemId) return { error: "item", dropped: [] };
    if (itemId.indexOf("wk-") === 0) return { skipped: true, dropped: [] };
    var prefix = "plan:" + day + ":" + itemId + ":";
    var existing = active(state).filter(function (e) {
      return e.taskId && e.taskId.indexOf(prefix) === 0;
    });
    if (existing.length) {
      existing.forEach(function (e) { e.undone = true; });
      recompute(state);
      return { removed: true, dropped: [] };
    }
    var domains = spec.domains || [];
    if (!domains.length) return { skipped: true, dropped: [] };
    var group = uid();
    var dropped = [];
    var entries = [];
    domains.forEach(function (d) {
      var pts = Math.round(Number(d.points));
      if (!domain(d.domainId) || !(pts > 0)) return;
      var res = creditRaw(state, {
        group: group,
        day: day,
        at: spec.at,
        domainId: d.domainId,
        taskId: prefix + d.domainId,
        label: spec.label || d.label || coinLabel(d.domainId),
        points: pts,
        kind: "points",
        source: "plan"
      });
      if (res.entry) entries.push(res.entry);
      dropped = dropped.concat(res.dropped || []);
    });
    return { entries: entries, entry: entries[0] || null, dropped: dropped };
  }

  function trackLabel(track) { return TRACKS[track] || track; }

  function logPractice(state, opts, ctx) {
    opts = opts || {};
    ctx = ctx || {};
    var scoring = ctx.scoring;
    var byId = ctx.byId || {};
    var when = opts.at ? new Date(opts.at) : new Date();
    if (isNaN(when.getTime())) return { error: "time" };
    var minutes = opts.minutes;
    if ([5, 10, 20, 30].indexOf(minutes) < 0) return { error: "minutes" };
    if (!TRACKS[opts.track]) return { error: "track" };
    var day = dayKey(when);
    var group = uid();
    var blackout = isMusicBlackout(when, scoring);
    var session = {
      id: uid(),
      group: group,
      at: when.toISOString(),
      day: day,
      track: opts.track,
      minutes: minutes,
      note: String(opts.note || "").trim().slice(0, 140),
      tired: !!opts.tired,
      entryIds: [],
      points: 0,
      blackout: blackout
    };
    var dropped = [];
    var mode = state.scoring === "draft" ? "draft" : "proposal";
    if (!blackout && scoring) {
      if (mode === "proposal") {
        var taskId = opts.tired ? scoring.proposal.tiredDayMapsTo : scoring.proposal.practiceMapsTo[opts.track];
        var task = byId[taskId];
        if (task) {
          var res = creditTask(state, task, { day: day, at: session.at, source: "practice", group: group });
          if (!res.duplicate && res.entry) {
            session.entryIds.push(res.entry.id);
            session.points += task.points || 0;
            dropped = dropped.concat(res.dropped || []);
          }
        }
      } else {
        var per = Math.floor(minutes / scoring.draft.pointsPerMinutes) * scoring.draft.pointsEach;
        var already = 0;
        active(state).forEach(function (e) {
          if (e.day === day && e.source === "draft-minutes") already += e.points || 0;
        });
        var give = Math.min(per, Math.max(0, scoring.draft.dailyCap - already));
        if (give > 0) {
          var resM = creditRaw(state, {
            group: group, day: day, at: session.at, domainId: "music-creativity",
            taskId: "draft:minutes:" + session.id,
            label: trackLabel(opts.track) + " · " + minutes + " min",
            points: give, kind: "points", source: "draft-minutes"
          });
          session.entryIds.push(resM.entry.id);
          session.points += give;
          dropped = dropped.concat(resM.dropped);
        }
        var earlier = state.practice.filter(function (p) { return p.day === day && !p.blackout; });
        if (!earlier.length && opts.hardestTrack && opts.hardestTrack === opts.track && scoring.draft.hardestFirst) {
          var resH = creditRaw(state, {
            group: group, day: day, at: session.at, domainId: "music-creativity",
            taskId: "draft:hardest:" + session.id,
            label: "Hardest thing first",
            points: scoring.draft.hardestFirst, kind: "points", source: "draft-hardest"
          });
          session.entryIds.push(resH.entry.id);
          session.points += scoring.draft.hardestFirst;
          dropped = dropped.concat(resH.dropped);
        }
        if (opts.tired && scoring.draft.tiredDay) {
          var resT = creditRaw(state, {
            group: group, day: day, at: session.at, domainId: "music-creativity",
            taskId: "draft:tired:" + session.id,
            label: "Tired-day practice",
            points: scoring.draft.tiredDay, kind: "points", source: "draft-tired"
          });
          session.entryIds.push(resT.entry.id);
          session.points += scoring.draft.tiredDay;
          dropped = dropped.concat(resT.dropped);
        }
      }
    }
    state.practice.push(session);
    return { session: session, dropped: dropped, points: session.points, blackout: blackout, duplicate: session.points === 0 && !blackout && mode === "proposal" };
  }

  function setSkill(state, skillId, on, scoring, when) {
    when = when || new Date();
    var taskId = "skill:" + skillId;
    var existing = active(state).filter(function (e) { return e.taskId === taskId; });
    if (!on) {
      if (!existing.length) return { points: 0 };
      existing.forEach(function (e) { e.undone = true; });
      recompute(state);
      return { points: 0, removed: true };
    }
    if (existing.length) return { points: 0, duplicate: true };
    if (state.scoring !== "draft") return { points: 0, skipped: true };
    if (isMusicBlackout(when, scoring)) return { points: 0, blackout: true };
    var pts = scoring && scoring.draft ? scoring.draft.skillCheckoff : 0;
    if (!pts) return { points: 0 };
    creditRaw(state, {
      domainId: "music-creativity", taskId: taskId, label: "Skill checkoff",
      points: pts, kind: "points", source: "draft-skill",
      day: dayKey(when), at: when.toISOString()
    });
    return { points: pts };
  }

  function creditVoiceTest(state, scoring, when) {
    when = when || new Date();
    if (state.scoring !== "draft") return { skipped: true, points: 0 };
    var age = (Date.now() - when.getTime()) / 86400000;
    if (age > 8 || age < -1) return { skipped: true, points: 0 };
    if (isMusicBlackout(when, scoring)) return { blackout: true, points: 0 };
    var wk = sundayKey(when);
    var taskId = "voicetest:" + wk;
    var existing = active(state).filter(function (e) { return e.taskId === taskId; });
    if (existing.length) return { duplicate: true, points: 0 };
    var pts = scoring && scoring.draft ? scoring.draft.weeklyVoiceTest : 0;
    if (!pts) return { points: 0 };
    var res = creditRaw(state, {
      domainId: "music-creativity", taskId: taskId, label: "Weekly voice test",
      points: pts, kind: "points", source: "draft-voicetest",
      day: dayKey(when), at: when.toISOString()
    });
    return { points: pts, dropped: res.dropped };
  }

  function shabbosLogged(state, date) {
    var key = shabbosKey(date || new Date());
    return active(state).some(function (e) { return e.taskId === "faith-shabbos" && e.shabbosKey === key; });
  }

  function logShabbos(state, task, when) {
    when = when || new Date();
    var key = shabbosKey(when);
    if (shabbosLogged(state, when)) return { duplicate: true, dropped: [] };
    var res = creditTask(state, task, {
      day: dayKey(when), at: when.toISOString(), source: "shabbos", shabbosKey: key
    });
    state.shabbatHold = false;
    state.shabbatLifted = key;
    return res;
  }

  function weekMinutes(state, date, scoring) {
    var keys = sunThuKeys(date || new Date());
    var sum = 0;
    state.practice.forEach(function (p) {
      if (!p.blackout && keys.indexOf(p.day) >= 0) sum += p.minutes || 0;
    });
    var daily = (scoring && scoring.sunThuDailyMinutes) || 60;
    var days = (scoring && scoring.sunThuDays) || 5;
    return { minutes: sum, goal: daily * days, keys: keys };
  }

  function hasProgress(state) {
    return state.entries.some(function (e) { return !e.undone; });
  }

  function canOfferSeed(state, id) {
    if (!state.seeds) state.seeds = {};
    if (state.seeds[id] || state.seeds[id + ":declined"]) return false;
    return !hasProgress(state);
  }

  function applySeed(state, seed) {
    if (!seed || !seed.id) return { error: "seed" };
    if (state.seeds && state.seeds[seed.id]) return { already: true };
    if (hasProgress(state)) return { blocked: true };
    state.seeds = state.seeds || {};
    var group = "seed-" + seed.id;
    Object.keys(seed.meters || {}).forEach(function (id) {
      var pts = seed.meters[id] | 0;
      if (pts > 0 && domain(id)) {
        creditRaw(state, {
          id: "seed-" + seed.id + "-" + id,
          group: group,
          at: seed.at || new Date().toISOString(),
          day: seed.day || dayKey(new Date()),
          domainId: id,
          taskId: "seed:" + seed.id + ":" + id,
          label: "Progress already counted",
          points: pts,
          kind: "points",
          source: "seed"
        });
      }
    });
    state.seeds[seed.id] = true;
    recompute(state);
    return { ok: true };
  }

  function declineSeed(state, id) {
    state.seeds = state.seeds || {};
    state.seeds[id + ":declined"] = true;
  }

  function exportBundle(state) {
    return { game: "The Self Love Bank", version: 1, exportedAt: new Date().toISOString(), state: state };
  }

  function importBundle(data) {
    if (!data || typeof data !== "object") return { ok: false, error: "That file is not a Self Love Bank save." };
    var state = null;
    if (data.state && data.state.version === 1 && Array.isArray(data.state.entries)) state = data.state;
    else if (data.version === 1 && Array.isArray(data.entries)) state = data;
    if (!state) return { ok: false, error: "That file is not a Self Love Bank save." };
    if (state.entries.length > 5000) return { ok: false, error: "That save is too large for this phone." };
    var base = blank();
    Object.keys(base).forEach(function (k) { if (state[k] === undefined) state[k] = base[k]; });
    if (state.scoring !== "draft") state.scoring = "proposal";
    recompute(state);
    return { ok: true, state: state };
  }

  /* Live phones store this under localStorage slb.v1, version 1.
     The ledger is kept. Meters and banked coins are rebuilt from it.
     A load does not zero a coin or drop an entry. */
  function ensureShape(state) {
    var base = blank();
    if (!state || state.version !== 1 || !Array.isArray(state.entries)) return blank();
    Object.keys(base).forEach(function (k) { if (state[k] === undefined) state[k] = base[k]; });
    recompute(state);
    return state;
  }

  return {
    DOMAINS: DOMAINS,
    EASY_DEFAULT: EASY_DEFAULT,
    CELEBRATE: CELEBRATE,
    TRACKS: TRACKS,
    domain: domain,
    coinLabel: coinLabel,
    domainsInLabel: domainsInLabel,
    catalogPoints: catalogPoints,
    weekItemId: weekItemId,
    weekMustAward: weekMustAward,
    weekItemAward: weekItemAward,
    planItemOn: planItemOn,
    togglePlanItem: togglePlanItem,
    dayKey: dayKey,
    prettyDay: prettyDay,
    blank: blank,
    recompute: recompute,
    creditRaw: creditRaw,
    creditTask: creditTask,
    toggleTask: toggleTask,
    toggleMusic: toggleMusic,
    MUSIC_CAP: MUSIC_CAP,
    MUSIC_TAPS: MUSIC_TAPS,
    MUSIC_LEGACY_ID: MUSIC_LEGACY_ID,
    musicPointsOn: musicPointsOn,
    musicTapFits: musicTapFits,
    musicCapped: musicCapped,
    toggleMust: toggleMust,
    undoLast: undoLast,
    undoLatestForTask: undoLatestForTask,
    undoPractice: undoPractice,
    loggedToday: loggedToday,
    addCustom: addCustom,
    addMust: addMust,
    removeMust: removeMust,
    setEasyTasks: setEasyTasks,
    setWeek: setWeek,
    isMusicBlackout: isMusicBlackout,
    sundayKey: sundayKey,
    sunThuKeys: sunThuKeys,
    shabbosKey: shabbosKey,
    shabbatQuiet: shabbatQuiet,
    logPractice: logPractice,
    setSkill: setSkill,
    creditVoiceTest: creditVoiceTest,
    shabbosLogged: shabbosLogged,
    logShabbos: logShabbos,
    weekMinutes: weekMinutes,
    canOfferSeed: canOfferSeed,
    applySeed: applySeed,
    declineSeed: declineSeed,
    exportBundle: exportBundle,
    importBundle: importBundle,
    ensureShape: ensureShape,
    active: active
  };
});
