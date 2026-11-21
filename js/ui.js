// Small DOM helpers shared by the views.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

let toastTimer = null;
/** Screen-only feedback. kind: '' | 'heard' | 'ok' | 'err' */
export function toast(text, kind = '', ms = 2600) {
  const t = document.getElementById('toast');
  t.textContent = text;
  t.className = `show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = ''), ms);
}

export const go = (hash) => { location.hash = hash; };
