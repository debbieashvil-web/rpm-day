/* Voice test listener - signal processing. Vanilla JS, no network, no libraries.
   Works in the browser (window.VoiceDSP) and in Node (require) for unit tests.
   A440 tuning. E3 = MIDI 52 = 164.81 Hz. */
(function (root) {
  'use strict';
  var NN = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function midiOf(f) { return 69 + 12 * Math.log2(f / 440); }
  function name(m) { m = Math.round(m); return NN[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1); }

  /* ---------- YIN pitch detector (de Cheveigne & Kawahara 2002) ----------
     Returns {f, clarity, voiced}. clarity = 1 - CMND minimum (1 = perfectly periodic). */
  function yin(buf, sr, opt) {
    opt = opt || {};
    var minF = opt.minF || 75, maxF = opt.maxF || 1100, thr = opt.threshold || 0.15;
    var N = buf.length;
    var tauMin = Math.max(2, Math.floor(sr / maxF));
    var tauMax = Math.min(Math.floor(sr / minF), Math.floor(N / 2) - 1);
    var W = N - tauMax - 1;
    var d = new Float32Array(tauMax + 2), c = new Float32Array(tauMax + 2);
    for (var tau = 1; tau <= tauMax + 1; tau++) {
      var s = 0;
      for (var i = 0; i < W; i++) { var x = buf[i] - buf[i + tau]; s += x * x; }
      d[tau] = s;
    }
    c[0] = 1; var run = 0;
    for (tau = 1; tau <= tauMax + 1; tau++) { run += d[tau]; c[tau] = run > 0 ? d[tau] * tau / run : 1; }
    // First local minimum that is under the threshold AND close to the deepest minimum.
    // The second test stops strong upper formants (e.g. "ee" around 3 kHz) from winning.
    var gmin = 1e9; for (tau = tauMin; tau <= tauMax; tau++) if (c[tau] < gmin) gmin = c[tau];
    var lim = Math.min(thr, gmin + 0.08), best = -1;
    for (tau = tauMin; tau <= tauMax; tau++) {
      if (c[tau] < lim) { while (tau + 1 <= tauMax && c[tau + 1] < c[tau]) tau++; best = tau; break; }
    }
    var voiced = best > 0;
    if (!voiced) { // global minimum, reported as unvoiced
      var mv = 1e9; for (tau = tauMin; tau <= tauMax; tau++) if (c[tau] < mv) { mv = c[tau]; best = tau; }
    }
    // parabolic interpolation on the raw difference function (less biased than on CMND)
    var t = best;
    if (best > tauMin && best < tauMax) {
      var a = d[best - 1], b = d[best], e = d[best + 1], den = a - 2 * b + e;
      if (den > 0) t = best + 0.5 * (a - e) / den;
    }
    return { f: sr / t, clarity: Math.max(0, 1 - c[best]), voiced: voiced };
  }

  /* ---------- frame features: level, high-band (sibilant) level, ratio ---------- */
  function biquadHP(fc, sr) { // RBJ high-pass, Q = 0.707
    var w = 2 * Math.PI * fc / sr, cs = Math.cos(w), al = Math.sin(w) / (2 * 0.7071);
    var a0 = 1 + al;
    return { b0: (1 + cs) / 2 / a0, b1: -(1 + cs) / a0, b2: (1 + cs) / 2 / a0, a1: -2 * cs / a0, a2: (1 - al) / a0 };
  }
  var hpCache = {};
  function features(buf, sr) {
    var key = sr, q = hpCache[key] || (hpCache[key] = biquadHP(3500, sr));
    var N = buf.length, e = 0, eh = 0, x1 = 0, x2 = 0, y1 = 0, y2 = 0, skip = 64, n = 0, zc = 0;
    for (var i = 0; i < N; i++) {
      var x = buf[i];
      var y = q.b0 * x + q.b1 * x1 + q.b2 * x2 - q.a1 * y1 - q.a2 * y2;
      x2 = x1; x1 = x; y2 = y1; y1 = y;
      if (i >= skip) { e += x * x; eh += y * y; n++; if ((x >= 0) !== (buf[i - 1] >= 0)) zc++; }
    }
    var rms = Math.sqrt(e / n), hf = Math.sqrt(eh / n);
    return { rms: rms, hf: hf, ratio: e > 0 ? eh / e : 0, zcr: zc / n };
  }
  function db(x) { return 20 * Math.log10(Math.max(x, 1e-7)); }

  /* ---------- analyse one frame: everything the UI needs ---------- */
  function analyse(buf, sr) {
    var ft = features(buf, sr);
    var p = ft.rms > 0.0005 ? yin(buf, sr) : { f: 0, clarity: 0, voiced: false };
    ft.f = p.f; ft.clarity = p.clarity; ft.voiced = p.voiced; ft.midi = p.voiced ? midiOf(p.f) : null;
    return ft;
  }

  /* ---------- Hiss detector: auto start / auto stop stopwatch ----------
     feed(frame, t) with frame from analyse(); t in seconds. muted frames: feedMuted(t). */
  function HissDetector(opt) {
    opt = opt || {};
    this.startHold = opt.startHold || 0.4;   // sustained hiss needed to start (s)
    this.stopGrace = opt.stopGrace || 0.45;  // silence needed to stop (s)
    this.minRatio = opt.minRatio || 0.15;    // share of energy above 3.5 kHz
    this.setSensitivity(opt.sensitivity || 'normal');
    this.floor = null; this.reset();
  }
  HissDetector.prototype.setSensitivity = function (s) {
    this.sensitivity = s;
    this.absGate = s === 'more' ? 0.0007 : 0.0014;  // about -63 / -57 dBFS in the high band
    this.floorMul = s === 'more' ? 2.0 : 2.5;        // gate sits 6 / 8 dB over the room
  };
  HissDetector.prototype.reset = function () {
    this.state = 'armed'; this.cand = null; this.t0 = 0; this.last = 0; this.result = null; this.heard = false; this.dip = 0;
  };
  HissDetector.prototype.gate = function () { return Math.max(this.absGate, (this.floor || 0) * this.floorMul); };
  HissDetector.prototype.classify = function (fr) {
    var g = this.gate();
    var isHiss = fr.hf > g && fr.ratio > this.minRatio && !(fr.voiced && fr.clarity > 0.8);
    var near = !isHiss && fr.hf > g * 0.45 && fr.ratio > this.minRatio * 0.7 && !(fr.voiced && fr.clarity > 0.8);
    return { hiss: isHiss, near: near, gate: g };
  };
  HissDetector.prototype.learn = function (fr, c) { // learn the room only when quiet-ish and not hissing
    c = c || this.classify(fr);
    if (!c.hiss && fr.hf < c.gate) {
      if (this.floor === null) this.floor = fr.hf;
      else if (fr.hf < this.floor) this.floor = 0.5 * this.floor + 0.5 * fr.hf;
      else if (this.state !== 'running') this.floor += (fr.hf - this.floor) * 0.02;
    }
    return c;
  };
  HissDetector.prototype.manualStart = function (t) { this.state = 'running'; this.t0 = t; this.last = t; this.heard = false; this.result = null; };
  HissDetector.prototype.manualStop = function (t) {
    if (this.state !== 'running') return null;
    var end = this.heard ? Math.max(this.last, Math.min(t, this.last + this.stopGrace)) : t;
    return this._finish(end);
  };
  HissDetector.prototype._finish = function (end) { this.state = 'stopped'; this.result = Math.max(0, end - this.t0); return this.result; };
  HissDetector.prototype.feed = function (fr, t) {
    var c = this.classify(fr); c.event = null;
    this.learn(fr, c);
    if (this.state === 'armed') {
      if (c.hiss) { this.dip = 0; if (this.cand === null) this.cand = t; if (t - this.cand >= this.startHold) { this.state = 'running'; this.t0 = this.cand; this.last = t; this.heard = true; c.event = 'start'; } }
      else if (this.cand !== null) { this.dip += 1; if (this.dip > 2) { this.cand = null; this.dip = 0; } }
    } else if (this.state === 'running') {
      if (c.hiss) { this.last = t; this.heard = true; }
      else if (this.heard && t - this.last > this.stopGrace) { this._finish(this.last); c.event = 'stop'; }
    }
    c.state = this.state; return c;
  };
  HissDetector.prototype.feedMuted = function (t, dt) { // speaker playing: hold, do not let the gap end the hiss
    if (this.state === 'running') this.last += dt; if (this.cand !== null) this.cand += dt;
  };

  /* ---------- Range tracker for the lip trill ---------- */
  function RangeTracker(opt) { opt = opt || {}; this.hold = opt.hold || 0.12; this.reset(); }
  RangeTracker.prototype.reset = function () { this.time = {}; this.recent = []; this.rejects = 0; this.voicedTime = 0; };
  RangeTracker.prototype.feed = function (m, dt) { // m = midi float of a confident voiced frame
    if (m < 36 || m > 84) return null;
    var r = this.recent;
    if (r.length >= 3) {
      var s = r.slice().sort(function (a, b) { return a - b; }), med = s[s.length >> 1];
      if (Math.abs(m - med) > 7 && this.rejects < 6) { this.rejects++; return null; } // octave / wild jump
    }
    this.rejects = 0; r.push(m); if (r.length > 7) r.shift();
    var k = Math.round(m); this.time[k] = (this.time[k] || 0) + dt; this.voicedTime += dt; return m;
  };
  RangeTracker.prototype.range = function () {
    var lo = null, hi = null, self = this;
    Object.keys(this.time).forEach(function (k) { if (self.time[k] >= self.hold) { k = +k; if (lo === null || k < lo) lo = k; if (hi === null || k > hi) hi = k; } });
    return lo === null ? null : { low: lo, high: hi };
  };

  /* ---------- 1-5-1 scorer: follows E3 F#3 G#3 A3 B3 A3 G#3 F#3 E3 ---------- */
  var PAT = [52, 54, 56, 57, 59, 57, 56, 54, 52], SCALE = [52, 54, 56, 57, 59];
  function nearestScale(m) { // fold octave into E3..B3 neighbourhood, then nearest scale note
    var k = 0; while (m < 51) { m += 12; k -= 12; } while (m >= 63) { m -= 12; k += 12; }
    var best = SCALE[0]; SCALE.forEach(function (n) { if (Math.abs(m - n) < Math.abs(m - best)) best = n; });
    if (Math.abs(m - 64) < Math.abs(m - best)) best = 64;
    return { note: best, cents: (m - best) * 100, octShift: k };
  }
  function PatternScorer(opt) { opt = opt || {}; this.hold = opt.hold || 0.12; this.reset(); }
  PatternScorer.prototype.reset = function () { this.idx = -1; this.sum = 0; this.wt = 0; this.cur = null; this.curT = 0; this.abs = 0; };
  PatternScorer.prototype.feed = function (m, dt) {
    var ns = nearestScale(m); if (Math.abs(ns.cents) > 60) return null;
    if (ns.note === this.cur) this.curT += dt; else { this.cur = ns.note; this.curT = dt; }
    if (this.curT >= this.hold) {
      if (this.idx < 8 && ns.note === PAT[this.idx + 1]) this.idx++;
      else if (this.idx === -1 && ns.note !== PAT[0]) { /* waiting for E3 */ }
    }
    if (this.curT >= this.hold) { this.sum += ns.cents * dt; this.abs += Math.abs(ns.cents) * dt; this.wt += dt; }
    return { note: ns.note + ns.octShift, cents: ns.cents, idx: this.idx };
  };
  PatternScorer.prototype.result = function () { return this.wt < 0.8 ? null : { cents: this.sum / this.wt, absCents: this.abs / this.wt, seconds: this.wt, reached: this.idx }; };

  var api = { hz: hz, midiOf: midiOf, name: name, yin: yin, features: features, analyse: analyse, db: db,
    HissDetector: HissDetector, RangeTracker: RangeTracker, PatternScorer: PatternScorer, nearestScale: nearestScale, PAT: PAT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.VoiceDSP = api;
})(typeof window !== 'undefined' ? window : this);
