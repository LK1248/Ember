// Long-press a tile, then drag it to a new place (also into another section's grid).
// Touch: a quick swipe still scrolls; only a ~0.45 s still press picks the tile up.

const HOLD_MS = 450;
const SLOP = 8; // px of movement allowed during the hold

/**
 * container: element holding one or more `.grid` elements of `.cell` tiles (each with data-id).
 * onDrop(grids): called with [{grid, ids}] for every grid after a move.
 * Returns a dispose() that removes the window listeners.
 */
export function enableReorder(container, onDrop) {
  let press = null;   // {cell, x, y, timer, pointerId}
  let drag = null;    // {cell, ghost, dx, dy, from}
  let scrollRaf = 0, lastY = 0;
  let suppressClick = false;

  container.addEventListener('contextmenu', (e) => { if (e.target.closest('.cell')) e.preventDefault(); });
  container.addEventListener('click', (e) => {
    if (suppressClick) { e.preventDefault(); e.stopPropagation(); suppressClick = false; }
  }, true);

  container.addEventListener('pointerdown', (e) => {
    const cell = e.target.closest('.cell');
    if (!cell || e.button > 0) return;
    press = {
      cell, x: e.clientX, y: e.clientY, pointerId: e.pointerId,
      timer: setTimeout(() => startDrag(e.clientX, e.clientY), HOLD_MS),
    };
  });

  const onMove = (e) => {
    if (drag) return moveDrag(e.clientX, e.clientY);
    if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > SLOP) cancelPress();
  };
  const onUp = () => { if (drag) endDrag(); else cancelPress(); };
  const onTouchMove = (e) => { if (drag) e.preventDefault(); }; // no page scroll under the finger while dragging
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  window.addEventListener('touchmove', onTouchMove, { passive: false });

  function cancelPress() {
    if (press) clearTimeout(press.timer);
    press = null;
  }

  function startDrag(x, y) {
    if (!press) return;
    const cell = press.cell;
    press = null;
    const r = cell.getBoundingClientRect();
    const ghost = cell.cloneNode(true);
    ghost.classList.add('ghost');
    Object.assign(ghost.style, { width: `${r.width}px`, height: `${r.height}px`, left: `${r.left}px`, top: `${r.top}px` });
    document.body.append(ghost);
    cell.classList.add('placeholder');
    drag = { cell, ghost, dx: x - r.left, dy: y - r.top, from: cell.parentElement };
    document.body.classList.add('dragging');
    navigator.vibrate?.(15);
    lastY = y;
    scrollRaf = requestAnimationFrame(autoScroll);
  }

  function moveDrag(x, y) {
    lastY = y;
    drag.ghost.style.left = `${x - drag.dx}px`;
    drag.ghost.style.top = `${y - drag.dy}px`;
    const under = document.elementFromPoint(x, y);
    const target = under?.closest('.cell');
    const grid = under?.closest('.grid');
    if (target && target !== drag.cell && container.contains(target)) {
      const r = target.getBoundingClientRect();
      const after = (y - r.top) / r.height > 0.5 || ((y - r.top) / r.height > 0.2 && (x - r.left) / r.width > 0.5);
      target.parentElement.insertBefore(drag.cell, after ? target.nextSibling : target);
    } else if (grid && container.contains(grid) && grid !== drag.cell.parentElement && !target) {
      grid.append(drag.cell); // empty space in another section
    }
  }

  function autoScroll() {
    if (!drag) return;
    const edge = 90;
    if (lastY < edge) window.scrollBy(0, -Math.ceil((edge - lastY) / 6));
    else if (lastY > innerHeight - edge) window.scrollBy(0, Math.ceil((lastY - innerHeight + edge) / 6));
    scrollRaf = requestAnimationFrame(autoScroll);
  }

  function endDrag() {
    cancelAnimationFrame(scrollRaf);
    const { cell, ghost, from } = drag;
    ghost.remove();
    cell.classList.remove('placeholder');
    document.body.classList.remove('dragging');
    drag = null;
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 400);
    const grids = [...new Set([from, cell.parentElement])].map((grid) => ({
      grid, ids: [...grid.querySelectorAll('.cell')].map((c) => c.dataset.id),
    }));
    onDrop(grids);
  }

  return function dispose() {
    cancelPress();
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    window.removeEventListener('touchmove', onTouchMove);
  };
}
