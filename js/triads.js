// Triad trainer: a progression inside a 4-fret window (walk 0→15 or random),
// or on one string set with smooth voice leading.

import * as T from './theory.js';
import { fretboardSVG } from './fretboard.js';
import * as store from './store.js';
import { esc, el, toast } from './ui.js';
import { cue } from './audio.js';

const MAX_START = 15;
let handoff = null; // {chords, label} from the Roll screen
export const sendToTrainer = (p) => { handoff = p; };

function randomProgression() {
  const key = T.pick(T.MAJOR_KEYS);
  const digits = T.pick(T.PROGRESSIONS);
  return { chords: T.progressionInKey(key, digits), label: `${T.noteName(key)} major · ${[...digits].join('-')}` };
}

export function triadsView(root, { id }) {
  const item = id ? store.getItem(id) : null;
  const fixed = item && !item.random ? T.parseProgression(item.chords || item.name) : null;
  const s = {
    mode: fixed ? 'walk' : 'random',
    method: item?.method || 'window',
    setIdx: 0,
    start: 0,
    shown: !!fixed,
    labels: store.settings().labels || 'roles',
    ...(fixed ? { chords: fixed, label: item.name } : handoff || randomProgression()),
  };
  if (handoff) { s.mode = 'random'; s.shown = true; handoff = null; }
  if (s.mode === 'random') s.start = Math.floor(Math.random() * (MAX_START + 1));

  const v = el(`<div class="triads">
    <div class="prog"></div>
    <div class="controls">
      <div class="seg" data-k="mode"><button data-v="walk">Walk 0→15</button><button data-v="random">Random</button></div>
      <div class="seg" data-k="method"><button data-v="window">4-fret window</button><button data-v="strings">String set</button></div>
      <div class="seg sets" data-k="setIdx">${T.STRING_SETS.map((st, i) => `<button data-v="${i}">${[...st].reverse().join('')}</button>`).join('')}</div>
      <div class="seg" data-k="labels"><button data-v="roles">R 3 5</button><button data-v="notes">Notes</button></div>
    </div>
    <div class="winbar">
      <button class="step" id="wprev">−</button>
      <div class="win"><b id="wtxt"></b><small id="wsub"></small></div>
      <button class="step" id="wnext">+</button>
    </div>
    <div class="diagrams"></div>
    <div class="foot">
      <button class="btn ghost" id="show"></button>
      <button class="btn hot big" id="next">Next</button>
    </div>
    <p class="legend"><i class="dot r">R</i> root <i class="dot t">3</i> third <i class="dot f">5</i> fifth · lines join complete triads (<span class="s0">root pos.</span>, <span class="s1">1st inv.</span>, <span class="s2">2nd inv.</span>)</p>
  </div>`);
  root.append(v);
  const $ = (q) => v.querySelector(q);

  function render() {
    $('.prog').innerHTML = `<div class="chips">${s.chords.map((c) => `<span class="chord">${esc(c.name)}</span>`).join('')}</div><small dir="auto">${esc(s.label)}</small>`;
    v.querySelectorAll('.seg').forEach((seg) => seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', String(s[seg.dataset.k]) === b.dataset.v)));
    $('.sets').hidden = s.method !== 'strings';
    const end = s.start + 3;
    $('#wtxt').textContent = s.start === 0 ? 'Open – 3' : `Frets ${s.start}–${end}`;
    $('#wsub').textContent = s.method === 'strings' ? `start near fret ${s.start} · strings ${[...T.STRING_SETS[s.setIdx]].reverse().join('-')}` : s.mode === 'walk' ? `window ${s.start + 1} of ${MAX_START + 1}` : 'random window';
    $('#show').textContent = s.shown ? 'Hide' : 'Show';
    $('#next').textContent = s.mode === 'walk' ? 'Next window' : 'New random';

    const box = $('.diagrams');
    if (!s.shown) {
      box.innerHTML = `<div class="hidden-hint">Play it, then say <b>“Ember, show”</b> or tap Show.</div>`;
      return;
    }
    if (s.method === 'window') {
      const frets = T.windowFrets(s.start);
      box.innerHTML = s.chords.map((c) => {
        const shapes = T.triadShapes(c, s.start, end);
        return `<figure><figcaption>${esc(c.name)}<small>${shapes.length ? shapes.map((x) => x.inversion).join(' · ') : 'no full triad on adjacent strings'}</small></figcaption>${fretboardSVG({ frets, dots: T.tonesInWindow(c, s.start), shapes, labels: s.labels })}</figure>`;
      }).join('');
    } else {
      const set = T.STRING_SETS[s.setIdx];
      const voicings = T.voiceLead(s.chords, set, s.start);
      const all = voicings.filter(Boolean).flatMap((x) => x.frets);
      const lo = Math.max(0, Math.min(...all)), hi = Math.max(lo + 3, Math.max(...all));
      const frets = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
      box.innerHTML = s.chords.map((c, i) => {
        const vc = voicings[i];
        const dots = vc ? vc.strings.map((st, j) => ({ string: st, fret: vc.frets[j], pc: T.pcAt(st, vc.frets[j]), role: T.role(c, T.pcAt(st, vc.frets[j])) })) : [];
        return `<figure><figcaption>${esc(c.name)}<small>${vc ? vc.inversion : '—'}</small></figcaption>${fretboardSVG({ frets, dots, shapes: vc ? [vc] : [], labels: s.labels })}</figure>`;
      }).join('');
    }
  }

  function next() {
    if (s.mode === 'walk') {
      s.start++;
      if (s.start > MAX_START) { s.start = 0; toast('Whole neck done — back to the open position', 'ok'); }
    } else {
      if (!fixed) Object.assign(s, randomProgression());
      s.start = Math.floor(Math.random() * (MAX_START + 1));
      if (s.method === 'strings' && Math.random() < 0.5) s.setIdx = Math.floor(Math.random() * T.STRING_SETS.length);
      s.shown = false;
    }
    render();
  }
  function prev() {
    s.start = s.start <= 0 ? MAX_START : s.start - 1;
    render();
  }

  v.querySelectorAll('.seg').forEach((seg) => seg.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const k = seg.dataset.k;
    s[k] = k === 'setIdx' ? Number(b.dataset.v) : b.dataset.v;
    if (k === 'labels') store.setSettings({ labels: s.labels });
    if (k === 'mode') { s.shown = s.mode === 'walk'; if (s.mode === 'walk') s.start = 0; }
    render();
  });
  $('#wprev').onclick = prev;
  $('#wnext').onclick = () => { s.start = Math.min(MAX_START, s.start + 1); render(); };
  $('#show').onclick = () => { s.shown = !s.shown; render(); };
  $('#next').onclick = next;
  render();

  return {
    title: item ? item.name : 'Triad trainer',
    itemId: item?.id,
    handle(cmd) {
      switch (cmd.type) {
        case 'next': next(); return true;
        case 'prev': prev(); return true;
        case 'random': s.mode = 'random'; next(); return true;
        case 'walk': s.mode = 'walk'; s.start = 0; s.shown = true; render(); return true;
        case 'show': s.shown = cmd.on; render(); return true;
        case 'window': s.start = Math.max(0, Math.min(MAX_START, cmd.start)); render(); return true;
        case 'labels': s.labels = cmd.labels; store.setSettings({ labels: s.labels }); render(); return true;
        case 'stringSet': s.method = 'strings'; if (cmd.top >= 1 && cmd.top <= 4) s.setIdx = cmd.top - 1; render(); return true;
      }
      return false;
    },
  };
}

// ---- Roll: the sheet's "Randoms" tab --------------------------------------------------

export function rollView(root, { what }) {
  const v = el(`<div class="roll">
    <div class="result" id="res"><small>Tap a die or say “Ember, random key”</small></div>
    <div class="menu">
      <button class="tile" data-w="key"><b>Key</b><small>12 major keys</small></button>
      <button class="tile" data-w="interval"><b>Interval</b><small>2m … octave</small></button>
      <button class="tile" data-w="position"><b>Scale position</b><small>4+ 5− 5+ 6− 6+</small></button>
      <button class="tile" data-w="progression"><b>Progression</b><small>in a random key</small></button>
    </div>
  </div>`);
  root.append(v);
  let last = null;

  function roll(w) {
    const res = v.querySelector('#res');
    if (w === 'key') res.innerHTML = `<b>${T.noteName(T.pick(T.MAJOR_KEYS))} major</b><small>key</small>`;
    if (w === 'interval') res.innerHTML = `<b>${T.pick(T.INTERVALS)}</b><small>interval</small>`;
    if (w === 'position') { const p = T.pick(T.POSITIONS); res.innerHTML = `<b>${p.id.replace('-', '−')}</b><small>${esc(p.text)}</small>`; }
    if (w === 'progression') {
      last = randomProgression();
      res.innerHTML = `<b>${last.chords.map((c) => esc(c.name)).join(' · ')}</b><small>${esc(last.label)}</small><a class="btn hot" href="#/triads" id="totri">Practice as triads</a>`;
      res.querySelector('#totri').onclick = () => sendToTrainer(last);
    }
    res.classList.remove('pop'); void res.offsetWidth; res.classList.add('pop');
  }
  v.querySelectorAll('[data-w]').forEach((b) => b.onclick = () => roll(b.dataset.w));
  if (what) roll(what);

  return {
    title: 'Roll',
    handle(cmd) {
      if (cmd.type === 'roll') { roll(cmd.what); return true; }
      if (cmd.type === 'open' && last) { sendToTrainer(last); location.hash = '#/triads'; return true; }
      return false;
    },
  };
}
