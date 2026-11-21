// Always-on wake-word listening.
//  - 'vosk': offline recogniser in the page (vosk-browser), restricted to Ember's vocabulary.
//  - 'web':  Chrome's speech recognition (online; beeps/restarts on Android) as a fallback.
// Both deliver plain text utterances to handleText(), which finds the wake word.

import { WAKE, VOCABULARY } from './commands.js';
import { audioCtx } from './audio.js';

const VOSK_JS = 'https://cdn.jsdelivr.net/npm/vosk-browser@0.0.8/dist/vosk.js';
const MODEL_URL = 'https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-en-us-0.15.tar.gz';
const AWAKE_MS = 6000; // after a bare "ember", the next utterance within this time is a command

let handlers = {};
let state = 'off'; // off | loading | listening | awake | error
let awakeTimer = null;
let stopFn = null;

export const voiceState = () => state;

function setState(s, detail) {
  state = s;
  handlers.onState?.(s, detail);
}

/** Callbacks: onState(state, detail), onWake(), onHearing(partial), onCommand(text). */
export function configureVoice(h) {
  handlers = h;
}

export async function startVoice(engine) {
  await stopVoice();
  try {
    if (engine === 'web') await startWeb();
    else await startVosk();
  } catch (err) {
    console.error('voice', err);
    setState('error', String(err?.message || err));
  }
}

export async function stopVoice() {
  clearTimeout(awakeTimer);
  if (stopFn) { try { await stopFn(); } catch { /* ignore */ } }
  stopFn = null;
  setState('off');
}

/** Feed recognised text (also used by tests: window.ember.say("ember next")). */
export function handleText(text) {
  const t = String(text || '').toLowerCase().replace(/\[unk\]/g, ' ')
    .replace(/\b(amber|embers|hey ember)\b/g, WAKE) // common mishearings in the online engine
    .replace(/\s+/g, ' ').trim();
  if (!t) return;
  const words = t.split(' ');
  const w = words.lastIndexOf(WAKE);
  if (w >= 0) {
    const rest = words.slice(w + 1).join(' ');
    handlers.onWake?.();
    if (rest) return command(rest);
    setState('awake');
    clearTimeout(awakeTimer);
    awakeTimer = setTimeout(() => state === 'awake' && setState('listening'), AWAKE_MS);
    return;
  }
  if (state === 'awake') command(t);
}

function command(text) {
  clearTimeout(awakeTimer);
  setState('listening');
  handlers.onCommand?.(text);
}

// ---- vosk (offline) ------------------------------------------------------------

let modelPromise = null;

function loadScript(src) {
  return new Promise((res, rej) => {
    if (window.Vosk) return res();
    const s = document.createElement('script');
    s.src = src;
    s.onload = res;
    s.onerror = () => rej(new Error('Could not load the speech engine'));
    document.head.appendChild(s);
  });
}

async function startVosk() {
  setState('loading');
  await loadScript(VOSK_JS);
  modelPromise ||= window.Vosk.createModel(MODEL_URL);
  const model = await modelPromise;

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
  });
  const ctx = audioCtx();
  const grammar = JSON.stringify([...new Set(VOCABULARY)].concat('[unk]'));
  const rec = new model.KaldiRecognizer(ctx.sampleRate, grammar);
  rec.on('result', (m) => handleText(m.result?.text));
  rec.on('partialresult', (m) => {
    const p = m.result?.partial || '';
    if (p.split(' ').includes(WAKE) && state === 'listening') handlers.onHearing?.(p);
  });

  const src = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  proc.onaudioprocess = (e) => { try { rec.acceptWaveform(e.inputBuffer); } catch { /* ignore */ } };
  const mute = ctx.createGain();
  mute.gain.value = 0;
  src.connect(proc).connect(mute).connect(ctx.destination);

  stopFn = async () => {
    proc.disconnect(); src.disconnect();
    stream.getTracks().forEach((t) => t.stop());
    try { rec.remove(); } catch { /* ignore */ }
  };
  setState('listening');
}

// ---- Chrome speech (fallback) ----------------------------------------------------

async function startWeb() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) throw new Error('Speech recognition is not available in this browser');
  let alive = true;
  const r = new SR();
  r.lang = 'en-US';
  r.continuous = true;
  r.interimResults = false;
  r.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) handleText(e.results[i][0].transcript);
  };
  r.onend = () => { if (alive) setTimeout(() => { try { r.start(); } catch { /* already started */ } }, 250); };
  r.onerror = (e) => { if (e.error === 'not-allowed') { alive = false; setState('error', 'Microphone blocked'); } };
  r.start();
  stopFn = async () => { alive = false; r.abort(); };
  setState('listening');
}
