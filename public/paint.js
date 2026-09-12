// Highlighting a photo with a finger.
//
// A shelf photo usually has ten things on it. Rather than describe which one,
// you darken the picture and wipe the dark away over the thing you mean. The
// result is flattened into the JPEG that gets uploaded, so the highlight is
// part of the photo and needs no extra storage or viewer.
window.NervaPaint = (function () {
  const DIM = 0.62;          // how dark the rest of the photo goes
  const BRUSHES = [0.06, 0.12, 0.22];   // brush width as a fraction of the photo's short side

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

    // The mask is a separate canvas holding the dark layer. Painting erases it.
    const mask = document.createElement('canvas');
    mask.width = W; mask.height = H;
    const mctx = mask.getContext('2d');
    const ctx = canvas.getContext('2d');
    const short = Math.min(W, H);
    let brush = 1, painted = false;
    const undos = [];

    const fillMask = () => { mctx.globalCompositeOperation = 'source-over'; mctx.clearRect(0, 0, W, H); mctx.fillStyle = `rgba(0,0,0,${DIM})`; mctx.fillRect(0, 0, W, H); };
    const draw = () => { ctx.clearRect(0, 0, W, H); ctx.drawImage(bmp, 0, 0); ctx.drawImage(mask, 0, 0); };
    fillMask(); draw();

    const pos = e => {
      const r = canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
    };
    const pushUndo = () => { undos.push(mctx.getImageData(0, 0, W, H)); if (undos.length > 12) undos.shift(); };

    let drawing = false, last = null;
    const stroke = (a, b) => {
      mctx.globalCompositeOperation = 'destination-out';
      mctx.strokeStyle = '#000';
      mctx.lineWidth = short * BRUSHES[brush];
      mctx.lineCap = mctx.lineJoin = 'round';
      mctx.beginPath(); mctx.moveTo(a.x, a.y); mctx.lineTo(b.x, b.y); mctx.stroke();
      draw();
    };
    canvas.addEventListener('pointerdown', e => {
      e.preventDefault();
      try { canvas.setPointerCapture(e.pointerId); } catch {}   // not every pointer can be captured
      pushUndo(); painted = true; drawing = true; last = pos(e); stroke(last, last);
    });
    canvas.addEventListener('pointermove', e => { if (!drawing) return; e.preventDefault(); const p = pos(e); stroke(last, p); last = p; });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) canvas.addEventListener(ev, () => { drawing = false; });

    sizeBtn.onclick = () => { brush = (brush + 1) % BRUSHES.length; sizeBtn.textContent = 'brush ' + ['·', '●', '⬤'][brush]; };
    undoBtn.onclick = () => { const prev = undos.pop(); if (prev) { mctx.putImageData(prev, 0, 0); draw(); painted = undos.length > 0; } };
    resetBtn.onclick = () => { pushUndo(); fillMask(); draw(); painted = false; };

    return new Promise(resolve => {
      const onKey = e => { if (e.key === 'Escape') done(null); };
      const done = out => { document.removeEventListener('keydown', onKey); wrap.remove(); bmp.close?.(); resolve(out); };
      document.addEventListener('keydown', onKey);
      skipBtn.onclick = () => blobOf(bmp, W, H, null).then(done);
      useBtn.onclick = () => blobOf(bmp, W, H, painted ? mask : null).then(done);
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
