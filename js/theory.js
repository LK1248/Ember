// Notes, chords, keys and triad shapes on the fretboard.

export const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLATS = { Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#', Cb: 'B', Fb: 'E', 'E#': 'F', 'B#': 'C' };

// Open-string pitches (MIDI), indexed by string number 1 (high e) .. 6 (low E).
export const TUNING = { 1: 64, 2: 59, 3: 55, 4: 50, 5: 45, 6: 40 };
export const STRING_SETS = [[3, 2, 1], [4, 3, 2], [5, 4, 3], [6, 5, 4]];

export const noteName = (pc) => NOTES[((pc % 12) + 12) % 12];

export function notePc(name) {
  const n = FLATS[name] || name;
  const i = NOTES.indexOf(n);
  return i < 0 ? null : i;
}

const QUALITY = {
  maj: { ivs: [0, 4, 7], suffix: '' },
  min: { ivs: [0, 3, 7], suffix: 'm' },
  dim: { ivs: [0, 3, 6], suffix: 'dim' },
  aug: { ivs: [0, 4, 8], suffix: 'aug' },
};

/** "C#m", "Bb", "F#7", "C#m7", "Bdim" → chord (7ths are reduced to their triad, flagged). */
export function parseChord(token) {
  const m = /^([A-G])([#b]?)(maj7|M7|m7|m|min|dim|aug|7)?$/.exec(token.trim());
  if (!m) return null;
  const root = notePc(m[1] + m[2]);
  if (root == null) return null;
  const q = m[3] || '';
  const quality = q === 'dim' ? 'dim' : q === 'aug' ? 'aug' : (q === 'm' || q === 'min' || q === 'm7') ? 'min' : 'maj';
  return makeChord(root, quality, /7/.test(q) ? q : '');
}

export function makeChord(root, quality, seventh = '') {
  const { ivs, suffix } = QUALITY[quality];
  const tones = ivs.map((iv) => (root + iv) % 12);
  return { root, quality, tones, name: noteName(root) + suffix + (seventh && seventh !== 'm7' ? seventh : seventh ? '7' : ''), seventh };
}

/** "Bm / G / C#m / F#" or "Am G F E" → chords; unknown tokens are skipped. */
export function parseProgression(text) {
  const clean = String(text || '').replace(/\(.*?\)|\[.*?\]/g, ' ');
  return clean.split(/[\s/,|]+/).map(parseChord).filter(Boolean);
}

// Role of a pitch class in a chord: 'R', '3' or '5'.
export function role(chord, pc) {
  const i = chord.tones.indexOf(pc);
  return i < 0 ? null : ['R', '3', '5'][i];
}

// ---- keys and progressions ---------------------------------------------------

const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
const DEGREE_QUALITY = ['maj', 'min', 'min', 'maj', 'maj', 'min', 'dim'];
export const MAJOR_KEYS = NOTES.map((n, i) => i);

export function degreeChord(keyPc, degree) {
  const d = (degree - 1) % 7;
  return makeChord((keyPc + MAJOR_STEPS[d]) % 12, DEGREE_QUALITY[d]);
}

// From the sheet's "Randoms" tab, plus a few common ones.
export const PROGRESSIONS = ['1456', '1645', '6415', '1564', '2516', '15634145', '1625', '4156', '6451'];

export function progressionInKey(keyPc, digits) {
  return [...digits].map((d) => degreeChord(keyPc, Number(d)));
}

export const INTERVALS = ['2m', '2M', '3m', '3M', '4P', 'Tritone', '5P', '6m', '6M', '7m', '7M', 'Octave'];
export const POSITIONS = [
  { id: '4+', text: 'Root on string 4 · most notes below the root fret' },
  { id: '5-', text: 'Root on string 5 · most notes above the root fret' },
  { id: '5+', text: 'Root on string 5 · most notes below the root fret' },
  { id: '6-', text: 'Root on string 6 · most notes above the root fret' },
  { id: '6+', text: 'Root on string 6 · most notes below the root fret' },
];

export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ---- fretboard ------------------------------------------------------------

export const pcAt = (string, fret) => (TUNING[string] + fret) % 12;

/** Frets shown for a 4-fret window starting at `start` (start 0 = open strings + frets 1-3). */
export function windowFrets(start, width = 4) {
  return Array.from({ length: width }, (_, i) => start + i);
}

/** Every chord tone inside the window, on every string. */
export function tonesInWindow(chord, start, width = 4) {
  const out = [];
  for (let s = 1; s <= 6; s++) {
    for (const f of windowFrets(start, width)) {
      const r = role(chord, pcAt(s, f));
      if (r) out.push({ string: s, fret: f, role: r, pc: pcAt(s, f) });
    }
  }
  return out;
}

function inversionOf(chord, bassPc) {
  return ['root', '1st inv', '2nd inv'][chord.tones.indexOf(bassPc)];
}

/** Complete triads on three adjacent strings with all frets in [lo, hi]. */
export function triadShapes(chord, lo, hi, sets = STRING_SETS) {
  const shapes = [];
  for (const set of sets) {
    const options = set.map((s) => {
      const fs = [];
      for (let f = lo; f <= hi; f++) if (role(chord, pcAt(s, f))) fs.push(f);
      return fs;
    });
    for (const a of options[0]) for (const b of options[1]) for (const c of options[2]) {
      const frets = [a, b, c];
      const pcs = new Set(frets.map((f, i) => pcAt(set[i], f)));
      if (pcs.size !== 3) continue;
      const fretted = frets.filter((f) => f > 0);
      if (fretted.length && Math.max(...fretted) - Math.min(...fretted) > 3) continue;
      if (frets.includes(0) && Math.max(...frets) > 4) continue; // open string + high fret: not a real shape
      const bass = pcAt(set[0], frets[0]); // sets are listed low string first, e.g. [3,2,1]
      shapes.push({ strings: set, frets, inversion: inversionOf(chord, bass) });
    }
  }
  return shapes;
}

/** Triads on one string set across a progression, each chosen close to the previous one. */
export function voiceLead(chords, set, startFret) {
  let anchor = startFret + 1.5;
  return chords.map((ch) => {
    const all = triadShapes(ch, 0, 17, [set]);
    if (!all.length) return null;
    const center = (sh) => sh.frets.reduce((a, b) => a + b, 0) / 3;
    all.sort((x, y) => Math.abs(center(x) - anchor) - Math.abs(center(y) - anchor));
    const best = all[0];
    anchor = center(best);
    return best;
  });
}
