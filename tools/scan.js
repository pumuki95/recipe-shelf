// Run on a YouTube watch page (paste into the browser). Starts a background job; poll window.__job.
// 1) metadata + captions  2) sample a frame every ~2s  3) score sharpness / exposure / colour
// 4) show the top candidates as a numbered contact sheet for a visual pick (plated, unobstructed).
window.__job = {state:'running'};
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const J = window.__job;
  try {
    let p = null, R = null;
    const want = new URLSearchParams(location.search).get('v');
    for (let i = 0; i < 30; i++) {
      p = document.getElementById('movie_player');
      R = (p?.getPlayerResponse && p.getPlayerResponse()) || window.ytInitialPlayerResponse;
      if (R?.videoDetails?.videoId === want) break; await sleep(400);
    }
    if (R?.videoDetails?.videoId !== want) throw new Error('player is on a different video');
    document.querySelector('.ytp-autonav-toggle-button[aria-checked="true"]')?.click();
    const V = R.videoDetails, L = +V.lengthSeconds;
    Object.assign(J, {id: V.videoId, title: V.title, author: V.author, len: L, desc: V.shortDescription});
    // captions: intercept the player's own timedtext request
    const tracks = R.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    const tr = tracks.find(t => t.languageCode === 'en' && t.kind !== 'asr') || tracks.find(t => t.kind !== 'asr')
            || tracks.find(t => t.languageCode === 'en') || tracks.find(t => t.kind === 'asr') || tracks[0];
    window.__cap = null;
    if (!window.__hooked) {
      window.__hooked = true;
      const of = window.fetch;
      window.fetch = async function (...a) { const res = await of.apply(this, a); try { const u = (a[0].url || a[0] + ''); if (u.includes('timedtext') && u.includes('pot=')) window.__cap = [u, await res.clone().text()]; } catch (e) {} return res; };
      const oo = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function (m, u, ...x) { this.__u = u; this.addEventListener('load', () => { const s = this.__u + ''; if (s.includes('timedtext') && s.includes('pot=')) window.__cap = [s, this.responseText]; }); return oo.call(this, m, u, ...x); };
    }
    p.mute(); p.playVideo();
    for (let i = 0; i < 45 && document.querySelector('.ad-showing'); i++) { document.querySelector('.ytp-skip-ad-button,.ytp-ad-skip-button-modern,.ytp-skip-ad button')?.click(); await sleep(1000); }
    let tx = '';
    if (tr) {
      try { p.unloadModule('captions'); } catch (e) {}
      await sleep(500); p.loadModule('captions'); p.setOption('captions', 'track', {languageCode: tr.languageCode, kind: tr.kind});
      for (let i = 0; i < 12 && !(window.__cap && window.__cap[0].includes('v=' + V.videoId)); i++) await sleep(600);
      if (window.__cap && window.__cap[0].includes('v=' + V.videoId)) {
        try { const d = JSON.parse(window.__cap[1]); let last = -99;
          tx = d.events.filter(e => e.segs).map(e => { const t = Math.floor(e.tStartMs / 1000); const s = e.segs.map(x => x.utf8).join('').replace(/\n/g, ' ').trim(); if (!s) return ''; const pre = (t - last >= 20) ? '[' + t + '] ' : ''; if (pre) last = t; return pre + s; }).filter(Boolean).join(' ');
        } catch (e) { tx = 'PARSEERR'; }
      }
      try { p.unloadModule('captions'); } catch (e) {}
    }
    J.lang = tr ? tr.languageCode + '/' + (tr.kind || 'manual') : 'none'; J.tx = tx;
    p.pauseVideo();
    // frame sampling
    const vid = document.querySelector('video.html5-main-video');
    const step = Math.max(2, L / 60), times = [];
    for (let t = 1; t < L - 0.5; t += step) times.push(+t.toFixed(1));
    const S = 160, sc = document.createElement('canvas'); sc.width = S; sc.height = Math.round(S * vid.videoHeight / vid.videoWidth);
    const sx = sc.getContext('2d', {willReadFrequently: true});
    window.__frames = {}; const scored = [];
    for (const t of times) {
      vid.currentTime = t;
      await new Promise(r => { const f = () => { vid.removeEventListener('seeked', f); r(); }; vid.addEventListener('seeked', f); setTimeout(r, 2500); });
      await new Promise(r => vid.requestVideoFrameCallback ? (vid.requestVideoFrameCallback(() => r()), setTimeout(r, 400)) : setTimeout(r, 200));
      const c = document.createElement('canvas'); c.width = vid.videoWidth; c.height = vid.videoHeight; c.getContext('2d').drawImage(vid, 0, 0);
      window.__frames[t] = c;
      sx.drawImage(vid, 0, 0, sc.width, sc.height);
      const {data} = sx.getImageData(0, 0, sc.width, sc.height), w = sc.width, h = sc.height, g = new Float32Array(w * h);
      let lum = 0, clip = 0, rg = 0, yb = 0, rg2 = 0, yb2 = 0;
      for (let i = 0, j = 0; i < data.length; i += 4, j++) {
        const R_ = data[i], G = data[i + 1], B = data[i + 2], y = 0.299 * R_ + 0.587 * G + 0.114 * B; g[j] = y; lum += y;
        if (y < 12 || y > 245) clip++;
        const a = R_ - G, b = 0.5 * (R_ + G) - B; rg += a; yb += b; rg2 += a * a; yb2 += b * b;
      }
      const n = w * h; lum /= n;
      let lap = 0, lap2 = 0, m = 0;
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; const v = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w]; lap += v; lap2 += v * v; m++; }
      const sharp = lap2 / m - (lap / m) ** 2;
      const colour = Math.sqrt((rg2 / n - (rg / n) ** 2) + (yb2 / n - (yb / n) ** 2)) + 0.3 * Math.sqrt((rg / n) ** 2 + (yb / n) ** 2);
      const expo = 1 - Math.min(1, Math.abs(lum - 128) / 110) - clip / n;
      scored.push({t, sharp, colour, expo});
      J.progress = scored.length + '/' + times.length;
    }
    const norm = k => { const v = scored.map(s => s[k]), lo = Math.min(...v), hi = Math.max(...v); scored.forEach(s => s[k + 'N'] = hi > lo ? (s[k] - lo) / (hi - lo) : 0.5); };
    norm('sharp'); norm('colour');
    scored.forEach(s => { s.score = +(0.45 * s.sharpN + 0.3 * s.colourN + 0.25 * Math.max(0, s.expo) + (s.t > L * 0.6 ? 0.08 : 0)).toFixed(3); });
    const top = [...scored].sort((a, b) => b.score - a.score).slice(0, 12).sort((a, b) => a.t - b.t);
    J.top = top.map((s, i) => ({n: i + 1, t: s.t, score: s.score}));
    const grid = document.createElement('div'); grid.id = '__ov';
    grid.style.cssText = 'position:fixed;inset:0;z-index:999999;background:#fff;display:grid;grid-template-columns:repeat(4,1fr);gap:3px;padding:3px;font:bold 15px sans-serif;align-content:start';
    top.forEach((s, i) => { const wr = document.createElement('div'); wr.style.position = 'relative'; const c = window.__frames[s.t], c2 = document.createElement('canvas'); c2.width = c.width / 3; c2.height = c.height / 3; c2.getContext('2d').drawImage(c, 0, 0, c2.width, c2.height); c2.style.cssText = 'width:100%;display:block'; const lb = document.createElement('span'); lb.textContent = (i + 1) + ' · ' + s.t + 's'; lb.style.cssText = 'position:absolute;left:2px;top:2px;background:yellow;padding:0 3px'; wr.append(c2, lb); grid.appendChild(wr); });
    document.querySelectorAll('#__ov').forEach(e => e.remove()); document.body.appendChild(grid);
    window.__show = t => { document.querySelectorAll('#__ov').forEach(e => e.remove()); const c = window.__frames[t]; const d = document.createElement('div'); d.id = '__ov'; d.style.cssText = 'position:fixed;inset:0;z-index:999999;background:#000'; c.style.cssText = 'max-width:100vw;max-height:100vh;display:block'; d.appendChild(c); document.body.appendChild(d); return t; };
    J.state = 'done';
  } catch (e) { J.state = 'error'; J.error = String(e && e.stack || e); }
})();
'started';
