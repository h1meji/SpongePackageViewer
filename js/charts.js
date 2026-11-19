/* Tiny dependency-free SVG chart kit */
const PALETTE = ['#7c6cff', '#ff5fa2', '#35d0ff', '#3ee08f', '#ffb648', '#c062ff', '#ff8a5c', '#5ce1c4', '#9aa4ff', '#ff9ad1'];
const NS = 'http://www.w3.org/2000/svg';
const fmtN = n => (n == null ? '–' : Number(n).toLocaleString('en-US'));
const fmtK = n => n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + 'k' : String(Math.round(n));
const escH = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const Tip = {
  el: null,
  show(e, html) {
    this.el = this.el || document.getElementById('tip');
    this.el.innerHTML = html; this.el.style.opacity = 1;
    const w = this.el.offsetWidth, h = this.el.offsetHeight;
    let x = e.clientX + 14, y = e.clientY + 14;
    if (x + w > innerWidth - 8) x = e.clientX - w - 14;
    if (y + h > innerHeight - 8) y = e.clientY - h - 14;
    this.el.style.left = x + 'px'; this.el.style.top = y + 'px';
  },
  hide() { if (this.el) this.el.style.opacity = 0; }
};

function svgEl(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}

function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}

/* Time series area chart. series: [{name,color,points:[[ms,v],...]}] (points sorted, same buckets) */
function areaChart(el, series, opt = {}) {
  el.innerHTML = '';
  const W = el.clientWidth || 800, H = opt.height || 220, P = { l: 44, r: 10, t: 12, b: 26 };
  const svg = svgEl('svg', { width: W, height: H, class: 'chart' }, el);
  const all = series.flatMap(s => s.points);
  if (!all.length) { el.innerHTML = '<div class="empty">No data</div>'; return; }
  const x0 = Math.min(...series.map(s => s.points[0]?.[0] ?? Infinity));
  const x1 = Math.max(...series.map(s => s.points[s.points.length - 1]?.[0] ?? -Infinity));
  const yMax = niceMax(Math.max(...all.map(p => p[1])));
  const X = t => P.l + (x1 === x0 ? 0.5 : (t - x0) / (x1 - x0)) * (W - P.l - P.r);
  const Y = v => H - P.b - (v / yMax) * (H - P.t - P.b);
  const g = svgEl('g', { class: 'grid' }, svg);
  for (let i = 0; i <= 4; i++) {
    const v = yMax * i / 4, y = Y(v);
    svgEl('line', { x1: P.l, x2: W - P.r, y1: y, y2: y }, g);
    svgEl('text', { x: P.l - 8, y: y + 3, 'text-anchor': 'end' }, svg).textContent = fmtK(v);
  }
  // x labels: years or months
  const span = x1 - x0, d0 = new Date(x0), d1 = new Date(x1);
  const ticks = [];
  if (span > 1000 * 86400 * 1100) { for (let y = d0.getFullYear() + 1; y <= d1.getFullYear(); y++) ticks.push([+new Date(y, 0, 1), String(y)]); }
  else { const d = new Date(d0.getFullYear(), d0.getMonth() + 1, 1); while (+d <= x1) { ticks.push([+d, d.toLocaleString('en', { month: 'short' }) + (d.getMonth() === 0 ? ' ' + d.getFullYear() : '')]); d.setMonth(d.getMonth() + (span > 86400e3 * 500 ? 3 : span > 86400e3 * 200 ? 2 : 1)); } }
  ticks.forEach(([t, l]) => { svgEl('line', { x1: X(t), x2: X(t), y1: P.t, y2: H - P.b, stroke: 'rgba(255,255,255,.04)' }, svg); svgEl('text', { x: X(t), y: H - 8, 'text-anchor': 'middle' }, svg).textContent = l; });
  const defs = svgEl('defs', {}, svg);
  series.forEach((s, i) => {
    const c = s.color || PALETTE[i % PALETTE.length], id = 'gr' + Math.random().toString(36).slice(2);
    const lg = svgEl('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    svgEl('stop', { offset: '0%', 'stop-color': c, 'stop-opacity': opt.stacked === false || series.length > 1 ? .18 : .45 }, lg);
    svgEl('stop', { offset: '100%', 'stop-color': c, 'stop-opacity': 0 }, lg);
    const pts = s.points;
    let d = '';
    pts.forEach((p, j) => d += (j ? 'L' : 'M') + X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1));
    svgEl('path', { d: d + `L${X(pts[pts.length - 1][0])},${Y(0)}L${X(pts[0][0])},${Y(0)}Z`, fill: `url(#${id})` }, svg);
    svgEl('path', { d, fill: 'none', stroke: c, 'stroke-width': 1.6, 'stroke-linejoin': 'round' }, svg);
  });
  const cross = svgEl('line', { y1: P.t, y2: H - P.b, stroke: 'rgba(255,255,255,.25)', 'stroke-dasharray': '3 3', opacity: 0 }, svg);
  const dots = series.map((s, i) => svgEl('circle', { r: 4, fill: s.color || PALETTE[i % PALETTE.length], stroke: '#0b0b14', 'stroke-width': 2, opacity: 0 }, svg));
  const hit = svgEl('rect', { x: P.l, y: 0, width: W - P.l - P.r, height: H, fill: 'transparent' }, svg);
  const ref = series[0].points;
  hit.addEventListener('mousemove', e => {
    const r = svg.getBoundingClientRect(), mx = e.clientX - r.left;
    const t = x0 + (mx - P.l) / (W - P.l - P.r) * (x1 - x0);
    let lo = 0, hi = ref.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ref[m][0] < t) lo = m; else hi = m; }
    const j = Math.abs(ref[lo][0] - t) < Math.abs(ref[hi][0] - t) ? lo : hi;
    const px = X(ref[j][0]);
    cross.setAttribute('x1', px); cross.setAttribute('x2', px); cross.setAttribute('opacity', 1);
    let html = `<b>${opt.labelFn ? opt.labelFn(ref[j][0]) : new Date(ref[j][0]).toLocaleDateString()}</b>`;
    series.forEach((s, i) => {
      const p = s.points[j]; if (!p) return;
      dots[i].setAttribute('cx', X(p[0])); dots[i].setAttribute('cy', Y(p[1])); dots[i].setAttribute('opacity', 1);
      html += `<span style="color:${s.color || PALETTE[i]}">●</span> ${escH(s.name || '')} ${fmtN(p[1])}<br>`;
    });
    Tip.show(e, html);
  });
  hit.addEventListener('mouseleave', () => { Tip.hide(); cross.setAttribute('opacity', 0); dots.forEach(d => d.setAttribute('opacity', 0)); });
}

/* Vertical columns: items [[label, value, tooltipLabel?]] */
function columns(el, items, opt = {}) {
  el.innerHTML = '';
  const W = el.clientWidth || 600, H = opt.height || 180, P = { l: opt.noAxis ? 4 : 40, r: 4, t: 10, b: 24 };
  const svg = svgEl('svg', { width: W, height: H, class: 'chart' }, el);
  const max = niceMax(Math.max(1, ...items.map(i => i[1])));
  const bw = (W - P.l - P.r) / items.length;
  if (!opt.noAxis) for (let i = 0; i <= 4; i++) {
    const y = H - P.b - (i / 4) * (H - P.t - P.b);
    svgEl('line', { x1: P.l, x2: W - P.r, y1: y, y2: y, stroke: 'rgba(255,255,255,.05)' }, svg);
    svgEl('text', { x: P.l - 8, y: y + 3, 'text-anchor': 'end' }, svg).textContent = fmtK(max * i / 4);
  }
  const every = Math.ceil(items.length / Math.max(1, Math.floor((W - P.l) / 34)));
  items.forEach(([l, v, tl], i) => {
    const h = (v / max) * (H - P.t - P.b), x = P.l + i * bw;
    const c = typeof opt.color === 'function' ? opt.color(i, v) : (opt.color || PALETTE[0]);
    const r = svgEl('rect', { x: x + bw * .12, y: H - P.b - h, width: Math.max(1, bw * .76), height: Math.max(0, h), rx: Math.min(4, bw * .3), fill: c }, svg);
    const hit = svgEl('rect', { x, y: P.t, width: bw, height: H - P.t - P.b, fill: 'transparent' }, svg);
    hit.addEventListener('mousemove', e => { r.setAttribute('opacity', .75); Tip.show(e, `<b>${escH(tl || l)}</b>${fmtN(v)} ${opt.unit || ''}`); });
    hit.addEventListener('mouseleave', () => { r.setAttribute('opacity', 1); Tip.hide(); });
    if (opt.onClick) { hit.style.cursor = 'pointer'; hit.addEventListener('click', () => opt.onClick(i)); }
    if (i % every === 0) svgEl('text', { x: x + bw / 2, y: H - 8, 'text-anchor': 'middle' }, svg).textContent = l;
  });
}

/* Weekday × hour heatmap. m[7][24], rows start Monday */
function heatmap(el, m, opt = {}) {
  el.innerHTML = '';
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const W = Math.max(520, el.clientWidth || 700), P = 38, cw = (W - P) / 24, ch = Math.min(26, cw * .9), H = ch * 7 + 22;
  const svg = svgEl('svg', { width: W, height: H, class: 'chart' }, el);
  const max = Math.max(1, ...m.flat());
  const c = opt.color || [124, 108, 255];
  m.forEach((row, d) => {
    svgEl('text', { x: 0, y: d * ch + ch / 2 + 4 }, svg).textContent = days[d];
    row.forEach((v, h) => {
      const a = v ? .08 + .92 * Math.pow(v / max, .7) : .03;
      const r = svgEl('rect', { x: P + h * cw + 1.5, y: d * ch + 1.5, width: cw - 3, height: ch - 3, rx: 4, fill: v ? `rgba(${c},${a})` : 'rgba(255,255,255,.03)' }, svg);
      r.addEventListener('mousemove', e => Tip.show(e, `<b>${days[d]} ${String(h).padStart(2, '0')}:00–${String(h + 1).padStart(2, '0')}:00</b>${fmtN(v)} ${opt.unit || ''}`));
      r.addEventListener('mouseleave', () => Tip.hide());
    });
  });
  for (let h = 0; h < 24; h += 3) svgEl('text', { x: P + h * cw + cw / 2, y: H - 4, 'text-anchor': 'middle' }, svg).textContent = String(h).padStart(2, '0');
}

/* GitHub-style calendar for one year. counts: Map('YYYY-MM-DD' -> n) */
function calendarChart(el, counts, year, opt = {}) {
  el.innerHTML = '';
  const start = new Date(year, 0, 1), end = new Date(year, 11, 31);
  const off = (start.getDay() + 6) % 7;
  const weeks = Math.ceil((off + (end - start) / 864e5 + 1) / 7);
  const W = Math.max(600, el.clientWidth || 800), P = 30, cs = Math.min(22, (W - P) / weeks), H = cs * 7 + 20;
  const svg = svgEl('svg', { width: W, height: H, class: 'chart' }, el);
  let max = 1; counts.forEach((v, k) => { if (k.startsWith(year + '-')) max = Math.max(max, v); });
  ['Mon', '', 'Wed', '', 'Fri', '', ''].forEach((d, i) => d && (svgEl('text', { x: 0, y: 18 + i * cs + cs / 2 }, svg).textContent = d));
  const c = opt.color || [255, 95, 162];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const idx = off + Math.round((d - start) / 864e5), w = Math.floor(idx / 7), wd = idx % 7;
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const v = counts.get(key) || 0;
    if (d.getDate() === 1) svgEl('text', { x: P + w * cs, y: 10 }, svg).textContent = d.toLocaleString('en', { month: 'short' });
    const r = svgEl('rect', { x: P + w * cs + 1, y: 16 + wd * cs + 1, width: cs - 2, height: cs - 2, rx: 3, fill: v ? `rgba(${c},${.15 + .85 * Math.pow(v / max, .6)})` : 'rgba(255,255,255,.04)' }, svg);
    const label = d.toLocaleDateString('en', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
    r.addEventListener('mousemove', e => Tip.show(e, `<b>${label}</b>${fmtN(v)} ${opt.unit || ''}`));
    r.addEventListener('mouseleave', () => Tip.hide());
    if (opt.onClick && v) { r.style.cursor = 'pointer'; r.addEventListener('click', () => opt.onClick(key)); }
  }
}

/* Donut. items [[label, value]] */
function donut(el, items, opt = {}) {
  el.innerHTML = '';
  const S = opt.size || 170, R = S / 2, r = R * .62;
  const wrap = document.createElement('div'); wrap.className = 'row'; wrap.style.alignItems = 'center'; wrap.style.gap = '22px'; wrap.style.flexWrap = 'nowrap';
  el.appendChild(wrap);
  const svg = svgEl('svg', { width: S, height: S, class: 'chart', style: 'flex:none' }, wrap);
  const total = items.reduce((a, b) => a + b[1], 0) || 1;
  let a0 = -Math.PI / 2;
  const leg = document.createElement('div'); leg.className = 'bars'; leg.style.flex = '1'; leg.style.minWidth = '0';
  items.forEach(([l, v], i) => {
    const a1 = a0 + (v / total) * Math.PI * 2, c = opt.colors?.[i] || PALETTE[i % PALETTE.length];
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (a, rr) => [R + rr * Math.cos(a), R + rr * Math.sin(a)];
    const [x0, y0] = p(a0, R), [x1, y1] = p(a1, R), [x2, y2] = p(a1, r), [x3, y3] = p(a0, r);
    const d = items.length === 1 ? `M${R},0A${R},${R} 0 1 1 ${R - .01},0Z M${R},${R - r}A${r},${r} 0 1 0 ${R + .01},${R - r}Z` : `M${x0},${y0}A${R},${R} 0 ${large} 1 ${x1},${y1}L${x2},${y2}A${r},${r} 0 ${large} 0 ${x3},${y3}Z`;
    const path = svgEl('path', { d, fill: c, stroke: '#141425', 'stroke-width': 2, 'fill-rule': 'evenodd' }, svg);
    path.addEventListener('mousemove', e => Tip.show(e, `<b>${escH(l)}</b>${fmtN(v)} · ${(v / total * 100).toFixed(1)}%`));
    path.addEventListener('mouseleave', () => Tip.hide());
    a0 = a1;
    if (i < (opt.legendMax || 8)) leg.insertAdjacentHTML('beforeend', `<div class="row small" style="gap:8px;flex-wrap:nowrap"><i style="width:10px;height:10px;border-radius:3px;background:${c};flex:none"></i><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escH(l)}</span><span class="muted num">${(v / total * 100).toFixed(1)}%</span></div>`);
  });
  const t = svgEl('text', { x: R, y: R - 2, 'text-anchor': 'middle', style: 'fill:#fff;font-size:20px;font-weight:800' }, svg); t.textContent = fmtK(opt.center ?? total);
  const t2 = svgEl('text', { x: R, y: R + 16, 'text-anchor': 'middle' }, svg); t2.textContent = opt.centerLabel || 'total';
  wrap.appendChild(leg);
}

/* Ranked horizontal bars → HTML string. items [{label, value, sub?, icon?, onclick?}] */
function hbars(items, opt = {}) {
  if (!items.length) return '<div class="empty">Nothing here</div>';
  const max = Math.max(...items.map(i => i.value)) || 1;
  return '<div class="bars">' + items.map((it, i) => `
    <div class="bar ${it.onclick ? 'click' : ''}" ${it.onclick ? `onclick="${it.onclick}"` : ''} ${it.title ? `title="${escH(it.title)}"` : ''}>
      <div class="l">${opt.rank !== false ? `<span class="rank">${i + 1}</span>` : ''}${it.icon || ''}<span style="overflow:hidden;text-overflow:ellipsis">${it.html || escH(it.label)}</span></div>
      <div class="r">${it.right ?? fmtN(it.value)}</div>
      <div class="t"><i style="width:${(it.value / max * 100).toFixed(2)}%;${it.color ? 'background:' + it.color : ''}"></i></div>
    </div>`).join('') + '</div>';
}
