// Tuner: chromatic by default, optional standard-tuning mode (E A D G B e).
// Pitch: McLeod normalized square difference (NSDF) on 2048-sample windows, ~20 readings/s.

import * as store from './store.js';
import { audioCtx } from './audio.js';
import { NOTES } from './theory.js';
import { el } from './ui.js';

const STRINGS = [ // low to high
  { name: 'E', label: 'E2', midi: 40 }, { name: 'A', label: 'A2', midi: 45 }, { name: 'D', label: 'D3', midi: 50 },
  { name: 'G', label: 'G3', midi: 55 }, { name: 'B', label: 'B3', midi: 59 }, { name: 'e', label: 'E4', midi: 64 },
];
const IN_TUNE = 5;       // cents shown as "in tune"
const MIN_RMS = 0.004;   // quieter than this = no note
const MIN_CLARITY = 0.85;

const midiToFreq = (m, a4) => a4 * Math.pow(2, (m - 69) / 12);
const freqToMidi = (f, a4) => 69 + 12 * Math.log2(f / a4);

/** Pitch in Hz (or null) and clarity 0..1 for a mono buffer. */
export function detectPitch(buf, sr) {
  const n = buf.length;
  let rms = 0;
  for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / n);
  if (rms < MIN_RMS) return { freq: null, clarity: 0, rms };

  const minLag = Math.floor(sr / 1400), maxLag = Math.min(Math.floor(sr / 60), n >> 1);
  const nsdf = new Float32Array(maxLag + 1);
  for (let tau = minLag; tau <= maxLag; tau++) {
    let acf = 0, m = 0;
    for (let i = 0, end = n - tau; i < end; i++) {
      const a = buf[i], b = buf[i + tau];
      acf += a * b;
      m += a * a + b * b;
    }
    nsdf[tau] = m ? (2 * acf) / m : 0;
  }
  // key maxima: the highest point of each positive lobe after the first negative dip
  const peaks = [];
  let tau = minLag;
  while (tau < maxLag && nsdf[tau] > 0) tau++;
  while (tau < maxLag) {
    while (tau < maxLag && nsdf[tau] <= 0) tau++;
    let best = tau;
    while (tau < maxLag && nsdf[tau] > 0) { if (nsdf[tau] > nsdf[best]) best = tau; tau++; }
    if (best > minLag && best < maxLag) peaks.push(best);
  }
  if (!peaks.length) return { freq: null, clarity: 0, rms };
  const top = Math.max(...peaks.map((p) => nsdf[p]));
  const pick = peaks.find((p) => nsdf[p] >= 0.9 * top);
  // parabolic interpolation around the chosen lag
  const y0 = nsdf[pick - 1], y1 = nsdf[pick], y2 = nsdf[pick + 1];
  const d = (y0 - y2) / (2 * (y0 - 2 * y1 + y2) || 1);
  return { freq: sr / (pick + (Number.isFinite(d) ? d : 0)), clarity: y1, rms };
}

export function tunerView(root, { mode: modeParam }) {
  const s = {
    mode: modeParam || store.settings().tunerMode || 'chromatic',
    a4: store.settings().a4 || 440,
    lock: null,           // index into STRINGS when a string is tapped (standard mode)
  };
  let stream = null, src = null, analyser = null, timer = null, history = [], lastHeard = 0;

  const v = el(`<div class="tuner">
    <div class="tmodes">
      <div class="seg" id="tmode"><button data-m="chromatic">Chromatic</button><button data-m="standard">Standard EADGBE</button></div>
    </div>
    <div class="tstrings" id="tstrings">${STRINGS.map((st, i) => `<button data-i="${i}">${st.name}</button>`).join('')}</div>
    <div class="tdisplay idle" id="tdisp">
      <div class="tnote"><b id="tname">–</b><sub id="toct"></sub></div>
      <svg class="gauge" viewBox="0 0 300 160" aria-hidden="true">
        <path class="arc" d="${arcPath(-50, 50)}"/>
        <path class="zone" d="${arcPath(-IN_TUNE, IN_TUNE)}"/>
        ${[-50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50].map((c) => tick(c)).join('')}
        <text class="glab" x="${pt(-50, 138)[0].toFixed(0)}" y="${pt(-50, 138)[1].toFixed(0)}">−50</text><text class="glab" x="${pt(50, 138)[0].toFixed(0)}" y="${pt(50, 138)[1].toFixed(0)}">+50</text>
        <g id="needle" style="transform: rotate(0deg)"><line x1="150" y1="150" x2="150" y2="42"/><circle cx="150" cy="150" r="7"/></g>
      </svg>
      <div class="tcents"><span id="tcents">play a note</span></div>
      <div class="thint" id="thint"></div>
      <small class="thz" id="thz"></small>
    </div>
    <div class="tref">
      <button class="step" id="a4m">−</button>
      <div><b id="a4">A4 = ${s.a4} Hz</b><small>reference pitch</small></div>
      <button class="step" id="a4p">+</button>
    </div>
    <p class="hint" id="tmsg"></p>
  </div>`);
  root.append(v);
  const $ = (q) => v.querySelector(q);

  function paintMode() {
    v.querySelectorAll('#tmode button').forEach((b) => b.classList.toggle('on', b.dataset.m === s.mode));
    $('#tstrings').hidden = s.mode !== 'standard';
    v.querySelectorAll('#tstrings button').forEach((b, i) => b.classList.toggle('lock', s.lock === i));
  }
  function setMode(m) {
    s.mode = m; s.lock = null; history = [];
    store.setSettings({ tunerMode: m });
    paintMode();
  }
  v.querySelectorAll('#tmode button').forEach((b) => b.onclick = () => setMode(b.dataset.m));
  v.querySelectorAll('#tstrings button').forEach((b) => b.onclick = () => { const i = Number(b.dataset.i); s.lock = s.lock === i ? null : i; paintMode(); });
  const setA4 = (x) => { s.a4 = Math.max(430, Math.min(450, x)); store.setSettings({ a4: s.a4 }); $('#a4').textContent = `A4 = ${s.a4} Hz`; };
  $('#a4m').onclick = () => setA4(s.a4 - 1);
  $('#a4p').onclick = () => setA4(s.a4 + 1);
  paintMode();

  function show(freq) {
    const disp = $('#tdisp');
    if (!freq) {
      if (Date.now() - lastHeard > 1500) {
        disp.classList.add('idle'); disp.classList.remove('good');
        $('#tcents').textContent = 'play a note';
        $('#thint').textContent = '';
      }
      return;
    }
    lastHeard = Date.now();
    disp.classList.remove('idle');
    const midi = freqToMidi(freq, s.a4);
    let target, label, octave;
    if (s.mode === 'standard') {
      const i = s.lock ?? STRINGS.reduce((bi, st, j) => (Math.abs(st.midi - midi) < Math.abs(STRINGS[bi].midi - midi) ? j : bi), 0);
      target = STRINGS[i].midi;
      label = STRINGS[i].name;
      octave = `string ${6 - i}`;
      v.querySelectorAll('#tstrings button').forEach((b, j) => b.classList.toggle('on', j === i));
    } else {
      target = Math.round(midi);
      label = NOTES[((target % 12) + 12) % 12];
      octave = String(Math.floor(target / 12) - 1);
    }
    const cents = Math.round((midi - target) * 100);
    $('#tname').textContent = label;
    $('#toct').textContent = octave;
    $('#tcents').textContent = Math.abs(cents) <= IN_TUNE ? 'in tune' : `${cents > 0 ? '+' : '−'}${Math.abs(cents)} cents`;
    $('#thint').textContent = Math.abs(cents) <= IN_TUNE ? '' : cents < 0 ? '↑ tune up' : '↓ tune down';
    $('#thz').textContent = `${freq.toFixed(1)} Hz · target ${midiToFreq(target, s.a4).toFixed(1)} Hz`;
    disp.classList.toggle('good', Math.abs(cents) <= IN_TUNE);
    $('#needle').style.transform = `rotate(${Math.max(-50, Math.min(50, cents)) * 1.2}deg)`;
  }

  async function start() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
      });
    } catch (err) {
      $('#tmsg').textContent = `Microphone not available (${err.name || err}). Allow the microphone for this site and reopen the tuner.`;
      return;
    }
    const ctx = audioCtx();
    src = ctx.createMediaStreamSource(stream);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    src.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    timer = setInterval(() => {
      analyser.getFloatTimeDomainData(buf);
      const r = detectPitch(buf, ctx.sampleRate);
      if (!r.freq || r.clarity < MIN_CLARITY) return show(null);
      // median of recent readings; a jump of more than a semitone starts fresh
      const med = history.length ? [...history].sort((a, b) => a - b)[history.length >> 1] : r.freq;
      if (Math.abs(12 * Math.log2(r.freq / med)) > 1) history = [];
      history.push(r.freq);
      if (history.length > 5) history.shift();
      show([...history].sort((a, b) => a - b)[history.length >> 1]);
    }, 50);
  }
  start();

  return {
    title: 'Tuner',
    cleanup() {
      clearInterval(timer);
      try { src?.disconnect(); } catch { /* ignore */ }
      stream?.getTracks().forEach((t) => t.stop());
    },
    handle(cmd) {
      if (cmd.type === 'tunerMode') { setMode(cmd.mode); return true; }
      if (cmd.type === 'stringSet' || cmd.type === 'index') {
        const n = cmd.type === 'index' ? cmd.n : cmd.top;
        if (s.mode === 'standard' && n >= 1 && n <= 6) { s.lock = 6 - n; paintMode(); return true; }
      }
      return false;
    },
  };
}

// ---- gauge geometry: -50..+50 cents across a 120° arc ---------------------------
function pt(cents, r) {
  const a = ((cents * 1.2) - 90) * Math.PI / 180;
  return [150 + r * Math.cos(a), 150 + r * Math.sin(a)];
}
function arcPath(c0, c1) {
  const [x0, y0] = pt(c0, 120), [x1, y1] = pt(c1, 120);
  return `M${x0.toFixed(1)} ${y0.toFixed(1)} A120 120 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}
function tick(c) {
  const [x0, y0] = pt(c, c % 50 === 0 || c === 0 ? 100 : 108), [x1, y1] = pt(c, 120);
  return `<line class="tick${c === 0 ? ' mid' : ''}" x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}"/>`;
}
