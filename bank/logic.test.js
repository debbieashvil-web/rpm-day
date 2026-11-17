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

assert.strictEqual(count, 100, "task count");
L.DOMAINS.forEach(function (d) {
  const fromFile = tasks.domains.find(function (x) { return x.id === d.id; });
  assert.ok(fromFile, d.id);
  assert.strictEqual(fromFile.fill, d.fill, d.id + " fill");
  assert.strictEqual(fromFile.coin, d.coin);
});
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

// Approved Songbird points. Piano and guitar are separate. A short vocal is not the 35.
{
  const s = fresh();
  const afternoon = new Date(2026, 10, 17, 15, 0, 0);
  const voice = L.logPractice(s, { track: "voice", minutes: 20, at: afternoon.toISOString() }, ctx);
  assert.strictEqual(voice.points, 35);
  const short = L.logPractice(s, { track: "voice", minutes: 5, at: afternoon.toISOString() }, ctx);
  assert.strictEqual(short.points, 0);
  const both = fresh();
  const piano = L.logPractice(both, { track: "piano", minutes: 20, at: afternoon.toISOString() }, ctx);
  const guitar = L.logPractice(both, { track: "guitar", minutes: 20, at: afternoon.toISOString() }, ctx);
  assert.strictEqual(piano.points, 25);
  assert.strictEqual(guitar.points, 25);
  assert.strictEqual(both.meters["music-creativity"], 50);
  assert.strictEqual(byId["mus-vocals"].points, scoring.tracks.voice.points);
  assert.strictEqual(byId["mus-piano"].points, scoring.tracks.piano.points);
  assert.strictEqual(byId["mus-guitar"].points, scoring.tracks.guitar.points);
}

// Before noon adds 10 on the first morning session only.
{
  const s = fresh();
  const morning = new Date(2026, 10, 18, 9, 0, 0);
  const later = new Date(2026, 10, 18, 11, 0, 0);
  const afternoon = new Date(2026, 10, 18, 13, 0, 0);
  const first = L.logPractice(s, { track: "piano", minutes: 10, at: morning.toISOString() }, ctx);
  assert.strictEqual(first.points, 25 + 10);
  const second = L.logPractice(s, { track: "guitar", minutes: 10, at: later.toISOString() }, ctx);
  assert.strictEqual(second.points, 25);
  const after = L.logPractice(s, { track: "book1", minutes: 10, at: afternoon.toISOString() }, ctx);
  assert.strictEqual(after.session.beforeNoon, undefined);
  assert.ok(after.points <= 25);
  assert.ok(after.points !== 35);
  const nextDay = new Date(2026, 10, 19, 16, 0, 0);
  const noMorning = L.logPractice(s, { track: "piano", minutes: 10, at: nextDay.toISOString() }, ctx);
  assert.strictEqual(noMorning.points, 25);
}

// A tired day stands in for that session and does not stack.
{
  const s = fresh();
  const when = new Date(2026, 10, 18, 16, 0, 0);
  const tired = L.logPractice(s, { track: "voice", minutes: 5, tired: true, at: when.toISOString() }, ctx);
  assert.strictEqual(tired.points, 15);
  const full = L.logPractice(s, { track: "voice", minutes: 20, at: when.toISOString() }, ctx);
  assert.strictEqual(full.points, 0);
  assert.strictEqual(s.meters["music-creativity"], 15);
  const other = fresh();
  const fullFirst = L.logPractice(other, { track: "voice", minutes: 20, at: when.toISOString() }, ctx);
  const tiredLater = L.logPractice(other, { track: "voice", minutes: 5, tired: true, at: when.toISOString() }, ctx);
  assert.strictEqual(fullFirst.points, 35);
  assert.strictEqual(tiredLater.points, 0);
  assert.strictEqual(tiredLater.stoodIn, true);
  assert.strictEqual(other.meters["music-creativity"], 35);
}

// The day stops at 75. A bonus coin is not part of that cap.
{
  const s = fresh();
  const when = new Date(2026, 10, 17, 15, 0, 0);
  L.logPractice(s, { track: "voice", minutes: 20, at: when.toISOString() }, ctx);
  L.logPractice(s, { track: "piano", minutes: 20, at: when.toISOString() }, ctx);
  const guitar = L.logPractice(s, { track: "guitar", minutes: 20, at: when.toISOString() }, ctx);
  assert.strictEqual(guitar.capped, true);
  assert.strictEqual(guitar.points, 15);
  assert.strictEqual(s.meters["music-creativity"], 75);
  const book = L.logPractice(s, { track: "book1", minutes: 10, at: when.toISOString() }, ctx);
  assert.strictEqual(book.points, 0);
  assert.strictEqual(book.capped, true);
  assert.strictEqual(s.practice.length, 4);
  const song = L.creditTask(s, byId["mus-finished-song"], { day: "2026-11-17" });
  assert.strictEqual(song.dropped.length, 1);
  assert.strictEqual(song.dropped[0].bonus, true);
  assert.strictEqual(s.meters["music-creativity"], 75);
}

// No music points Friday evening or Saturday. Minutes still save.
{
  const s = fresh();
  const fri = new Date(2026, 10, 20, 18, 30, 0);
  const sat = new Date(2026, 10, 21, 11, 0, 0);
  const a = L.logPractice(s, { track: "voice", minutes: 20, at: fri.toISOString() }, ctx);
  const b = L.logPractice(s, { track: "piano", minutes: 10, at: sat.toISOString() }, ctx);
  assert.strictEqual(a.blackout, true);
  assert.strictEqual(b.points, 0);
  assert.strictEqual(s.meters["music-creativity"], 0);
  assert.strictEqual(L.weekMinutes(s, fri, scoring).minutes, 0);
  const thu = new Date(2026, 10, 19, 19, 0, 0);
  L.logPractice(s, { track: "guitar", minutes: 30, at: thu.toISOString() }, ctx);
  assert.strictEqual(L.weekMinutes(s, fri, scoring).minutes, 30);
  assert.strictEqual(L.weekMinutes(s, fri, scoring).goal, 300);
}

// A passed checkoff banks one Songbird. The weekly voice test is 25, once.
{
  const s = fresh();
  const when = new Date();
  const skill = L.setSkill(s, "v1", true, scoring, when);
  assert.strictEqual(skill.points, 0);
  assert.strictEqual(skill.coins, 1);
  assert.strictEqual(s.banked.length, 1);
  assert.strictEqual(s.meters["music-creativity"], 0);
  assert.strictEqual(L.setSkill(s, "v1", true, scoring, when).duplicate, true);
  L.setSkill(s, "v1", false, scoring, when);
  assert.strictEqual(s.banked.length, 0);
  assert.strictEqual(L.creditVoiceTest(s, scoring, when).points, 25);
  assert.strictEqual(L.creditVoiceTest(s, scoring, when).duplicate, true);
  assert.strictEqual(s.meters["music-creativity"], 25);
}

// Shabbos logs once per week and does not prompt during the quiet window.
{
  const s = fresh();
  const sat = new Date(2026, 10, 21, 20, 0, 0);
  assert.strictEqual(L.shabbatQuiet(s, sat), true);
  const res = L.logShabbos(s, byId["faith-shabbos"], sat);
  assert.strictEqual(res.entry.points, 50);
  assert.strictEqual(L.shabbatQuiet(s, sat), false);
  assert.strictEqual(L.logShabbos(s, byId["faith-shabbos"], sat).duplicate, true);
  assert.strictEqual(s.meters.faith, 50);
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
  assert.ok(JSON.stringify(cur).indexOf("voice-test/index.html") >= 0);
  assert.ok(index.indexOf("plan.json") >= 0);
  const bankApp = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
  assert.ok(bankApp.indexOf("plan.json") < 0);
  assert.ok(bankApp.indexOf("toLocaleDateString") >= 0);
}

console.log("logic.test.js ok (" + count + " tasks)");
