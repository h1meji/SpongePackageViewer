/* Landing page, local processing, and IndexedDB cache. Nothing here talks to a server. */
'use strict';
(() => {
  const $ = (s) => document.querySelector(s);
  const status = (window.__pv = { state: 'idle' });

  /* ---------------- IndexedDB (report cache, stays in this browser) */
  const DB = {
    open() {
      return new Promise((res, rej) => {
        const r = indexedDB.open('sponge-package-viewer', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    },
    async op(mode, fn) {
      const db = await this.open();
      return new Promise((res, rej) => {
        const tx = db.transaction('kv', mode), st = tx.objectStore('kv');
        const req = fn(st);
        tx.oncomplete = () => { res(req && req.result); db.close(); };
        tx.onerror = tx.onabort = () => { rej(tx.error); db.close(); };
      });
    },
    get: (k) => DB.op('readonly', (s) => s.get(k)),
    set: (k, v) => DB.op('readwrite', (s) => s.put(v, k)),
    del: (k) => DB.op('readwrite', (s) => s.delete(k)),
  };

  const fmtBytes = (b) => (b >= 1e9 ? (b / 1e9).toFixed(2) + ' GB' : b >= 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.round(b / 1e3) + ' KB');
  const showErr = (msg) => { const e = $('#err'); e.textContent = msg; e.hidden = !msg; };

  /* ---------------- boot the dashboard */
  let booted = false;
  function boot(rec) {
    const data = rec.data, urls = {};
    for (const [p, blob] of Object.entries(rec.assets || {})) urls[p] = URL.createObjectURL(blob);
    const fix = (v) => (typeof v === 'string' && urls[v] ? urls[v] : v === null || v === undefined ? v : typeof v === 'string' && v.startsWith('assets/') ? null : v);
    data.avatar = fix(data.avatar);
    data.avatars = (data.avatars || []).map((a) => ({ url: fix(a), path: a })).filter((a) => a.url);
    (data.applications || []).forEach((a) => ['_icon', '_bot_avatar', '_cover_image'].forEach((k) => a[k] && (a[k] = fix(a[k]))));
    (data.messages || []).forEach((c) => c.icon && (c.icon = fix(c.icon)));
    (data.servers?.servers || []).forEach((s) => {
      if (s.icon) s.icon = fix(s.icon);
      if (s.images) s.images = s.images.map(fix).filter(Boolean);
      for (const k of ['emoji_files', 'webhook_files']) if (s[k]) for (const id in s[k]) s[k][id] = fix(s[k][id]);
    });
    window.DATA = data;
    document.body.classList.remove('landing-mode');
    $('#landing').hidden = true;
    $('#side').hidden = $('#main').hidden = $('#menu').hidden = false;
    if (!location.hash.startsWith('#/')) history.replaceState(null, '', '#/overview');
    if (!booted) {
      booted = true;
      const s = document.createElement('script');
      s.src = 'js/app.js';
      s.onload = () => (status.state = 'ready');
      document.body.appendChild(s);
    }
  }

  $('#newpkg').onclick = async () => {
    if (!confirm('Delete the saved report from this browser and load another package?')) return;
    try { await DB.del('report'); } catch { }
    location.href = location.pathname;
  };

  /* ---------------- saved report */
  async function checkSaved() {
    let rec;
    try { rec = await DB.get('report'); } catch { return; }
    if (!rec || !rec.data) return;
    if (location.hash.startsWith('#/')) return boot(rec);
    const s = $('#saved');
    const u = rec.data.user || {};
    s.innerHTML = `<div style="flex:1;min-width:200px"><b>Welcome back${u.global_name || u.username ? ', ' + escH(u.global_name || u.username) : ''}!</b><div class="muted small">Saved report from ${escH(rec.data.package?.name || 'package.zip')} · ${new Date(rec.savedAt).toLocaleString()}</div></div>
      <button class="btn on" id="open-saved">Open report →</button><button class="btn" id="del-saved" title="Remove it from this browser">Delete</button>`;
    s.hidden = false;
    $('#open-saved').onclick = () => boot(rec);
    $('#del-saved').onclick = async () => { await DB.del('report'); s.hidden = true; };
  }

  /* ---------------- processing */
  const STAGES = ['Opening package', 'Scanning telemetry', 'Extracting images', 'Reading your account', 'Reading messages', 'Reading servers', 'Reading the rest'];
  let worker = null;
  function setStage(stage, pct, detail) {
    $('#prog-stage').textContent = stage + '…';
    $('#prog-pct').textContent = Math.round(pct * 100) + '%';
    $('#prog-bar').style.width = (pct * 100).toFixed(1) + '%';
    $('#prog-detail').textContent = detail || '';
    const idx = STAGES.indexOf(stage);
    if (idx >= 0) document.querySelectorAll('#prog-steps div').forEach((d, i) => { d.className = i < idx ? 'ok' : i === idx ? 'on' : ''; d.firstChild.textContent = i < idx ? '✓' : i === idx ? '◌' : '·'; });
    status.stage = stage; status.pct = pct;
  }
  function resetUI() {
    $('#drop').hidden = false; $('#prog').hidden = true;
    if (worker) { worker.terminate(); worker = null; }
    status.state = 'idle';
  }
  $('#prog-cancel').onclick = resetUI;

  function handleFile(file) {
    showErr('');
    if (!file) return;
    if (!/\.zip$/i.test(file.name) && !/zip/.test(file.type)) return showErr('Please choose the .zip file Discord sent you (usually called package.zip).');
    if (!('DecompressionStream' in window)) return showErr('Your browser is too old to unpack zip files locally. Please use a recent Chrome, Edge, Firefox or Safari.');
    const withActivity = $('#opt-activity').checked && !/[?&]noact=1/.test(location.search);
    $('#drop').hidden = true; $('#prog').hidden = false; $('#saved').hidden = true;
    $('#prog-steps').innerHTML = STAGES.filter((s) => withActivity || s !== 'Scanning telemetry').map((s) => `<div><span>·</span>${s}</div>`).join('');
    setStage('Opening package', 0, `${file.name} · ${fmtBytes(file.size)}`);
    status.state = 'processing';
    const t0 = performance.now();
    worker = new Worker('js/worker.js');
    worker.onmessage = async (ev) => {
      const m = ev.data;
      if (m.type === 'progress') setStage(m.stage, m.pct, m.detail);
      else if (m.type === 'error') { resetUI(); status.state = 'error'; status.error = m.message; showErr('Could not read this package:\n' + m.message); }
      else if (m.type === 'done') {
        status.ms = performance.now() - t0;
        worker.terminate(); worker = null;
        setStage('Saving report in your browser', 1, 'so you can come back later');
        const rec = { data: m.data, assets: m.assets, savedAt: Date.now() };
        try { await DB.set('report', rec); } catch (e) { console.warn('Could not cache report', e); }
        boot(rec);
      }
    };
    worker.onerror = (e) => { resetUI(); status.state = 'error'; showErr('Processing failed: ' + (e.message || 'unknown error')); };
    worker.postMessage({ file, options: { activity: withActivity } });
  }

  const drop = $('#drop'), input = $('#file');
  drop.addEventListener('click', () => input.click());
  drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  input.addEventListener('change', () => handleFile(input.files[0]));
  ['dragenter', 'dragover'].forEach((t) => document.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((t) => document.addEventListener(t, (e) => { e.preventDefault(); if (t === 'drop' || e.target === document.documentElement) drop.classList.remove('over'); }));
  document.addEventListener('drop', (e) => { if (!$('#drop').hidden) handleFile(e.dataTransfer.files[0]); });

  // Dev/testing hook: ?src=<same-origin url> loads a zip without the file picker (CSP restricts it to this site).
  const src = new URLSearchParams(location.search).get('src');
  if (src) fetch(src).then((r) => r.blob()).then((b) => handleFile(new File([b], src.split('/').pop() || 'package.zip', { type: 'application/zip' }))).catch((e) => showErr(String(e)));
  else checkSaved();
})();
