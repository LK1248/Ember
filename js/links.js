// An item's links: sort into videos / lessons / tabs, play YouTube inside Ember, open the rest.

import { esc, el } from './ui.js';

const YT = /(?:youtube\.com|youtu\.be)/i;

export function classify(links = []) {
  const yt = links.filter((l) => YT.test(l.url));
  const lessons = yt.filter((l) => /lesson/i.test(l.label));
  const videos = yt.filter((l) => !/lesson/i.test(l.label));
  const tabs = links.filter((l) => !YT.test(l.url));
  return { video: videos.length ? videos : lessons, lesson: lessons, tabs: tabs.length ? tabs : links };
}

export const isVideo = (url) => YT.test(url);

/** YouTube id + start time from watch / youtu.be / shorts / embed URLs. */
export function youtubeInfo(url) {
  try {
    const u = new URL(url);
    let id = null;
    if (u.hostname.includes('youtu.be')) id = u.pathname.slice(1);
    else if (u.pathname.startsWith('/shorts/') || u.pathname.startsWith('/embed/')) id = u.pathname.split('/')[2];
    else id = u.searchParams.get('v');
    const t = u.searchParams.get('t');
    const start = t ? parseInt(t, 10) || 0 : 0;
    return id ? { id: id.split(/[?&]/)[0], start, vertical: u.pathname.startsWith('/shorts/') } : null;
  } catch {
    return null;
  }
}

/**
 * Open a non-video link. Voice commands have no tap behind them, so a new tab would be
 * blocked; fall back to opening it in place (Back returns to Ember).
 */
export function openExternal(url) {
  const w = window.open(url, '_blank');
  if (w) { try { w.opener = null; } catch { /* cross-origin */ } return; }
  location.assign(url);
}

// ---- in-app video player -----------------------------------------------------------

let player = null;

export const videoOpen = () => !!player;

export function playVideo(link, title) {
  const info = youtubeInfo(link.url);
  if (!info) return openExternal(link.url);
  closeVideo();
  const src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(info.id)}?autoplay=1&playsinline=1&rel=0&enablejsapi=1&start=${info.start}&origin=${encodeURIComponent(location.origin)}`;
  player = el(`<div class="player${info.vertical ? ' vertical' : ''}" role="dialog" aria-label="Video">
    <div class="pbar"><b dir="auto">${esc(title)}</b><small>${esc(link.label)}</small><button class="pclose" aria-label="Close">×</button></div>
    <div class="pframe"><iframe src="${src}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>
    <div class="pctl">
      <button class="btn" data-a="pause">Pause</button><button class="btn" data-a="play">Play</button>
      <a class="btn ghost" href="${esc(link.url)}" target="_blank" rel="noopener">YouTube ↗</a>
    </div>
    <p class="hint">“Ember, pause” · “Ember, play” · “Ember, close”</p>
  </div>`);
  document.body.append(player);
  player.querySelector('.pclose').onclick = closeVideo;
  player.querySelectorAll('[data-a]').forEach((b) => b.onclick = () => videoCommand(b.dataset.a));
}

export function videoCommand(action) {
  const f = player?.querySelector('iframe');
  if (!f) return false;
  const func = action === 'pause' ? 'pauseVideo' : 'playVideo';
  f.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args: [] }), '*');
  return true;
}

export function closeVideo() {
  player?.remove();
  player = null;
}
