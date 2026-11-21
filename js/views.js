// Menu, topic lists, item cards, history, settings, item editor.
// Each view: (root, params) => ({ title, itemId?, handle(cmd) → bool, refresh?(), cleanup?() })

import * as store from './store.js';
import { metronome, cue } from './audio.js';
import { esc, el, toast, go } from './ui.js';
import { sync, syncConfigured } from './sync.js';
import { enableReorder } from './reorder.js';
import { classify, isVideo, playVideo, openExternal, videoOpen, videoCommand, closeVideo } from './links.js';

// ---- menu -------------------------------------------------------------------------

export function menuView(root) {
  const counts = Object.fromEntries(store.TOPICS.map((t) => [t.id, store.allItems().filter((i) => i.topic === t.id).length]));
  root.append(el(`<div class="menu">
    ${store.TOPICS.map((t, i) => `<a class="tile" href="#/topic/${t.id}"><span class="num">${i + 1}</span><b>${esc(t.name)}</b><small>${counts[t.id]} items</small></a>`).join('')}
    <a class="tile hot" href="#/triads"><b>Triad trainer</b><small>4-fret windows · string sets</small></a>
    <a class="tile hot" href="#/tuner"><b>Tuner</b><small>chromatic · standard</small></a>
    <a class="tile" href="#/roll"><b>Roll</b><small>random key · interval · position</small></a>
    <a class="tile" href="#/history"><b>History</b><small>${store.logEntries().length} entries</small></a>
    <a class="tile wide quiet" href="#/settings"><b>Settings</b><small>${syncConfigured() ? 'sync on' : 'sync not set up'} · voice · sounds</small></a>
  </div>`));
  return {
    title: 'Ember',
    handle(cmd) {
      if (cmd.type === 'index' && cmd.n >= 1 && cmd.n <= store.TOPICS.length) { go(`#/topic/${store.TOPICS[cmd.n - 1].id}`); return true; }
      return false;
    },
  };
}

// ---- topic list -------------------------------------------------------------------

export function topicView(root, { id, n }) {
  const topic = store.TOPICS.find((t) => t.id === id);
  if (!topic) return go('#/menu');
  const groups = store.topicItems(id);
  const flat = groups.flatMap((g) => g.items);
  let sel = -1;

  const wrap = el(`<div class="tlist"></div>`);
  const counts = store.recentCounts(30);
  let k = 0;
  for (const g of groups) {
    if (groups.length > 1) wrap.append(el(`<h3 class="sec">${esc(g.section)}</h3>`));
    const grid = el(`<div class="grid" data-section="${esc(g.section)}"></div>`);
    for (const it of g.items) {
      k++;
      const last = store.lastLog(it.id);
      // warmth: times logged in the last 30 days (10+ = full), gently eased
      const heat = Math.pow(Math.min(counts[it.id] || 0, 10) / 10, 0.75).toFixed(2);
      const meta = [
        it.setlist && '<i class="star" title="setlist">★</i>',
        it.bpm && `${it.bpm}`,
        last && `${store.ago(last.date)}${last.grade ? ` <em class="g g${last.grade}">${last.grade}</em>` : ''}`,
      ].filter(Boolean).join(' · ');
      grid.append(el(`<a class="cell" data-id="${esc(it.id)}" style="--heat:${heat}" title="${counts[it.id] || 0}× in the last 30 days" href="#/item/${encodeURIComponent(it.id)}">
        <span class="num">${k}</span>
        <b dir="auto">${esc(it.name)}</b>
        ${meta ? `<small>${meta}</small>` : ''}
      </a>`));
    }
    wrap.append(grid);
  }
  wrap.append(el(`<p class="hint grid-hint">Hold a tile to move it · warmer tiles = practiced more in the last 30 days</p>`));
  wrap.append(el(`<a class="btn ghost add" href="#/new/${id}">+ Add item</a>`));
  root.append(wrap);

  const dispose = enableReorder(wrap, (grids) => {
    store.saveArrangement(id, grids.map(({ grid, ids }) => ({ section: grid.dataset.section, ids })));
    renumber();
  });
  // keep the spoken numbers in step with the new order
  function renumber() {
    rows().forEach((c, i) => (c.querySelector('.num').textContent = i + 1));
    flat.splice(0, flat.length, ...rows().map((c) => store.getItem(c.dataset.id)));
  }

  const rows = () => [...wrap.querySelectorAll('.cell')];
  function select(i) {
    sel = Math.max(0, Math.min(flat.length - 1, i));
    rows().forEach((r, j) => r.classList.toggle('sel', j === sel));
    rows()[sel]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  const open = (i) => flat[i] && go(`#/item/${encodeURIComponent(flat[i].id)}`);
  if (n) setTimeout(() => open(n - 1));

  return {
    title: topic.name,
    cleanup: dispose,
    handle(cmd) {
      switch (cmd.type) {
        case 'next': select(sel + 1); return true;
        case 'prev': select(sel - 1); return true;
        case 'open': if (sel >= 0) open(sel); else select(0); return true;
        case 'index': open(cmd.n < 0 ? flat.length - 1 : cmd.n - 1); return !!flat[cmd.n < 0 ? flat.length - 1 : cmd.n - 1];
        case 'random': open(Math.floor(Math.random() * flat.length)); return true;
      }
      return false;
    },
  };
}

// ---- item card --------------------------------------------------------------------

export function itemView(root, { id }) {
  const item = store.getItem(id);
  if (!item) return go('#/menu');
  const siblings = store.topicItems(item.topic).flatMap((g) => g.items);
  const pos = siblings.findIndex((s) => s.id === id);
  const showMode = item.kind === 'scale' || item.topic === 'technique' || item.topic === 'fretboard';
  const form = { grade: null, mode: showMode ? 'F' : null };
  if (item.bpm && !metronome.running) metronome.setBpm(item.bpm);

  const card = el(`<div class="item">
    <div class="ihead">
      <div class="crumbs"><a href="#/topic/${item.topic}">${esc(store.TOPICS.find((t) => t.id === item.topic)?.name)}</a> · ${esc(item.section)} · ${pos + 1}/${siblings.length}</div>
      <h2 dir="auto">${esc(item.name)}</h2>
      ${item.note ? `<p class="note" dir="auto">${esc(item.note)}</p>` : ''}
      <div class="links">${(item.links || []).map((l, i) => isVideo(l.url)
        ? `<button class="chip vid" data-li="${i}">▶ ${esc(l.label)}</button>`
        : `<a class="chip" target="_blank" rel="noopener" href="${esc(l.url)}">${esc(l.label)} ↗</a>`).join('')}</div>
      ${(item.links || []).length ? `<p class="hint say">Say “Ember, ${[classify(item.links).video.length && 'video', classify(item.links).tabs.some((l) => !isVideo(l.url)) && 'tabs', classify(item.links).lesson.length && 'lesson'].filter(Boolean).join('” · “Ember, ')}”</p>` : ''}
      ${item.kind === 'triad' ? `<a class="btn hot big" href="#/triads/${encodeURIComponent(item.id)}">Open in triad trainer</a>` : ''}
    </div>

    <section class="card metro">
      <div class="mrow">
        <button class="step" data-d="-5">−5</button><button class="step" data-d="-1">−1</button>
        <div class="bpm"><b id="bpm">${metronome.bpm}</b><small>bpm${item.bpm ? ` · target ${item.bpm}` : ''}</small></div>
        <button class="step" data-d="1">+1</button><button class="step" data-d="5">+5</button>
      </div>
      <div class="beats">${Array.from({ length: metronome.beats }, (_, i) => `<i data-b="${i}"></i>`).join('')}</div>
      <button class="btn big" id="mtoggle">${metronome.running ? 'Stop' : 'Start'} metronome</button>
    </section>

    <section class="card log">
      <div class="grades">${['A', 'B', 'C', 'F'].map((g) => `<button class="grade g${g}" data-g="${g}">${g}</button>`).join('')}</div>
      <div class="lrow">
        <label>Tempo <input id="ltempo" type="number" inputmode="numeric" min="20" max="320" placeholder="—"></label>
        ${showMode ? `<div class="seg" id="lmode"><button data-m="F" class="on">Fingers</button><button data-m="P">Pick</button></div>` : ''}
      </div>
      <input id="lnote" type="text" placeholder="Note (optional)" dir="auto">
      <button class="btn hot big" id="logbtn">Log practice</button>
      <ul class="hist" id="hist"></ul>
    </section>

    <div class="foot">
      <a class="btn ghost" href="#/item/${encodeURIComponent(siblings[pos - 1]?.id || '')}" ${pos > 0 ? '' : 'hidden'}>← Prev</a>
      <a class="btn ghost" href="#/edit/${encodeURIComponent(id)}">Edit</a>
      <a class="btn ghost" href="#/item/${encodeURIComponent(siblings[pos + 1]?.id || '')}" ${pos < siblings.length - 1 ? '' : 'hidden'}>Next →</a>
    </div>
  </div>`);
  root.append(card);

  const $ = (s) => card.querySelector(s);
  const tempoIn = $('#ltempo');

  function paintMetro() {
    $('#bpm').textContent = metronome.bpm;
    $('#mtoggle').textContent = `${metronome.running ? 'Stop' : 'Start'} metronome`;
    $('#mtoggle').classList.toggle('on', metronome.running);
    if (metronome.running && !tempoIn.dataset.touched) tempoIn.value = metronome.bpm;
  }
  function paintForm() {
    card.querySelectorAll('.grade').forEach((b) => b.classList.toggle('on', b.dataset.g === form.grade));
    card.querySelectorAll('#lmode button').forEach((b) => b.classList.toggle('on', b.dataset.m === form.mode));
  }
  function paintHist() {
    const entries = store.logEntries(id).slice(0, 12);
    $('#hist').innerHTML = entries.length
      ? entries.map((e) => `<li><span>${new Date(e.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span><b>${esc(store.describeLog(e)) || 'practiced'}</b><button data-del="${e.id}" aria-label="Delete">×</button></li>`).join('')
      : '<li class="empty">Not logged yet</li>';
  }

  card.querySelectorAll('.step').forEach((b) => b.onclick = () => { metronome.setBpm(metronome.bpm + Number(b.dataset.d)); paintMetro(); });
  $('#mtoggle').onclick = () => { metronome.toggle(); paintMetro(); };
  card.querySelectorAll('.grade').forEach((b) => b.onclick = () => { form.grade = form.grade === b.dataset.g ? null : b.dataset.g; paintForm(); });
  card.querySelectorAll('#lmode button').forEach((b) => b.onclick = () => { form.mode = b.dataset.m; paintForm(); });
  tempoIn.oninput = () => (tempoIn.dataset.touched = '1');
  $('#logbtn').onclick = () => doLog({});
  card.querySelectorAll('[data-li]').forEach((b) => b.onclick = () => playVideo(item.links[Number(b.dataset.li)], item.name));

  function openLink(kind, n) {
    const list = classify(item.links)[kind] || [];
    const link = list[Math.min(list.length, Math.max(1, n)) - 1];
    if (!link) return false;
    if (isVideo(link.url)) playVideo(link, item.name);
    else openExternal(link.url);
    return true;
  }
  $('#hist').onclick = (e) => {
    const d = e.target.dataset.del;
    if (d) { store.deleteLog(d); paintHist(); }
  };

  function doLog({ grade, bpm, mode }) {
    const entry = store.addLog({
      itemId: id, item: item.name, topic: item.topic,
      grade: grade || form.grade || undefined,
      bpm: bpm || Number(tempoIn.value) || undefined,
      mode: mode || form.mode || undefined,
      note: $('#lnote').value.trim() || undefined,
    });
    cue('logged');
    toast(`Logged · ${store.describeLog(entry) || 'practiced'}`, 'ok');
    form.grade = null; $('#lnote').value = ''; delete tempoIn.dataset.touched;
    paintForm(); paintHist();
  }

  const prevBeat = metronome.onBeat;
  metronome.onBeat = (b) => {
    card.querySelectorAll('.beats i').forEach((x, i) => x.classList.toggle('on', i === b));
  };

  paintMetro(); paintForm(); paintHist();

  return {
    title: item.name,
    itemId: id,
    refresh: paintMetro,
    cleanup() { metronome.onBeat = prevBeat; closeVideo(); },
    handle(cmd) {
      if (videoOpen()) {
        if (cmd.type === 'media') return videoCommand(cmd.action);
        if (cmd.type === 'back' || cmd.type === 'cancel') { closeVideo(); return true; }
      }
      switch (cmd.type) {
        case 'link': return openLink(cmd.kind, cmd.n);
        case 'log': doLog(cmd); return true;
        case 'mode': form.mode = cmd.mode; paintForm(); return true;
        case 'next': if (siblings[pos + 1]) go(`#/item/${encodeURIComponent(siblings[pos + 1].id)}`); return !!siblings[pos + 1];
        case 'prev': if (siblings[pos - 1]) go(`#/item/${encodeURIComponent(siblings[pos - 1].id)}`); return !!siblings[pos - 1];
        case 'open': if (item.kind === 'triad') go(`#/triads/${encodeURIComponent(id)}`); return item.kind === 'triad';
        case 'random': go(`#/item/${encodeURIComponent(siblings[Math.floor(Math.random() * siblings.length)].id)}`); return true;
      }
      return false;
    },
  };
}

// ---- history ------------------------------------------------------------------------

export function historyView(root) {
  const entries = store.logEntries();
  const byDay = new Map();
  for (const e of entries) {
    const d = new Date(e.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(e);
  }
  root.append(el(`<div class="list">${entries.length ? '' : '<p class="empty">Nothing logged yet. Open an item and log a practice — or say “Ember, log B”.</p>'}
    ${[...byDay].map(([d, es]) => `<h3 class="sec">${esc(d)}</h3>${es.map((e) => `<a class="row" href="#/item/${encodeURIComponent(e.itemId)}"><span class="main"><b dir="auto">${esc(e.item || e.itemId)}</b></span><span class="meta">${esc(store.describeLog(e))}</span></a>`).join('')}`).join('')}
  </div>`));
  return { title: 'History', handle: () => false };
}

// ---- settings -----------------------------------------------------------------------

export function settingsView(root, _p, { restartVoice }) {
  const s = store.settings();
  const v = el(`<div class="settings">
    <section class="card">
      <h3>Google Sheet sync</h3>
      <p class="hint">Follow SETUP.md once: create the sheet, paste the script, deploy, then paste the two values here.</p>
      <label>Web app URL<input id="surl" type="url" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(s.syncUrl)}"></label>
      <label>Sync key<input id="skey" type="password" autocomplete="off" value="${esc(s.syncKey)}"></label>
      <div class="lrow"><button class="btn hot" id="ssave">Save &amp; sync now</button><span class="hint" id="sstat">${s.syncKey && store.raw().lastSync ? `Last sync ${new Date(store.raw().lastSync).toLocaleString()}` : ''}</span></div>
    </section>
    <section class="card">
      <h3>Voice</h3>
      <label class="check"><input type="checkbox" id="von" ${s.voice ? 'checked' : ''}> Listen for “Ember”</label>
      <div class="seg" id="veng"><button data-e="vosk">Offline (recommended)</button><button data-e="web">Chrome online</button></div>
      <p class="hint">Offline downloads a ~40 MB speech model once, then works without internet and only knows Ember's commands. Say “Ember” and a command, e.g. “Ember, next” or “Ember, log B one forty”.</p>
    </section>
    <section class="card">
      <h3>Sounds</h3>
      <label>Cue volume<input type="range" id="cvol" min="0" max="1" step="0.05" value="${s.cueVolume}"></label>
      <label>Metronome volume<input type="range" id="kvol" min="0" max="1" step="0.05" value="${s.clickVolume}"></label>
      <button class="btn ghost" id="ctest">Play cues</button>
    </section>
    <section class="card">
      <h3>Backup</h3>
      <div class="lrow"><button class="btn ghost" id="bexp">Export JSON</button><label class="btn ghost">Import JSON<input type="file" id="bimp" accept="application/json" hidden></label></div>
    </section>
    <section class="card cmds">
      <h3>Voice commands</h3>
      <ul>
        <li><b>Ember</b> … then within a few seconds a command (or say both together)</li>
        <li><b>songs · technique · fretboard · chords · ear · improvisation</b> — open a topic (“songs three” opens item 3)</li>
        <li><b>next · previous · open · number 5 · first · last · random</b></li>
        <li><b>log B · log A one forty · log fail · log B pick</b> — log the open item</li>
        <li><b>video · video two · lesson · tabs (or link)</b> — videos play inside Ember; then <b>pause · play · close</b></li>
        <li><b>metronome · metronome ninety · start · stop · faster · slower · faster ten · tempo 120</b></li>
        <li><b>triads · random triads · walk · window seven · show · hide · notes · roles · string set two</b></li>
        <li><b>tuner · chromatic · standard</b> — in standard mode “string six” … “string one” locks a string</li>
        <li><b>random key · random interval · random position · random progression</b></li>
        <li><b>undo · back · home · menu · history · settings · sync · cancel</b></li>
      </ul>
    </section>
  </div>`);
  root.append(v);
  const $ = (q) => v.querySelector(q);
  const paintEng = () => v.querySelectorAll('#veng button').forEach((b) => b.classList.toggle('on', b.dataset.e === store.settings().engine));
  paintEng();

  $('#ssave').onclick = async () => {
    store.setSettings({ syncUrl: $('#surl').value.trim(), syncKey: $('#skey').value.trim() });
    $('#sstat').textContent = 'Syncing…';
    const r = await sync();
    $('#sstat').textContent = r.ok ? `Synced (${r.sent} sent)` : r.error;
  };
  $('#von').onchange = () => { store.setSettings({ voice: $('#von').checked }); restartVoice(); };
  v.querySelectorAll('#veng button').forEach((b) => b.onclick = () => { store.setSettings({ engine: b.dataset.e }); paintEng(); restartVoice(); });
  $('#cvol').oninput = () => store.setSettings({ cueVolume: Number($('#cvol').value) });
  $('#kvol').oninput = () => store.setSettings({ clickVolume: Number($('#kvol').value) });
  $('#ctest').onclick = () => ['wake', 'ok', 'logged', 'error'].forEach((c, i) => setTimeout(() => cue(c), i * 700));
  $('#bexp').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([store.exportJSON()], { type: 'application/json' }));
    a.download = `ember-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };
  $('#bimp').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try { store.importJSON(await f.text()); toast('Imported', 'ok'); } catch { toast('That file is not an Ember backup', 'err'); }
  };
  return { title: 'Settings', handle: () => false };
}

// ---- item editor -----------------------------------------------------------------------

export function editView(root, { id, topic }) {
  const it = id ? store.getItem(id) : { topic, section: store.topicItems(topic)[0]?.section || 'General', name: '', links: [] };
  if (!it) return go('#/menu');
  const sections = [...new Set(store.allItems().filter((x) => x.topic === it.topic).map((x) => x.section))];
  const v = el(`<form class="settings">
    <section class="card">
      <label>Name<input name="name" required dir="auto" value="${esc(it.name)}"></label>
      <label>Section<input name="section" list="secs" value="${esc(it.section)}"><datalist id="secs">${sections.map((s) => `<option value="${esc(s)}">`).join('')}</datalist></label>
      <label>Target tempo<input name="bpm" type="number" inputmode="numeric" value="${esc(it.bpm || '')}"></label>
      <label>Note<input name="note" dir="auto" value="${esc(it.note || '')}"></label>
      ${it.topic === 'fretboard' ? `<label>Triad chords (e.g. Am / C / F / G)<input name="chords" value="${esc(it.chords || '')}"></label>` : ''}
      <label>Links — one per line: label | url<textarea name="links" rows="4">${esc((it.links || []).map((l) => `${l.label} | ${l.url}`).join('\n'))}</textarea></label>
      ${it.topic === 'songs' ? `<label class="check"><input type="checkbox" name="active" ${it.active ? 'checked' : ''}> Active</label><label class="check"><input type="checkbox" name="setlist" ${it.setlist ? 'checked' : ''}> Setlist</label>` : ''}
      <div class="lrow"><button class="btn hot" type="submit">Save</button>${id ? '<button class="btn ghost danger" type="button" id="del">Delete item</button>' : ''}</div>
    </section>
  </form>`);
  root.append(v);
  v.onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(v);
    const name = f.get('name').trim();
    const links = String(f.get('links') || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
      const [a, b] = l.includes('|') ? l.split('|').map((x) => x.trim()) : ['Link', l];
      return { label: a || 'Link', url: b };
    });
    const rec = {
      ...it, id: id || store.newItemId(it.topic, name), name, section: f.get('section').trim() || 'General',
      bpm: Number(f.get('bpm')) || undefined, note: f.get('note').trim() || undefined, links,
      active: f.get('active') ? true : it.topic === 'songs' ? false : it.active,
      setlist: f.get('setlist') ? true : it.topic === 'songs' ? false : it.setlist,
    };
    if (f.has('chords')) { rec.chords = f.get('chords').trim() || undefined; if (rec.chords) rec.kind = 'triad'; }
    store.saveItem(rec);
    go(`#/item/${encodeURIComponent(rec.id)}`);
  };
  v.querySelector('#del')?.addEventListener('click', () => {
    if (!confirm(`Delete “${it.name}”? Its log entries stay in History.`)) return;
    store.saveItem({ ...it, deleted: true });
    go(`#/topic/${it.topic}`);
  });
  return { title: id ? 'Edit item' : 'New item', handle: () => false };
}
