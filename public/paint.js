// Highlighting a photo with a finger.
//
// A shelf photo usually has ten things on it. Rather than describe which one,
// you darken the picture and wipe the dark away over the thing you mean. The
// result is flattened into the JPEG that gets uploaded, so the highlight is
// part of the photo and needs no extra storage or viewer.
//
// How the soft edge is made, and why it is made this way:
//
// The obvious approach, blurring an erased shape with ctx.filter, is not
// reliable on phones: Safari ignores canvas filters in some compositing modes,
// so the edge silently came out hard. Instead there is a `shade` layer, an
// opaque grey picture of how bright each part of the photo should end up.
// Round soft-edged brush marks are stamped onto it with the `lighten` blend,
// which keeps the brightest of what is already there and the new mark. Because
// that is a maximum rather than a sum, overlapping marks along one stroke
// cannot stack up into a hard rim, which is exactly what a blur was for.
// The photo is then multiplied by the shade. Both blends are old and everywhere.
window.NervaPaint = (function () {
  const DIM = 0.62;                     // how dark the rest of the photo goes
  const BRUSHES = [0.16, 0.30, 0.48];   // brush diameter as a fraction of the short side
  const CORE = 0.42;                    // solid middle of a brush mark; the rest fades out,
                                        // and that wide fade is what reads as a soft edge
  const SMOOTH = 16;                     // shrink the shade by this much and stretch it back,
                                        // which rounds off where brush marks meet
  const SPACING = 0.12;                 // how far the brush moves between marks, in radii
  const GREY = Math.round((1 - DIM) * 255);

  function el(tag, css, html) {
    const e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (html != null) e.innerHTML = html;
    return e;
  }

  async function bitmap(blob) {
    try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); }
    catch { return await createImageBitmap(blob); }      // older phones lack the options
  }

  // A round mark: white in the middle, fading to black, fully opaque so that
  // `lighten` takes the brighter of it and the shade and leaves the rest alone.
  function makeBrush(radius) {
    const size = Math.max(2, Math.ceil(radius * 2));
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, '#fff');
    g.addColorStop(CORE, '#fff');
    // a smooth shoulder rather than a straight ramp, so nothing reads as an edge
    for (let i = 1; i <= 8; i++) {
      const t = i / 8;
      const v = Math.round(255 * (1 - t * t * (3 - 2 * t)));
      g.addColorStop(CORE + (1 - CORE) * t, `rgb(${v},${v},${v})`);
    }
    x.fillStyle = '#000';
    x.fillRect(0, 0, size, size);
    x.globalCompositeOperation = 'lighten';
    x.fillStyle = g;
    x.fillRect(0, 0, size, size);
    return c;
  }

  // Returns a JPEG Blob (highlighted or untouched), or null if cancelled.
  async function highlight(blob) {
    const bmp = await bitmap(blob);
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

    const shade = document.createElement('canvas');
    shade.width = W; shade.height = H;
    const sctx = shade.getContext('2d');

    // Shrinking the shade and stretching it back is a blur the browser does in
    // hardware, and unlike ctx.filter it behaves the same on every phone.
    const small = document.createElement('canvas');
    small.width = Math.max(1, Math.round(W / SMOOTH));
    small.height = Math.max(1, Math.round(H / SMOOTH));
    const smctx = small.getContext('2d');
    const soft = document.createElement('canvas');
    soft.width = W; soft.height = H;
    const soctx = soft.getContext('2d');
    function smoothed() {
      smctx.imageSmoothingEnabled = true; smctx.imageSmoothingQuality = 'high';
      smctx.drawImage(shade, 0, 0, small.width, small.height);
      soctx.imageSmoothingEnabled = true; soctx.imageSmoothingQuality = 'high';
      soctx.drawImage(small, 0, 0, W, H);
      return soft;
    }
    const ctx = canvas.getContext('2d');
    const short = Math.min(W, H);
    let brush = 1, painted = false;
    const undos = [];
    const brushes = BRUSHES.map(f => makeBrush(short * f / 2));

    const clearShade = () => { sctx.globalCompositeOperation = 'source-over'; sctx.fillStyle = `rgb(${GREY},${GREY},${GREY})`; sctx.fillRect(0, 0, W, H); };
    function render() {
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(bmp, 0, 0);
      ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(smoothed(), 0, 0);
      ctx.globalCompositeOperation = 'source-over';
    }
    clearShade(); render();

    // A moving finger fires more events than the screen can show; marks are
    // stamped as they arrive, but the picture is rebuilt once a frame.
    let queued = false;
    const scheduleRender = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; render(); });
    };

    const pos = e => {
      const r = canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
    };
    const pushUndo = () => { undos.push(sctx.getImageData(0, 0, W, H)); if (undos.length > 8) undos.shift(); };

    function stamp(p) {
      const b = brushes[brush];
      sctx.globalCompositeOperation = 'lighten';
      sctx.drawImage(b, p.x - b.width / 2, p.y - b.height / 2);
      sctx.globalCompositeOperation = 'source-over';
    }
    // Marks along the way, so a fast swipe leaves a line and not a dotted trail.
    function stampTo(a, b) {
      const r = brushes[brush].width / 2;
      const dx = b.x - a.x, dy = b.y - a.y;
      const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / (r * SPACING)));
      for (let i = 1; i <= steps; i++) stamp({ x: a.x + dx * i / steps, y: a.y + dy * i / steps });
    }

    let drawing = false, last = null;
    canvas.addEventListener('pointerdown', e => {
      e.preventDefault();
      try { canvas.setPointerCapture(e.pointerId); } catch {}   // not every pointer can be captured
      pushUndo();
      painted = true; drawing = true;
      last = pos(e);
      stamp(last);
      scheduleRender();
    });
    canvas.addEventListener('pointermove', e => {
      if (!drawing) return;
      e.preventDefault();
      const p = pos(e);
      stampTo(last, p);
      last = p;
      scheduleRender();
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) canvas.addEventListener(ev, () => { drawing = false; });

    sizeBtn.onclick = () => { brush = (brush + 1) % BRUSHES.length; sizeBtn.textContent = 'brush ' + ['·', '●', '⬤'][brush]; };
    undoBtn.onclick = () => { const prev = undos.pop(); if (prev) { sctx.putImageData(prev, 0, 0); render(); painted = undos.length > 0; } };
    resetBtn.onclick = () => { pushUndo(); clearShade(); render(); painted = false; };

    return new Promise(resolve => {
      const onKey = e => { if (e.key === 'Escape') done(null); };
      const done = out => { document.removeEventListener('keydown', onKey); wrap.remove(); bmp.close?.(); resolve(out); };
      document.addEventListener('keydown', onKey);
      skipBtn.onclick = () => flatten(bmp, W, H, null).then(done);
      useBtn.onclick = () => flatten(bmp, W, H, painted ? smoothed() : null).then(done);
    });
  }

  // Photo times shade, as one JPEG.
  function flatten(bmp, W, H, shade) {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    x.drawImage(bmp, 0, 0);
    if (shade) {
      x.globalCompositeOperation = 'multiply';
      x.drawImage(shade, 0, 0);
      x.globalCompositeOperation = 'source-over';
    }
    return new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
  }

  return { highlight };
})();
