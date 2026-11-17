/* Approved Songbird points. This is the only music scoring. */
(function (root) {
  var SONG_SCORING = {
    fill: 100,
    dailyCap: 75,
    beforeNoon: 10,
    noonHour: 12,
    tiredDay: 15,
    tiredDaySlot: "voice",
    weeklyVoiceTest: 25,
    bonusCoin: 1,
    sunThuDailyMinutes: 60,
    sunThuDays: 5,
    tracks: {
      voice: { taskId: "mus-vocals", points: 35, minMinutes: 10, slot: "voice" },
      piano: { taskId: "mus-piano", points: 25, slot: "piano" },
      guitar: { taskId: "mus-guitar", points: 25, slot: "guitar" },
      book1: { taskId: "mus-book", points: 25, slot: "book" }
    },
    shabbat: { fridayFromHour: 18 }
  };
  if (typeof module === "object" && module.exports) module.exports = SONG_SCORING;
  root.SONG_SCORING = SONG_SCORING;
})(typeof globalThis !== "undefined" ? globalThis : this);
