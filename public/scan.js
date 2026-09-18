// Camera scanning. Nerva.scan(onCode) opens a full-screen viewfinder and
// calls onCode(id) for every item label it reads, until the person taps done. The
// browser's BarcodeDetector where it exists, jsQR otherwise (loaded only then).
(function () {
  // What a label says: { id, place } from ".../i/<id>" or ".../l/<id>", an item
  // for a bare id typed into some other QR, or null for anything not ours.
  function idFrom(text) {
    const m = /\/(i|l)\/([a-z0-9]{4,8}(?:-\d{1,4})?)(?:[?#]|$)/i.exec(text);
    if (m) return { id: m[2].toLowerCase(), place: m[1].toLowerCase() === 'l' };
    const bare = /^([a-z0-9]{4,8}(?:-\d{1,4})?)$/i.exec(text.trim());
    return bare ? { id: bare[1].toLowerCase(), place: false } : null;
  }

  function loadJsQR() {
    if (window.jsQR) return Promise.resolve();
    return new Promise((ok, no) => {
      const s = document.createElement('script');
      s.src = '/jsqr.js'; s.onload = ok; s.onerror = () => no(new Error('the QR reader did not load'));
      document.head.appendChild(s);
    });
  }

  async function makeDetector(video) {
    if ('BarcodeDetector' in window) {
      try {
        if ((await BarcodeDetector.getSupportedFormats()).includes('qr_code')) {
          const d = new BarcodeDetector({ formats: ['qr_code'] });
          return async () => (await d.detect(video)).map(b => b.rawValue);
        }
      } catch { /* fall through to jsQR */ }
    }
    await loadJsQR();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    return async () => {
      const w = video.videoWidth, h = video.videoHeight;
      if (!w) return [];
      const scale = Math.min(1, 640 / w);        // enough pixels for a label, cheap enough per frame
      canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const r = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
      return r ? [r.data] : [];
    };
  }

  function scan(onCode) {
    const el = document.createElement('div');
    el.className = 'scanner';
    el.innerHTML = `<video playsinline muted autoplay></video><div class="frame"></div>
      <div class="last" hidden></div>
      <div class="bar"><span class="n">0 scanned</span><button type="button" class="btn primary">Done</button></div>`;
    document.body.appendChild(el);
    const video = el.querySelector('video'), last = el.querySelector('.last'), n = el.querySelector('.n');
    let stream, stopped = false, count = 0;
    const seen = new Map();                        // code -> when, so a label held still is not added twice
    const stop = () => { stopped = true; if (stream) stream.getTracks().forEach(t => t.stop()); el.remove(); };
    el.querySelector('button').onclick = stop;
    const say = (text, bad) => { last.hidden = false; last.textContent = text; last.classList.toggle('bad', !!bad); };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
        video.srcObject = stream;
        await video.play();
        const detect = await makeDetector(video);
        while (!stopped) {
          for (const text of await detect().catch(() => [])) {
            const now = Date.now();
            if (now - (seen.get(text) || 0) < 2500) continue;
            seen.set(text, now);
            const code = idFrom(text);
            if (!code) { say('Not a Nerva label', true); continue; }
            if (code.place) { say('That is a shelf label: scan the thing itself', true); continue; }
            const name = onCode(code.id);
            if (name === false) { say(`${code.id}: not in the catalogue`, true); continue; }
            count++; n.textContent = `${count} scanned`;
            say(name || code.id);
            if (navigator.vibrate) navigator.vibrate(60);
          }
          await new Promise(r => setTimeout(r, 120));
        }
      } catch (e) {
        say(e.name === 'NotAllowedError' ? 'Camera access was refused' : e.message || 'No camera', true);
        setTimeout(stop, 2500);
      }
    })();
    return stop;
  }

  const supported = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  window.NervaScan = { scan, idFrom, supported };
})();
