"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const L = require("./logic.js");
const scoring = require("./songbird.js");
const tasks = require("./tasks.json");
const seed = require("./seed-nov16.json");
const cur = require("../curriculum.json");

const byId = {};
let count = 0;
tasks.domains.forEach(function (d) {
  d.tasks.forEach(function (t) {
    t.domainId = d.id;
    byId[t.id] = t;
    count++;
  });
});

assert.strictEqual(count, 98, "task count");
L.DOMAINS.forEach(function (d) {
  const fromFile = tasks.domains.find(function (x) { return x.id === d.id; });
  assert.ok(fromFile, d.id);
  assert.strictEqual(fromFile.fill, d.fill, d.id + " fill");
  assert.strictEqual(fromFile.coin, d.coin);
  assert.strictEqual(L.coinLabel(d), d.name + " · " + d.coin);
  assert.strictEqual(L.coinLabel(d.id), d.name + " · " + d.coin);
});
assert.strictEqual(L.coinLabel("missing"), "");
assert.strictEqual(L.coinLabel("resilience"), "Resilience · The Oak");
assert.strictEqual(L.coinLabel("body"), "Body · The Ember");
assert.strictEqual(L.coinLabel("finances"), "Finances · The Copper Key");
assert.strictEqual(L.coinLabel("career"), "Career · The Teacher's Bell");
assert.strictEqual(L.coinLabel("self-care"), "Self-Care · Still Water");
assert.strictEqual(L.coinLabel("music-creativity"), "Music & Creativity · The Songbird");
assert.strictEqual(L.coinLabel("kindness-connection"), "Kindness & Connection · Warm Bread");
assert.strictEqual(L.coinLabel("faith"), "Faith · Candlelight");
assert.strictEqual(L.coinLabel("home"), "Home · The Hearth");
assert.strictEqual(byId["body-milestone"].kind, "bonus_coin");
assert.strictEqual(byId["car-lesson"].repeat, true);
assert.ok(!byId["body-hop-walk"].repeat);
assert.strictEqual(seed.meters.body, 140);
assert.strictEqual(seed.meters.resilience, 70);
assert.ok(!seed.meters.home);

function fresh() { return L.blank(); }
const ctx = { byId: byId, scoring: scoring };

// Rollover banks a coin and keeps the remainder.
{
  const s = fresh();
  const res = L.creditRaw(s, { domainId: "home", points: 200, label: "steps", kind: "points", taskId: "x", day: "2026-11-17" });
  assert.strictEqual(res.dropped.length, 2);
  assert.strictEqual(s.meters.home, 50);
  assert.strictEqual(s.banked.length, 2);
}

// Bonus coin does not move the meter.
{
  const s = fresh();
  L.creditRaw(s, { domainId: "body", points: 40, label: "walk", kind: "points", taskId: "body-hop-walk", day: "2026-11-17" });
  const bonus = L.creditTask(s, byId["body-milestone"], { day: "2026-11-17" });
  assert.strictEqual(bonus.dropped.length, 1);
  assert.strictEqual(bonus.dropped[0].bonus, true);
  assert.strictEqual(s.meters.body, 40);
  assert.strictEqual(s.banked.length, 1);
}

// A second tap the same day does not double. Undo gives the points back.
{
  const s = fresh();
  const a = L.toggleTask(s, byId["home-bed"], { day: "2026-11-17" });
  assert.ok(!a.duplicate && a.entry);
  assert.strictEqual(s.meters.home, 10);
  const b = L.toggleTask(s, byId["home-bed"], { day: "2026-11-17" });
  assert.strictEqual(b.removed, true);
  assert.strictEqual(s.meters.home, 0);
  assert.strictEqual(s.banked.length, 0);
}

// Filling exactly drops the coin and leaves a clean meter. Undo pulls it back.
{
  const s = fresh();
  L.creditRaw(s, { domainId: "home", points: 65, label: "already", kind: "points", taskId: "pre", day: "2026-11-17" });
  const res = L.toggleTask(s, byId["home-bed"], { day: "2026-11-17" });
  assert.strictEqual(res.dropped.length, 1);
  assert.strictEqual(s.meters.home, 0);
  L.undoLast(s);
  assert.strictEqual(s.meters.home, 65);
  assert.strictEqual(s.banked.length, 0);
}

// Lessons can be logged more than once. A must does not double the first one.
{
  const s = fresh();
  L.creditTask(s, byId["car-lesson"], { day: "2026-11-17", source: "task" });
  L.creditTask(s, byId["car-lesson"], { day: "2026-11-17", source: "task" });
  assert.strictEqual(s.meters.career, 40);
  const must = L.toggleMust(s, byId["car-lesson"], { day: "2026-11-17" });
  assert.strictEqual(must.removed, true);
  assert.strictEqual(s.meters.career, 20);
  const again = L.toggleMust(s, byId["mus-vocals"], { day: "2026-11-17" });
  assert.ok(again.entry);
  const dup = L.toggleTask(s, byId["mus-vocals"], { day: "2026-11-17" });
  assert.strictEqual(dup.removed, true);
  assert.strictEqual(s.meters["music-creativity"], 0);
}

// Proposal practice uses the task points once. Draft mode does not also add them.
{
  const s = fresh();
  const when = new Date(2026, 10, 17, 15, 0, 0);
  const a = L.logPractice(s, { track: "voice", minutes: 20, at: when.toISOString() }, ctx);
  assert.strictEqual(a.points, 25);
  assert.strictEqual(s.meters["music-creativity"], 25);
  const b = L.logPractice(s, { track: "voice", minutes: 10, at: when.toISOString() }, ctx);
  assert.strictEqual(b.points, 0);
  assert.strictEqual(s.practice.length, 2);
  assert.strictEqual(s.meters["music-creativity"], 25);
  s.scoring = "draft";
  const next = new Date(2026, 10, 18, 15, 0, 0);
  const c = L.logPractice(s, { track: "piano", minutes: 30, at: next.toISOString(), hardestTrack: "piano" }, ctx);
  assert.strictEqual(c.points, 3 + 2);
  assert.strictEqual(s.meters["music-creativity"], 25 + 5);
  const d = L.logPractice(s, { track: "guitar", minutes: 30, at: next.toISOString() }, ctx);
  assert.strictEqual(d.points, 3);
  const e = L.logPractice(s, { track: "voice", minutes: 30, at: next.toISOString() }, ctx);
  assert.strictEqual(e.points, 0);
}

// Tired day in draft mode is +1, and 5 minutes adds no minute-points.
{
  const s = fresh();
  s.scoring = "draft";
  const when = new Date(2026, 10, 18, 9, 0, 0);
  const r = L.logPractice(s, { track: "voice", minutes: 5, tired: true, at: when.toISOString() }, ctx);
  assert.strictEqual(r.points, 1);
}

// Friday evening and Saturday earn coins like any other day. A skipped day does not take points away.
{
  const s = fresh();
  const fri = new Date(2026, 10, 20, 18, 30, 0);
  const sat = new Date(2026, 10, 21, 11, 0, 0);
  assert.strictEqual(L.isMusicBlackout(fri, scoring), false);
  assert.strictEqual(L.isMusicBlackout(sat, scoring), false);
  assert.strictEqual(L.shabbatQuiet(s, sat), false);
  const a = L.logPractice(s, { track: "voice", minutes: 20, at: fri.toISOString() }, ctx);
  const b = L.logPractice(s, { track: "piano", minutes: 10, at: sat.toISOString() }, ctx);
  assert.strictEqual(a.blackout, false);
  assert.strictEqual(a.points, 25);
  assert.strictEqual(b.points, 25);
  assert.strictEqual(s.meters["music-creativity"], 50);
  assert.strictEqual(L.weekMinutes(s, fri, scoring).minutes, 0);
  const thu = new Date(2026, 10, 19, 19, 0, 0);
  L.logPractice(s, { track: "guitar", minutes: 30, at: thu.toISOString() }, ctx);
  assert.strictEqual(L.weekMinutes(s, fri, scoring).minutes, 30);
  assert.strictEqual(L.weekMinutes(s, fri, scoring).goal, 300);
  const quiet = fresh();
  L.toggleTask(quiet, byId["home-bed"], { day: "2026-11-13" });
  L.recompute(quiet);
  assert.strictEqual(quiet.meters.home, 10);
}

// Skill checkoff and voice test follow the active set.
{
  const s = fresh();
  const when = new Date();
  assert.strictEqual(L.setSkill(s, "v1", true, scoring, when).points, 0);
  s.scoring = "draft";
  assert.strictEqual(L.setSkill(s, "v1", true, scoring, when).points, 10);
  assert.strictEqual(L.setSkill(s, "v1", true, scoring, when).duplicate, true);
  L.setSkill(s, "v1", false, scoring, when);
  assert.strictEqual(s.meters["music-creativity"], 0);
  assert.strictEqual(L.creditVoiceTest(s, scoring, when).points, 5);
  assert.strictEqual(L.creditVoiceTest(s, scoring, when).duplicate, true);
}

// Shabbos still logs once per week, and Saturday is not a quiet block.
{
  const s = fresh();
  const sat = new Date(2026, 10, 21, 20, 0, 0);
  assert.strictEqual(L.shabbatQuiet(s, sat), false);
  const res = L.logShabbos(s, byId["faith-shabbos"], sat);
  assert.strictEqual(res.entry.points, 50);
  assert.strictEqual(L.shabbatQuiet(s, sat), false);
  assert.strictEqual(L.logShabbos(s, byId["faith-shabbos"], sat).duplicate, true);
  assert.strictEqual(s.meters.faith, 50);
}

// A plan check awards the named coin once. Uncheck and recheck does not double it.
{
  function same(a, b) { assert.deepStrictEqual(a.slice().sort(), b.slice().sort()); }
  same(L.domainsInLabel("Grocery run (Ember, Oak)"), ["body", "resilience"]);
  assert.deepStrictEqual(L.domainsInLabel("Vocals (Songbird)"), ["music-creativity"]);
  assert.deepStrictEqual(L.domainsInLabel("Income hour (Teacher's Bell)"), ["career"]);
  assert.deepStrictEqual(L.domainsInLabel("Fold laundry (Hearth)"), ["home"]);
  assert.deepStrictEqual(L.domainsInLabel("Dinner (Still Water)"), ["self-care"]);
  assert.deepStrictEqual(L.domainsInLabel("A gratitude list (Candlelight)"), ["faith"]);
  assert.deepStrictEqual(L.domainsInLabel("A kind note (Warm Bread)"), ["kindness-connection"]);
  assert.deepStrictEqual(L.domainsInLabel("Protein lunch"), []);
  assert.strictEqual(L.coinLabel("resilience"), "Resilience · The Oak");
  assert.strictEqual(L.catalogPoints("body", "Hour of Power walk (Ember)", byId), 25);
  assert.strictEqual(L.catalogPoints("body", "Human Garage (Ember)", byId), 20);
  assert.strictEqual(L.catalogPoints("music-creativity", "Vocals (Songbird)", byId), 25);
  assert.strictEqual(L.catalogPoints("career", "Bank Game block (Teacher's Bell)", byId), 30);
  assert.strictEqual(L.catalogPoints("resilience", "Grocery run and one phone call (Oak)", byId), 30);
  const s = fresh();
  const domains = [
    { domainId: "body", points: 25, label: "Body · The Ember" },
    { domainId: "resilience", points: 30, label: "Resilience · The Oak" }
  ];
  L.togglePlanItem(s, { id: "s7", day: "2026-11-21", label: "Grocery run", domains: domains });
  assert.strictEqual(s.meters.body, 25);
  assert.strictEqual(s.meters.resilience, 30);
  assert.strictEqual(L.planItemOn(s, "2026-11-21", "s7"), true);
  const off = L.togglePlanItem(s, { id: "s7", day: "2026-11-21", domains: domains });
  assert.strictEqual(off.removed, true);
  assert.strictEqual(s.meters.body, 0);
  assert.strictEqual(s.meters.resilience, 0);
  L.togglePlanItem(s, { id: "s7", day: "2026-11-21", domains: domains });
  assert.strictEqual(s.meters.body, 25);
  assert.strictEqual(s.meters.resilience, 30);
  assert.strictEqual(L.active(s).filter(function (e) { return e.taskId.indexOf("plan:2026-11-21:s7:") === 0; }).length, 2);
}

// Each music tap is once per day, including Saturday, and a second tap un-taps.
// A quiet next day leaves the points where they are.
{
  const s = fresh();
  const sat = new Date(2026, 10, 21, 11, 0, 0);
  const day = "2026-11-21";
  assert.strictEqual(L.isMusicBlackout(sat, scoring), false);
  assert.strictEqual(L.shabbatQuiet(s, sat), false);
  assert.deepStrictEqual(L.MUSIC_TAPS.map(function (t) { return [t.id, t.label, t.points]; }), [
    ["music-voice", "Voice", 35],
    ["music-piano", "Piano", 25],
    ["music-guitar", "Guitar", 25],
    ["music-tired-voice", "Tired-day voice", 15]
  ]);
  assert.strictEqual(L.MUSIC_CAP, 75);
  const voice = L.toggleMusic(s, "music-voice", { day: day, at: sat.toISOString() });
  assert.strictEqual(voice.entry.domainId, "music-creativity");
  assert.strictEqual(voice.entry.points, 35);
  assert.strictEqual(L.coinLabel(voice.entry.domainId), "Music & Creativity · The Songbird");
  assert.strictEqual(s.meters["music-creativity"], 35);
  const off = L.toggleMusic(s, "music-voice", { day: day });
  assert.strictEqual(off.removed, true);
  assert.strictEqual(s.meters["music-creativity"], 0);
  assert.strictEqual(s.entries.filter(function (e) { return e.taskId === "music-voice" && e.undone; })[0].points, 35);
  L.toggleMusic(s, "music-voice", { day: day });
  L.toggleMusic(s, "music-piano", { day: day });
  L.toggleMusic(s, "music-piano", { day: day });
  L.toggleMusic(s, "music-piano", { day: day });
  assert.strictEqual(L.active(s).filter(function (e) { return e.day === day && e.taskId === "music-voice"; }).length, 1);
  assert.strictEqual(L.active(s).filter(function (e) { return e.day === day && e.taskId === "music-piano"; }).length, 1);
  assert.strictEqual(L.musicPointsOn(s, day), 60);
  const next = "2026-11-22";
  assert.strictEqual(L.musicPointsOn(s, next), 0);
  assert.strictEqual(s.meters["music-creativity"], 60);
  L.toggleMusic(s, "music-guitar", { day: next });
  L.toggleMusic(s, "music-guitar", { day: next });
  assert.strictEqual(L.loggedToday(s, "music-guitar", next).length, 0);
  L.toggleMusic(s, "music-guitar", { day: next });
  assert.strictEqual(L.active(s).filter(function (e) { return e.day === next && e.taskId === "music-guitar"; }).length, 1);
  assert.strictEqual(L.loggedToday(s, "music-guitar", day).length, 0);
  const third = "2026-11-23";
  L.toggleMusic(s, "music-tired-voice", { day: third });
  L.toggleMusic(s, "music-tired-voice", { day: third });
  L.toggleMusic(s, "music-tired-voice", { day: third });
  assert.strictEqual(L.active(s).filter(function (e) { return e.day === third && e.taskId === "music-tired-voice"; }).length, 1);
  assert.strictEqual(L.musicPointsOn(s, third), 15);
  assert.strictEqual(s.meters["music-creativity"], 0);
  assert.strictEqual(s.banked.filter(function (c) { return c.domainId === "music-creativity"; }).length, 1);
  assert.notStrictEqual(35, byId["mus-vocals"].points);
}

// Tired-day voice replaces Voice that day. The two never both count.
{
  const s = fresh();
  const day = "2026-11-21";
  L.toggleMusic(s, "music-voice", { day: day });
  L.toggleMusic(s, "music-piano", { day: day });
  const tired = L.toggleMusic(s, "music-tired-voice", { day: day });
  assert.strictEqual(tired.cleared, "music-voice");
  assert.strictEqual(L.loggedToday(s, "music-voice", day).length, 0);
  assert.strictEqual(L.loggedToday(s, "music-tired-voice", day).length, 1);
  assert.strictEqual(L.loggedToday(s, "music-piano", day).length, 1);
  assert.strictEqual(L.musicPointsOn(s, day), 15 + 25);
  const back = L.toggleMusic(s, "music-voice", { day: day });
  assert.strictEqual(back.cleared, "music-tired-voice");
  assert.strictEqual(L.loggedToday(s, "music-tired-voice", day).length, 0);
  assert.strictEqual(L.loggedToday(s, "music-voice", day).length, 1);
  assert.strictEqual(L.musicPointsOn(s, day), 35 + 25);
  assert.strictEqual(L.active(s).filter(function (e) {
    return e.day === day && (e.taskId === "music-voice" || e.taskId === "music-tired-voice");
  }).length, 1);
}

// Music taps stop at 75 for the day. Voice plus both instruments is 85, so that third tap is refused.
{
  const s = fresh();
  const day = "2026-11-21";
  L.toggleMusic(s, "music-voice", { day: day });
  L.toggleMusic(s, "music-piano", { day: day });
  assert.strictEqual(L.musicPointsOn(s, day), 60);
  assert.strictEqual(L.musicTapFits(s, "music-guitar", day), false);
  assert.strictEqual(L.musicCapped(s, day), false);
  const guitar = L.toggleMusic(s, "music-guitar", { day: day });
  assert.strictEqual(guitar.capped, true);
  assert.strictEqual(L.loggedToday(s, "music-guitar", day).length, 0);
  assert.strictEqual(L.musicPointsOn(s, day), 60);
  assert.strictEqual(s.meters["music-creativity"], 60);
  L.toggleMusic(s, "music-piano", { day: day });
  const guitarOn = L.toggleMusic(s, "music-guitar", { day: day });
  assert.ok(!guitarOn.capped);
  assert.strictEqual(L.musicPointsOn(s, day), 60);
  L.toggleMusic(s, "music-tired-voice", { day: day });
  L.toggleMusic(s, "music-piano", { day: day });
  assert.strictEqual(L.musicPointsOn(s, day), 15 + 25 + 25);
  assert.strictEqual(L.musicCapped(s, day), true);
  const voiceBlocked = L.toggleMusic(s, "music-voice", { day: day });
  assert.strictEqual(voiceBlocked.capped, true);
  assert.strictEqual(L.loggedToday(s, "music-tired-voice", day).length, 1);
  assert.strictEqual(L.loggedToday(s, "music-voice", day).length, 0);
  assert.strictEqual(L.musicPointsOn(s, day), 65);
  assert.strictEqual(s.meters["music-creativity"], 65);
}

// An older Music done 35 entry is kept as it was, and it still counts.
{
  const day = "2026-11-16";
  const live = {
    version: 1,
    scoring: "proposal",
    meters: {
      resilience: 0, body: 0, finances: 0, career: 0,
      "self-care": 0, "music-creativity": 0,
      "kindness-connection": 0, faith: 0, home: 0
    },
    banked: [],
    entries: [
      { id: "old-music", group: "gm", at: "2026-11-16T18:00:00.000Z", day: day, domainId: "music-creativity", taskId: "music-done", label: "Music done", points: 35, kind: "points", source: "music-done", coins: 0, shabbosKey: "" },
      { id: "old-bed", group: "gb", at: "2026-11-16T19:00:00.000Z", day: day, domainId: "home", taskId: "home-bed", label: "Made my bed", points: 10, kind: "points", source: "task", coins: 0, shabbosKey: "" }
    ],
    customTasks: [],
    easyDay: false,
    easyDayTaskIds: ["sc-daily-care", "sc-teeth", "body-hop-walk", "mus-vocals", "sc-lights-out"],
    musts: [],
    practice: [],
    weekPlans: {},
    seeds: {},
    shabbatHold: false,
    shabbatLifted: ""
  };
  const raw = JSON.parse(JSON.stringify(live));
  const entriesBefore = JSON.parse(JSON.stringify(raw.entries));
  const loaded = L.ensureShape(raw);
  assert.strictEqual(loaded, raw);
  assert.deepStrictEqual(loaded.entries, entriesBefore);
  assert.strictEqual(loaded.version, 1);
  assert.strictEqual(loaded.entries[0].id, "old-music");
  assert.strictEqual(loaded.entries[0].taskId, "music-done");
  assert.strictEqual(loaded.entries[0].label, "Music done");
  assert.strictEqual(loaded.entries[0].points, 35);
  assert.ok(!loaded.entries[0].undone);
  assert.strictEqual(loaded.meters["music-creativity"], 35);
  assert.strictEqual(loaded.meters.home, 10);
  assert.strictEqual(L.musicPointsOn(loaded, day), 35);
  assert.strictEqual(L.loggedToday(loaded, "music-voice", day).length, 0);
  L.toggleMusic(loaded, "music-voice", { day: day });
  assert.strictEqual(L.musicPointsOn(loaded, day), 70);
  assert.strictEqual(loaded.meters["music-creativity"], 70);
  const piano = L.toggleMusic(loaded, "music-piano", { day: day });
  assert.strictEqual(piano.capped, true);
  assert.strictEqual(L.musicPointsOn(loaded, day), 70);
  assert.strictEqual(loaded.entries[0].taskId, "music-done");
  assert.strictEqual(loaded.entries[0].points, 35);
  assert.strictEqual(loaded.entries[0].label, "Music done");
  assert.ok(!loaded.entries[0].undone);
  L.toggleMusic(loaded, "music-voice", { day: day });
  L.toggleMusic(loaded, "music-tired-voice", { day: day });
  L.toggleMusic(loaded, "music-piano", { day: day });
  assert.strictEqual(L.musicPointsOn(loaded, day), 75);
  assert.strictEqual(L.musicCapped(loaded, day), true);
  const guitar = L.toggleMusic(loaded, "music-guitar", { day: day });
  assert.strictEqual(guitar.capped, true);
  assert.strictEqual(L.musicPointsOn(loaded, day), 75);
  assert.strictEqual(loaded.meters["music-creativity"], 75);
  assert.strictEqual(loaded.meters.home, 10);
  const back = L.importBundle(L.exportBundle(loaded));
  assert.strictEqual(back.ok, true);
  assert.strictEqual(back.state.entries[0].taskId, "music-done");
  assert.strictEqual(back.state.entries[0].points, 35);
  assert.strictEqual(back.state.meters["music-creativity"], 75);
}

// A live slb.v1 save keeps its ledger, points, and banked coins.
{
  const live = {
    version: 1,
    scoring: "proposal",
    meters: {
      resilience: 0, body: 10, finances: 0, career: 99,
      "self-care": 0, "music-creativity": 25,
      "kindness-connection": 0, faith: 0, home: 10
    },
    banked: [
      { id: "stored-coin", entryId: "e2", domainId: "body", at: "2026-11-16T15:00:00.000Z", day: "2026-11-16", bonus: false, label: "Strength gym session" }
    ],
    entries: [
      { id: "e1", group: "g1", at: "2026-11-16T12:00:00.000Z", day: "2026-11-16", domainId: "body", taskId: "body-hop-walk", label: "Hour of Power morning walk", points: 40, kind: "points", source: "task", coins: 0, shabbosKey: "" },
      { id: "e2", group: "g2", at: "2026-11-16T15:00:00.000Z", day: "2026-11-16", domainId: "body", taskId: "body-gym", label: "Strength gym session", points: 120, kind: "points", source: "task", coins: 0, shabbosKey: "" },
      { id: "e3", group: "g3", at: "2026-11-16T18:00:00.000Z", day: "2026-11-16", domainId: "home", taskId: "home-bed", label: "Made my bed", points: 10, kind: "points", source: "task", coins: 0, shabbosKey: "" },
      { id: "e4", group: "g4", at: "2026-11-16T19:00:00.000Z", day: "2026-11-16", domainId: "career", taskId: "car-lesson", label: "Taught a lesson", points: 20, kind: "points", source: "task", coins: 0, shabbosKey: "", undone: true },
      { id: "e5", group: "g5", at: "2026-11-17T12:00:00.000Z", day: "2026-11-17", domainId: "music-creativity", taskId: "mus-vocals", label: "Vocal exercises", points: 25, kind: "points", source: "task", coins: 0, shabbosKey: "" },
      { id: "e6", group: "g6", at: "2026-11-17T15:00:00.000Z", day: "2026-11-17", domainId: "body", taskId: "body-milestone", label: "Body milestone", points: 0, kind: "bonus_coin", source: "bonus", coins: 1, shabbosKey: "" }
    ],
    customTasks: [{ id: "custom-abc", domainId: "home", label: "Water the plant", points: 5, repeat: false, kind: "points", cadence: "daily", custom: true }],
    easyDay: true,
    easyDayTaskIds: ["sc-daily-care", "sc-teeth", "body-hop-walk", "mus-vocals", "sc-lights-out"],
    musts: [{ id: "must-1", label: "A walk", domainId: "body", taskId: "body-hop-walk" }],
    practice: [{ id: "p1", group: "pg", at: "2026-11-17T12:00:00.000Z", day: "2026-11-17", track: "voice", minutes: 20, note: "", tired: false, entryIds: ["e5"], points: 25, blackout: false }],
    weekPlans: { "2026-11-15": { body: { result: "Move a little", purpose: "Because it feels good" } } },
    seeds: { nov16: true },
    shabbatHold: false,
    shabbatLifted: "2026-11-14"
  };
  const raw = JSON.parse(JSON.stringify(live));
  delete raw.weekPlans;
  const loaded = L.ensureShape(raw);
  assert.strictEqual(loaded.meters.body, 10);
  assert.strictEqual(loaded.meters.home, 10);
  assert.strictEqual(loaded.meters["music-creativity"], 25);
  assert.strictEqual(loaded.meters.career, 0);
  assert.strictEqual(loaded.entries.length, 6);
  assert.strictEqual(loaded.entries[3].undone, true);
  assert.strictEqual(loaded.entries[3].points, 20);
  assert.strictEqual(loaded.banked.length, 2);
  assert.strictEqual(loaded.banked.filter(function (c) { return c.domainId === "body" && c.bonus; }).length, 1);
  assert.strictEqual(loaded.banked.filter(function (c) { return c.domainId === "body" && !c.bonus; }).length, 1);
  assert.strictEqual(loaded.customTasks[0].label, "Water the plant");
  assert.strictEqual(loaded.musts[0].taskId, "body-hop-walk");
  assert.strictEqual(loaded.practice[0].minutes, 20);
  assert.strictEqual(loaded.seeds.nov16, true);
  assert.strictEqual(loaded.easyDay, true);
  assert.strictEqual(loaded.shabbatLifted, "2026-11-14");
  assert.deepStrictEqual(loaded.weekPlans, {});
  assert.strictEqual(loaded.version, 1);
}

// Seed is one time, totals only, and refuses a save that already has progress.
{
  const s = fresh();
  assert.strictEqual(L.canOfferSeed(s, "nov16"), true);
  const applied = L.applySeed(s, seed);
  assert.strictEqual(applied.ok, true);
  assert.strictEqual(s.meters.body, 140);
  assert.strictEqual(s.meters.resilience, 70);
  assert.strictEqual(s.meters.finances, 75);
  assert.strictEqual(s.meters["music-creativity"], 25);
  assert.strictEqual(s.meters["kindness-connection"], 30);
  assert.strictEqual(s.banked.length, 0);
  assert.strictEqual(L.applySeed(s, seed).already, true);
  const busy = fresh();
  L.toggleTask(busy, byId["home-bed"], { day: "2026-11-17" });
  assert.strictEqual(L.applySeed(busy, seed).blocked, true);
  assert.strictEqual(busy.meters.home, 10);
}

// Export and import round-trip. A bad file is refused.
{
  const s = fresh();
  L.toggleTask(s, byId["faith-gratitude"], { day: "2026-11-17" });
  const raw = JSON.parse(JSON.stringify(L.exportBundle(s)));
  const back = L.importBundle(raw);
  assert.strictEqual(back.ok, true);
  assert.strictEqual(back.state.meters.faith, 10);
  assert.strictEqual(L.importBundle({ hello: 1 }).ok, false);
}

// Musts stay between 0 and 5, and easy day wants five real tasks.
{
  const s = fresh();
  for (let i = 0; i < 5; i++) {
    assert.ok(L.addMust(s, { label: "Must " + i, domainId: "home", taskId: "home-bed" }));
  }
  assert.strictEqual(L.addMust(s, { label: "too many", domainId: "home", taskId: "home-bed" }), null);
  assert.strictEqual(L.setEasyTasks(s, L.EASY_DEFAULT, byId), true);
  assert.strictEqual(L.setEasyTasks(s, ["nope", "home-bed", "home-bed", "home-dishes", "home-tidy"], byId), false);
}

// Curriculum the music page depends on is intact, plus the optional song.
{
  const ids = cur.cards.flatMap(function (c) { return c.skills.map(function (s) { return s[0]; }); });
  ["v1", "v2", "v3", "v4", "v5", "p1", "p2", "p3", "p4", "p5", "p6", "g1", "g2", "g3", "g4", "g5", "g6"].forEach(function (id) {
    assert.ok(ids.indexOf(id) >= 0, id);
  });
  assert.strictEqual(cur.updated, "2026-11-16");
  assert.strictEqual(cur.cards[0].now, "Daily voice routine, about 15 min: Regulate → Release → Rebuild");
  assert.strictEqual(cur.cards[0].routine.steps[0].title, "Regulate");
  assert.strictEqual(cur.cards[0].routine.steps[1].title, "Release");
  assert.strictEqual(cur.cards[0].routine.steps[4].title, "Rebuild");
  assert.strictEqual(cur.songs[0].title, "Heal");
  assert.strictEqual(cur.songs[0].key, "B minor");
  assert.ok(!cur.week);
  const index = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "app.css"), "utf8");
  const weekFile = JSON.parse(fs.readFileSync(path.join(__dirname, "../week.json"), "utf8"));
  assert.ok(JSON.stringify(cur).indexOf("voice-test/index.html") >= 0);
  assert.ok(index.indexOf("plan.json") >= 0);
  assert.ok(index.indexOf("week.json") >= 0);
  assert.ok(index.indexOf("My Curriculum") < 0);
  assert.ok(index.indexOf("curriculum.json") < 0);
  assert.ok(index.indexOf("Fredoka") < 0);
  assert.ok(index.indexOf("The Self Love Bank Game") >= 0);
  assert.ok(index.indexOf("by The Grateful Deb") >= 0);
  assert.ok(index.indexOf("Outfit") >= 0);
  assert.ok(index.indexOf("Plus+Jakarta+Sans") >= 0);
  assert.ok(css.indexOf("#FFF8EF") >= 0);
  assert.ok(css.indexOf("#C45A2A") >= 0);
  assert.ok(css.indexOf("#C9973E") >= 0);
  const bankApp = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
  assert.ok(bankApp.indexOf("plan.json") >= 0);
  assert.ok(bankApp.indexOf("week.json") >= 0);
  assert.ok(bankApp.indexOf("MUSIC_APP_URL") >= 0);
  assert.ok(bankApp.indexOf('var MUSIC_APP_URL = "https://debbieashvil-web.github.io/rpm-day/music/"') >= 0);
  assert.ok(bankApp.indexOf("Open music app") >= 0);
  assert.ok(bankApp.indexOf("data-music-tap") >= 0);
  assert.ok(bankApp.indexOf("L.MUSIC_TAPS") >= 0);
  assert.ok(bankApp.indexOf("Music full for today") >= 0);
  assert.strictEqual(bankApp.indexOf("data-music-done"), -1);
  assert.strictEqual(bankApp.indexOf("MUSIC_DONE_POINTS"), -1);
  const browserJs = fs.readFileSync(path.join(__dirname, "browser.js"), "utf8");
  assert.ok(browserJs.indexOf('var KEY = "slb.v1"') >= 0);
  assert.ok(bankApp.indexOf("toLocaleDateString") >= 0);
  assert.ok(bankApp.indexOf("Nothing written for this week yet") >= 0);
  assert.ok(Array.isArray(weekFile.days) && weekFile.days.length >= 7);
  assert.ok(/example/i.test(JSON.stringify(weekFile)));
  ["Debbie", "Melody", "Forgie"].forEach(function (name) {
    assert.strictEqual(JSON.stringify(weekFile).indexOf(name), -1, name);
  });
  const sw = fs.readFileSync(path.join(__dirname, "sw.js"), "utf8");
  assert.ok(sw.indexOf("slb-static-v8") >= 0);
  assert.strictEqual(sw.indexOf("slb-static-v7"), -1);
  const manifest = fs.readFileSync(path.join(__dirname, "manifest.webmanifest"), "utf8");
  assert.ok(manifest.indexOf("The Self Love Bank Game") >= 0);
  assert.ok(manifest.indexOf("#FFF8EF") >= 0);
}

console.log("logic.test.js ok (" + count + " tasks)");
