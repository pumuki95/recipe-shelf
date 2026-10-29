// Cover capture helpers (run on a YouTube watch page after scan.js has produced window.__frames).
// __hq(): switch the player to the best available quality before sampling.
// __grab(t): grab the frame at time t at full native resolution into window.__frames[t].
// __show(t): show the whole frame fitted to the viewport; returns native-px per screenshot-px.
// __tile(t, box, k, n): show tile k (row-major) of an n×n grid covering box=[x0,y0,x1,y1] (native px),
//   scaled so each tile fills an 800×450 screenshot area; capture each with a lossless zoom and stitch.
window.__hq = async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const p = document.getElementById('movie_player'), v = document.querySelector('video.html5-main-video');
  const best = (p.getAvailableQualityLevels() || [])[0];
  if (best) p.setPlaybackQualityRange(best, best);
  p.mute(); p.playVideo();
  for (let i = 0; i < 40 && document.querySelector('.ad-showing'); i++) { document.querySelector('.ytp-skip-ad-button,.ytp-ad-skip-button-modern,.ytp-skip-ad button')?.click(); await sleep(1000); }
  const want = {hd2160: 2160, hd1440: 1440, hd1080: 1080, hd720: 720, large: 480}[best] || 0;
  for (let i = 0; i < 25 && Math.min(v.videoWidth, v.videoHeight) < Math.min(want, 1080) * 0.95; i++) await sleep(600);
  p.pauseVideo();
  return {best, dims: [v.videoWidth, v.videoHeight]};
};
window.__grab = async t => {
  const v = document.querySelector('video.html5-main-video');
  v.currentTime = t;
  await new Promise(r => { const f = () => { v.removeEventListener('seeked', f); r(); }; v.addEventListener('seeked', f); setTimeout(r, 3000); });
  await new Promise(r => setTimeout(r, 450));
  const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext('2d').drawImage(v, 0, 0);
  (window.__frames = window.__frames || {})[t] = c; return [c.width, c.height];
};
window.__ovl = () => { document.querySelectorAll('#__ov').forEach(e => e.remove()); const d = document.createElement('div'); d.id = '__ov'; d.style.cssText = 'position:fixed;inset:0;z-index:999999;background:#000;overflow:hidden'; document.body.appendChild(d); return d; };
window.__show = t => {
  const src = window.__frames[t], d = __ovl(), S = 800 / innerWidth;           // screenshot px per CSS px
  const fit = Math.min(innerWidth / src.width, innerHeight / src.height);       // CSS px per native px
  const c = document.createElement('canvas'); c.width = Math.round(src.width * fit * devicePixelRatio); c.height = Math.round(src.height * fit * devicePixelRatio);
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  c.style.cssText = `position:absolute;left:0;top:0;width:${src.width * fit}px;height:${src.height * fit}px`;
  d.appendChild(c);
  return {t, native: [src.width, src.height], nativePerShotPx: +(1 / (fit * S)).toFixed(4)};
};
window.__tile = (t, box, k, n) => {
  const src = window.__frames[t], d = __ovl(), S = 800 / innerWidth;
  const [x0, y0, x1, y1] = box, tw = (x1 - x0) / n, th = (y1 - y0) / n, col = k % n, row = Math.floor(k / n);
  const cssW = 800 / S, cssH = 450 / S, bleed = 4;                             // tile fills an 800x450 screenshot region (+bleed so no black edge)
  const c = document.createElement('canvas'); c.width = Math.round((cssW + bleed) * devicePixelRatio); c.height = Math.round((cssH + bleed) * devicePixelRatio);
  const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
  g.drawImage(src, x0 + col * tw, y0 + row * th, tw * (cssW + bleed) / cssW, th * (cssH + bleed) / cssH, 0, 0, c.width, c.height);
  c.style.cssText = `position:absolute;left:0;top:0;width:${cssW + bleed}px;height:${cssH + bleed}px`;
  d.appendChild(c);
  return {k, srcTile: [Math.round(tw), Math.round(th)]};
};
'ok';
