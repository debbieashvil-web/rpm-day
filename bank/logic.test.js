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

// Music done uses the Songbird vocal points, once per day, including Saturday.
{
  const s = fresh();
  const music = {
    id: "music-done",
    domainId: "music-creativity",
    label: "Music done",
    points: byId["mus-vocals"].points,
    kind: "points"
  };
  L.toggleTask(s, music, { day: "2026-11-21" });
  assert.strictEqual(s.meters["music-creativity"], byId["mus-vocals"].points);
  assert.strictEqual(L.toggleTask(s, music, { day: "2026-11-21" }).removed, true);
  assert.strictEqual(s.meters["music-creativity"], 0);
  L.toggleTask(s, music, { day: "2026-11-21" });
  assert.strictEqual(s.meters["music-creativity"], byId["mus-vocals"].points);
  assert.strictEqual(L.active(s).filter(function (e) { return e.taskId === "music-done"; }).length, 1);
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
  assert.ok(bankApp.indexOf('var MUSIC_APP_URL = ""') >= 0);
  assert.ok(bankApp.indexOf("toLocaleDateString") >= 0);
  assert.ok(bankApp.indexOf("Nothing written for this week yet") >= 0);
  assert.ok(Array.isArray(weekFile.days) && weekFile.days.length >= 7);
  assert.ok(/example/i.test(JSON.stringify(weekFile)));
  ["Debbie", "Melody", "Forgie"].forEach(function (name) {
    assert.strictEqual(JSON.stringify(weekFile).indexOf(name), -1, name);
  });
  const sw = fs.readFileSync(path.join(__dirname, "sw.js"), "utf8");
  assert.ok(sw.indexOf("slb-static-v6") >= 0);
  const manifest = fs.readFileSync(path.join(__dirname, "manifest.webmanifest"), "utf8");
  assert.ok(manifest.indexOf("The Self Love Bank Game") >= 0);
  assert.ok(manifest.indexOf("#FFF8EF") >= 0);
}

console.log("logic.test.js ok (" + count + " tasks)");
