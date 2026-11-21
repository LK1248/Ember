// Local state (localStorage) — items, practice log and settings.
// Every synced record has {id, updatedAt, deleted?}; the newest updatedAt wins on merge.

import { SEED_ITEMS } from './items.js';

const KEY = 'ember.v1';

export const TOPICS = [
  { id: 'songs', name: 'Songs', sections: ['Active', 'Repertoire'] },
  { id: 'technique', name: 'Technique' },
  { id: 'fretboard', name: 'Fretboard' },
  { id: 'chords', name: 'Chords' },
  { id: 'ear', name: 'Ear & singing' },
  { id: 'improv', name: 'Improvisation' },
];

const DEFAULT_SETTINGS = {
  syncUrl: '',
  syncKey: '',
  cueVolume: 0.5,
  clickVolume: 0.7,
  voice: true,
  engine: 'vosk', // 'vosk' (offline) | 'web' (Chrome speech)
  labels: 'roles',
};

let state = load();
const listeners = new Set();

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}');
    return {
      items: s.items || {},   // user edits/additions, keyed by id
      log: s.log || {},       // log entries keyed by id
      settings: { ...DEFAULT_SETTINGS, ...(s.settings || {}) },
      lastPush: s.lastPush || 0,
      lastSync: s.lastSync || 0,
    };
  } catch {
    return { items: {}, log: {}, settings: { ...DEFAULT_SETTINGS }, lastPush: 0, lastSync: 0 };
  }
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage full/blocked */ }
  listeners.forEach((fn) => fn());
}

export const onChange = (fn) => (listeners.add(fn), () => listeners.delete(fn));
export const raw = () => state;

// ---- settings ----------------------------------------------------------------
export const settings = () => state.settings;
export function setSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  save();
}

// ---- items -------------------------------------------------------------------
export function allItems() {
  const map = new Map(SEED_ITEMS.map((it) => [it.id, it]));
  for (const it of Object.values(state.items)) map.set(it.id, { ...(map.get(it.id) || {}), ...it });
  return [...map.values()].filter((it) => !it.deleted);
}

export const getItem = (id) => allItems().find((it) => it.id === id);

export function topicItems(topicId) {
  const t = TOPICS.find((x) => x.id === topicId);
  // active songs are listed under "Active" whatever section they came from
  const items = allItems().filter((it) => it.topic === topicId)
    .map((it, i) => ({ ...it, section: topicId === 'songs' && it.active ? 'Active' : it.section, _i: i }));
  const order = [];
  for (const it of items) if (!order.includes(it.section)) order.push(it.section);
  if (t?.sections) order.sort((a, b) => idx(t.sections, a) - idx(t.sections, b));
  // a saved manual order (long-press drag) wins; otherwise the sheet's order
  const rank = (it) => (it.order ?? it._i * 10);
  return order.map((section) => ({
    section,
    items: items.filter((it) => it.section === section).sort((a, b) => rank(a) - rank(b)),
  }));
}

/** Save a dragged arrangement: [{section, ids:[...]}] for the grids that changed. */
export function saveArrangement(topicId, groups) {
  const now = Date.now();
  for (const { section, ids } of groups) {
    ids.forEach((id, i) => {
      const base = SEED_ITEMS.find((s) => s.id === id) || {};
      const cur = { ...base, ...state.items[id] };
      const patch = { order: i * 10, section };
      if (topicId === 'songs') {
        patch.active = section === 'Active';
        if (section !== 'Active' && cur.section === 'Active') patch.section = 'Repertoire';
      }
      state.items[id] = { ...cur, ...patch, updatedAt: now };
    });
  }
  save();
}

/** How many times each item was logged in the last `days` days. */
export function recentCounts(days = 30) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const counts = {};
  for (const e of Object.values(state.log)) {
    if (!e.deleted && e.date >= since) counts[e.itemId] = (counts[e.itemId] || 0) + 1;
  }
  return counts;
}
const idx = (arr, v) => (arr.indexOf(v) < 0 ? 99 : arr.indexOf(v));

export function saveItem(item) {
  const base = SEED_ITEMS.find((s) => s.id === item.id) || {};
  state.items[item.id] = { ...base, ...state.items[item.id], ...item, updatedAt: Date.now() };
  save();
}

export function newItemId(topic, name) {
  const slug = name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 30) || 'item';
  return `${topic}-${slug}-${Date.now().toString(36)}`;
}

// ---- log ---------------------------------------------------------------------
export function addLog(entry) {
  const id = 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const e = { id, date: new Date().toISOString(), ...entry, updatedAt: Date.now() };
  state.log[id] = e;
  save();
  return e;
}

export function deleteLog(id) {
  if (!state.log[id]) return;
  state.log[id] = { ...state.log[id], deleted: true, updatedAt: Date.now() };
  save();
}

export function logEntries(itemId) {
  return Object.values(state.log)
    .filter((e) => !e.deleted && (!itemId || e.itemId === itemId))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function lastLog(itemId) {
  return logEntries(itemId)[0];
}

// ---- sync helpers ------------------------------------------------------------
export function pendingChanges() {
  const since = state.lastPush;
  return {
    items: Object.values(state.items).filter((it) => (it.updatedAt || 0) > since),
    log: Object.values(state.log).filter((e) => (e.updatedAt || 0) > since),
  };
}

export function mergeRemote({ items = [], log = [] }, pushedAt) {
  for (const it of items) {
    const cur = state.items[it.id];
    if (!cur || (it.updatedAt || 0) > (cur.updatedAt || 0)) state.items[it.id] = it;
  }
  for (const e of log) {
    const cur = state.log[e.id];
    if (!cur || (e.updatedAt || 0) > (cur.updatedAt || 0)) state.log[e.id] = e;
  }
  if (pushedAt) state.lastPush = pushedAt;
  state.lastSync = Date.now();
  save();
}

// ---- backup ------------------------------------------------------------------
export const exportJSON = () => JSON.stringify({ app: 'Ember', items: state.items, log: state.log }, null, 1);
export function importJSON(text) {
  const d = JSON.parse(text);
  mergeRemote({ items: Object.values(d.items || {}), log: Object.values(d.log || {}) });
}

// ---- formatting --------------------------------------------------------------
export function ago(iso) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 60) return `${Math.round(days / 7)}w ago`;
  return `${Math.round(days / 30)}mo ago`;
}

export function describeLog(e) {
  return [e.grade, e.bpm && `${e.bpm} bpm`, e.mode === 'P' ? 'pick' : e.mode === 'F' ? 'fingers' : null, e.note]
    .filter(Boolean).join(' · ');
}
