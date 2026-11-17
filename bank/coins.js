/* Coin art. One path per domain, relative to this folder.
   When the designer sends 9 transparent PNGs, change only this map. */
(function (root) {
  var COIN_ART = {
    resilience: "coins/oak.png",
    body: "coins/ember.png",
    finances: "coins/copper-key.png",
    career: "coins/teachers-bell.png",
    "self-care": "coins/still-water.png",
    "music-creativity": "coins/songbird.png",
    "kindness-connection": "coins/warm-bread.png",
    faith: "coins/candlelight.png",
    home: "coins/hearth.png"
  };
  if (typeof module === "object" && module.exports) module.exports = COIN_ART;
  root.COIN_ART = COIN_ART;
})(typeof globalThis !== "undefined" ? globalThis : this);
