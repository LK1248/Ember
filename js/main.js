// Ember — shell: router, header, home logo, voice wiring and global commands.

import * as store from './store.js';
import { audioCtx, cue, metronome } from './audio.js';
import { parseCommand } from './commands.js';
import { configureVoice, startVoice, stopVoice, handleText, voiceState } from './voice.js';
import { sync, scheduleSync } from './sync.js';
import { toast, go, esc } from './ui.js';
import { menuView, topicView, itemView, historyView, settingsView, editView } from './views.js';
import { triadsView, rollView } from './triads.js';
import { tunerView } from './tuner.js';

const app = document.getElementById('app');
const view = document.getElementById('view');
const header = document.getElementById('hdr');
const home = document.getElementById('home');
const logo = document.getElementById('logo');

let current = null;   // active view controller
let ignited = false;  // audio + voice started (needs one tap on phones)

// ---- routing --------------------------------------------------------------------

const ROUTES = [
  [/^#?\/?$/, () => null],
  [/^#\/menu$/, () => menuView],
  [/^#\/topic\/([^/]+)(?:\/(\d+))?$/, (m) => [topicView, { id: m[1], n: m[2] && Number(m[2]) }]],
  [/^#\/item\/(.+)$/, (m) => [itemView, { id: decodeURIComponent(m[1]) }]],
  [/^#\/edit\/(.+)$/, (m) => [editView, { id: decodeURIComponent(m[1]) }]],
  [/^#\/new\/(.+)$/, (m) => [editView, { topic: m[1] }]],
  [/^#\/triads(?:\/([^?]+))?(?:\?.*)?$/, (m) => [triadsView, { id: m[1] && decodeURIComponent(m[1]) }]],
  [/^#\/roll(?:\/(\w+))?$/, (m) => [rollView, { what: m[1] }]],
  [/^#\/tuner(?:\/(\w+))?$/, (m) => [tunerView, { mode: m[1] }]],
  [/^#\/history$/, () => historyView],
  [/^#\/settings$/, () => settingsView],
];

function route() {
  current?.cleanup?.();
  current = null;
  view.innerHTML = '';
  const hash = location.hash || '#/';
  let found = null;
  for (const [re, fn] of ROUTES) {
    const m = hash.match(re);
    if (m) { found = fn(m); break; }
  }
  const isHome = !found && /^#?\/?$/.test(hash);
  app.classList.toggle('at-home', isHome);
  if (isHome) return paintHeader();
  if (!found) return go('#/menu');
  const [fn, params] = Array.isArray(found) ? found : [found, {}];
  current = fn(view, params, { restartVoice }) || null;
  paintHeader();
  window.scrollTo(0, 0);
}

function paintHeader() {
  header.querySelector('.title').textContent = current?.title || '';
  header.querySelector('.title').dir = 'auto';
  paintMetroPill();
}

function paintMetroPill() {
  const p = header.querySelector('.mpill');
  p.hidden = !metronome.running;
  p.textContent = `♩ ${metronome.bpm}`;
}

// ---- home logo ----------------------------------------------------------------------

function setLogoState(st) {
  logo.dataset.state = st;
  document.querySelector('.mic').dataset.state = st;
}

logo.addEventListener('click', () => {
  if (!ignited) return ignite();
  go('#/menu');
});

async function ignite() {
  ignited = true;
  audioCtx();
  cue('wake');
  keepAwake();
  if (store.settings().voice) await restartVoice();
  else setLogoState('lit');
}

async function restartVoice() {
  if (!ignited) return;
  if (!store.settings().voice) { await stopVoice(); setLogoState('lit'); return; }
  await startVoice(store.settings().engine);
}

configureVoice({
  onState(st, detail) {
    setLogoState(st);
    if (st === 'error') toast(`Voice off: ${detail}. Tap the ember for the menu.`, 'err', 5000);
    if (st === 'loading') toast('Lighting up… (first time downloads the speech model)', '', 4000);
  },
  onWake() { cue('wake'); setLogoState('awake'); },
  onHearing() { setLogoState('awake'); },
  onCommand: runCommand,
});

// keep the screen on while Ember is open
let wakeLock = null;
async function keepAwake() {
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* not allowed / unsupported */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (ignited && (!wakeLock || wakeLock.released)) keepAwake();
    scheduleSync(500);
  }
});

// ---- commands ----------------------------------------------------------------------

let lastLogId = null;
store.onChange(() => scheduleSync());

function runCommand(text) {
  const cmd = parseCommand(text);
  if (!cmd) { cue('error'); toast(`Didn't catch: “${text}”`, 'err'); return false; }
  const ok = execute(cmd);
  if (ok) { cue(cmd.type === 'log' ? 'logged' : 'ok'); if (cmd.type !== 'log') toast(`› ${text}`, 'heard', 1600); }
  else { cue('error'); toast(`Can't do “${text}” here`, 'err'); }
  return ok;
}

function execute(cmd) {
  // the open view gets first say (next/previous/log/show… mean different things per screen)
  if (cmd.type === 'log') {
    if (!current?.itemId || !current.handle(cmd)) return false;
    lastLogId = store.logEntries(current.itemId)[0]?.id;
    return true;
  }
  if (current?.handle?.(cmd)) return true;

  switch (cmd.type) {
    case 'cancel': return true;
    case 'nav':
      if (cmd.to === 'home') go('#/');
      else if (cmd.to === 'topic') go(`#/topic/${cmd.topic}${cmd.n ? '/' + cmd.n : ''}`);
      else if (cmd.to === 'triads') go(cmd.random ? `#/triads?r=${Date.now()}` : '#/triads');
      else go(`#/${cmd.to}`);
      return true;
    case 'back': history.back(); return true;
    case 'undo': {
      const id = lastLogId || store.logEntries()[0]?.id;
      if (!id) return false;
      store.deleteLog(id);
      lastLogId = null;
      toast('Removed the last log entry', 'ok');
      route();
      return true;
    }
    case 'sync': sync().then((r) => toast(r.ok ? 'Synced' : r.error, r.ok ? 'ok' : 'err')); return true;
    case 'roll': go(`#/roll/${cmd.what}`); return true;
    case 'tunerMode': go(`#/tuner/${cmd.mode}`); return true;
    case 'metronome':
      if (cmd.on === null) metronome.toggle(); else if (cmd.on) metronome.start(); else metronome.stop();
      break;
    case 'tempo':
      metronome.setBpm(cmd.bpm);
      if (cmd.start) metronome.start();
      break;
    case 'tempoStep':
      metronome.setBpm(metronome.bpm + cmd.delta);
      break;
    case 'random':
      go(`#/topic/${store.TOPICS[Math.floor(Math.random() * 4)].id}`);
      return true;
    default:
      return false;
  }
  // metronome commands land here
  current?.refresh?.();
  paintMetroPill();
  return true;
}

// ---- boot ----------------------------------------------------------------------

header.querySelector('.homebtn').onclick = () => go('#/');
header.querySelector('.mic').onclick = () => { if (!ignited) ignite(); else toast(`Voice: ${voiceState()}`); };
header.querySelector('.mpill').onclick = () => { metronome.stop(); paintMetroPill(); current?.refresh?.(); };
window.addEventListener('hashchange', route);
setInterval(paintMetroPill, 1000);
setLogoState('cold');
route();
scheduleSync(1500);

// tapping anywhere first also lights Ember (phones need a gesture for audio)
document.addEventListener('pointerdown', () => { if (!ignited && !app.classList.contains('at-home')) ignite(); }, { once: true });

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

// test hook: window.ember.say("ember log b one forty")
window.ember = { say: handleText, run: runCommand, store, metronome, esc };
