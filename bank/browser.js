/* Phone storage for The Self Love Bank. Every tap stays in localStorage. */
(function () {
  "use strict";
  var KEY = "slb.v1";
  var me = document.currentScript;
  var tasksUrl = (me && me.getAttribute("data-tasks")) || "tasks.json";
  var L = window.SLBLogic;

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return L.blank();
      return L.ensureShape(JSON.parse(raw));
    } catch (e) {
      return L.blank();
    }
  }

  function save(state) {
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  var api = {
    KEY: KEY,
    byId: {},
    tasks: null,
    load: load,
    save: save,
    ready: null
  };

  function indexTasks(data) {
    api.tasks = data;
    api.byId = {};
    (data.domains || []).forEach(function (d) {
      (d.tasks || []).forEach(function (t) {
        t.domainId = d.id;
        api.byId[t.id] = t;
      });
    });
    return api;
  }

  api.ready = fetch(tasksUrl).then(function (r) {
    if (!r.ok) throw new Error("tasks");
    return r.json();
  }).then(indexTasks).catch(function () {
    api.byId = {};
    return api;
  });

  function ctx() {
    return { byId: api.byId, scoring: window.SONG_SCORING };
  }

  api.practice = function (opts) {
    var s = load();
    var result = L.logPractice(s, opts, ctx());
    save(s);
    return result;
  };

  api.skill = function (id, on) {
    var s = load();
    var result = L.setSkill(s, id, on, window.SONG_SCORING, new Date());
    save(s);
    return result;
  };

  api.voiceTest = function (when) {
    var s = load();
    var result = L.creditVoiceTest(s, window.SONG_SCORING, when || new Date());
    save(s);
    return result;
  };

  api.undoPractice = function (id) {
    var s = load();
    L.undoPractice(s, id);
    save(s);
    return load();
  };

  window.SLB = api;
})();
