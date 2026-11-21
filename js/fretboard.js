// SVG fretboard segment (horizontal, high e on top — like tab).

import { noteName } from './theory.js';

const INLAYS = new Set([3, 5, 7, 9, 15, 17, 19, 21]);
const ROLE_CLASS = { R: 'r', 3: 't', 5: 'f' };
const SHAPE_CLASS = { root: 's0', '1st inv': 's1', '2nd inv': 's2' };

/**
 * frets: consecutive fret numbers to show, e.g. [0,1,2,3] or [7,8,9,10]
 * dots:  [{string, fret, role, pc, faint?}]
 * shapes: [{strings:[a,b,c], frets:[x,y,z], inversion}]
 * labels: 'roles' | 'notes'
 */
export function fretboardSVG({ frets, dots = [], shapes = [], labels = 'roles' }) {
  const colW = 62, rowH = 24, left = 26, top = 16;
  const W = left + colW * frets.length + 10;
  const H = top + rowH * 5 + 34;
  const hasOpen = frets[0] === 0;
  const xOf = (f) => left + (frets.indexOf(f) + 0.5) * colW;
  const yOf = (s) => top + (s - 1) * rowH;

  let svg = `<svg class="fb" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img">`;
  // fret wires (right edge of each column) and nut
  frets.forEach((f, i) => {
    const x = left + (i + 1) * colW;
    if (!(hasOpen && i === 0)) svg += `<line class="fw" x1="${x}" y1="${top}" x2="${x}" y2="${top + rowH * 5}"/>`;
    else svg += `<line class="nut" x1="${x}" y1="${top - 2}" x2="${x}" y2="${top + rowH * 5 + 2}"/>`;
  });
  if (!hasOpen) svg += `<line class="fw" x1="${left}" y1="${top}" x2="${left}" y2="${top + rowH * 5}"/>`;
  // strings (thicker for low strings)
  for (let s = 1; s <= 6; s++) {
    svg += `<line class="str" stroke-width="${0.8 + (s - 1) * 0.35}" x1="${left - 6}" y1="${yOf(s)}" x2="${W - 6}" y2="${yOf(s)}"/>`;
    svg += `<text class="sn" x="${left - 14}" y="${yOf(s) + 4}">${['e', 'B', 'G', 'D', 'A', 'E'][s - 1]}</text>`;
  }
  // fret numbers + inlays
  frets.forEach((f) => {
    const x = xOf(f);
    svg += `<text class="fn${f === 12 ? ' oct' : ''}" x="${x}" y="${top + rowH * 5 + 26}">${f}</text>`;
    if (INLAYS.has(f)) svg += `<circle class="inlay" cx="${x}" cy="${top + rowH * 5 + 12}" r="3"/>`;
    if (f === 12) svg += `<circle class="inlay" cx="${x - 7}" cy="${top + rowH * 5 + 12}" r="3"/><circle class="inlay" cx="${x + 7}" cy="${top + rowH * 5 + 12}" r="3"/>`;
  });
  // shapes: soft bands joining the three notes
  for (const sh of shapes) {
    const pts = sh.strings.map((s, i) => `${xOf(sh.frets[i])},${yOf(s)}`).join(' ');
    svg += `<polyline class="shape ${SHAPE_CLASS[sh.inversion] || ''}" points="${pts}"/>`;
  }
  // dots
  for (const d of dots) {
    const x = xOf(d.fret), y = yOf(d.string);
    const label = labels === 'notes' ? noteName(d.pc) : d.role;
    svg += `<g class="dot ${ROLE_CLASS[d.role] || ''}${d.faint ? ' faint' : ''}"><circle cx="${x}" cy="${y}" r="10.5"/><text x="${x}" y="${y + 4}">${label}</text></g>`;
  }
  return svg + '</svg>';
}
