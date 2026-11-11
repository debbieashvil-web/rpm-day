# Weekly voice test: listening coach (preview)

Open `index.html` (works offline from a file or any static host; on a phone the mic needs https or localhost).
Files: `index.html` (layout and styles), `app.js` (screens, mic, tones, recorder), `dsp.js` (YIN pitch, hiss detector, range tracker, 1-5-1 scorer).
There are no network requests, CDNs, fonts to download, or analytics. CSP blocks `connect-src`.

Deep links: `#0` Setup, `#1` Hiss, `#2` Trill, `#3` 1-5-1, `#4` Song, `#5` Done.

Preview states for screenshots (no mic, sample numbers, nothing saved): `#N?demo=STATE`
- `#0?demo=ask|meter|blocked`
- `#1?demo=listen|running|goal|done|nomic`
- `#2?demo=live|done|nomic`
- `#3?demo=tone|live|sharp|done|nomic`
- `#4?demo=think|sing`
- `#5?demo=1|nomic`

Tests:
- `node tests/test_dsp.js` runs the pitch, hiss, trill and 1-5-1 unit tests. The last output is in `tests/test_dsp_output.txt`.
- `node tests/make_wavs.js /tmp/vl_wavs && NODE_PATH=<puppeteer-core> node tests/e2e.js /tmp/vl_wavs` feeds Chrome's fake mic from synthesized wavs. Output is in `tests/e2e_output.json`.
- `NODE_PATH=<puppeteer-core> node tests/shots.js` writes the QA stills to `../voice_test_listener_qa/`.
