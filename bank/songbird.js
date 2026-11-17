/* Draft minute rules, not approved yet. */
(function (root) {
  var SONG_SCORING = {
    sunThuDailyMinutes: 60,
    sunThuDays: 5,
    proposal: {
      id: "proposal",
      label: "Proposal task points (default)",
      practiceMapsTo: {
        voice: "mus-vocals",
        piano: "mus-instrument",
        guitar: "mus-instrument",
        book1: "mus-instrument"
      },
      tiredDayMapsTo: "mus-vocals",
      skillCheckoff: 0,
      weeklyVoiceTest: 0,
      hardestFirst: 0
    },
    draft: {
      id: "draft",
      label: "Draft minute scoring (not approved)",
      pointsPerMinutes: 10,
      pointsEach: 1,
      dailyCap: 6,
      hardestFirst: 2,
      tiredDay: 1,
      weeklyVoiceTest: 5,
      skillCheckoff: 10
    },
    shabbat: { fridayFromHour: 18 }
  };
  if (typeof module === "object" && module.exports) module.exports = SONG_SCORING;
  root.SONG_SCORING = SONG_SCORING;
})(typeof globalThis !== "undefined" ? globalThis : this);
