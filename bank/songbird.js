/* Songbird scoring. Debbie has not approved the draft minute rules.
   The live choice is state.scoring, and a new save starts on "proposal".
   Proposal mode uses the Music & Creativity task points from the task list.
   Draft mode uses the minute rules below INSTEAD, never on top of those
   task points, so one practice session is never counted twice.
   Neither mode awards music points from Friday 6pm through Saturday. */
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
    melody: {
      id: "melody",
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
