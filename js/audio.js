// Shared AudioContext, soft non-vocal cues, and a metronome.

import { settings } from './store.js';

let ctx = null;
export function audioCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function noiseBuffer(c, seconds) {
  const b = c.createBuffer(1, Math.ceil(c.sampleRate * seconds), c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

function tone(c, out, freq, t, dur, gain, type = 'sine') {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function crackle(c, out, t, count, gain) {
  for (let i = 0; i < count; i++) {
    const s = c.createBufferSource();
    s.buffer = noiseBuffer(c, 0.03);
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1800 + Math.random() * 2200;
    f.Q.value = 1.2;
    const g = c.createGain();
    const at = t + i * (0.03 + Math.random() * 0.05);
    g.gain.setValueAtTime(gain * (0.5 + Math.random() * 0.5), at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.025);
    s.connect(f).connect(g).connect(out);
    s.start(at);
  }
}

/** Soft cues: 'wake' (crackle), 'ok' (low chime), 'error' (muted thud), 'logged' (spark pop). */
export function cue(name) {
  const vol = settings().cueVolume;
  if (!vol) return;
  const c = audioCtx();
  const out = c.createGain();
  out.gain.value = vol * 0.6;
  out.connect(c.destination);
  const t = c.currentTime + 0.01;
  if (name === 'wake') crackle(c, out, t, 4, 0.35);
  else if (name === 'ok') { tone(c, out, 392, t, 0.35, 0.12, 'triangle'); tone(c, out, 523, t + 0.07, 0.4, 0.09, 'sine'); }
  else if (name === 'error') tone(c, out, 140, t, 0.22, 0.25, 'sine');
  else if (name === 'logged') { crackle(c, out, t, 3, 0.25); tone(c, out, 660, t + 0.05, 0.3, 0.07, 'sine'); tone(c, out, 880, t + 0.12, 0.35, 0.05, 'sine'); }
}

// ---- metronome ---------------------------------------------------------------

export const metronome = {
  bpm: 80,
  beats: 4,
  running: false,
  onBeat: null, // (beatIndex) => void, called roughly on time for visuals
  _timer: null,
  _next: 0,
  _beat: 0,

  setBpm(b) {
    this.bpm = Math.max(30, Math.min(300, Math.round(b)));
  },
  start() {
    if (this.running) return;
    const c = audioCtx();
    this.running = true;
    this._beat = 0;
    this._next = c.currentTime + 0.08;
    this._timer = setInterval(() => this._schedule(), 25);
    this._schedule();
  },
  stop() {
    this.running = false;
    clearInterval(this._timer);
  },
  toggle() {
    this.running ? this.stop() : this.start();
  },
  _schedule() {
    const c = audioCtx();
    while (this._next < c.currentTime + 0.12) {
      this._click(this._next, this._beat % this.beats === 0);
      const beat = this._beat % this.beats;
      const delay = Math.max(0, (this._next - c.currentTime) * 1000);
      setTimeout(() => this.onBeat && this.onBeat(beat), delay);
      this._next += 60 / this.bpm;
      this._beat++;
    }
  },
  _click(t, accent) {
    const c = audioCtx();
    const g = c.createGain();
    const vol = settings().clickVolume;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime((accent ? 0.9 : 0.55) * vol + 0.0001, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    // woody click: short noise through a resonant band-pass
    const s = c.createBufferSource();
    s.buffer = noiseBuffer(c, 0.07);
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = accent ? 2400 : 1700;
    f.Q.value = 6;
    s.connect(f).connect(g).connect(c.destination);
    s.start(t);
  },
};
