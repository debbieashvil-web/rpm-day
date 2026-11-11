/* Weekly voice test - listening coach. All audio stays on this device. No network requests. */
(function () {
'use strict';
var D = window.VoiceDSP, $ = function (id) { return document.getElementById(id); };
var NAMES = ['Setup', 'Hiss', 'Trill', '1-5-1', 'Song', 'Done'], cur = 0;
var EN = '\u2013', CENT = '\u00A2', MINUS = '\u2212';
function parseHash() { var h = location.hash.slice(1), i = h.indexOf('?'), a = i < 0 ? h : h.slice(0, i), q = i < 0 ? '' : h.slice(i + 1), p = {};
  q.split('&').forEach(function (kv) { if (kv) { var j = kv.indexOf('='); p[decodeURIComponent(j < 0 ? kv : kv.slice(0, j))] = j < 0 ? '1' : decodeURIComponent(kv.slice(j + 1)); } });
  return { s: Math.max(0, Math.min(5, parseInt(a, 10) || 0)), demo: p.demo || null }; }
var DEMO = parseHash().demo;
var now = function () { return performance.now() / 1000; };

/* ---------- storage ---------- */
var store = {
  get: function (k) { try { var v = localStorage.getItem('vl_' + k); return v === null ? null : JSON.parse(v); } catch (e) { return null; } },
  set: function (k, v) { if (DEMO) return; try { localStorage.setItem('vl_' + k, JSON.stringify(v)); } catch (e) {} },
  del: function (k) { try { localStorage.removeItem('vl_' + k); } catch (e) {} }
};

/* ---------- navigation ---------- */
var chips = $('chips');
NAMES.forEach(function (n, i) { var b = document.createElement('button'); b.className = 'chip'; b.textContent = n; b.onclick = function () { go(i); }; chips.appendChild(b); });
function go(i) {
  i = Math.max(0, Math.min(5, i));
  if (LEAVE[cur]) LEAVE[cur]();
  cur = i;
  document.querySelectorAll('section').forEach(function (s) { s.classList.toggle('hide', +s.dataset.s !== i); });
  [].forEach.call(chips.children, function (c, j) { c.className = 'chip' + (j === i ? ' on' : (j < i ? ' done' : '')); });
  $('prevB').style.visibility = i ? 'visible' : 'hidden';
  $('nextB').style.visibility = i === 5 ? 'hidden' : 'visible';
  $('nextTxt').textContent = i === 0 ? 'Start' : (i === 4 ? 'Finish' : 'Next');
  var h = '#' + i + (DEMO ? '?demo=' + DEMO : '');
  if (location.hash !== h) try { history.replaceState(null, '', h); } catch (e) {}
  if (ENTER[i]) ENTER[i]();
  window.scrollTo(0, 0);
}
window.go = function (i) { go(i); };
window.addEventListener('hashchange', function () { var p = parseHash(); if (p.s !== cur) go(p.s); });

/* ---------- audio out (A440 tones, same voice as the old coach) ---------- */
var ac = null;
function ctx() { if (!ac) { var C = window.AudioContext || window.webkitAudioContext; if (!C) return null; ac = new C(); }
  if (ac.state !== 'running') { try { ac.resume(); } catch (e) {} } return ac; }
function mute(sec) { if (!ac) return; M.muteUntil = Math.max(M.muteUntil, ac.currentTime + sec); }
function note(m, start, dur, vol, sustain) {
  var a = ctx(); if (!a) return; var out = a.createGain(); out.gain.value = vol || 0.22; out.connect(a.destination);
  [[1, 1], [2, .5], [3, .28], [4, .14], [5, .07]].forEach(function (h, idx) {
    var o = a.createOscillator(); o.type = 'sine'; o.frequency.value = D.hz(m) * h[0];
    var g = a.createGain(), t0 = a.currentTime + start, amp = h[1];
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(amp, t0 + 0.01);
    if (sustain) { g.gain.setTargetAtTime(amp * 0.45, t0 + 0.02, 0.4 / (1 + idx * 0.5)); g.gain.setTargetAtTime(0, t0 + dur - 0.35, 0.12); }
    else g.gain.setTargetAtTime(0, t0 + 0.02, 0.9 / (1 + idx * 0.6));
    o.connect(g); g.connect(out); o.start(t0); o.stop(t0 + dur + 0.5);
  });
}
function chime() {
  if (!$('chimes').checked) return; var a = ctx(); if (!a) return; mute(0.9);
  [[1318.5, 1], [1975.5, .35]].forEach(function (p) { var o = a.createOscillator(); o.frequency.value = p[0]; var g = a.createGain(), t0 = a.currentTime;
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.05 * p[1], t0 + 0.005); g.gain.setTargetAtTime(0, t0 + 0.01, 0.3);
    o.connect(g); g.connect(a.destination); o.start(); o.stop(t0 + 1.6); });
}

/* ---------- microphone ---------- */
var M = { on: false, stream: null, src: null, an: null, sink: null, buf: null, sr: 48000, muteUntil: 0, byteBuf: null };
function setMicClass() { document.body.classList.toggle('mic', M.on); document.body.classList.toggle('nomic', !M.on); }
async function enableMic() {
  var a = ctx();
  try { if (navigator.audioSession) navigator.audioSession.type = 'play-and-record'; } catch (e) {}
  if (!a || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return micBlocked('This browser can\u2019t use the microphone on this page. (Phones need the page opened over https.)'); }
  $('micStarting').classList.remove('hide'); $('micBtn').disabled = true;
  var stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } });
  } catch (e) {
    if (e && (e.name === 'OverconstrainedError' || e.name === 'TypeError')) { try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e2) { e = e2; } }
    if (!stream) { $('micStarting').classList.add('hide'); $('micBtn').disabled = false;
      return micBlocked(e && e.name === 'NotFoundError' ? 'No microphone was found on this device.' : 'The browser didn\u2019t let this page use the microphone.'); }
  }
  try { if (a.state !== 'running') await a.resume(); } catch (e) {}
  M.stream = stream; M.src = a.createMediaStreamSource(stream); M.an = a.createAnalyser(); M.an.fftSize = 2048; M.an.smoothingTimeConstant = 0;
  M.sink = a.createGain(); M.sink.gain.value = 0; M.src.connect(M.an); M.an.connect(M.sink); M.sink.connect(a.destination); // silent sink keeps Safari processing
  M.buf = new Float32Array(2048); M.byteBuf = new Uint8Array(2048); M.sr = a.sampleRate; M.on = true;
  stream.getAudioTracks().forEach(function (t) { t.onended = function () { disableMic(); }; });
  $('micStarting').classList.add('hide'); $('micBtn').classList.add('hide'); $('micBtn').disabled = false; $('micLive').classList.remove('hide'); $('micBlocked').classList.add('hide');
  $('chimes').checked = false;
  recInit(); setMicClass(); micBar(false); wakeUpdate(); startLoop();
  if (ENTER[cur]) ENTER[cur]();
}
window.enableMic = enableMic;
function micBlocked(why) { $('micBlocked').classList.remove('hide'); $('blockWhy').textContent = why; setMicClass(); $('micTxt').textContent = 'Mic off \u00B7 timers and tones still work'; }
function disableMic() {
  recStop(false);
  if (M.stream) M.stream.getTracks().forEach(function (t) { t.stop(); });
  try { M.src && M.src.disconnect(); M.an && M.an.disconnect(); M.sink && M.sink.disconnect(); } catch (e) {}
  M.on = false; M.stream = null; setMicClass();
  $('micBtn').classList.remove('hide'); $('micLive').classList.add('hide'); micBar(false); wakeUpdate();
  if (ENTER[cur]) ENTER[cur]();
}
window.disableMic = disableMic;
function micBar(muted) {
  var b = $('micbar'); b.classList.toggle('live', M.on && !muted); b.classList.toggle('paused', M.on && muted); b.classList.toggle('recording', !!R.mr);
  $('micTxt').textContent = !M.on ? ($('micBlocked').classList.contains('hide') ? 'Mic off' : 'Mic off \u00B7 timers and tones still work') : (muted ? 'Listening paused while the tone plays' : 'Listening on this device');
}

/* ---------- analysis loop ---------- */
var loopOn = false, lastA = 0, lastMuted = null;
function startLoop() { if (loopOn) return; loopOn = true; lastA = now(); requestAnimationFrame(loop); }
function readFrame() {
  if (M.an.getFloatTimeDomainData) M.an.getFloatTimeDomainData(M.buf);
  else { M.an.getByteTimeDomainData(M.byteBuf); for (var i = 0; i < 2048; i++) M.buf[i] = (M.byteBuf[i] - 128) / 128; }
}
function loop() {
  if (!M.on) { loopOn = false; return; }
  requestAnimationFrame(loop);
  var t = now(); if (t - lastA < 0.03) return;
  var dt = Math.min(0.1, t - lastA); lastA = t;
  readFrame(); var fr = D.analyse(M.buf, M.sr);
  var muted = ac.currentTime < M.muteUntil;
  if (muted !== lastMuted) { micBar(muted); lastMuted = muted; $('paused').classList.toggle('on', muted); }
  if (HANDLE[cur]) HANDLE[cur](fr, t, dt, muted);
}
function meter(id, dbv, ok, gateDb) {
  var el = $(id); if (!el) return; var pct = function (d) { return Math.max(0, Math.min(100, (d + 72) / 57 * 100)); };
  el.firstElementChild.style.width = pct(dbv) + '%'; el.classList.toggle('ok', !!ok);
  var g = el.querySelector('.gate'); if (g && gateDb != null) { g.style.display = 'block'; g.style.left = pct(gateDb) + '%'; }
}
function coach(id, txt, cls) { var el = $(id); if (!el) return; if (el.textContent !== txt) el.textContent = txt; el.className = 'coach listenOnly' + (cls ? ' ' + cls : ''); }
var VOICE_RMS = 0.002;
function confident(fr, minClar) { return fr.voiced && fr.clarity > (minClar || 0.8) && fr.rms > VOICE_RMS && fr.midi > 40 && fr.midi < 86; }

/* ---------- recording (optional) ---------- */
var R = { ok: false, enabled: true, mr: null, key: null, takes: {}, mime: '' };
var TAKE_LABEL = { hiss: 'Hiss', trill: 'Lip trill', p151: '1-5-1 (all takes)', song: 'Song line' };
function recInit() {
  R.ok = typeof window.MediaRecorder !== 'undefined';
  if (R.ok) { var list = ['audio/mp4', 'audio/mp4;codecs=mp4a.40.2', 'audio/aac', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
    R.mime = ''; for (var i = 0; i < list.length; i++) { try { if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(list[i])) { R.mime = list[i]; break; } } catch (e) {} } }
  var p = store.get('rec'); R.enabled = p === null ? true : !!p; $('recOn').checked = R.enabled;
  $('recRow').classList.toggle('hide', !R.ok); $('recNo').classList.toggle('hide', R.ok);
}
window.recPref = function () { R.enabled = $('recOn').checked; store.set('rec', R.enabled); if (!R.enabled) recStop(false); };
function recStart(key) {
  if (!R.ok || !R.enabled || !M.on || !M.stream) return;
  recStop(false);
  try {
    var mr = R.mime ? new MediaRecorder(M.stream, { mimeType: R.mime }) : new MediaRecorder(M.stream), chunks = [];
    mr._keep = false; mr._key = key;
    mr.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
    mr.onstop = function () { if (mr._keep && chunks.length) { var b = new Blob(chunks, { type: mr.mimeType || R.mime || 'audio/webm' }); if (R.takes[key]) URL.revokeObjectURL(R.takes[key].url); R.takes[key] = { blob: b, url: URL.createObjectURL(b) }; if (cur === 5) renderDone(); } };
    mr.start(1000); R.mr = mr;
  } catch (e) { R.ok = false; R.mr = null; $('recRow').classList.add('hide'); $('recNo').classList.remove('hide'); }
  micBar(false);
}
function recStop(keep) { var mr = R.mr; if (!mr) return; R.mr = null; mr._keep = !!keep; try { if (mr.state !== 'inactive') mr.stop(); } catch (e) {} micBar(ac && ac.currentTime < M.muteUntil); }
function extFor(type) { return /mp4|aac/.test(type) ? 'm4a' : (/ogg/.test(type) ? 'ogg' : 'webm'); }

/* ---------- wake lock ---------- */
var wl = null, timersRunning = 0;
async function wakeUpdate() {
  var need = M.on || timersRunning > 0;
  try {
    if (need && !wl && 'wakeLock' in navigator && document.visibilityState === 'visible') { wl = await navigator.wakeLock.request('screen'); wl.addEventListener('release', function () { wl = null; }); }
    else if (!need && wl) { var w = wl; wl = null; await w.release(); }
  } catch (e) { wl = null; }
}
document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') wakeUpdate(); });
function timerOn() { timersRunning++; wakeUpdate(); }
function timerOff() { timersRunning = Math.max(0, timersRunning - 1); wakeUpdate(); }

function setPill(id, txt, kind) { var p = $(id); p.textContent = txt; p.className = 'pill' + (kind ? ' ' + kind : ''); }
var fmt = function (s) { return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0'); };
var fmtC = function (c) { var r = Math.round(c); return (r > 0 ? '+' : (r < 0 ? MINUS : '\u00B1')) + Math.abs(r) + ' ' + CENT; };
function centsWord(c) { return Math.abs(c) <= 15 ? 'in tune' : (c > 0 ? 'a little sharp' : 'a little flat'); }

/* ================= 0 SETUP ================= */
var HD = new D.HissDetector({ sensitivity: store.get('sens') || 'normal' });
function handleSetup(fr, t, dt, muted) {
  if (muted) return;
  var c = HD.learn(fr);
  meter('m0', D.db(fr.rms), c.hiss || confident(fr));
  if (c.hiss) coach('c0', 'I hear a hiss. That\u2019s it!', 'ok');
  else if (confident(fr)) coach('c0', 'I hear you: ' + D.name(fr.midi), 'ok');
  else if (c.near || fr.rms > 0.0025) coach('c0', 'I hear something. Try a hiss or a hum.', 'more');
  else coach('c0', 'Hiss or hum. Watch the bar move.');
}

/* ================= 1 HISS ================= */
var H = { ui: 'idle', t0: 0, lastChime: 0, raf: 0 };
function enterHiss() {
  if (H.ui === 'running') return;
  if (H.ui !== 'done') { HD.reset(); H.ui = M.on ? 'armed' : 'idle'; renderHissIdle(); if (M.on) recStart('hiss'); }
  $('chimeNote').textContent = M.on ? ' (best with headphones; off while listening is safest)' : ' (best with headphones)';
  [].forEach.call($('sens').children, function (b, i) { b.classList.toggle('on', (i ? 'more' : 'normal') === HD.sensitivity); });
}
function renderHissIdle() {
  setPill('hissState', M.on ? 'Listening \u00B7 start your hiss when ready' : 'Tap START, then hiss', M.on ? 'live' : '');
  $('hissNum').textContent = '0'; $('hissNum').style.color = ''; $('hissFill').style.width = '0';
  $('hissResult').classList.add('hide'); $('hissReset').classList.add('hide'); var b = $('hissBtn'); b.classList.remove('hide'); b.textContent = 'START'; b.className = 'btn go';
}
function hissBegin(t0) {
  H.ui = 'running'; H.t0 = t0; H.lastChime = 0; timerOn();
  setPill('hissState', M.on ? 'I hear you \u00B7 HISS' : 'TIMING \u00B7 HISS', 'rec');
  var b = $('hissBtn'); b.textContent = 'STOP \u2014 out of air'; b.className = 'btn stop';
  $('hissResult').classList.add('hide'); $('hissReset').classList.add('hide');
  var tick = function () { if (H.ui !== 'running') return; drawHiss(now() - H.t0); H.raf = requestAnimationFrame(tick); }; tick();
}
function drawHiss(el) {
  $('hissNum').textContent = Math.floor(el); $('hissNum').style.color = el >= 30 ? '#147F78' : '#B8611F';
  var f = $('hissFill'); f.style.width = Math.min(100, el / 45 * 100) + '%'; f.style.background = el >= 30 ? '#147F78' : '#CC7330';
  var c = Math.floor(el / 10) * 10; if (c > H.lastChime && c <= 30) { H.lastChime = c; chime(); }
}
function hissFinish(sec) {
  if (H.ui !== 'running') return; H.ui = 'done'; cancelAnimationFrame(H.raf); timerOff();
  var n = Math.round(sec); H.exact = sec; drawHiss(n); store.set('hiss', n);
  setPill('hissState', M.on ? 'Stopped \u00B7 the hiss ended' : 'Stopped', '');
  showHissResult(n); recStop(true);
}
function showHissResult(n) {
  var r = $('hissResult'); r.innerHTML = 'Log this: <b>' + n + ' seconds</b><br><span class="small">Goal: 30 seconds steady. ' + (n >= 30 ? 'You made it!' : 'Every second counts.') + '</span>'; r.classList.remove('hide');
  $('hissBtn').classList.add('hide'); $('hissReset').classList.remove('hide');
}
window.hissToggle = function () { ctx(); var t = now();
  if (H.ui === 'running') { var r = HD.state === 'running' ? HD.manualStop(t) : t - H.t0; hissFinish(r); }
  else { HD.manualStart(t); hissBegin(t); } };
window.hissReset = function () { HD.reset(); H.ui = M.on ? 'armed' : 'idle'; renderHissIdle(); coach('c1', ''); if (M.on) recStart('hiss'); };
window.setSens = function (s) { HD.setSensitivity(s); store.set('sens', s); [].forEach.call($('sens').children, function (b, i) { b.classList.toggle('on', (i ? 'more' : 'normal') === s); }); };
function handleHiss(fr, t, dt, muted) {
  if (muted) { HD.feedMuted(t, dt); return; }
  var c = HD.feed(fr, t);
  meter('m1', D.db(fr.hf), c.hiss, D.db(c.gate));
  if (c.event === 'start' && H.ui === 'armed') hissBegin(HD.t0);
  if (c.event === 'stop' && H.ui === 'running') hissFinish(HD.result);
  if (H.ui === 'done') coach('c1', '');
  else if (c.hiss) coach('c1', 'That\u2019s it, I hear you', 'ok');
  else if (c.near) coach('c1', 'A little more present', 'more');
  else if (H.ui === 'running') coach('c1', 'Keep it steady\u2026', 'more');
  else coach('c1', 'Breathe in low, then sss');
}

/* ================= 2 TRILL ================= */
var RT = new D.RangeTracker(), PRE = [], T = { ui: 'idle', t0: 0, run: 0, lastVoice: 0, heard: false, raf: 0, lastShow: 0 };
var KB = (function () {
  var lo = 50, hi = 74, isB = function (m) { return [1, 3, 6, 8, 10].indexOf(((m % 12) + 12) % 12) >= 0; };
  var whites = []; for (var m = lo; m <= hi; m++) if (!isB(m)) whites.push(m);
  var x0 = 6, w = 428 / whites.length, y0 = 146, kh = 88, pos = {}, s = '';
  whites.forEach(function (m, j) { var x = x0 + j * w; pos[m] = x + w / 2; s += '<rect x="' + x + '" y="' + y0 + '" width="' + w + '" height="' + kh + '" fill="#fff" stroke="#22343C" stroke-width="2"/>'; });
  whites.forEach(function (m, j) { if (m + 1 <= hi && isB(m + 1)) { var x = x0 + (j + 1) * w; pos[m + 1] = x; s += '<rect x="' + (x - w * .29) + '" y="' + y0 + '" width="' + (w * .58) + '" height="' + (kh * .6) + '" rx="2" fill="#22343C"/>'; } });
  [50, 55, 60, 64, 67, 72].forEach(function (m) { s += '<text x="' + pos[m] + '" y="' + (y0 + kh + 22) + '" text-anchor="middle" font-size="19" font-weight="700" fill="#54646C">' + D.name(m) + '</text>'; });
  var bar = function (a, b, y, c, l) { return '<rect x="' + (pos[a] - 8) + '" y="' + (y - 8) + '" width="' + (pos[b] - pos[a] + 16) + '" height="16" rx="8" fill="' + c + '"/>' + (l ? '<text x="' + (pos[a] - 6) + '" y="' + (y - 14) + '" font-size="18" font-weight="800" fill="' + c + '">' + l + '</text>' : ''); };
  s += bar(51, 69, 36, '#B8611F', 'Today D#3 ' + EN + ' A4') + bar(55, 72, 84, '#147F78', 'Goal G3 ' + EN + ' C5');
  var sx = pos[73], sy = y0 + 34, st = ''; for (var k = 0; k < 10; k++) { var r = k % 2 ? 3.2 : 7.5, a = -Math.PI / 2 + k * Math.PI / 5; st += (k ? 'L' : 'M') + (sx + r * Math.cos(a)).toFixed(1) + ' ' + (sy + r * Math.sin(a)).toFixed(1); }
  s += '<path d="' + st + 'Z" fill="#CC7330" stroke="#FAEADC" stroke-width="1"/>';
  s += '<g id="kbTake"></g><g id="kbLive"></g>';
  var svg = $('kb'); svg.innerHTML = s;
  function px(m) { var a = Math.floor(m), b = a + 1, f = m - a; if (pos[a] == null || pos[b] == null) return pos[Math.round(Math.max(lo, Math.min(hi, m)))]; return pos[a] + f * (pos[b] - pos[a]); }
  return {
    live: function (m) { var g = $('kbLive'); if (m == null) { g.innerHTML = ''; return; } var x = px(Math.max(lo, Math.min(hi, m)));
      g.innerHTML = '<line x1="' + x + '" y1="126" x2="' + x + '" y2="' + (y0 + kh) + '" stroke="#147F78" stroke-width="4" opacity=".55"/><circle cx="' + x + '" cy="126" r="11" fill="#147F78" stroke="#fff" stroke-width="3"/>'; },
    take: function (r) { var g = $('kbTake'); if (!r) { g.innerHTML = ''; return; } var a = Math.max(lo, r.low), b = Math.min(hi, r.high);
      g.innerHTML = '<rect x="' + (px(a) - 8) + '" y="' + 102 + '" width="' + (px(b) - px(a) + 16) + '" height="12" rx="6" fill="#22343C"/>'; }
  };
})();
var arch = $('arch'), AP = []; for (var i = 0; i <= 100; i++) AP.push([36 + 628 * i / 100, 200 - 165 * Math.sin(Math.PI * i / 100)]);
function drawArch(u) { var k = Math.round(100 * Math.min(Math.max(u, 0), 1)); var d = function (p) { return p.map(function (q, i) { return (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1); }).join(''); };
  var p = AP[k]; arch.innerHTML = '<path d="' + d(AP) + '" fill="none" stroke="#D6DDE0" stroke-width="16" stroke-linecap="round"/>' + (k > 0 ? '<path d="' + d(AP.slice(0, k + 1)) + '" fill="none" stroke="#147F78" stroke-width="16" stroke-linecap="round"/>' : '') +
  '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="24" fill="#CC7330" stroke="#fff" stroke-width="4"/><text x="350" y="165" text-anchor="middle" font-size="40" font-weight="800" fill="#22343C">' + (u <= 0 ? 'ready' : (u < .5 ? 'slowly up\u2026' : (u < 1 ? 'slowly down\u2026' : 'easy finish'))) + '</text>'; }
drawArch(0);
function enterTrill() { if (T.ui === 'running') return; if (T.ui !== 'done') { T.ui = M.on ? 'armed' : 'idle'; renderTrillIdle(); if (M.on) recStart('trill'); } }
function renderTrillIdle() {
  setPill('trillState', M.on ? 'Listening \u00B7 start your brrr when ready' : 'Tap START, then brrr', M.on ? 'live' : '');
  $('trillNum').textContent = '0:00'; drawArch(0); $('trillResult').classList.add('hide'); $('trillAgain').classList.add('hide');
  var b = $('trillBtn'); b.classList.remove('hide'); b.textContent = 'START'; b.className = 'btn go'; KB.live(null); KB.take(null); $('trillNow').textContent = EN;
}
function trillBegin(t0) {
  RT.reset(); PRE.forEach(function (q) { RT.feed(q[0], q[1]); }); T.heard = PRE.length > 0; PRE = [];
  T.ui = 'running'; T.t0 = t0; T.lastVoice = now(); timerOn();
  setPill('trillState', M.on ? 'Listening \u00B7 YOUR TURN' : 'TIMING \u00B7 YOUR TURN', 'rec');
  var b = $('trillBtn'); b.textContent = 'STOP'; b.className = 'btn stop'; $('trillResult').classList.add('hide'); $('trillAgain').classList.add('hide');
  var tick = function () { if (T.ui !== 'running') return; var el = now() - T.t0; $('trillNum').textContent = fmt(el); drawArch(el / 26); T.raf = requestAnimationFrame(tick); }; tick();
}
function trillFinish() {
  if (T.ui !== 'running') return; T.ui = 'done'; cancelAnimationFrame(T.raf); timerOff(); KB.live(null);
  var r = M.on ? RT.range() : null, el = $('trillResult');
  setPill('trillState', 'Stopped', '');
  if (r) { store.set('trill', { low: r.low, high: r.high }); KB.take(r);
    el.className = 'result'; el.innerHTML = 'Estimated range: <b>' + D.name(r.low) + ' ' + EN + ' ' + D.name(r.high) + '</b><br><span class="small">A live estimate. Your teacher can confirm it from your memo.</span>'; }
  else if (M.on) { el.className = 'result warm'; el.innerHTML = '<b>I didn\u2019t catch enough</b><br><span class="small">Try again closer to the phone, or your teacher can measure it from your memo.</span>'; }
  else { el.className = 'result'; el.innerHTML = 'Nice slide.<br><span class="small">Your teacher measures the range from your memo.</span>'; }
  $('trillBtn').classList.add('hide'); $('trillAgain').classList.remove('hide');
  recStop(!!r || !M.on);
}
window.trillToggle = function () { ctx(); if (T.ui === 'running') trillFinish(); else { PRE = []; trillBegin(now()); } };
window.trillReset = function () { T.ui = M.on ? 'armed' : 'idle'; renderTrillIdle(); if (M.on) recStart('trill'); };
function handleTrill(fr, t, dt, muted) {
  if (muted) return;
  meter('m2', D.db(fr.rms), confident(fr, 0.75));
  var ok = confident(fr, 0.75);
  if (T.ui === 'armed') { if (ok) { T.run += dt; PRE.push([fr.midi, dt]); } else { T.run = 0; PRE = []; } if (T.run >= 0.3) { trillBegin(t - T.run); return; } }
  if (ok) { var m = T.ui === 'running' ? RT.feed(fr.midi, dt) : fr.midi;
    if (m !== null) { KB.live(m); $('trillNow').textContent = D.name(m); T.lastShow = t; if (T.ui === 'running') { T.lastVoice = t; T.heard = true; KB.take(RT.range()); } } }
  if (t - T.lastShow > 0.3) { KB.live(null); $('trillNow').textContent = EN; }
  if (T.ui === 'running' && T.heard && t - T.lastVoice > 4 && t - T.t0 > 5) { trillFinish(); $('trillNum').textContent = fmt(T.lastVoice - T.t0); }
}

/* ================= 3 1-5-1 ================= */
var PAT = D.PAT, B = 60 / 72, strip = $('strip'), patTimers = [];
PAT.forEach(function (m) { var d = document.createElement('div'); d.textContent = D.name(m).replace(/\d+$/, ''); d.title = D.name(m); strip.appendChild(d); }); // all in octave 3
function lightStrip(j) { [].forEach.call(strip.children, function (d, k) { d.classList.toggle('on', k === j); }); }
function markSung(idx) { [].forEach.call(strip.children, function (d, k) { d.classList.toggle('sung', k <= idx); }); }
function clearTimers() { patTimers.forEach(clearTimeout); patTimers = []; }
function playE3(cb) { ctx(); clearTimers(); note(52, 0.02, 3.0, 0.24, true); mute(3.4); lightStrip(0); patTimers.push(setTimeout(function () { lightStrip(-1); if (typeof cb === 'function') cb(); }, 3150)); }
window.playE3 = function () { playE3(); };
window.playPattern = function () { ctx(); clearTimers(); markSung(-1);
  PAT.forEach(function (m, j) { note(m, 0.05 + j * B, j === 8 ? 1.6 : B * 1.1, 0.22); patTimers.push(setTimeout(function () { lightStrip(j); }, 50 + j * B * 1000)); });
  mute(0.05 + 8 * B + 1.6 + 0.5); patTimers.push(setTimeout(function () { lightStrip(-1); }, (0.05 + 9 * B) * 1000 + 400)); };
var TUNE = [], PS = new D.PatternScorer(), P = { take: 1, phase: 'idle', res: [null, null, null], t0: 0, heard: false, lastVoice: 0, lastShow: 0 };
function renderTakes() {
  [].forEach.call($('takes').children, function (d, k) { d.className = P.res[k] !== null ? 'done' : (k + 1 === P.take && P.take <= 3 ? 'on' : ''); });
  var allDone = P.take > 3;
  $('takeBtn').classList.toggle('hide', allDone || P.phase === 'tone' || P.phase === 'listen' || P.phase === 'manual');
  $('takeDone').classList.toggle('hide', !(P.phase === 'listen' || P.phase === 'manual'));
  $('takeBtn').textContent = 'Start take ' + P.take;
  if (P.phase === 'idle') { setPill('takeState', allDone ? 'All 3 takes done' : 'Take ' + P.take + ' of 3', allDone ? 'live' : '');
    $('takeTxt').textContent = allDone ? 'Lovely work. On to the song line.' : ($('e3First').checked ? 'Tap Start take. You\u2019ll hear E3, then sing.' : 'Tap Start take, then sing.'); }
  var html = ''; P.res.forEach(function (r, k) { if (r === null) return; html += '<li><span>Take ' + (k + 1) + '</span><b>' + (typeof r === 'number' ? fmtC(r) + ' \u00B7 ' + centsWord(r) : 'done') + '</b></li>'; });
  $('takeRes').innerHTML = html;
  var nums = P.res.filter(function (r) { return typeof r === 'number'; }), s = $('takeSum');
  if (nums.length) {
    var avg0 = nums.reduce(function (a, b) { return a + b; }, 0) / nums.length, best0 = nums.slice().sort(function (a, b) { return Math.abs(a) - Math.abs(b); })[0];
    if (P.phase === 'idle') store.set('p151', { avg: avg0, best: best0, n: nums.length });
  }
  if (allDone && nums.length) {
    var avg = nums.reduce(function (a, b) { return a + b; }, 0) / nums.length, best = nums.slice().sort(function (a, b) { return Math.abs(a) - Math.abs(b); })[0];
    s.className = 'result'; s.innerHTML = 'Average of ' + nums.length + ' take' + (nums.length > 1 ? 's' : '') + ': <b>' + fmtC(avg) + '</b><br><span class="small">Best take ' + fmtC(best) + '. ' +
      (avg > 15 ? 'A little high, like usual. Next week, let it settle onto the note.' : (avg < -15 ? 'A little low. Think up, keep it easy.' : 'Right in tune. Lovely.')) + '</span>';
  } else s.className = 'result hide';
}
window.takeStart = function () {
  ctx(); if (P.take > 3) return; PS.reset(); markSung(-1);
  if ($('e3First').checked) { P.phase = 'tone'; setPill('takeState', 'Listen: E3', 'wait'); $('takeTxt').textContent = 'Hear E3. Hum it softly with me.'; renderTakes(); playE3(beginListen); }
  else beginListen();
};
function beginListen() {
  P.t0 = now(); P.heard = false; P.lastVoice = P.t0;
  if (M.on) { P.phase = 'listen'; setPill('takeState', 'Listening \u00B7 take ' + P.take, 'live'); $('takeTxt').textContent = 'Sing "mee": 1-5-1, up and back down.'; timerOn(); }
  else { P.phase = 'manual'; setPill('takeState', 'Your turn \u00B7 take ' + P.take, 'rec'); $('takeTxt').textContent = 'Sing it, then tap Done.'; }
  renderTakes();
}
function takeEnd(manual) {
  if (P.phase === 'tone') { clearTimers(); lightStrip(-1); P.phase = 'idle'; renderTakes(); return; }
  if (P.phase !== 'listen' && P.phase !== 'manual') return;
  var wasListen = P.phase === 'listen'; P.phase = 'idle'; if (wasListen) timerOff();
  if (!wasListen) { P.res[P.take - 1] = 'done'; P.take++; renderTakes(); return; }
  var r = PS.result();
  if (r) { P.res[P.take - 1] = r.cents; P.take++; renderTakes(); }
  else { renderTakes(); setPill('takeState', 'Take ' + P.take + ' of 3', 'wait'); $('takeTxt').textContent = 'I didn\u2019t catch that one. Try it again?'; }
}
window.takeEnd = takeEnd;
window.takeBack = function () { if (P.phase !== 'idle') takeEnd(true); var k = Math.min(P.take, 3) - 1; if (P.res[k] === null && k > 0) k--; P.res[k] = null; P.take = k + 1; store.del('p151'); renderTakes(); };
window.takeNextManual = function () { if (P.take <= 3) { P.res[P.take - 1] = 'done'; P.take++; } P.phase = 'idle'; renderTakes(); };
$('e3First').onchange = renderTakes;
function enter151() { renderTakes(); if (M.on && !R.mr) recStart('p151'); }
function handle151(fr, t, dt, muted) {
  if (muted) return;
  var ok = confident(fr, 0.8);
  if (ok) {
    TUNE.push(fr.midi); if (TUNE.length > 5) TUNE.shift(); var sm = TUNE.slice().sort(function (a, b) { return a - b; })[TUNE.length >> 1];
    if (Math.abs(sm - fr.midi) > 0.6) { TUNE = [fr.midi]; sm = fr.midi; } // new note: follow it at once
    var n = Math.round(sm), c = (sm - n) * 100; P.lastShow = t;
    $('tNote').textContent = D.name(n); var tc = $('tCents'); tc.textContent = fmtC(c) + ' \u00B7 ' + centsWord(c);
    tc.style.color = Math.abs(c) <= 15 ? '#147F78' : '#B8611F'; $('tNote').style.color = Math.abs(c) <= 15 ? '#147F78' : '#22343C';
    var nd = $('tNeedle'); nd.style.display = 'block'; nd.style.left = (50 + Math.max(-50, Math.min(50, c))) + '%';
    if (P.phase === 'listen') { var r = PS.feed(fr.midi, dt); if (r) { markSung(r.idx); P.lastVoice = t; P.heard = true; } }
  } else if (t - P.lastShow > 0.4) { TUNE = []; $('tNote').textContent = EN; $('tNote').style.color = ''; $('tCents').textContent = 'Sing, and I\u2019ll show your pitch'; $('tCents').style.color = ''; $('tNeedle').style.display = 'none'; }
  if (P.phase === 'listen') { var since = t - P.t0;
    if ((P.heard && t - P.lastVoice > 1.8 && (PS.idx >= 4 || since > 6)) || since > 14 || (!P.heard && since > 9)) takeEnd(false); }
}

/* ================= 4 SONG ================= */
var SG = { ui: 'idle', t0: 0, raf: 0, thinkI: null, lastHeard: 0 };
function clearThink() { if (SG.thinkI) { clearInterval(SG.thinkI); SG.thinkI = null; timerOff(); } }
window.think = function () { ctx(); clearThink(); if (SG.ui === 'sing') return; var n = 10; SG.ui = 'think'; timerOn();
  setPill('songState', 'THINK TIME \u00B7 mark your breaths', 'wait'); $('songNum').textContent = n; $('songUnit').textContent = 'seconds to think';
  SG.thinkI = setInterval(function () { n--; if (n <= 0) { clearThink(); SG.ui = 'idle'; $('songNum').textContent = '0:00'; $('songUnit').textContent = 'about 30 seconds'; setPill('songState', 'Ready. Tap START SINGING', ''); } else $('songNum').textContent = n; }, 1000); };
window.songToggle = function () { ctx(); clearThink(); if (SG.ui === 'sing') songStop(); else songStart(); };
function songStart() { SG.ui = 'sing'; SG.t0 = now(); timerOn(); if (M.on) recStart('song');
  setPill('songState', M.on ? 'Listening \u00B7 SING' : 'YOUR TURN \u00B7 SING', 'rec'); $('songUnit').textContent = 'about 30 seconds'; $('songResult').classList.add('hide');
  var b = $('songBtn'); b.textContent = 'STOP'; b.className = 'btn stop'; $('thinkBtn').classList.add('hide');
  var tick = function () { if (SG.ui !== 'sing') return; $('songNum').textContent = fmt(now() - SG.t0); SG.raf = requestAnimationFrame(tick); }; tick(); }
function songStop() { if (SG.ui !== 'sing') return; SG.ui = 'done'; cancelAnimationFrame(SG.raf); timerOff(); recStop(true); store.set('songDone', true);
  setPill('songState', 'Stopped', ''); $('thinkBtn').classList.remove('hide'); var b = $('songBtn'); b.textContent = 'Sing it again'; b.className = 'btn go';
  var r = $('songResult'); r.className = 'result'; r.innerHTML = '<b>Lovely.</b><br><span class="small">That was the last take. Tap Finish for your log.</span>'; coach('c4', ''); }
function handleSong(fr, t, dt, muted) {
  if (muted) return; var ok = confident(fr, 0.75);
  meter('m4', D.db(fr.rms), ok || fr.rms > 0.004);
  if (ok || fr.rms > 0.004) SG.lastHeard = t;
  if (SG.ui === 'done') return;
  if (ok) coach('c4', 'I hear you \u00B7 ' + D.name(fr.midi), 'ok');
  else if (t - SG.lastHeard < 0.6) coach('c4', 'I hear you', 'ok');
  else coach('c4', SG.ui === 'sing' ? 'Breathe when you need to' : '');
}

/* ================= 5 DONE ================= */
function renderDone() {
  var h = store.get('hiss'), tr = store.get('trill'), p = store.get('p151');
  $('logHiss').innerHTML = h !== null ? h + ' seconds' : '<span class="tc">use your timer number</span>';
  var tc = '<span class="tc">live estimate</span>', tcon = '<span class="tc" style="font-size:15px">teacher can confirm</span>';
  $('logLo').innerHTML = tr ? D.name(tr.low) + tc : tcon; $('logHi').innerHTML = tr ? D.name(tr.high) + tc : tcon;
  $('log151').innerHTML = p ? fmtC(p.avg) + '<span class="tc">average of ' + p.n + ' take' + (p.n > 1 ? 's' : '') + ' \u00B7 best ' + fmtC(p.best) + '</span>' : tcon;
  $('songLine').value = store.get('songLine') || '';
  var list = $('dlList'), html = '', any = false, d = new Date(), ds = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  ['hiss', 'trill', 'p151', 'song'].forEach(function (k) { var tk = R.takes[k];
    if (tk) { any = true; html += '<div class="dl"><span>' + TAKE_LABEL[k] + '</span><a href="' + tk.url + '" download="voice-test-' + ds + '-' + (k === 'p151' ? '1-5-1' : k) + '.' + extFor(tk.blob.type) + '"><svg class="ico" viewBox="0 0 24 24"><path d="M11 3h2v10.2l3.6-3.6L18 11l-6 6-6-6 1.4-1.4 3.6 3.6zM5 19h14v2H5z"/></svg>Download</a></div>'; }
    else if (R.ok && R.enabled && M.on) html += '<div class="dl"><span>' + TAKE_LABEL[k] + '</span><span class="none">not saved</span></div>'; });
  if (!html) html = '<p class="small" style="margin:0">Nothing was saved on this page. Use the recordings from your memo app.</p>';
  list.innerHTML = html;
}
window.saveSongLine = function () { store.set('songLine', $('songLine').value); };
window.clearWeek = function () { ['hiss', 'trill', 'p151', 'songLine', 'songDone'].forEach(store.del); H.ui = 'idle'; T.ui = 'idle'; P.res = [null, null, null]; P.take = 1; SG.ui = 'idle'; renderDone(); };

/* ---------- screen hooks ---------- */
var ENTER = { 1: enterHiss, 2: enterTrill, 3: enter151, 5: renderDone };
var HANDLE = { 0: handleSetup, 1: handleHiss, 2: handleTrill, 3: handle151, 4: handleSong };
var LEAVE = {
  1: function () { if (H.ui === 'running') hissToggle(); if (H.ui !== 'done') recStop(false); },
  2: function () { if (T.ui === 'running') trillFinish(); if (T.ui !== 'done') recStop(false); },
  3: function () { if (P.phase !== 'idle') takeEnd(false); clearTimers(); lightStrip(-1); recStop(P.res.some(function (r) { return r !== null; })); },
  4: function () { clearThink(); if (SG.ui === 'sing') songStop(); if (SG.ui === 'think') SG.ui = 'idle'; recStop(false); }
};

/* ---------- preview / demo states for screenshots: #N?demo=STATE (no mic, sample numbers) ---------- */
function applyDemo(s, d) {
  var tag = document.createElement('div'); tag.className = 'demo'; tag.textContent = 'Preview \u00B7 sample numbers'; var wr = document.querySelector('.wrap'); wr.insertBefore(tag, wr.firstChild);
  var micOn = d !== 'blocked' && d !== 'nomic';
  if (micOn) { M.on = true; setMicClass(); M.on = false; $('micbar').classList.add('live'); $('micTxt').textContent = 'Listening on this device'; }
  if (d === 'recording') $('micbar').classList.add('recording');
  var fake = function (id, pct, ok, gate) { var el = $(id); el.firstElementChild.style.transition = 'none'; el.firstElementChild.style.width = pct + '%'; el.classList.toggle('ok', !!ok); if (gate != null) { var g = el.querySelector('.gate'); g.style.display = 'block'; g.style.left = gate + '%'; } };
  if (s === 0) {
    if (d === 'blocked') { micBlocked('The browser didn\u2019t let this page use the microphone.'); return; }
    if (micOn && d !== 'ask') { $('micBtn').classList.add('hide'); $('micLive').classList.remove('hide'); R.ok = true; $('recRow').classList.remove('hide'); $('recNo').classList.add('hide'); fake('m0', 58, true); coach('c0', 'I hear a hiss. That\u2019s it!', 'ok'); }
    if (d === 'ask') { M.on = false; setMicClass(); $('micbar').classList.remove('live'); $('micTxt').textContent = 'Mic off'; }
  }
  if (s === 1) {
    $('chimeNote').textContent = ' (best with headphones; off while listening is safest)';
    if (d === 'listen') { setPill('hissState', 'Listening \u00B7 start your hiss when ready', 'live'); fake('m1', 22, false, 26); coach('c1', 'A little more present', 'more'); }
    if (d === 'running') { setPill('hissState', 'I hear you \u00B7 HISS', 'rec'); $('hissNum').textContent = '17'; $('hissNum').style.color = '#B8611F'; $('hissFill').style.width = (17 / 45 * 100) + '%'; fake('m1', 47, true, 26); coach('c1', 'That\u2019s it, I hear you', 'ok'); $('hissBtn').textContent = 'STOP \u2014 out of air'; $('hissBtn').className = 'btn stop'; }
    if (d === 'goal') { setPill('hissState', 'I hear you \u00B7 HISS', 'rec'); $('hissNum').textContent = '32'; $('hissNum').style.color = '#147F78'; var f = $('hissFill'); f.style.width = (32 / 45 * 100) + '%'; f.style.background = '#147F78'; fake('m1', 44, true, 26); coach('c1', 'That\u2019s it, I hear you', 'ok'); $('hissBtn').textContent = 'STOP \u2014 out of air'; $('hissBtn').className = 'btn stop'; }
    if (d === 'done') { setPill('hissState', 'Stopped \u00B7 the hiss ended', ''); $('hissNum').textContent = '26'; $('hissNum').style.color = '#B8611F'; $('hissFill').style.width = (26 / 45 * 100) + '%'; fake('m1', 4, false, 26); showHissResult(26); }
  }
  if (s === 2) {
    if (d === 'live') { setPill('trillState', 'Listening \u00B7 YOUR TURN', 'rec'); $('trillNum').textContent = '0:12'; drawArch(12 / 26); KB.live(57.2); KB.take({ low: 51, high: 57 }); $('trillNow').textContent = 'A3'; fake('m2', 55, true); $('trillBtn').textContent = 'STOP'; $('trillBtn').className = 'btn stop'; }
    if (d === 'done') { setPill('trillState', 'Stopped', ''); $('trillNum').textContent = '0:29'; drawArch(1); KB.take({ low: 51, high: 70 }); var el = $('trillResult'); el.className = 'result'; el.innerHTML = 'Estimated range: <b>D#3 ' + EN + ' A#4</b><br><span class="small">A live estimate. Your teacher can confirm it from your memo.</span>'; $('trillBtn').classList.add('hide'); $('trillAgain').classList.remove('hide'); fake('m2', 3, false); }
  }
  if (s === 3) {
    if (d === 'tone') { $('paused').classList.add('on'); $('micbar').classList.remove('live'); $('micbar').classList.add('paused'); $('micTxt').textContent = 'Listening paused while the tone plays'; lightStrip(0); P.phase = 'tone'; renderTakes(); setPill('takeState', 'Listen: E3', 'wait'); $('takeTxt').textContent = 'Hear E3. Hum it softly with me.'; }
    if (d === 'live' || d === 'sharp') { P.take = 2; P.res = [14, null, null]; P.phase = 'listen'; renderTakes(); setPill('takeState', 'Listening \u00B7 take 2', 'live'); $('takeTxt').textContent = 'Sing "mee": 1-5-1, up and back down.'; markSung(2); lightStrip(-1);
      var c = d === 'sharp' ? 22 : 6; $('tNote').textContent = 'G#3'; $('tNote').style.color = c > 15 ? '#22343C' : '#147F78'; $('tCents').textContent = fmtC(c) + ' \u00B7 ' + centsWord(c); $('tCents').style.color = c > 15 ? '#B8611F' : '#147F78'; $('tNeedle').style.display = 'block'; $('tNeedle').style.left = (50 + c) + '%'; }
    if (d === 'done') { P.take = 4; P.res = [14, 9, 4]; P.phase = 'idle'; renderTakes(); markSung(8); }
  }
  if (s === 4) {
    if (d === 'think') { setPill('songState', 'THINK TIME \u00B7 mark your breaths', 'wait'); $('songNum').textContent = '7'; $('songUnit').textContent = 'seconds to think'; }
    if (d === 'sing') { setPill('songState', 'Listening \u00B7 SING', 'rec'); $('songNum').textContent = '0:14'; fake('m4', 61, true); coach('c4', 'I hear you \u00B7 B3', 'ok'); $('songBtn').textContent = 'STOP'; $('songBtn').className = 'btn stop'; $('thinkBtn').classList.add('hide'); $('micbar').classList.add('recording'); }
  }
  if (s === 5) {
    $('logHiss').innerHTML = '26 seconds'; $('logLo').innerHTML = 'D#3<span class="tc">live estimate</span>'; $('logHi').innerHTML = 'A#4<span class="tc">live estimate</span>';
    $('log151').innerHTML = fmtC(9) + '<span class="tc">average of 3 takes \u00B7 best ' + fmtC(4) + '</span>';
    if (d !== 'nomic') $('dlList').innerHTML = ['Hiss', 'Lip trill', '1-5-1 (all takes)', 'Song line'].map(function (l) { return '<div class="dl"><span>' + l + '</span><a href="#5?demo=1" onclick="return false"><svg class="ico" viewBox="0 0 24 24"><path d="M11 3h2v10.2l3.6-3.6L18 11l-6 6-6-6 1.4-1.4 3.6 3.6zM5 19h14v2H5z"/></svg>Download</a></div>'; }).join('');
    else { $('logLo').innerHTML = '<span class="tc" style="font-size:15px">teacher can confirm</span>'; $('logHi').innerHTML = $('logLo').innerHTML; $('log151').innerHTML = $('logLo').innerHTML; }
  }
}

/* ---------- start ---------- */
var first = parseHash();
if (typeof MediaRecorder === 'undefined') { $('recRow').classList.add('hide'); $('recNo').classList.remove('hide'); }
go(first.s);
if (DEMO) applyDemo(first.s, DEMO);
})();
