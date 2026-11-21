// Spoken command vocabulary and parser.  Text in → {type, ...} out.

export const WAKE = 'ember';

const UNITS = { zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const TEENS = { ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

const TOPIC_WORDS = {
  songs: 'songs', song: 'songs',
  technique: 'technique',
  fretboard: 'fretboard',
  chords: 'chords', chord: 'chords',
  ear: 'ear', singing: 'ear',
  improvisation: 'improv',
};

const GRADES = { a: 'A', b: 'B', c: 'C', f: 'F', fail: 'F' };

const OTHER_WORDS = [
  'next', 'previous', 'back', 'home', 'menu', 'open', 'close', 'training', 'triads', 'triad',
  'settings', 'history', 'log', 'grade', 'fingers', 'finger', 'pick', 'metronome', 'start', 'stop',
  'faster', 'slower', 'tempo', 'show', 'hide', 'random', 'walk', 'window', 'fret', 'item', 'number',
  'undo', 'cancel', 'never', 'mind', 'roll', 'key', 'interval', 'position', 'progression', 'first',
  'last', 'sync', 'hundred', 'and', 'notes', 'roles', 'string', 'strings', 'set', 'up', 'down', 'by',
  'video', 'watch', 'tabs', 'tab', 'link', 'lesson', 'play', 'pause', 'resume',
];

/** Words for a restricted-vocabulary recogniser (plus "[unk]" for everything else). */
export const VOCABULARY = [
  WAKE, ...Object.keys(UNITS), ...Object.keys(TEENS), ...Object.keys(TENS),
  ...Object.keys(TOPIC_WORDS), ...Object.keys(GRADES), ...OTHER_WORDS,
];

const isNum = (w) => w in UNITS || w in TEENS || w in TENS || w === 'hundred' || /^\d+$/.test(w);

/** "one forty five" → 145, "one hundred and twenty" → 120, "two twenty" → 220, "ninety" → 90. */
export function parseNumber(words) {
  let total = 0, cur = 0, seen = false, unitOnly = false;
  for (const w of words) {
    if (/^\d+$/.test(w)) { cur += Number(w); seen = true; continue; }
    if (w === 'and') continue;
    if (w === 'hundred') { total += (cur || 1) * 100; cur = 0; unitOnly = false; seen = true; continue; }
    if (w in TENS || w in TEENS) {
      const v = TENS[w] ?? TEENS[w];
      // "one forty" / "two twenty": a lone leading unit means hundreds
      if (unitOnly && total === 0) { cur = cur * 100 + v; } else cur += v;
      unitOnly = false; seen = true; continue;
    }
    if (w in UNITS) {
      // "one oh five" → 105
      if (UNITS[w] === 0 && unitOnly && total === 0) { cur *= 100; unitOnly = false; seen = true; continue; }
      unitOnly = cur === 0 && total === 0;
      cur += UNITS[w]; seen = true; continue;
    }
  }
  return seen ? total + cur : null;
}

function numberAfter(words, i) {
  const run = [];
  for (let j = i; j < words.length && (isNum(words[j]) || (words[j] === 'and' && run.length)); j++) run.push(words[j]);
  return run.length ? parseNumber(run) : null;
}

const firstNumber = (words) => {
  const i = words.findIndex(isNum);
  return i < 0 ? null : numberAfter(words, i);
};

/** Parse the words after the wake word. */
export function parseCommand(text) {
  const words = String(text).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  const has = (...ws) => ws.some((w) => words.includes(w));
  if (!words.length) return null;

  if (has('cancel') || (has('never') && has('mind'))) return { type: 'cancel' };
  if (has('undo')) return { type: 'undo' };
  if (has('sync')) return { type: 'sync' };

  // links on the open item: "video", "video two", "tabs", "link", "lesson"
  if (has('video', 'watch')) return { type: 'link', kind: 'video', n: firstNumber(words) || 1 };
  if (has('lesson')) return { type: 'link', kind: 'lesson', n: firstNumber(words) || 1 };
  if (has('tabs', 'tab', 'link')) return { type: 'link', kind: 'tabs', n: firstNumber(words) || 1 };
  if (has('play', 'resume')) return { type: 'media', action: 'play' };
  if (has('pause')) return { type: 'media', action: 'pause' };

  if (has('log', 'grade')) {
    const i = words.findIndex((w) => w === 'log' || w === 'grade');
    const rest = words.slice(i + 1);
    const g = rest.find((w) => w in GRADES);
    return {
      type: 'log',
      grade: g ? GRADES[g] : null,
      bpm: firstNumber(rest),
      mode: rest.includes('pick') ? 'P' : (rest.includes('fingers') || rest.includes('finger')) ? 'F' : null,
    };
  }
  if (has('fingers', 'finger')) return { type: 'mode', mode: 'F' };
  if (has('pick') && !has('random')) return { type: 'mode', mode: 'P' };

  if (has('metronome')) {
    const n = firstNumber(words);
    if (n) return { type: 'tempo', bpm: n, start: true };
    if (has('stop')) return { type: 'metronome', on: false };
    if (has('start')) return { type: 'metronome', on: true };
    return { type: 'metronome', on: null };
  }
  if (has('tempo')) {
    const n = firstNumber(words);
    return n ? { type: 'tempo', bpm: n } : null;
  }
  if (has('faster', 'slower')) {
    const n = firstNumber(words) || 5;
    return { type: 'tempoStep', delta: has('faster') ? n : -n };
  }
  if (has('start')) return { type: 'metronome', on: true };
  if (has('stop')) return { type: 'metronome', on: false };

  if (has('random') || has('roll')) {
    if (has('key')) return { type: 'roll', what: 'key' };
    if (has('interval')) return { type: 'roll', what: 'interval' };
    if (has('position')) return { type: 'roll', what: 'position' };
    if (has('progression')) return { type: 'roll', what: 'progression' };
    if (has('triad', 'triads')) return { type: 'nav', to: 'triads', random: true };
    if (has('roll') && !has('random')) return { type: 'nav', to: 'roll' };
    return { type: 'random' };
  }

  if (has('window', 'fret')) {
    const n = firstNumber(words);
    if (n != null) return { type: 'window', start: n };
  }
  if (has('walk')) return { type: 'walk' };
  if (has('show')) return { type: 'show', on: true };
  if (has('hide')) return { type: 'show', on: false };
  if (has('notes')) return { type: 'labels', labels: 'notes' };
  if (has('roles')) return { type: 'labels', labels: 'roles' };
  if (has('string', 'strings') && has('set')) {
    const n = firstNumber(words);
    return { type: 'stringSet', top: n };
  }

  if (has('next')) return { type: 'next' };
  if (has('previous')) return { type: 'prev' };
  if (has('first')) return { type: 'index', n: 1 };
  if (has('last')) return { type: 'index', n: -1 };
  if (has('up')) return { type: 'prev' };
  if (has('down')) return { type: 'next' };

  if (has('home')) return { type: 'nav', to: 'home' };
  if (has('menu')) return { type: 'nav', to: 'menu' };
  if (has('back', 'close')) return { type: 'back' };
  if (has('settings')) return { type: 'nav', to: 'settings' };
  if (has('history')) return { type: 'nav', to: 'history' };
  if (has('triads', 'triad')) return { type: 'nav', to: 'triads' };
  const topic = words.find((w) => w in TOPIC_WORDS);
  if (topic) {
    const n = firstNumber(words);
    return { type: 'nav', to: 'topic', topic: TOPIC_WORDS[topic], n };
  }

  if (has('open', 'item', 'number')) {
    const n = firstNumber(words);
    return n != null ? { type: 'index', n } : { type: 'open' };
  }
  const n = firstNumber(words);
  if (n != null && words.every((w) => isNum(w) || w === 'and')) return { type: 'index', n };
  return null;
}
