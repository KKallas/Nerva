// Highlighting a photo with a finger.
//
// A shelf photo usually has ten things on it. Rather than describe which one,
// you darken the picture and wipe the dark away over the thing you mean. The
// result is flattened into the JPEG that gets uploaded, so the highlight is
// part of the photo and needs no extra storage or viewer.
window.NervaPaint = (function () {
  const DIM = 0.62;          // how dark the rest of the photo goes
  const BRUSHES = [0.06, 0.12, 0.22];   // brush width as a fraction of the photo's short side
  const FEATHER = 0.45;      // blur radius as a fraction of the brush width: a wide, soft edge
  const PASSES = 3;          // blurring alone never fully clears the middle of a stroke;
                             // wiping the blurred shape a few times does, and still fades out

  function el(tag, css, html) {
    const e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (html != null) e.innerHTML = html;
    return e;
  }

  // Returns a JPEG Blob (highlighted or untouched), or null if cancelled.
  async function highlight(blob) {
    const bmp = await createImageBitmap(blob);
    const W = bmp.width, H = bmp.height;

    const wrap = el('div', `position:fixed;inset:0;z-index:9999;background:#000;display:flex;flex-direction:column;
      touch-action:none;-webkit-user-select:none;user-select:none;font:16px/1.3 system-ui,-apple-system,sans-serif;color:#fff`);
    const stage = el('div', 'flex:1;display:flex;align-items:center;justify-content:center;overflow:hidden;padding:8px');
    const canvas = el('canvas', 'max-width:100%;max-height:100%;touch-action:none;border-radius:6px');
    canvas.width = W; canvas.height = H;
    stage.appendChild(canvas);

    const bar = el('div', `display:flex;gap:8px;padding:10px 12px calc(10px + env(safe-area-inset-bottom));
      background:#111;align-items:center;flex-wrap:wrap;justify-content:center`);
    const mk = (label, css) => el('button', `font:inherit;font-size:15px;padding:11px 14px;border-radius:10px;border:1px solid #444;
      background:#1f2937;color:#fff;cursor:pointer;${css || ''}`, label);
    const sizeBtn = mk('brush ●');
    const undoBtn = mk('undo');
    const resetBtn = mk('reset');
    const skipBtn = mk('no highlight');
    const useBtn = mk('use photo', 'background:#2563eb;border-color:#2563eb;font-weight:600');
    const hint = el('div', 'flex-basis:100%;text-align:center;color:#9ca3af;font-size:13px;padding-bottom:2px',
      'Draw over what this photo is about. Everything else stays dark.');
    bar.append(hint, sizeBtn, undoBtn, resetBtn, skipBtn, useBtn);
    wrap.append(stage, bar);
    document.body.appendChild(wrap);

    // Three layers. `reveal` holds what the finger has uncovered, as solid
    // white strokes. `mask` is the dark sheet with `reveal` punched out of it,
    // blurred on the way through so the highlight fades off instead of ending
    // at a hard rim. The visible canvas is the photo with `mask` laid on top.
    const reveal = document.createElement('canvas');
    reveal.width = W; reveal.height = H;
    const rctx = reveal.getContext('2d');
    const mask = document.createElement('canvas');
    mask.width = W; mask.height = H;
    const mctx = mask.getContext('2d');
    const ctx = canvas.getContext('2d');
    const short = Math.min(W, H);
    const softEdges = typeof mctx.filter === 'string';   // canvas filters: everything current
    let brush = 1, painted = false;
    const undos = [];

    const width = () => short * BRUSHES[brush];

    function render() {
      // rebuild the dark sheet, then wipe the revealed shape out of it, blurred
      mctx.filter = 'none';
      mctx.globalCompositeOperation = 'source-over';
      mctx.clearRect(0, 0, W, H);
      mctx.fillStyle = `rgba(0,0,0,${DIM})`;
      mctx.fillRect(0, 0, W, H);
      mctx.globalCompositeOperation = 'destination-out';
      if (softEdges) {
        mctx.filter = `blur(${Math.round(width() * FEATHER)}px)`;
        for (let i = 0; i < PASSES; i++) mctx.drawImage(reveal, 0, 0);
      } else {
        mctx.drawImage(reveal, 0, 0);
      }
      mctx.filter = 'none';
      mctx.globalCompositeOperation = 'source-over';

      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(bmp, 0, 0);
      ctx.drawImage(mask, 0, 0);
    }

    // A moving finger fires far more events than the screen can show. Coalesce
    // them, so the blur is recomputed once a frame rather than once a move.
    let queued = false;
    function scheduleRender() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; render(); });
    }
    render();

    const pos = e => {
      const r = canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
    };
    const pushUndo = () => { undos.push(rctx.getImageData(0, 0, W, H)); if (undos.length > 12) undos.shift(); };

    // A stroke is redrawn as one path from its own starting snapshot, so the
    // overlapping dabs of a slow finger cannot stack up into a hard edge.
    let drawing = false, points = [], atStart = null;
    function paintStroke() {
      rctx.putImageData(atStart, 0, 0);
      rctx.globalCompositeOperation = 'source-over';
      rctx.strokeStyle = '#fff';
      rctx.fillStyle = '#fff';
      rctx.lineWidth = width();
      rctx.lineCap = rctx.lineJoin = 'round';
      if (points.length === 1) {
        rctx.beginPath(); rctx.arc(points[0].x, points[0].y, width() / 2, 0, Math.PI * 2); rctx.fill();
      } else {
        rctx.beginPath();
        rctx.moveTo(points[0].x, points[0].y);
        for (const p of points.slice(1)) rctx.lineTo(p.x, p.y);
        rctx.stroke();
      }
      scheduleRender();
    }
    canvas.addEventListener('pointerdown', e => {
      e.preventDefault();
      try { canvas.setPointerCapture(e.pointerId); } catch {}   // not every pointer can be captured
      pushUndo();
      atStart = rctx.getImageData(0, 0, W, H);
      painted = true; drawing = true; points = [pos(e)];
      paintStroke();
    });
    canvas.addEventListener('pointermove', e => {
      if (!drawing) return;
      e.preventDefault();
      points.push(pos(e));
      paintStroke();
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) canvas.addEventListener(ev, () => { drawing = false; });

    sizeBtn.onclick = () => { brush = (brush + 1) % BRUSHES.length; sizeBtn.textContent = 'brush ' + ['·', '●', '⬤'][brush]; };
    undoBtn.onclick = () => { const prev = undos.pop(); if (prev) { rctx.putImageData(prev, 0, 0); render(); painted = undos.length > 0; } };
    // a new brush size changes the blur, so the picture has to be rebuilt
    sizeBtn.addEventListener('click', render);
    resetBtn.onclick = () => { pushUndo(); rctx.clearRect(0, 0, W, H); render(); painted = false; };

    return new Promise(resolve => {
      const onKey = e => { if (e.key === 'Escape') done(null); };
      const done = out => { document.removeEventListener('keydown', onKey); wrap.remove(); bmp.close?.(); resolve(out); };
      document.addEventListener('keydown', onKey);
      skipBtn.onclick = () => blobOf(bmp, W, H, null).then(done);
      useBtn.onclick = () => { render(); blobOf(bmp, W, H, painted ? mask : null).then(done); };
    });
  }

  // Flatten photo + remaining dark layer into one JPEG.
  function blobOf(bmp, W, H, mask) {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    x.drawImage(bmp, 0, 0);
    if (mask) x.drawImage(mask, 0, 0);
    return new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
  }

  return { highlight };
})();
