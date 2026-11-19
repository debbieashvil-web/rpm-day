/* Optional cloud sync for The Self Love Bank.
   Paste a free-plan Supabase project URL and its anon key below.
   Leave both blank and this file never contacts a server.
   A blank config does not read or write the slb.v1 ledger.
   Use the anon key, never the service_role key.
   The anon key is public. Row-level security limits each row to the signed-in account.
   Stay on the free plan. */
var SLB_SUPABASE = { url: "", anonKey: "" };

(function (root, factory) {
  var api = factory(SLB_SUPABASE);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SLBSync = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (CONFIG) {
  "use strict";

  var LEDGER_KEY = "slb.v1";
  var OPT_KEY = "slb.sync.optin";
  var TABLE = "ledger_entries";
  var CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.1/dist/umd/supabase.js";
  var libraryPromise = null;
  var liveClient = null;
  var listening = false;
  var running = false;
  var again = false;

  var runtime = {
    config: CONFIG,
    storage: null,
    logic: null,
    loadState: null,
    saveState: null,
    onStatus: null,
    onSession: null,
    redirectTo: ""
  };

  function readyConfig(cfg) {
    cfg = cfg || CONFIG;
    if (!cfg) return null;
    var url = cfg.url != null ? String(cfg.url).trim() : "";
    var anonKey = cfg.anonKey != null ? String(cfg.anonKey).trim() : "";
    if (!url || !anonKey) return null;
    return { url: url, anonKey: anonKey };
  }

  function configured() {
    return !!readyConfig(CONFIG);
  }

  /* Blank URL or anon key is off, before any storage access.
     Opt-in lives in its own key, never inside slb.v1. */
  function shouldSync(cfg, storage) {
    if (!readyConfig(cfg)) return false;
    if (!storage || typeof storage.getItem !== "function") return false;
    try { return storage.getItem(OPT_KEY) === "1"; }
    catch (e) { return false; }
  }

  function entriesChanged(before, after) {
    if (!Array.isArray(before) || !Array.isArray(after) || before.length !== after.length) return true;
    for (var i = 0; i < before.length; i++) {
      var a = before[i] || {};
      var b = after[i] || {};
      if (String(a.id) !== String(b.id)) return true;
      if (!!a.undone !== !!b.undone) return true;
    }
    return false;
  }

  function globalScope() {
    if (typeof globalThis !== "undefined") return globalThis;
    return typeof window !== "undefined" ? window : {};
  }

  function loadLibrary() {
    var scope = globalScope();
    if (scope.supabase && scope.supabase.createClient) return Promise.resolve(scope.supabase);
    if (libraryPromise) return libraryPromise;
    libraryPromise = new Promise(function (resolve, reject) {
      if (typeof document === "undefined") {
        libraryPromise = null;
        reject(new Error("library"));
        return;
      }
      var script = document.createElement("script");
      script.src = CDN;
      script.async = true;
      script.onload = function () {
        var loaded = globalScope();
        if (loaded.supabase && loaded.supabase.createClient) resolve(loaded.supabase);
        else {
          libraryPromise = null;
          reject(new Error("library"));
        }
      };
      script.onerror = function () {
        libraryPromise = null;
        reject(new Error("library"));
      };
      (document.head || document.documentElement).appendChild(script);
    });
    return libraryPromise;
  }

  function clientFor(cfg, deps) {
    if (deps && deps.client) return Promise.resolve(deps.client);
    if (liveClient) return Promise.resolve(liveClient);
    return loadLibrary().then(function (lib) {
      liveClient = lib.createClient(cfg.url, cfg.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: "pkce"
        }
      });
      return liveClient;
    });
  }

  function pullEntries(client) {
    var query = client.from(TABLE).select("entry_id, entry");
    var ordered = typeof query.order === "function" ? query.order("entry_id", { ascending: true }) : query;
    return Promise.resolve(ordered).then(function (res) {
      if (res && res.error) throw res.error;
      var rows = (res && res.data) || [];
      var out = [];
      rows.forEach(function (row) {
        var entry = row && row.entry;
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return;
        if ((entry.id == null || entry.id === "") && row.entry_id) {
          var copy = {};
          Object.keys(entry).forEach(function (k) { copy[k] = entry[k]; });
          copy.id = row.entry_id;
          entry = copy;
        }
        out.push(entry);
      });
      return out;
    });
  }

  function pushEntries(client, userId, entries) {
    var rows = [];
    (entries || []).forEach(function (entry) {
      if (!entry || entry.id == null || entry.id === "") return;
      rows.push({
        user_id: userId,
        entry_id: String(entry.id),
        entry: JSON.parse(JSON.stringify(entry))
      });
    });
    if (!rows.length) return Promise.resolve();
    var chain = Promise.resolve();
    var size = 200;
    for (var i = 0; i < rows.length; i += size) {
      (function (chunk) {
        chain = chain.then(function () {
          return client.from(TABLE).upsert(chunk, { onConflict: "user_id,entry_id" }).then(function (res) {
            if (res && res.error) throw res.error;
          });
        });
      })(rows.slice(i, i + size));
    }
    return chain;
  }

  /* Reads the ledger only when sync is on and a session exists.
     Writes it only when the merged id list or a tombstone actually changed. */
  function syncLedger(deps) {
    deps = deps || runtime;
    var cfg = readyConfig(deps.config || CONFIG);
    var storage = deps.storage;
    if (!cfg || !shouldSync(cfg, storage)) return Promise.resolve({ ran: false });
    var logic = deps.logic;
    if (!logic || typeof logic.mergeEntries !== "function" || typeof deps.loadState !== "function" || typeof deps.saveState !== "function") {
      return Promise.resolve({ ran: false, reason: "setup" });
    }
    return clientFor(cfg, deps).then(function (client) {
      return client.auth.getSession().then(function (res) {
        if (res && res.error) throw res.error;
        var session = res && res.data && res.data.session;
        var user = session && session.user;
        if (!user || !user.id) {
          if (deps.onSession) deps.onSession(false);
          return { ran: false, needsAuth: true };
        }
        if (deps.onSession) deps.onSession(true);
        return pullEntries(client).then(function (remote) {
          var state = deps.loadState();
          if (!state || !Array.isArray(state.entries)) return { ran: false, reason: "ledger" };
          var merged = logic.mergeEntries(state.entries, remote);
          var changed = entriesChanged(state.entries, merged);
          if (changed) {
            state.entries = merged;
            if (typeof logic.recompute === "function") logic.recompute(state);
            deps.saveState(state);
          }
          return pushEntries(client, user.id, merged).then(function () {
            if (deps.onStatus) deps.onStatus("Synced.");
            return { ran: true, changed: changed, count: merged.length };
          });
        });
      });
    }).catch(function () {
      if (deps.onStatus) deps.onStatus("Could not sync. Taps on this device are still here.");
      return { ran: false, reason: "network" };
    });
  }

  function enqueue() {
    if (!shouldSync(runtime.config, runtime.storage)) return Promise.resolve({ ran: false });
    if (running) {
      again = true;
      return Promise.resolve({ ran: true, queued: true });
    }
    running = true;
    function step() {
      return syncLedger(runtime).then(function (res) {
        if (again) {
          again = false;
          return step();
        }
        running = false;
        return res;
      }, function () {
        running = false;
        again = false;
        return { ran: false, reason: "network" };
      });
    }
    return step();
  }

  function attach(deps) {
    deps = deps || {};
    if (deps.storage) runtime.storage = deps.storage;
    if (deps.logic) runtime.logic = deps.logic;
    if (deps.loadState) runtime.loadState = deps.loadState;
    if (deps.saveState) runtime.saveState = deps.saveState;
    if (deps.onStatus) runtime.onStatus = deps.onStatus;
    if (deps.onSession) runtime.onSession = deps.onSession;
    if (deps.redirectTo) runtime.redirectTo = deps.redirectTo;
    if (deps.config) runtime.config = deps.config;
  }

  function boot() {
    if (!shouldSync(runtime.config, runtime.storage)) return Promise.resolve({ ran: false });
    var cfg = readyConfig(runtime.config);
    return clientFor(cfg, runtime).then(function (client) {
      if (!listening && client.auth && typeof client.auth.onAuthStateChange === "function") {
        listening = true;
        client.auth.onAuthStateChange(function (event, session) {
          if (runtime.onSession) runtime.onSession(!!session);
          if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) enqueue();
        });
      }
      return enqueue();
    }).catch(function () {
      if (runtime.onStatus) runtime.onStatus("Could not sync. Taps on this device are still here.");
      return { ran: false, reason: "network" };
    });
  }

  function afterLocalChange() {
    return enqueue();
  }

  function pageUrl() {
    if (runtime.redirectTo) return runtime.redirectTo;
    if (typeof location === "undefined" || !location.origin) return "";
    return location.origin + location.pathname;
  }

  function validEmail(email) {
    var address = String(email || "").trim();
    if (address.length < 3 || address.length > 120) return "";
    if (address.indexOf("@") < 1 || address.indexOf(" ") >= 0) return "";
    if (address.indexOf("@") !== address.lastIndexOf("@")) return "";
    return address;
  }

  function setOptIn(on) {
    var storage = runtime.storage;
    if (!storage) return;
    try {
      if (on && typeof storage.setItem === "function") storage.setItem(OPT_KEY, "1");
      else if (!on && typeof storage.removeItem === "function") storage.removeItem(OPT_KEY);
    } catch (e) {}
  }

  function sendLink(email) {
    var cfg = readyConfig(runtime.config);
    if (!cfg) return Promise.resolve({ ok: false, reason: "unconfigured" });
    var address = validEmail(email);
    if (!address) return Promise.resolve({ ok: false, reason: "email" });
    var already = false;
    try { already = runtime.storage && runtime.storage.getItem(OPT_KEY) === "1"; }
    catch (e) { already = false; }
    setOptIn(true);
    return clientFor(cfg, runtime).then(function (client) {
      var redirect = pageUrl();
      var options = redirect ? { emailRedirectTo: redirect } : {};
      return client.auth.signInWithOtp({ email: address, options: options }).then(function (res) {
        if (res && res.error) {
          if (!already) setOptIn(false);
          return { ok: false, reason: "send" };
        }
        return { ok: true };
      });
    }).catch(function () {
      if (!already) setOptIn(false);
      return { ok: false, reason: "send" };
    });
  }

  function turnOff() {
    try {
      if (runtime.storage && typeof runtime.storage.removeItem === "function") runtime.storage.removeItem(OPT_KEY);
    } catch (e) {}
    if (runtime.onSession) runtime.onSession(false);
    if (!liveClient || !liveClient.auth || typeof liveClient.auth.signOut !== "function") {
      return Promise.resolve({ ok: true });
    }
    return liveClient.auth.signOut().then(function () {
      return { ok: true };
    }).catch(function () {
      return { ok: true };
    });
  }

  return {
    CONFIG: CONFIG,
    LEDGER_KEY: LEDGER_KEY,
    OPT_KEY: OPT_KEY,
    TABLE: TABLE,
    CDN: CDN,
    configured: configured,
    shouldSync: shouldSync,
    attach: attach,
    boot: boot,
    afterLocalChange: afterLocalChange,
    syncLedger: syncLedger,
    sendLink: sendLink,
    turnOff: turnOff
  };
});
