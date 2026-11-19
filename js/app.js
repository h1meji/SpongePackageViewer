/* Sponge Package Viewer — renders window.DATA produced by js/worker.js */
'use strict';
const D = window.DATA;

const U = D?.user || {}, A = D?.activity || {}, ME = U.id;
const $ = (s, r = document) => r.querySelector(s);
const html = (strings, ...vals) => strings.reduce((a, s, i) => a + s + (i < vals.length ? vals[i] ?? '' : ''), '');
const sens = v => `<span class="sens">${escH(v)}</span>`;
const plural = (n, w) => `${fmtN(n)} ${w}${n === 1 ? '' : 's'}`;
const snow = id => { try { return Number((BigInt(id) >> 22n) + 1420070400000n); } catch { return null; } };
const pad = n => String(n).padStart(2, '0');
const dayKey = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const fmtDate = (t, o = {}) => t ? new Date(t).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric', ...o }) : '–';
const fmtDT = t => t ? new Date(t).toLocaleString('en-GB', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–';
const fmtTime = t => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const iso = s => s ? Date.parse(String(s).replace(' UTC', 'Z').replace(' ', 'T')) : null;
const fmtBytes = b => b >= 1e9 ? (b / 1e9).toFixed(2) + ' GB' : b >= 1e6 ? (b / 1e6).toFixed(1) + ' MB' : b >= 1e3 ? (b / 1e3).toFixed(0) + ' KB' : b + ' B';
const fmtDur = s => { s = Math.round(s); const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60); return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`; };
const ago = t => { const d = (Date.now() - t) / 864e5; return d < 1 ? 'today' : d < 2 ? 'yesterday' : d < 60 ? Math.round(d) + ' days ago' : d < 730 ? Math.round(d / 30.4) + ' months ago' : (d / 365.25).toFixed(1) + ' years ago'; };
const memo = fn => { let v, done = false; return () => done ? v : (done = true, v = fn()); };
const colorFor = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return PALETTE[Math.abs(h) % PALETTE.length]; };
const initials = s => (String(s || '?').replace(/[^\p{L}\p{N}]/gu, '')[0] || '?').toUpperCase();
function avatarHTML(name, img, cls = '') {
  const fb = `<div class="ava ${cls}" style="background:${colorFor(name)}">${escH(initials(name))}</div>`;
  if (!img) return fb;
  return `<img class="ava ${cls}" src="${escH(img)}" loading="lazy" onerror="this.outerHTML=this.dataset.fb" data-fb="${escH(fb)}">`;
}
const userAvatarURL = u => u?.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.${u.avatar.startsWith('a_') ? 'gif' : 'png'}?size=96` : null;
const emojiURL = (id, anim) => `https://cdn.discordapp.com/emojis/${id}.${anim ? 'gif' : 'webp'}?size=48`;

/* ------------------------------------------------------------------ lookups */
const USERS = {};
(U.relationships || []).forEach(r => { const u = r.user || {}; USERS[r.id] = { ...u, rel: r.type, nickname: r.nickname, name: r.nickname || u.global_name || u.username || r.id }; });
const userName = id => id === ME ? (U.global_name || U.username) : USERS[id]?.name || null;

const GUILDS = {};
Object.entries(D?.servers?.index || {}).forEach(([id, n]) => GUILDS[id] = { id, name: n });
(D?.servers?.servers || []).forEach(s => { GUILDS[s.id] = { ...(GUILDS[s.id] || {}), ...s, id: s.id, name: s.name || GUILDS[s.id]?.name }; });
(D?.messages || []).forEach(c => { if (c.guild_id) { GUILDS[c.guild_id] = GUILDS[c.guild_id] || { id: c.guild_id, name: c.guild_name, left: true }; if (!GUILDS[c.guild_id].name) GUILDS[c.guild_id].name = c.guild_name; } });
const guildName = id => GUILDS[id]?.name || null;
const guildIcon = id => GUILDS[id]?.icon || null;

const APPNAMES = { ...(A.app_names || {}) };
(D?.applications || []).forEach(a => APPNAMES[a.id] = a.name);
const appName = id => APPNAMES[id] || null;

const CHANNELS = {};
function chanInfo(c) {
  if (c._info) return c._info;
  const idx = c.index_name || '';
  let title, sub, kind, img = c.icon, avatarName;
  if (c.type === 'DM') {
    kind = 'dm';
    const other = (c.recipients || []).find(r => r !== ME);
    const u = USERS[other];
    title = u?.name || (other && !/^\d+$/.test(other) ? other : '') || idx.replace(/^Direct Message with /, '') || 'Unknown user';
    if (/^Unknown|^None$/.test(title)) title = other && /^\d+$/.test(other) ? 'User …' + other.slice(-4) : 'Unknown user';
    sub = u ? '@' + (u.username || '') : 'Direct message';
    img = userAvatarURL(u ? { ...u, id: other } : null); c.other = other;
  } else if (c.type === 'GROUP_DM') {
    kind = 'group';
    const names = (c.recipients || []).filter(r => r !== ME).map(r => USERS[r]?.name).filter(Boolean);
    title = c.name || (idx && idx !== 'None' ? idx : '') || names.slice(0, 3).join(', ') || 'Group DM';
    sub = `Group · ${(c.recipients || []).length || '?'} members`;
  } else {
    kind = c.type === 'GUILD_VOICE' ? 'voice' : c.type === 'PUBLIC_THREAD' || c.type === 'PRIVATE_THREAD' ? 'thread' : 'guild';
    let name = c.name, g = c.guild_name || guildName(c.guild_id);
    if (!name && idx) { const parts = idx.split(', '); name = parts[0] === 'Unknown channel' ? null : parts[0]; g = g || parts.slice(1).join(', ') || null; }
    title = (kind === 'voice' ? '🔊 ' : kind === 'thread' ? '🧵 ' : '#') + (name || 'unknown-channel');
    sub = g || 'Unknown server';
    img = guildIcon(c.guild_id); avatarName = g || title;
  }
  return c._info = { title, sub, kind, img, avatarName: avatarName || title };
}
(D?.messages || []).forEach(c => { CHANNELS[c.id] = c; chanInfo(c); });
const chanLabel = id => { const c = CHANNELS[id]; if (c) { const i = chanInfo(c); return i.kind === 'guild' || i.kind === 'voice' || i.kind === 'thread' ? `${i.title} · ${i.sub}` : i.title; } return null; };

const ALLMSG = memo(() => {
  const out = [];
  D.messages.forEach(c => c.messages.forEach(m => out.push([m[1] * 1000, m[2], m[3], c.id, m[0]])));
  out.sort((a, b) => a[0] - b[0]);
  return out;
});

/* ------------------------------------------------------------------ text helpers */
const EMOJI_RE = /\p{Extended_Pictographic}(?:‍\p{Extended_Pictographic}|️|[\u{1F3FB}-\u{1F3FF}])*/gu;
const CEMOJI_RE = /<(a?):([\w~]+):(\d+)>/g;
const STOP = new Set(('the a an and or but if of to in on at for with is are was were be been am i you he she it we they me my your our their this that these those so not no yes do does did just like im its dont have has had what when where who how why can will would there here then than too very also all any some get got go going one out up about from as by u ur lol oh ok okay yeah ya ye xd ' +
  'de het een en of maar als van te in op aan voor met is zijn was waren ben ik jij je u hij zij ze wij we jullie mij mijn jouw onze dit dat deze die niet geen ja nee doe doet deed gewoon heb hebt heeft had wat wanneer waar wie hoe waarom kan kun zal zou er hier dan ook al wel nog toch maar naar om bij uit over nu even echt want dus zo').split(' '));
function renderContent(s, q) {
  let t = escH(s);
  t = t.replace(/&lt;(a?):([\w~]+):(\d+)&gt;/g, (_, a, n, id) => `<img class="emoji" title=":${n}:" alt=":${n}:" src="${emojiURL(id, a)}" loading="lazy">`);
  t = t.replace(/&lt;@!?(\d+)&gt;/g, (_, id) => `<span class="mention">@${escH(userName(id) || 'user-' + id.slice(-4))}</span>`);
  t = t.replace(/&lt;#(\d+)&gt;/g, (_, id) => `<span class="mention">${escH(chanLabel(id) || '#channel')}</span>`);
  t = t.replace(/&lt;@&amp;(\d+)&gt;/g, () => `<span class="mention">@role</span>`);
  t = t.replace(/&lt;t:(\d+)(?::\w)?&gt;/g, (_, n) => `<span class="mention">${fmtDT(n * 1000)}</span>`);
  t = t.replace(/`([^`\n]+)`/g, '<span class="code">$1</span>');
  t = t.replace(/(https?:\/\/[^\s<]+)/g, u => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u.length > 80 ? u.slice(0, 77) + '…' : u}</a>`);
  if (q) { const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')(?![^<]*>)', 'gi'); t = t.replace(re, '<mark>$1</mark>'); }
  return t;
}
function renderAttachments(a) {
  if (!a) return '';
  return a.split(/\s+/).filter(Boolean).map(u => {
    const isImg = /\.(png|jpe?g|gif|webp)(\?|$)/i.test(u);
    const name = decodeURIComponent(u.split('?')[0].split('/').pop());
    return `<span class="att">📎 <a href="${escH(u)}" target="_blank" rel="noopener noreferrer">${escH(name)}</a>${isImg ? `<img src="${escH(u)}" loading="lazy" onerror="this.remove()">` : ''}</span>`;
  }).join('');
}

/* ------------------------------------------------------------------ message stats */
const MSTATS = memo(() => {
  const all = ALLMSG();
  const byDay = new Map(), byMonth = new Map(), heat = Array.from({ length: 7 }, () => Array(24).fill(0));
  const hours = Array(24).fill(0), words = new Map(), emoji = new Map(), cemoji = new Map(), domains = new Map(), mentions = new Map(), exact = new Map();
  const lenBuckets = Array(12).fill(0);
  let chars = 0, wordsN = 0, attach = 0, links = 0, longest = null, night = 0;
  for (const [t, c, a] of all) {
    const d = new Date(t), dk = dayKey(d), mk = dk.slice(0, 7);
    byDay.set(dk, (byDay.get(dk) || 0) + 1); byMonth.set(mk, (byMonth.get(mk) || 0) + 1);
    const wd = (d.getDay() + 6) % 7, h = d.getHours();
    heat[wd][h]++; hours[h]++; if (h < 5) night++;
    chars += c.length;
    if (a) attach += a.split(/\s+/).filter(Boolean).length;
    if (!longest || c.length > longest[1].length) longest = [t, c];
    const L = c.length; lenBuckets[L === 0 ? 0 : Math.min(11, Math.floor(Math.log2(L)) + 1)]++;
    if (c) { const k = c.trim().toLowerCase(); if (k.length < 40) exact.set(k, (exact.get(k) || 0) + 1); }
    for (const m of c.matchAll(CEMOJI_RE)) { const k = m[3]; const e = cemoji.get(k) || [m[2], m[1] === 'a', 0]; e[2]++; cemoji.set(k, e); }
    const plain = c.replace(CEMOJI_RE, ' ');
    for (const m of plain.matchAll(EMOJI_RE)) emoji.set(m[0], (emoji.get(m[0]) || 0) + 1);
    for (const m of plain.matchAll(/<@!?(\d+)>/g)) mentions.set(m[1], (mentions.get(m[1]) || 0) + 1);
    for (const m of plain.matchAll(/https?:\/\/(?:www\.)?([^/\s]+)/g)) { links++; domains.set(m[1].toLowerCase(), (domains.get(m[1].toLowerCase()) || 0) + 1); }
    const text = plain.replace(/https?:\/\/\S+/g, ' ').replace(/<[@#][!&]?\d+>/g, ' ').toLowerCase();
    for (const w of text.match(/[\p{L}][\p{L}'’]*/gu) || []) { wordsN++; if (w.length > 1 && w.length < 18 && !STOP.has(w)) words.set(w, (words.get(w) || 0) + 1); }
  }
  // streaks
  const days = [...byDay.keys()].sort();
  let best = [0, null, null], cur = 0, curStart = null, prev = null;
  for (const k of days) {
    const t = Date.parse(k + 'T12:00:00');
    if (prev && Math.round((t - prev) / 864e5) === 1) cur++; else { cur = 1; curStart = k; }
    if (cur > best[0]) best = [cur, curStart, k];
    prev = t;
  }
  const busiest = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0] || ['', 0];
  const sortM = m => [...m.entries()].sort((a, b) => (b[1][2] ?? b[1]) - (a[1][2] ?? a[1]));
  return {
    all, byDay, byMonth, heat, hours, lenBuckets, chars, wordsN, attach, links, longest, night, best, busiest,
    words: sortM(words).slice(0, 150), emoji: sortM(emoji).slice(0, 60), cemoji: sortM(cemoji).slice(0, 60), domains: sortM(domains).slice(0, 30),
    mentions: sortM(mentions).slice(0, 30), exact: sortM(exact).filter(e => e[0]).slice(0, 25), activeDays: byDay.size,
    years: [...new Set(days.map(d => +d.slice(0, 4)))],
  };
});

/* ------------------------------------------------------------------ nav + router */
const PAGES = [
  ['overview', '✦', 'Overview'],
  ['messages', '💬', 'Messages', () => fmtK(ALLMSG().length)],
  ['people', '👥', 'People', () => (U.relationships || []).length],
  ['servers', '🏰', 'Servers', () => Object.keys(D.servers?.index || {}).length],
  ['sep', 'Tracking'],
  ['activity', '📡', 'Telemetry', () => fmtK(A.unique_events || 0)],
  ['places', '📍', 'Places & Devices'],
  ['media', '🎮', 'Games, Voice & Music'],
  ['sep', 'Account'],
  ['account', '🪪', 'Account & Settings'],
  ['money', '💎', 'Billing, Orbs & Quests'],
  ['support', '🛟', 'Support & Activities'],
  ['raw', '🗂️', 'Raw Package'],
];
function renderNav() {
  const cur = (location.hash.slice(2) || 'overview').split('/')[0];
  $('#nav').innerHTML = PAGES.map(p => p[0] === 'sep' ? `<div class="sep">${p[1]}</div>` :
    `<a href="#/${p[0]}" class="${cur === p[0] ? 'on' : ''}"><span class="ic">${p[1]}</span>${p[2]}${p[3] ? `<span class="n">${p[3]()}</span>` : ''}</a>`).join('');
}
function route() {
  const [page, ...rest] = (location.hash.slice(2) || 'overview').split('/');
  renderNav();
  $('#side').classList.remove('open');
  const main = $('#main');
  main.scrollTop = 0;
  const fn = R[page] || R.overview;
  main.innerHTML = '<div class="page" id="page"></div>';
  try { fn($('#page'), rest.map(decodeURIComponent)); } catch (e) { console.error(e); $('#page').innerHTML += `<div class="card"><b>Something broke rendering this page.</b><pre class="json">${escH(e.stack)}</pre></div>`; }
}
const R = {};
function openModal(h) { $('#modal-body').innerHTML = h; $('#modal').hidden = false; }
function closeModal() { $('#modal').hidden = true; }
window.closeModal = closeModal;
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
$('#modal')?.addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
const statCard = (k, v, d = '', ic = '', extra = '') => `<div class="card stat ${extra}"><span class="ic">${ic}</span><span class="k">${k}</span><span class="v">${v}</span><span class="d">${d}</span></div>`;
const afterRender = fn => requestAnimationFrame(() => requestAnimationFrame(fn));
const tableHTML = (cols, rows, opt = {}) => `<div class="tablewrap" style="${opt.h ? 'max-height:' + opt.h + 'px' : ''}"><table><thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c ?? ''}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${cols.length}" class="dim">No records</td></tr>`}</tbody></table></div>`;
const hourlyToDaily = (arr, bucket = 'day') => {
  const m = new Map();
  for (const [h, v] of arr || []) {
    const d = new Date(h * 3600e3);
    let k;
    if (bucket === 'week') { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)); k = +x; }
    else if (bucket === 'month') k = +new Date(d.getFullYear(), d.getMonth(), 1);
    else k = +new Date(d.getFullYear(), d.getMonth(), d.getDate());
    m.set(k, (m.get(k) || 0) + v);
  }
  return fillGaps([...m.entries()].sort((a, b) => a[0] - b[0]), bucket);
};
function fillGaps(pts, bucket) {
  if (!pts.length) return pts;
  const out = [], map = new Map(pts);
  const d = new Date(pts[0][0]), end = pts[pts.length - 1][0];
  while (+d <= end) { out.push([+d, map.get(+d) || 0]); if (bucket === 'month') d.setMonth(d.getMonth() + 1); else d.setDate(d.getDate() + (bucket === 'week' ? 7 : 1)); }
  return out;
}
const hourlyHeat = arr => { const m = Array.from({ length: 7 }, () => Array(24).fill(0)); for (const [h, v] of arr || []) { const d = new Date(h * 3600e3); m[(d.getDay() + 6) % 7][d.getHours()] += v; } return m; };
const prettyFlag = f => f.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()).replace('Hypesquad Online House 1', 'HypeSquad Bravery').replace('Hypesquad Online House 2', 'HypeSquad Brilliance').replace('Hypesquad Online House 3', 'HypeSquad Balance');

/* ================================================================== OVERVIEW */
R.overview = el => {
  const S = MSTATS();
  const created = snow(ME);
  const rel = U.relationships || [];
  const friends = rel.filter(r => r.type === 'FRIEND').length;
  const gameSecs = (U.user_activity_application_statistics || []).reduce((a, s) => a + (s.total_duration || 0), 0);
  const dms = D.messages.filter(c => c.type === 'DM');
  const topDM = dms.slice().sort((a, b) => b.messages.length - a.messages.length)[0];
  const guildCounts = new Map();
  D.messages.forEach(c => c.guild_id && guildCounts.set(c.guild_id, (guildCounts.get(c.guild_id) || 0) + c.messages.length));
  const topGuild = [...guildCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const first = S.all[0], last = S.all[S.all.length - 1];
  const peakHour = S.hours.indexOf(Math.max(...S.hours));
  const topWord = S.words[0], topEmoji = S.emoji[0], topCE = S.cemoji[0];
  const st = U.settings?.settings?.status;
  const meta = U.user_profile_metadata || {};
  const topReact = Object.entries(U.settings?.frecency?.emojiReactionFrecency?.emojis || {}).sort((a, b) => (b[1].totalUses || 0) - (a[1].totalUses || 0))[0];
  const topArtist = A.spotify_artists?.[0];
  const yrs = (Date.now() - created) / 31557600000;

  el.innerHTML = html`
  <div class="hero">
    <div class="banner"><div class="pattern"></div></div>
    <div class="body">
      ${D.avatar ? `<img class="av" src="${D.avatar}">` : avatarHTML(U.username, null, 'av')}
      <div class="who">
        <h1>${escH(U.global_name || U.username)}</h1>
        <div class="handle">@${escH(U.username)} ${meta.legacy_username ? `<span class="dim">· formerly ${escH(meta.legacy_username)}</span>` : ''}</div>
        ${st?.customStatus?.text ? `<div class="muted" style="margin-top:6px">💭 ${escH(st.customStatus.text)}</div>` : ''}
        <div class="badges">
          <span class="chip a">🎂 Joined ${fmtDate(created)} · ${yrs.toFixed(1)} yrs</span>
          ${U.premium_until ? `<span class="chip p">💎 Nitro until ${fmtDate(iso(U.premium_until))}</span>` : ''}
          ${meta.boosting_started_at ? `<span class="chip p">🚀 Boosting since ${fmtDate(iso(meta.boosting_started_at))}</span>` : ''}
          ${(U.flags || []).map(f => `<span class="chip">${escH(prettyFlag(f))}</span>`).join('')}
          ${st?.status ? `<span class="chip ${st.status === 'dnd' ? 'r' : st.status === 'online' ? 'g' : 'w'}">● ${escH(st.status)}</span>` : ''}
        </div>
      </div>
    </div>
  </div>

  <div class="grid g4">
    ${statCard('Messages', fmtN(S.all.length), `${fmtN(S.activeDays)} active days · ${fmtK(S.wordsN)} words`, '💬')}
    ${statCard('Conversations', fmtN(D.messages.length), `${dms.length} DMs · ${D.messages.filter(c => c.type === 'GROUP_DM').length} groups`, '🗨️')}
    ${statCard('Servers', fmtN(Object.keys(D.servers?.index || {}).length), `${guildCounts.size} you've posted in`, '🏰')}
    ${statCard('Friends', fmtN(friends), `${rel.filter(r => r.type === 'BLOCKED').length} blocked · ${rel.length} relationships`, '👥')}
    ${statCard('Telemetry events', fmtK(A.unique_events || 0), `${Object.keys(A.types || {}).length} event types logged`, '📡')}
    ${statCard('Time in games', fmtDur(gameSecs), `${(U.user_activity_application_statistics || []).length} apps tracked`, '🎮')}
    ${statCard('Spotify plays', fmtN(A.spotify_plays || 0), `${fmtN(A.spotify_unique || 0)} unique tracks seen`, '🎧')}
    ${statCard('Orbs', fmtN(U.current_orbs_balance || 0), `${(D.ads?.['quests_user_status.json'] || []).length} quests enrolled`, '🔮')}
  </div>

  <div class="card mt"><h2>Messages over time <span class="sub">${first ? fmtDate(first[0]) + ' → ' + fmtDate(last[0]) : ''}</span></h2><div id="ov-tl"></div></div>

  <h2 class="mt2">Fun facts</h2>
  <div class="facts">
    ${first ? `<div class="fact"><div class="t">First message in the archive</div><div class="b">“${escH(first[1].slice(0, 80) || '[attachment]')}”</div><div class="s">${fmtDT(first[0])} · ${escH(chanLabel(first[3]) || '')}</div></div>` : ''}
    ${topDM ? `<div class="fact"><div class="t">Your #1 DM</div><div class="b">${escH(chanInfo(topDM).title)}</div><div class="s">${fmtN(topDM.messages.length)} messages from you</div></div>` : ''}
    ${topGuild ? `<div class="fact"><div class="t">Most active server</div><div class="b">${escH(guildName(topGuild[0]) || topGuild[0])}</div><div class="s">${fmtN(topGuild[1])} messages</div></div>` : ''}
    <div class="fact"><div class="t">Busiest day</div><div class="b">${fmtDate(Date.parse(S.busiest[0]), { weekday: 'long' })}</div><div class="s">${fmtN(S.busiest[1])} messages in one day</div></div>
    <div class="fact"><div class="t">Longest streak</div><div class="b">${S.best[0]} days in a row</div><div class="s">${S.best[1] ? fmtDate(Date.parse(S.best[1])) + ' → ' + fmtDate(Date.parse(S.best[2])) : ''}</div></div>
    <div class="fact"><div class="t">Peak hour</div><div class="b">${pad(peakHour)}:00 – ${pad(peakHour + 1)}:00</div><div class="s">${(S.night / Math.max(1, S.all.length) * 100).toFixed(1)}% of messages sent between midnight and 5am 🌙</div></div>
    ${topWord ? `<div class="fact"><div class="t">Favourite word</div><div class="b">“${escH(topWord[0])}”</div><div class="s">used ${fmtN(topWord[1])} times</div></div>` : ''}
    ${topEmoji ? `<div class="fact"><div class="t">Most typed emoji</div><div class="b" style="font-size:30px">${topEmoji[0]}</div><div class="s">${fmtN(topEmoji[1])} times${topCE ? ` · top custom: <img src="${emojiURL(topCE[0], topCE[1][1])}" style="width:20px;vertical-align:-5px"> :${escH(topCE[1][0])}: ×${topCE[1][2]}` : ''}</div></div>` : ''}
    ${A.reactions?.[0] ? `<div class="fact"><div class="t">Most used reaction</div><div class="b" style="font-size:30px">${escH(A.reactions[0][0])}</div><div class="s">${fmtN(A.reactions[0][1])} times · then ${A.reactions.slice(1, 6).map(r => escH(r[0])).join(' ')}</div></div>` : topReact ? `<div class="fact"><div class="t">Most used reaction</div><div class="b">${/^\d+$/.test(topReact[0]) ? `<img src="${emojiURL(topReact[0])}" style="width:30px">` : ':' + escH(topReact[0]) + ':'}</div><div class="s">${fmtN(topReact[1].totalUses)} reactions</div></div>` : ''}
    <div class="fact"><div class="t">Average message</div><div class="b">${(S.chars / Math.max(1, S.all.length)).toFixed(1)} characters</div><div class="s">longest: ${fmtN(S.longest?.[1].length)} chars on ${fmtDate(S.longest?.[0])}</div></div>
    ${S.exact[0] ? `<div class="fact"><div class="t">Thing you say most</div><div class="b">“${escH(S.exact[0][0])}”</div><div class="s">${fmtN(S.exact[0][1])} times, word for word</div></div>` : ''}
    ${topArtist ? `<div class="fact"><div class="t">Top artist (Spotify status)</div><div class="b">${escH(topArtist[0])}</div><div class="s">${fmtN(topArtist[1])} track updates</div></div>` : ''}
    ${A.msg?.attachment_bytes ? `<div class="fact"><div class="t">Uploaded (tracked)</div><div class="b">${fmtBytes(A.msg.attachment_bytes)}</div><div class="s">across ${fmtN(A.msg.attachments)} attachments</div></div>` : ''}
    <div class="fact"><div class="t">Discord knows</div><div class="b">${fmtN((A.cities || []).length)} cities · ${fmtN((A.ips || []).length)} IPs</div><div class="s">${fmtN((A.devices || []).length)} device/client combos seen</div></div>
  </div>

  <h2 class="mt2">Your Discord timeline</h2>
  <div class="card"><div id="ov-life"></div></div>`;

  afterRender(() => {
    const pts = fillGaps([...S.byMonth.entries()].map(([k, v]) => [+new Date(+k.slice(0, 4), +k.slice(5) - 1, 1), v]).sort((a, b) => a[0] - b[0]), 'month');
    areaChart($('#ov-tl'), [{ name: 'messages', points: pts }], { height: 220, labelFn: t => new Date(t).toLocaleDateString('en', { month: 'long', year: 'numeric' }) });
    // life timeline
    const ev = [];
    ev.push([created, '🎂', 'Account created', '@' + U.username]);
    if (first) ev.push([first[0], '💬', 'First message in your archive', chanLabel(first[3])]);
    Object.values(D.tickets || {}).forEach(t => ev.push([iso(t.created_at), '🛟', 'Support ticket #' + t.ticket_id, t.status]));
    (D.exports?.['discord_billing/payments']?.records || []).forEach(p => ev.push([iso(p.created_at), '💳', p.description || 'Payment', `${p.amount} ${p.currency}`]));
    (D.exports?.['discord_harvests/data_subject_access_requests']?.records || []).forEach(p => ev.push([iso(p.created_at), '📦', 'Requested your data package', '']));
    D.avatars.forEach(a => { const id = a.path.split('/').pop().split('.')[0]; ev.push([snow(id), '🖼️', 'Avatar change', `<img src="${escH(a.url)}" style="width:22px;height:22px;border-radius:50%;vertical-align:-6px">`, true]); });
    if (meta.boosting_started_at) ev.push([iso(meta.boosting_started_at), '🚀', 'Started boosting', '']);
    if (U.age_assurance?.verified_at) ev.push([iso(U.age_assurance.verified_at), '🪪', 'Age verified (' + U.age_assurance.method + ')', U.age_assurance.vendor]);
    (D.ads?.['quests_user_status.json'] || []).filter(q => q.completed_at).forEach(q => ev.push([iso(q.completed_at), '🏆', 'Quest completed', q.orb_quantity_claimed ? q.orb_quantity_claimed + ' orbs' : '']));
    const raw = ev.filter(e => e[0]).sort((a, b) => a[0] - b[0]);
    const kindOf = e => e[2].replace(/#.*|\(.*/, '').trim();
    const evs = [];
    for (let i = 0; i < raw.length;) {
      const y = new Date(raw[i][0]).getFullYear(), k = kindOf(raw[i]);
      let j = i; while (j < raw.length && new Date(raw[j][0]).getFullYear() === y && kindOf(raw[j]) === k && raw[j][1] === raw[i][1]) j++;
      if (j - i >= 3) evs.push([raw[i][0], raw[i][1], `${j - i}× ${k.replace(/^Support ticket$/, 'support tickets').replace(/^Avatar change$/, 'avatar changes').replace(/^Quest completed$/, 'quests completed')}`, escH(`${fmtDate(raw[i][0])} → ${fmtDate(raw[j - 1][0])}`) + (raw[i][4] ? ' ' + raw.slice(i, j).map(e => e[3]).join(' ') : ''), true]);
      else for (let x = i; x < j; x++) evs.push(raw[x]);
      i = j;
    }
    const y0 = new Date(evs[0][0]).getFullYear(), y1 = new Date().getFullYear();
    let h = '<div style="position:relative;padding-left:26px;border-left:2px solid rgba(124,108,255,.3);margin-left:8px">';
    let lastY = null;
    evs.forEach(e => {
      const y = new Date(e[0]).getFullYear();
      if (y !== lastY) { h += `<div style="margin:${lastY ? 18 : 0}px 0 8px -42px;font-weight:800;font-size:18px" class="grad-text">${y}</div>`; lastY = y; }
      h += `<div style="position:relative;margin:0 0 10px"><span style="position:absolute;left:-39px;top:0;width:24px;height:24px;border-radius:50%;background:#1d1b33;display:grid;place-items:center;font-size:12px;border:1px solid var(--line2)">${e[1]}</span><b>${escH(e[2])}</b> <span class="muted small">· ${fmtDate(e[0])}</span>${e[3] ? `<div class="dim small">${e[4] ? e[3] : escH(e[3])}</div>` : ''}</div>`;
    });
    $('#ov-life').innerHTML = h + '</div>';
  });
};

/* ================================================================== MESSAGES */
R.messages = (el, [tab = 'insights', a1, a2]) => {
  el.innerHTML = html`
  <div class="row" style="margin-bottom:8px"><div><h1>Messages</h1><p class="lead" style="margin:0">Every message you sent that's still in your package — ${fmtN(ALLMSG().length)} across ${fmtN(D.messages.length)} channels.</p></div><div class="spacer"></div>
  <div class="seg">${[['insights', '📊 Insights'], ['browse', '📜 Browse'], ['search', '🔎 Search']].map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" onclick="location.hash='#/messages/${k}'">${l}</button>`).join('')}</div></div>
  <div id="mtab" class="mt"></div>`;
  ({ insights: msgInsights, browse: msgBrowse, search: msgSearch }[tab] || msgInsights)($('#mtab'), a1, a2);
};

function msgInsights(el) {
  const S = MSTATS(), M = A.msg || {};
  const kinds = { dm: 0, group: 0, guild: 0, voice: 0, thread: 0 };
  D.messages.forEach(c => kinds[chanInfo(c).kind] += c.messages.length);
  const year = S.years[S.years.length - 1];
  el.innerHTML = html`
  <div class="grid g5">
    ${statCard('Messages', fmtN(S.all.length), 'in archive', '')}
    ${statCard('Words', fmtK(S.wordsN), `${(S.wordsN / Math.max(1, S.all.length)).toFixed(1)} per message`)}
    ${statCard('Characters', fmtK(S.chars), `≈ ${fmtN(Math.round(S.chars / 1800))} book pages`)}
    ${statCard('Attachments', fmtN(S.attach), `${fmtN(S.links)} links shared`)}
    ${statCard('Active days', fmtN(S.activeDays), `avg ${(S.all.length / Math.max(1, S.activeDays)).toFixed(1)} msgs/day`)}
  </div>
  <div class="card mt"><div class="row"><h2 style="margin:0">Activity calendar</h2><div class="spacer"></div><div class="seg" id="yrs">${S.years.map(y => `<button data-y="${y}" class="${y === year ? 'on' : ''}">${y}</button>`).join('')}</div></div><div id="cal" class="heat-wrap mt"></div><div class="dim tiny" id="calsum"></div></div>
  <div class="grid g2 mt">
    <div class="card"><h2>When you type <span class="sub">local time</span></h2><div id="heat" class="heat-wrap"></div></div>
    <div class="card"><h2>Hour of day</h2><div id="hours"></div></div>
  </div>
  <div class="grid g3 mt">
    <div class="card"><h2>Where you talk</h2><div id="kinds"></div></div>
    <div class="card"><h2>Message length</h2><div id="lens"></div><div class="dim tiny">characters (log scale buckets)</div></div>
    <div class="card"><h2>Weekday split</h2><div id="wd"></div></div>
  </div>
  <div class="card mt"><h2>Your vocabulary <span class="sub">top 150 words, stopwords removed</span></h2><div class="wordcloud" id="wc"></div></div>
  <div class="grid g3 mt">
    <div class="card"><h2>Top emoji</h2><div class="pill-list" style="font-size:24px;gap:10px">${S.emoji.slice(0, 40).map(([e, n]) => `<span title="${n}×" style="position:relative">${e}<sub class="dim" style="font-size:10px;margin-left:1px">${fmtK(n)}</sub></span>`).join('') || '<span class="dim">none</span>'}</div></div>
    <div class="card"><h2>Top custom emoji</h2><div class="pill-list" style="gap:10px">${S.cemoji.slice(0, 40).map(([id, [n, an, c]]) => `<span title=":${escH(n)}: ×${c}" class="row" style="gap:3px"><img src="${emojiURL(id, an)}" style="width:28px;height:28px" loading="lazy" onerror="this.replaceWith(':${escH(n)}:')"><sub class="dim" style="font-size:10px">${c}</sub></span>`).join('') || '<span class="dim">none</span>'}</div></div>
    <div class="card"><h2>People you @mention</h2>${hbars(S.mentions.slice(0, 10).map(([id, n]) => ({ label: userName(id) || 'user ' + id.slice(-5), value: n, icon: avatarHTML(userName(id) || id, userAvatarURL(USERS[id] ? { ...USERS[id], id } : null), 'sm') })))}</div>
  </div>
  <div class="grid g2 mt">
    <div class="card"><h2>Top channels</h2><div id="topch"></div></div>
    <div class="card"><h2>Links you share</h2>${hbars(S.domains.slice(0, 14).map(([d, n]) => ({ label: d, value: n })))}
      <h2 class="mt2">Copy-paste classics <span class="sub">exact repeats</span></h2>${hbars(S.exact.slice(0, 10).map(([t, n]) => ({ label: '“' + t + '”', value: n })))}</div>
  </div>
  ${M.count ? html`<div class="card mt"><h2>What analytics saw on send <span class="sub">from ${fmtN(M.count)} send_message events</span></h2>
    <div class="grid g4">
      ${[['Emoji (unicode)', M.emoji_unicode], ['Custom emoji', M.emoji_custom], ['Animated emoji', M.emoji_animated], ['Emoji-only messages', M.emoji_only], ['Mentions', M.mentions], ['@everyone pings', M.mention_everyone], ['Embeds', M.embeds], ['URLs', M.urls], ['Stickers', M.stickers], ['Spoilers', M.spoilers], ['Markdown', M.markdown], ['In private chats', M.private], ['First message in a chat', M.first_messages], ['Attachments', M.attachments], ['Uploaded', fmtBytes(M.attachment_bytes || 0)], ['Total characters', fmtK(M.length || 0)]].map(([k, v]) => `<div class="stat"><span class="k">${k}</span><span class="v" style="font-size:22px">${typeof v === 'number' ? fmtN(v) : v ?? 0}</span></div>`).join('')}
    </div>
    <div class="grid g2 mt"><div><h3>Attachment types</h3><div id="mimes"></div></div><div><h3>Code block languages</h3>${hbars((A.code_langs || []).slice(0, 10).map(([l, n]) => ({ label: l, value: n })))}</div></div>
  </div>` : ''}`;

  afterRender(() => {
    const drawCal = y => { calendarChart($('#cal'), S.byDay, y, { unit: 'messages', onClick: k => { location.hash = '#/messages/search/' + encodeURIComponent('date:' + k); } }); let n = 0; S.byDay.forEach((v, k) => k.startsWith(y + '-') && (n += v)); $('#calsum').textContent = `${fmtN(n)} messages in ${y} · click a day to read it`; };
    drawCal(year);
    $('#yrs').onclick = e => { const b = e.target.closest('button'); if (!b) return; $('#yrs').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); drawCal(+b.dataset.y); };
    heatmap($('#heat'), S.heat, { unit: 'messages' });
    columns($('#hours'), S.hours.map((v, h) => [pad(h), v, `${pad(h)}:00–${pad(h + 1)}:00`]), { unit: 'messages', color: (i) => i < 5 || i > 22 ? '#c062ff' : '#7c6cff' });
    donut($('#kinds'), [['Server channels', kinds.guild + kinds.voice + kinds.thread], ['Direct messages', kinds.dm], ['Group DMs', kinds.group]].filter(x => x[1]), { centerLabel: 'messages' });
    const lb = ['0', '1', '2-3', '4-7', '8-15', '16-31', '32-63', '64-127', '128-255', '256-511', '512-1k', '1k+'];
    columns($('#lens'), S.lenBuckets.map((v, i) => [lb[i], v]), { color: '#ff5fa2', unit: 'messages' });
    const wdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    columns($('#wd'), S.heat.map((r, i) => [wdays[i], r.reduce((a, b) => a + b, 0)]), { color: '#35d0ff', unit: 'messages' });
    const mx = S.words[0]?.[1] || 1;
    $('#wc').innerHTML = S.words.map(([w, n], i) => `<span title="${n}×" style="font-size:${12 + 26 * Math.sqrt(n / mx)}px;color:${PALETTE[i % 6]};opacity:${.55 + .45 * Math.sqrt(n / mx)}">${escH(w)}</span>`).join('');
    const top = D.messages.slice().sort((a, b) => b.messages.length - a.messages.length).slice(0, 15);
    $('#topch').innerHTML = hbars(top.map(c => { const i = chanInfo(c); return { label: i.kind === 'dm' || i.kind === 'group' ? i.title : `${i.title} · ${i.sub}`, value: c.messages.length, icon: avatarHTML(i.avatarName, i.img, 'sm' + (i.kind === 'dm' ? '' : ' sq')), onclick: `location.hash='#/messages/browse/${c.id}'` }; }));
    if ($('#mimes')) donut($('#mimes'), (A.mimetypes || []).slice(0, 8), { centerLabel: 'files', size: 140 });
  });
}

function msgBrowse(el, cid, mid) {
  const chans = D.messages;
  el.innerHTML = html`<div class="card flat"><div class="chat">
    <div class="list"><div class="top"><input class="search" id="cf" placeholder="Filter conversations…"><div class="seg" id="ck">${[['all', 'All'], ['dm', 'DMs'], ['group', 'Groups'], ['guild', 'Servers']].map(([k, l], i) => `<button data-k="${k}" class="${i ? '' : 'on'}">${l}</button>`).join('')}</div></div><div class="items" id="cl"></div></div>
    <div class="pane" id="cp"><div class="empty" style="margin:auto">Pick a conversation</div></div>
  </div></div>`;
  let kind = 'all';
  const drawList = () => {
    const q = $('#cf').value.toLowerCase();
    $('#cl').innerHTML = chans.filter(c => { const i = chanInfo(c); return (kind === 'all' || i.kind === kind || (kind === 'guild' && ['voice', 'thread'].includes(i.kind))) && (!q || (i.title + ' ' + i.sub).toLowerCase().includes(q)); })
      .map(c => { const i = chanInfo(c); return `<div class="chan ${c.id === cid ? 'on' : ''}" data-id="${c.id}">${avatarHTML(i.avatarName, i.img, i.kind === 'dm' ? '' : 'sq')}<div class="nm"><b>${escH(i.title)}</b><small>${escH(i.sub)}</small></div><span class="c">${fmtK(c.messages.length)}</span></div>`; }).join('') || '<div class="empty">No matches</div>';
  };
  $('#cf').oninput = drawList;
  $('#ck').onclick = e => { const b = e.target.closest('button'); if (!b) return; kind = b.dataset.k; $('#ck').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); drawList(); };
  $('#cl').onclick = e => { const c = e.target.closest('.chan'); if (c) { history.replaceState(null, '', '#/messages/browse/' + c.dataset.id); cid = c.dataset.id; drawList(); openChan(cid); } };
  drawList();
  if (cid) openChan(cid, mid); else if (chans[0]) { cid = chans[0].id; drawList(); openChan(cid); }
}
function openChan(cid, mid, q) {
  const c = CHANNELS[cid]; if (!c) return;
  const i = chanInfo(c), msgs = c.messages;
  const first = msgs[0], last = msgs[msgs.length - 1];
  const extra = c.type === 'DM' && c.other ? `<a class="btn" onclick="showUser('${c.other}')">Profile</a>` : c.guild_id ? `<a class="btn" onclick="showGuild('${c.guild_id}')">Server</a>` : '';
  $('#cp').innerHTML = html`<div class="head">${avatarHTML(i.avatarName, i.img, i.kind === 'dm' ? '' : 'sq')}<div style="flex:1;min-width:0"><b>${escH(i.title)}</b><div class="dim small">${escH(i.sub)} · ${plural(msgs.length, 'message')}${first ? ` · ${fmtDate(first[1] * 1000)} → ${fmtDate(last[1] * 1000)}` : ''}</div></div>
    <input class="search" style="width:200px" id="inq" placeholder="Search here…" value="${escH(q || '')}">${extra}<a class="btn" href="https://discord.com/channels/${c.guild_id || '@me'}/${c.id}" target="_blank" rel="noopener">Open in Discord ↗</a></div><div class="msgs" id="ms"></div>`;
  let start;
  const N = 300;
  const anchor = mid ? msgs.findIndex(m => m[0] === mid) : -1;
  start = anchor >= 0 ? Math.max(0, anchor - 150) : Math.max(0, msgs.length - N);
  let end = anchor >= 0 ? Math.min(msgs.length, anchor + 150) : msgs.length;
  const ms = $('#ms');
  const draw = (keepScroll) => {
    const before = ms.scrollHeight - ms.scrollTop;
    const query = $('#inq').value.trim();
    const list = query ? msgs.filter(m => m[2].toLowerCase().includes(query.toLowerCase())) : msgs.slice(start, end);
    let h = '', lastDay = '', lastT = 0;
    if (!query && start > 0) h += `<div style="text-align:center;margin:10px"><button class="btn" id="older">Load older (${fmtN(start)} more)</button></div>`;
    for (const m of list) {
      const t = m[1] * 1000, d = new Date(t), dk = dayKey(d);
      if (dk !== lastDay) { h += `<div class="day-sep">${d.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>`; lastDay = dk; lastT = 0; }
      const firstOf = t - lastT > 7 * 60e3; lastT = t;
      h += `<div class="msg ${firstOf ? 'first' : ''} ${m[0] === mid ? 'hl' : ''}" id="m${m[0]}" title="${fmtDT(t)}"><span class="tm">${fmtTime(t)}</span><div class="ct">${renderContent(m[2], query)}${renderAttachments(m[3])}</div></div>`;
    }
    if (!query && end < msgs.length) h += `<div style="text-align:center;margin:10px"><button class="btn" id="newer">Load newer (${fmtN(msgs.length - end)} more)</button></div>`;
    if (query && !list.length) h += '<div class="empty">No messages match</div>';
    ms.innerHTML = h;
    $('#older') && ($('#older').onclick = () => { start = Math.max(0, start - N); draw(true); });
    $('#newer') && ($('#newer').onclick = () => { end = Math.min(msgs.length, end + N); draw(false); ms.scrollTop = ms.scrollTop; });
    if (keepScroll) ms.scrollTop = ms.scrollHeight - before;
  };
  draw();
  if (anchor >= 0) afterRender(() => $('#m' + mid)?.scrollIntoView({ block: 'center' })); else ms.scrollTop = ms.scrollHeight;
  let tmo; $('#inq').oninput = () => { clearTimeout(tmo); tmo = setTimeout(() => draw(), 200); };
}

function msgSearch(el, q0 = '') {
  el.innerHTML = html`<div class="card"><input class="search" id="sq" placeholder="Search all ${fmtN(ALLMSG().length)} messages…  (tip: date:2024-03-13, from a channel name with in:name)" value="${escH(q0)}" autofocus><div class="row mt small muted"><span id="sc"></span><div class="spacer"></div><label><input type="checkbox" id="sre"> regex</label></div></div><div class="card mt flat"><div id="sr" class="msgs" style="max-height:none"></div></div>`;
  const run = () => {
    let q = $('#sq').value.trim();
    if (!q) { $('#sr').innerHTML = '<div class="empty">Type something to search</div>'; $('#sc').textContent = ''; return; }
    let date = null, inn = null;
    q = q.replace(/date:(\S+)/, (_, d) => (date = d, '')).replace(/in:(\S+)/, (_, d) => (inn = d.toLowerCase(), '')).trim();
    let test;
    if ($('#sre').checked) { try { const re = new RegExp(q, 'i'); test = s => re.test(s); } catch { return; } } else { const ql = q.toLowerCase(); test = s => s.toLowerCase().includes(ql); }
    const res = [];
    for (const m of ALLMSG()) {
      if (date && !dayKey(new Date(m[0])).startsWith(date)) continue;
      if (inn && !(chanLabel(m[3]) || '').toLowerCase().includes(inn)) continue;
      if (q && !test(m[1])) continue;
      res.push(m);
    }
    $('#sc').textContent = `${fmtN(res.length)} results${res.length > 600 ? ' · showing newest 600' : ''}`;
    $('#sr').innerHTML = res.slice(-600).reverse().map(m => { const c = CHANNELS[m[3]], i = chanInfo(c); return `<div class="msg first" style="cursor:pointer;padding:8px 20px 8px 0" onclick="location.hash='#/messages/browse/${m[3]}/${m[4]}'"><span class="tm" style="opacity:1">${avatarHTML(i.avatarName, i.img, 'sm' + (i.kind === 'dm' ? '' : ' sq'))}</span><div class="ct"><div class="dim tiny">${escH(i.kind === 'dm' || i.kind === 'group' ? i.title : i.title + ' · ' + i.sub)} · ${fmtDT(m[0])}</div>${renderContent(m[1], $('#sre').checked ? '' : q)}${renderAttachments(m[2])}</div></div>`; }).join('') || '<div class="empty">Nothing found</div>';
  };
  let t; $('#sq').oninput = () => { clearTimeout(t); t = setTimeout(run, 220); }; $('#sre').onchange = run;
  run();
}

/* ================================================================== PEOPLE */
window.showUser = id => {
  const u = USERS[id] || { id, name: 'Unknown user' };
  const dm = D.messages.find(c => c.type === 'DM' && (c.recipients || []).includes(id));
  const groups = D.messages.filter(c => c.type === 'GROUP_DM' && (c.recipients || []).includes(id));
  const mentioned = MSTATS().mentions.find(m => m[0] === id)?.[1] || 0;
  openModal(html`<div class="row" style="gap:18px">${avatarHTML(u.name, userAvatarURL(u.avatar ? { ...u, id } : null), 'lg')}<div><h1 style="font-size:24px">${escH(u.name)}</h1><div class="muted">@${escH(u.username || '?')} · ${escH(u.rel || 'not a friend')}</div></div></div>
    <dl class="kv mt2"><dt>User ID</dt><dd class="mono">${id}</dd><dt>Their account created</dt><dd>${fmtDate(snow(id))} (${ago(snow(id))})</dd>${u.nickname ? `<dt>Your nickname for them</dt><dd>${escH(u.nickname)}</dd>` : ''}
    <dt>DM messages from you</dt><dd>${dm ? `${fmtN(dm.messages.length)} · <a href="#/messages/browse/${dm.id}" onclick="closeModal()">open chat</a>` : '–'}</dd><dt>Shared group DMs</dt><dd>${groups.map(g => `<a href="#/messages/browse/${g.id}" onclick="closeModal()">${escH(chanInfo(g).title)}</a>`).join(', ') || '–'}</dd><dt>You mentioned them</dt><dd>${fmtN(mentioned)} times</dd>
    ${dm?.messages.length ? `<dt>First DM</dt><dd>${fmtDT(dm.messages[0][1] * 1000)}</dd><dt>Last DM</dt><dd>${fmtDT(dm.messages[dm.messages.length - 1][1] * 1000)}</dd>` : ''}</dl>
    <h3 class="mt2">Raw relationship</h3><pre class="json">${escH(JSON.stringify((U.relationships || []).find(r => r.id === id) || {}, null, 2))}</pre>`);
};
R.people = el => {
  const rel = U.relationships || [];
  const dmCount = {};
  D.messages.filter(c => c.type === 'DM').forEach(c => { const o = (c.recipients || []).find(r => r !== ME); if (o) dmCount[o] = (dmCount[o] || 0) + c.messages.length; });
  const dmsUnknown = D.messages.filter(c => c.type === 'DM' && !USERS[c.other]);
  const groups = { FRIEND: [], BLOCKED: [], OTHER: [] };
  rel.forEach(r => (groups[r.type] || groups.OTHER).push(r));
  const tile = r => { const u = USERS[r.id]; return `<div class="tile" onclick="showUser('${r.id}')">${avatarHTML(u.name, userAvatarURL(u.avatar ? { ...u, id: r.id } : null))}<div class="nm"><b>${escH(u.name)}</b><small>@${escH(u.username)}${dmCount[r.id] ? ` · ${fmtK(dmCount[r.id])} msgs` : ''}</small></div></div>`; };
  const sortByMsgs = arr => arr.sort((a, b) => (dmCount[b.id] || 0) - (dmCount[a.id] || 0));
  const topDMs = D.messages.filter(c => c.type === 'DM' || c.type === 'GROUP_DM').sort((a, b) => b.messages.length - a.messages.length).slice(0, 15);
  const ext = U.external_friends_lists || [];
  el.innerHTML = html`<h1>People</h1><p class="lead">Your friends list, blocks, DMs — and who you talk to the most.</p>
  <div class="grid g4">${statCard('Friends', fmtN(groups.FRIEND.length), '', '💜')}${statCard('Blocked', fmtN(groups.BLOCKED.length), '', '🚫')}${statCard('DM channels', fmtN(D.messages.filter(c => c.type === 'DM').length), `${dmsUnknown.length} with non-friends`, '✉️')}${statCard('Contact-synced lists', fmtN(ext.length), `${fmtN(ext.reduce((a, e) => a + (e.friend_id_hashes || []).length, 0))} hashed contacts`, '📇')}</div>
  <div class="grid g2 mt"><div class="card"><h2>Top conversations</h2>${hbars(topDMs.map(c => { const i = chanInfo(c); return { label: i.title, value: c.messages.length, icon: avatarHTML(i.avatarName, i.img, 'sm'), onclick: `location.hash='#/messages/browse/${c.id}'` }; }))}</div>
  <div class="card"><h2>DM relationships over time <span class="sub">your messages per month, top 5</span></h2><div id="dmtl"></div><div class="legend" id="dmleg"></div></div></div>
  <h2 class="mt2">Friends <span class="sub">${groups.FRIEND.length}</span></h2><div class="tiles">${sortByMsgs(groups.FRIEND).map(tile).join('')}</div>
  ${groups.BLOCKED.length ? `<h2 class="mt2">Blocked <span class="sub">${groups.BLOCKED.length}</span></h2><div class="tiles">${groups.BLOCKED.map(tile).join('')}</div>` : ''}
  ${groups.OTHER.length ? `<h2 class="mt2">Other relationships <span class="sub">pending / implicit</span></h2><div class="tiles">${groups.OTHER.map(tile).join('')}</div>` : ''}
  <h2 class="mt2">Other people you DM'd <span class="sub">not in your relationships</span></h2><div class="tiles">${dmsUnknown.sort((a, b) => b.messages.length - a.messages.length).map(c => { const i = chanInfo(c); return `<div class="tile" onclick="location.hash='#/messages/browse/${c.id}'">${avatarHTML(i.title, null)}<div class="nm"><b>${escH(i.title)}</b><small>${fmtN(c.messages.length)} msgs · since ${fmtDate(c.messages[0]?.[1] * 1000)}</small></div></div>`; }).join('')}</div>
  ${(U.friend_suggestions || []).length ? `<div class="card mt"><h2>Friend suggestions</h2><pre class="json">${escH(JSON.stringify(U.friend_suggestions, null, 2))}</pre></div>` : ''}
  ${ext.length ? `<div class="card mt"><h2>External friend lists <span class="sub">from contact sync</span></h2>${tableHTML(['Platform', 'Name', 'Hashed contacts'], ext.map(e => [escH(e.platform_type), escH(e.name || '–'), fmtN((e.friend_id_hashes || []).length)]))}<p class="dim small mt">Discord stores hashes of your phone contacts to suggest friends.</p></div>` : ''}`;
  afterRender(() => {
    const top = D.messages.filter(c => c.type === 'DM' || c.type === 'GROUP_DM').sort((a, b) => b.messages.length - a.messages.length).slice(0, 5);
    const allMonths = new Set(); const per = top.map(c => { const m = new Map(); c.messages.forEach(x => { const d = new Date(x[1] * 1000); const k = +new Date(d.getFullYear(), d.getMonth(), 1); m.set(k, (m.get(k) || 0) + 1); allMonths.add(k); }); return m; });
    const months = [...allMonths].sort((a, b) => a - b); if (!months.length) return;
    const full = fillGaps(months.map(m => [m, 0]), 'month').map(p => p[0]);
    areaChart($('#dmtl'), top.map((c, i) => ({ name: chanInfo(c).title, color: PALETTE[i], points: full.map(t => [t, per[i].get(t) || 0]) })), { height: 220, labelFn: t => new Date(t).toLocaleDateString('en', { month: 'long', year: 'numeric' }) });
    $('#dmleg').innerHTML = top.map((c, i) => `<span><i style="background:${PALETTE[i]}"></i>${escH(chanInfo(c).title)}</span>`).join('');
  });
};

/* ================================================================== SERVERS */
const GS = memo(() => {
  const s = {};
  (U.guild_settings || []).forEach(g => s[g.guild_id] = g);
  return s;
});
window.showGuild = id => {
  const g = GUILDS[id] || { id };
  const chans = D.messages.filter(c => c.guild_id === id).sort((a, b) => b.messages.length - a.messages.length);
  const gs = GS()[id];
  const views = (A.guild_views || []).find(v => v[0] === id)?.[1] || 0;
  const voice = (A.voice_guilds || []).find(v => v[0] === id)?.[1] || 0;
  const al = g.audit_log || [];
  const total = chans.reduce((a, c) => a + c.messages.length, 0);
  const emojiFiles = g.emoji_files || {};
  const folder = (U.settings?.settings?.guildFolders?.folders || []).find(f => (f.guildIds || []).includes(id));
  openModal(html`<div class="row" style="gap:18px">${avatarHTML(g.name || id, g.icon, 'lg sq')}<div style="flex:1"><h1 style="font-size:24px">${escH(g.name || 'Unknown server')}</h1><div class="muted small">created ${fmtDate(snow(id))} · ${g.left ? 'you are no longer a member' : 'member'}${folder?.name ? ' · folder: ' + escH(folder.name) : ''}</div></div><a class="btn" href="https://discord.com/channels/${id}" target="_blank" rel="noopener">Open ↗</a></div>
  <div class="grid g4 mt2">${statCard('Your messages', fmtN(total))}${statCard('Channels used', fmtN(chans.length))}${statCard('Channel opens', fmtN(views), 'tracked')}${statCard('Voice events', fmtN(voice), 'tracked')}</div>
  ${(g.images || []).length ? `<div class="row mt">${g.images.map(i => `<img src="${i}" style="max-height:120px;border-radius:12px">`).join('')}</div>` : ''}
  ${chans.length ? `<h3 class="mt2">Channels you posted in</h3>${hbars(chans.map(c => ({ label: chanInfo(c).title, value: c.messages.length, onclick: `closeModal();location.hash='#/messages/browse/${c.id}'` })))}` : ''}
  ${Object.keys(emojiFiles).length ? `<h3 class="mt2">Emoji (${Object.keys(emojiFiles).length})</h3><div class="emojigrid">${Object.entries(emojiFiles).map(([eid, p]) => { const e = (g.emoji || []).find(x => x.id === eid); return `<img src="${p}" title="${escH(e?.name || eid)}">`; }).join('')}</div>` : ''}
  ${(g.channels || []).length ? `<h3 class="mt2">Channels (${g.channels.length})</h3>${tableHTML(['Name', 'Type', 'ID'], g.channels.map(c => [escH(c.name), escH(c.type), `<span class="mono">${c.id}</span>`]), { h: 260 })}` : ''}
  ${(g.webhooks || []).length ? `<h3 class="mt2">Webhooks</h3>${tableHTML(['', 'Name', 'Channel', 'ID'], g.webhooks.map(w => [g.webhook_files?.[w.avatar] ? `<img src="${g.webhook_files[w.avatar]}" class="ava sm">` : '', escH(w.name), `<span class="mono">${w.channel_id || ''}</span>`, `<span class="mono">${w.id}</span>`]))}` : ''}
  ${al.length ? `<h3 class="mt2">Audit log entries by you (${al.length})</h3>${tableHTML(['When', 'Action', 'Target / changes'], al.map(a => [fmtDT(snow(a.id)), auditAction(a.action_type), `<span class="mono tiny">${escH(JSON.stringify(a.changes || a.options || a.target_id || '').slice(0, 300))}</span>`]), { h: 300 })}` : ''}
  ${gs ? `<h3 class="mt2">Your notification settings</h3><div class="pill-list">${gs.muted ? '<span class="chip r">🔕 muted</span>' : '<span class="chip g">🔔 not muted</span>'}<span class="chip">notify: ${['all messages', 'only @mentions', 'nothing', 'default'][gs.message_notifications] ?? gs.message_notifications}</span>${gs.suppress_everyone ? '<span class="chip">suppress @everyone</span>' : ''}${gs.suppress_roles ? '<span class="chip">suppress roles</span>' : ''}${gs.mobile_push ? '<span class="chip">mobile push</span>' : ''}<span class="chip">${(gs.channel_overrides || []).length} channel overrides</span></div>` : ''}
  <details class="mt2"><summary class="muted" style="cursor:pointer">Raw server data</summary><pre class="json mt">${escH(JSON.stringify({ ...g, guild_settings: gs }, null, 2))}</pre></details>`);
};
const AUDIT = { 1: 'Server update', 10: 'Channel create', 11: 'Channel update', 12: 'Channel delete', 13: 'Permission create', 14: 'Permission update', 15: 'Permission delete', 20: 'Kick', 21: 'Prune', 22: 'Ban', 23: 'Unban', 24: 'Member update', 25: 'Member role update', 26: 'Member move', 27: 'Member disconnect', 28: 'Bot add', 30: 'Role create', 31: 'Role update', 32: 'Role delete', 40: 'Invite create', 41: 'Invite update', 42: 'Invite delete', 50: 'Webhook create', 51: 'Webhook update', 52: 'Webhook delete', 60: 'Emoji create', 61: 'Emoji update', 62: 'Emoji delete', 72: 'Message delete', 73: 'Bulk delete', 74: 'Pin', 75: 'Unpin', 80: 'Integration create', 90: 'Sticker create', 100: 'Event create', 110: 'Thread create', 111: 'Thread update', 121: 'Command permission update', 140: 'AutoMod rule create', 143: 'AutoMod block' };
const auditAction = t => AUDIT[t] ? `${AUDIT[t]} <span class="dim">(${t})</span>` : `Action ${t}`;
R.servers = el => {
  const counts = {};
  D.messages.forEach(c => c.guild_id && (counts[c.guild_id] = (counts[c.guild_id] || 0) + c.messages.length));
  const views = Object.fromEntries(A.guild_views || []);
  const gs = GS();
  const ids = Object.keys(GUILDS);
  const member = ids.filter(id => D.servers.index?.[id]);
  const left = ids.filter(id => !D.servers.index?.[id]);
  const sorter = (a, b) => (counts[b] || 0) - (counts[a] || 0) || (views[b] || 0) - (views[a] || 0);
  const tile = id => { const g = GUILDS[id]; return `<div class="tile" onclick="showGuild('${id}')">${avatarHTML(g.name || id, g.icon, 'sq')}<div class="nm"><b>${escH(g.name || 'Unknown server')}</b><small>${counts[id] ? fmtN(counts[id]) + ' msgs' : 'no messages'}${views[id] ? ' · ' + fmtK(views[id]) + ' opens' : ''}${gs[id]?.muted ? ' · 🔕' : ''}</small></div></div>`; };
  const folders = U.settings?.settings?.guildFolders?.folders || [];
  const al = (D.servers.servers || []).reduce((a, s) => a + (s.audit_log || []).length, 0);
  el.innerHTML = html`<h1>Servers</h1><p class="lead">Every server in your package, ranked by how much you actually talk there.</p>
  <div class="grid g4">${statCard('Member of', fmtN(member.length), '', '🏰')}${statCard('Past servers', fmtN(left.length), 'only known from old messages', '👻')}${statCard('Muted', fmtN(Object.values(gs).filter(g => g.muted).length), `${Object.keys(gs).length} with custom settings`, '🔕')}${statCard('Your audit log actions', fmtN(al), `in ${(D.servers.servers || []).filter(s => (s.audit_log || []).length).length} servers`, '🛠️')}</div>
  <div class="grid g2 mt"><div class="card"><h2>Messages per server</h2>${hbars(member.concat(left).filter(id => counts[id]).sort(sorter).slice(0, 15).map(id => ({ label: guildName(id) || id, value: counts[id], icon: avatarHTML(guildName(id) || id, guildIcon(id), 'sm sq'), onclick: `showGuild('${id}')` })))}</div>
  <div class="card"><h2>Most opened <span class="sub">channel_opened telemetry</span></h2>${hbars((A.guild_views || []).filter(v => GUILDS[v[0]] || true).slice(0, 15).map(([id, n]) => ({ label: guildName(id) || 'Server ' + id, value: n, icon: avatarHTML(guildName(id) || id, guildIcon(id), 'sm sq'), onclick: `showGuild('${id}')` })))}</div></div>
  ${folders.length ? `<div class="card mt"><h2>Your server sidebar <span class="sub">guild folders, in order</span></h2><div class="row" style="align-items:flex-start;gap:10px">${folders.map(f => { const col = f.color ? '#' + Number(f.color).toString(16).padStart(6, '0') : null; return `<div style="${f.guildIds.length > 1 ? `padding:6px;border-radius:16px;background:${col ? col + '22' : 'rgba(255,255,255,.05)'};border:1px solid ${col || 'var(--line)'};max-width:100%` : ''};display:flex;flex-wrap:wrap;gap:6px;align-items:center" title="${escH(f.name || '')}">${f.guildIds.length > 1 ? `<span class="tiny muted" style="width:100%;padding:0 4px">📁 ${escH(f.name || 'Folder')} · ${f.guildIds.length}</span>` : ''}${f.guildIds.map(id => `<span onclick="showGuild('${id}')" style="cursor:pointer" title="${escH(guildName(id) || id)}">${avatarHTML(guildName(id) || id, guildIcon(id), 'sq')}</span>`).join('')}</div>`; }).join('')}</div></div>` : ''}
  <h2 class="mt2">Current servers <span class="sub">${member.length}</span></h2><div class="tiles">${member.sort(sorter).map(tile).join('')}</div>
  ${left.length ? `<h2 class="mt2">Servers you've left <span class="sub">${left.length}</span></h2><div class="tiles">${left.sort(sorter).map(tile).join('')}</div>` : ''}`;
};

/* ================================================================== TELEMETRY */
const noTelemetry = (el, title) => { el.innerHTML = `<h1>${title}</h1><div class="card mt"><div class="empty"><div style="font-size:40px">📡</div><h2 style="justify-content:center">Telemetry wasn't scanned</h2><p class="muted">This report was built without the Activity folder (or your package doesn't have one — e.g. if you opted out of analytics in Discord's privacy settings).<br>Use <b>↺ Load another package</b> in the sidebar and keep “Include telemetry scan” checked.</p></div></div>`; };
R.activity = (el, [sel]) => {
  if (!A.types || !Object.keys(A.types).length) return noTelemetry(el, 'Telemetry');
  const types = Object.entries(A.types || {}).sort((a, b) => b[1].n - a[1].n);
  const files = A.files || {};
  const catInfo = { analytics: 'Product analytics: what you click, open and do in the app', modeling: 'Data used to train recommendation / ranking models', reporting: 'Business reporting and metrics', tns: 'Trust & Safety: used to fight spam, abuse and fraud' };
  const totalRaw = Object.values(files).reduce((a, f) => a + f.raw, 0);
  el.innerHTML = html`<h1>Telemetry</h1><p class="lead">Discord logged <b class="grad-text">${fmtN(A.unique_events)}</b> unique events about you, in ${types.length} different event types. Here's all of it.</p>
  <div class="grid g4">${Object.entries(files).map(([k, f]) => statCard(k, fmtK(f.raw), `${fmtBytes(f.bytes)} · ${escH(catInfo[k] || '')}`)).join('')}</div>
  <div class="card mt"><div class="row"><h2 style="margin:0">Events per week</h2><div class="spacer"></div><div class="seg" id="tlm"><button class="on" data-m="all">All</button><button data-m="cats">By category</button><button data-m="msg">Messages vs notifications</button></div></div><div id="tl" class="mt"></div><div class="legend" id="tlleg"></div></div>
  <div class="grid g2 mt"><div class="card"><h2>When Discord sees you <span class="sub">all events, local time</span></h2><div id="eh" class="heat-wrap"></div></div><div class="card"><h2>Session stuff</h2>${hbars([...Object.entries(A.sessions || {}), ...(A.opened_from || []).map(([k, v]) => ['app opened from: ' + k, v])].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: k, value: v })), { rank: false })}</div></div>
  <div class="grid g3 mt">
    <div class="card"><h2>Profile actions</h2>${hbars((A.profile_actions || []).map(([k, v]) => ({ label: k, value: v })))}</div>
    <div class="card"><h2>Status changes</h2>${hbars((A.statuses || []).map(([k, v]) => ({ label: k, value: v })))}<h2 class="mt2">Themes at launch</h2>${hbars((A.themes || []).map(([k, v]) => ({ label: k, value: v })))}</div>
    <div class="card"><h2>Experiments you were in <span class="sub">${fmtN(A.experiments_total)}</span></h2><div style="max-height:330px;overflow:auto">${hbars((A.experiments || []).slice(0, 80).map(([k, v]) => ({ label: k, value: v })))}</div></div>
  </div>
  ${(A.searches || []).length || (A.slash || []).length ? `<div class="grid g2 mt"><div class="card"><h2>Searches</h2>${hbars((A.searches || []).slice(0, 20).map(([k, v]) => ({ label: k, value: v })))}</div><div class="card"><h2>Slash commands</h2>${hbars((A.slash || []).slice(0, 20).map(([k, v]) => ({ label: k, value: v })))}</div></div>` : ''}
  <div class="card mt"><div class="row"><h2 style="margin:0">Event explorer</h2><div class="spacer"></div><input class="search" id="ef" style="max-width:300px" placeholder="Filter ${types.length} event types…"></div>
    <div class="grid mt" style="grid-template-columns:minmax(0,1fr) minmax(0,1.3fr);gap:18px"><div id="el" style="max-height:640px;overflow:auto;padding-right:6px"></div><div id="ed"></div></div></div>
  ${A.ad_traits_event && Object.keys(A.ad_traits_event).length ? `<div class="card mt"><h2>Ad targeting snapshot <span class="sub">from an ad_request_user_traits event</span></h2><div class="tree" id="adt"></div></div>` : ''}`;

  const max = types[0]?.[1].n || 1;
  const drawList = () => {
    const q = $('#ef').value.toLowerCase();
    $('#el').innerHTML = '<div class="bars">' + types.filter(([k]) => k.toLowerCase().includes(q)).map(([k, t], i) => `<div class="bar click" data-k="${escH(k)}" style="${k === sel ? 'background:rgba(124,108,255,.12);border-radius:8px' : ''}"><div class="l"><span class="rank">${i + 1}</span><span class="mono" style="overflow:hidden;text-overflow:ellipsis">${escH(k)}</span></div><div class="r">${fmtN(t.n)}</div><div class="t"><i style="width:${Math.max(.5, t.n / max * 100)}%"></i></div></div>`).join('') + '</div>';
  };
  const drawDetail = k => {
    const t = A.types[k]; if (!t) { $('#ed').innerHTML = '<div class="empty">Select an event type to see what it contains</div>'; return; }
    $('#ed').innerHTML = html`<h2 class="mono" style="font-size:15px">${escH(k)}</h2><dl class="kv"><dt>Unique events</dt><dd>${fmtN(t.n)}</dd><dt>First seen</dt><dd>${fmtDT(iso(t.first))}</dd><dt>Last seen</dt><dd>${fmtDT(iso(t.last))}</dd><dt>Found in</dt><dd>${Object.entries(t.cats).map(([c, n]) => `<span class="chip">${c} ${fmtK(n)}</span>`).join(' ')}</dd><dt>Fields (${t.keys.length})</dt><dd class="mono tiny muted">${t.keys.map(escH).join(', ')}</dd></dl><h3 class="mt">Sample event</h3><div class="tree" id="es"></div>`;
    jsonTree($('#es'), t.sample, true);
  };
  $('#ef').oninput = drawList;
  $('#el').onclick = e => { const b = e.target.closest('.bar'); if (b) { sel = b.dataset.k; history.replaceState(null, '', '#/activity/' + encodeURIComponent(sel)); drawList(); drawDetail(sel); } };
  drawList(); drawDetail(sel || types[0]?.[0]);
  if ($('#adt')) jsonTree($('#adt'), A.ad_traits_event, true);

  afterRender(() => {
    const draw = mode => {
      let series;
      if (mode === 'cats') series = Object.entries(A.hourly_cat || {}).map(([c, arr], i) => ({ name: c, color: PALETTE[i], points: hourlyToDaily(arr, 'week') }));
      else if (mode === 'msg') series = [{ name: 'send_message', color: PALETTE[1], points: hourlyToDaily(A.hourly_msg, 'week') }, { name: 'notifications', color: PALETTE[2], points: hourlyToDaily(A.hourly_notif, 'week') }];
      else series = [{ name: 'events', points: hourlyToDaily(A.hourly, 'week') }];
      // align series to common buckets
      const keys = [...new Set(series.flatMap(s => s.points.map(p => p[0])))].sort((a, b) => a - b);
      const full = fillGaps(keys.map(k => [k, 0]), 'week').map(p => p[0]);
      series.forEach(s => { const m = new Map(s.points); s.points = full.map(k => [k, m.get(k) || 0]); });
      areaChart($('#tl'), series, { height: 240, labelFn: t => 'Week of ' + fmtDate(t) });
      $('#tlleg').innerHTML = series.length > 1 ? series.map(s => `<span><i style="background:${s.color}"></i>${s.name}</span>`).join('') : '';
    };
    draw('all');
    $('#tlm').onclick = e => { const b = e.target.closest('button'); if (!b) return; $('#tlm').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); draw(b.dataset.m); };
    heatmap($('#eh'), hourlyHeat(A.hourly), { unit: 'events', color: [53, 208, 255] });
  });
};

/* ================================================================== PLACES & DEVICES */
R.places = el => {
  if (!A.types || !Object.keys(A.types).length) return noTelemetry(el, 'Places & Devices');
  const cities = (A.cities || []).filter(c => c[0][0] && c[0][0] !== 'null');
  const byFirst = cities.slice().filter(c => c[2]).sort((a, b) => (a[2] < b[2] ? -1 : 1));
  const dev = A.devices || [];
  el.innerHTML = html`<h1>Places & Devices</h1><p class="lead">Every event carries a rough location (from your IP), ISP, OS and client. This is what that adds up to.</p>
  <div class="grid g4">${statCard('Cities', fmtN(cities.length), `${(A.countries || []).length} countries`, '🏙️')}${statCard('IP addresses', fmtN((A.ips || []).length), 'seen in Trust & Safety logs', '🌐')}${statCard('ISPs', fmtN((A.isps || []).length), '', '📶')}${statCard('Device combos', fmtN(dev.length), `${(A.os || []).length} OS versions`, '📱')}</div>
  <div class="grid g2 mt"><div class="card"><h2>Top cities</h2>${hbars(cities.slice(0, 15).map(([[c, r, cc], n, f, l]) => ({ label: `${c}${r ? ', ' + r : ''} · ${cc}`, value: n, title: `first ${fmtDate(iso(f))}, last ${fmtDate(iso(l))}` })))}</div>
  <div class="card"><h2>Countries</h2><div id="cty"></div><h2 class="mt2">Internet providers</h2>${hbars((A.isps || []).slice(0, 8).map(([k, n]) => ({ label: k, value: n })))}</div></div>
  <div class="card mt"><h2>Where you've been <span class="sub">cities ordered by first appearance</span></h2><div id="travel"></div></div>
  <div class="card mt"><h2>All locations</h2>${tableHTML(['City', 'Region', 'Country', 'Events', 'First seen', 'Last seen'], cities.map(([[c, r, cc], n, f, l]) => [escH(c), escH(r), escH(cc), fmtN(n), fmtDate(iso(f)), fmtDate(iso(l))]), { h: 380 })}</div>
  <div class="grid g2 mt"><div class="card"><h2>Platforms</h2><div id="brw"></div></div><div class="card"><h2>Operating systems</h2>${hbars((A.os || []).slice(0, 12).map(([k, n]) => ({ label: k, value: n })))}</div></div>
  <div class="card mt"><h2>Devices & clients <span class="sub">OS · client · model</span></h2>${tableHTML(['OS', 'Client', 'Device', 'Events', 'First seen', 'Last seen'], dev.map(([k, n, f, l]) => { const [o, b, d] = k.split('|'); return [escH(o), escH(b), escH(d || '–'), fmtN(n), fmtDate(iso(f)), fmtDate(iso(l))]; }), { h: 380 })}</div>
  <div class="card mt"><h2>IP addresses <span class="sub">hover to reveal in streamer mode</span></h2>${tableHTML(['IP', 'Location', 'Events', 'First seen', 'Last seen'], (A.ips || []).map(([ip, n, f, l, c]) => [sens(ip), escH(c || ''), fmtN(n), fmtDT(iso(f)), fmtDT(iso(l))]), { h: 380 })}</div>
  <div class="grid g3 mt"><div class="card"><h2>Client versions</h2><div style="max-height:300px;overflow:auto">${hbars((A.clients || []).slice(0, 40).map(([k, n]) => ({ label: k, value: n })))}</div></div><div class="card"><h2>System locales</h2>${hbars((A.locales || []).map(([k, n]) => ({ label: k, value: n })))}<h2 class="mt2">Languages</h2>${hbars((A.languages || []).map(([k, n]) => ({ label: k, value: n })))}</div><div class="card"><h2>Time zones</h2>${hbars((A.timezones || []).map(([k, n]) => ({ label: k, value: n })))}</div></div>
  <div class="card mt"><h2>Login sessions <span class="sub">from your account record</span></h2>${tableHTML(['Created', 'Last used', 'Expires', 'OS', 'Client', 'IP', 'MFA'], (U.user_sessions || []).map(s => { const d = s.user_data || {}; const ci = d.client_info || {}; return [fmtDT(iso(d.creation_time)), fmtDT(iso(d.approx_last_used_time)), fmtDate(iso(d.expiration_time)), escH(ci.os || ''), escH(ci.platform || ''), sens(ci.ip || ''), d.is_mfa ? '✅' : '–']; }).sort((a, b) => 0))}</div>`;
  afterRender(() => {
    donut($('#cty'), (A.countries || []).slice(0, 8), { centerLabel: 'events', size: 140 });
    donut($('#brw'), (A.browsers || []).slice(0, 8), { centerLabel: 'events' });
    const span = byFirst.length ? [iso(byFirst[0][2]), Date.now()] : [0, 1];
    $('#travel').innerHTML = `<div style="position:relative">${byFirst.slice(0, 60).map(([[c, r, cc], n, f, l]) => { const a = iso(f), b = iso(l); const x0 = (a - span[0]) / (span[1] - span[0]) * 100, x1 = Math.max(x0 + .4, (b - span[0]) / (span[1] - span[0]) * 100); return `<div class="row small" style="gap:10px;flex-wrap:nowrap;margin:3px 0" title="${escH(c)}: ${fmtDate(a)} → ${fmtDate(b)} · ${fmtN(n)} events"><span style="width:150px;flex:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escH(c)} <span class="dim">${cc}</span></span><div style="flex:1;height:10px;position:relative;background:rgba(255,255,255,.03);border-radius:5px"><i style="position:absolute;left:${x0}%;width:${x1 - x0}%;top:0;bottom:0;border-radius:5px;background:${colorFor(c)};opacity:${.35 + .65 * Math.min(1, Math.log10(n + 1) / 4)}"></i></div></div>`; }).join('')}<div class="row dim tiny" style="margin-left:160px"><span>${fmtDate(span[0])}</span><div class="spacer"></div><span>now</span></div></div>`;
  });
};

/* ================================================================== GAMES & MUSIC */
R.media = el => {
  const stats = (U.user_activity_application_statistics || []).slice().sort((a, b) => b.total_duration - a.total_duration);
  const total = stats.reduce((a, s) => a + s.total_duration, 0);
  const widgets = U.user_profile_metadata?.widgets || [];
  const gname = id => appName(id) || null;
  const poker = D.activities?.['Activities_1/poker/poker.json'];
  el.innerHTML = html`<h1>Games, Voice & Music</h1><p class="lead">Playtime Discord detected, time spent in voice, what showed up in your status, and the music you broadcast.</p>
  <div class="grid g4">${statCard('Total playtime', fmtDur(total), `${stats.length} apps`, '🕹️')}${statCard('Top game', escH(gname(stats[0]?.application_id) || '—'), stats[0] ? fmtDur(stats[0].total_duration) : '', '🏆')}${statCard('Spotify updates', fmtN(A.spotify_plays || 0), `${fmtN(A.spotify_unique || 0)} tracks · ${fmtN((A.spotify_artists || []).length)} artists`, '🎵')}${statCard('Rich presence', fmtN((A.activities || []).length), 'distinct activities', '✨')}</div>
  ${voiceSection()}
  <div class="card mt"><h2>Playtime by app <span class="sub">user_activity_application_statistics</span></h2>${hbars(stats.slice(0, 30).map(s => ({ label: gname(s.application_id) || 'Application ' + s.application_id, value: s.total_duration, right: fmtDur(s.total_duration), title: `app ${s.application_id} · last played ${fmtDate(iso(s.last_played_at))}` })))}
    <details class="mt"><summary class="muted" style="cursor:pointer">All ${stats.length} apps</summary>${tableHTML(['App', 'ID', 'Total', 'Last played'], stats.map(s => [escH(gname(s.application_id) || '?'), `<span class="mono">${s.application_id}</span>`, fmtDur(s.total_duration), fmtDate(iso(s.last_played_at))]))}</details></div>
  ${(A.spotify_tracks || []).length ? html`<div class="grid g2 mt"><div class="card"><h2>Top tracks <span class="sub">by status updates</span></h2>${hbars(A.spotify_tracks.slice(0, 20).map(t => ({ html: `<b>${escH(t[1])}</b> <span class="dim">— ${escH(t[2])}</span>`, value: t[0] })))}</div><div class="card"><h2>Top artists</h2>${hbars(A.spotify_artists.slice(0, 20).map(([a, n]) => ({ label: a, value: n })))}</div></div>
  <div class="card mt"><h2>Every track Discord saw <span class="sub">${fmtN(A.spotify_tracks.length)}</span></h2>${tableHTML(['Track', 'Artist', 'Updates', 'First', 'Last'], A.spotify_tracks.map(t => [escH(t[1]), escH(t[2]), fmtN(t[0]), fmtDate(iso(t[4])), fmtDate(iso(t[5]))]), { h: 400 })}</div>` : ''}
  <div class="grid g2 mt"><div class="card"><h2>Other activities in your status</h2>${hbars((A.activities || []).slice(0, 25).map(([k, n]) => ({ label: k, value: n })))}</div>
  <div class="card"><h2>Games launched <span class="sub">launch_game events</span></h2>${hbars((A.launches || []).slice(0, 15).map(([k, n, f, l]) => ({ label: k, value: n, title: `${fmtDate(iso(f))} → ${fmtDate(iso(l))}` })))}<h2 class="mt2">Games in telemetry</h2>${hbars((A.games || []).slice(0, 15).map(([k, n, f, l]) => ({ label: k, value: n, title: `${fmtDate(iso(f))} → ${fmtDate(iso(l))}` })))}${(A.game_mentions || []).length ? `<h2 class="mt2">Games you mentioned in chat</h2>${hbars(A.game_mentions.slice(0, 10).map(([k, n]) => ({ label: k, value: n })))}` : ''}</div></div>
  ${widgets.length ? `<div class="card mt"><h2>Profile widgets</h2>${widgets.map(w => `<div class="mt"><h3>${escH(w.data?.type?.replace(/_/g, ' '))} <span class="dim tiny">updated ${fmtDate(iso(w.updated_at))}</span></h3><div class="pill-list">${(w.data?.games || []).map(g => `<span class="chip" title="${escH(g.comment || '')}">${escH(gname(g.game_id) || g.game_id)}${g.comment ? ' 💬' : ''}${(g.tags || []).length ? ' · ' + g.tags.map(escH).join(', ') : ''}</span>`).join('') || (w.data?.application_id ? `<span class="chip">${escH(gname(w.data.application_id) || w.data.application_id)}</span>` : '')}</div>${(w.data?.games || []).filter(g => g.comment).map(g => `<p class="note">${escH(g.comment)}</p>`).join('')}</div>`).join('')}</div>` : ''}
  ${(U.application_user_role_connections || []).length ? `<div class="card mt"><h2>Linked game accounts <span class="sub">role connections</span></h2>${tableHTML(['Platform', 'Username', 'Metadata'], U.application_user_role_connections.map(c => [escH(c.platform_name), escH(c.platform_username || '–'), `<span class="mono tiny">${escH(JSON.stringify(c.metadata))}</span>`]))}</div>` : ''}
  ${poker ? `<div class="card mt"><h2>♠️ Poker Night stats</h2><div class="grid g5">${Object.entries(poker.global_stats || {}).filter(([k]) => !k.startsWith('_')).map(([k, v]) => `<div class="stat"><span class="k">${escH(k.replace(/_/g, ' '))}</span><span class="v" style="font-size:22px">${typeof v === 'number' ? (k.includes('time') ? fmtDur(v) : fmtN(+v.toFixed(0))) : escH(v)}</span></div>`).join('')}</div></div>` : ''}`;
};

function voiceSection() {
  const vd = A.voice_dur || [], sess = A.voice_sessions || {}, st = A.streams || {};
  if (!vd.length && !st.watched_count) return '';
  const totalMs = vd.reduce((a, v) => a + v[1], 0), nSess = Object.values(sess).reduce((a, b) => a + b, 0);
  const label = id => guildName(id) ? guildName(id) : CHANNELS[id] ? chanInfo(CHANNELS[id]).title + ' (call)' : USERS[id] ? USERS[id].name : 'Channel ' + id.slice(-5);
  const icon = id => GUILDS[id] ? avatarHTML(guildName(id) || id, guildIcon(id), 'sm sq') : CHANNELS[id] ? avatarHTML(chanInfo(CHANNELS[id]).avatarName, chanInfo(CHANNELS[id]).img, 'sm') : avatarHTML(id, null, 'sm');
  afterRender(() => { const el = $('#vtl'); if (el) areaChart(el, [{ name: 'hours in voice', color: '#3ee08f', points: hourlyToDaily(A.voice_hourly, 'month').map(([t, v]) => [t, Math.round(v / 36e5 * 10) / 10]) }], { height: 200, labelFn: t => new Date(t).toLocaleDateString('en', { month: 'long', year: 'numeric' }) }); });
  return html`<div class="card mt"><h2>🎙️ Voice & streaming <span class="sub">from voice_disconnect and video_stream_ended events</span></h2>
    <div class="grid g4">${statCard('Time in voice', fmtDur(totalMs / 1000), `${fmtN(nSess)} sessions`)}${statCard('Avg session', fmtDur(totalMs / 1000 / Math.max(1, nSess)))}${statCard('Streams watched', fmtN(st.watched_count || 0), `${fmtDur(st.watched_secs || 0)} · ${fmtBytes(st.watched_bytes || 0)}`)}${statCard('Streams you ran', fmtN(st.streamed_count || 0), `${fmtDur(st.streamed_secs || 0)} · ${fmtBytes(st.streamed_bytes || 0)}`)}</div>
    <div class="grid g2 mt"><div><h3>Hours in voice per month</h3><div id="vtl"></div></div><div><h3>Where you hang out in voice</h3>${hbars(vd.slice(0, 12).map(([id, ms]) => ({ label: label(id), value: ms, right: fmtDur(ms / 1000), icon: icon(id), title: `${sess[id] || 0} sessions` })))}</div></div></div>`;
}

/* ================================================================== ACCOUNT */
R.account = el => {
  const s = U.settings?.settings || {}, fr = U.settings?.frecency || {};
  const gifs = Object.entries(fr.favoriteGifs?.gifs || {}).sort((a, b) => (b[1].order || 0) - (a[1].order || 0));
  const react = Object.entries(fr.emojiReactionFrecency?.emojis || {}).sort((a, b) => (b[1].totalUses || 0) - (a[1].totalUses || 0));
  const emoF = Object.entries(fr.emojiFrecency?.emojis || {}).sort((a, b) => (b[1].totalUses || 0) - (a[1].totalUses || 0));
  const emo = (k, sz = 26) => /^\d{6,}$/.test(k) ? `<img src="${emojiURL(k)}" style="width:${sz}px;height:${sz}px;vertical-align:middle" loading="lazy">` : `<span class="chip">:${escH(k)}:</span>`;
  const meta = U.user_profile_metadata || {};
  const conIcon = { github: '🐙', spotify: '🎧', tiktok: '🎵', steam: '🚂', twitch: '📺', youtube: '▶️', xbox: '🎮', playstation: '🎮', reddit: '👽', twitter: '🐦', domain: '🌐', contacts: '📇', battlenet: '⚔️', riotgames: '⚔️', epicgames: '🎮', roblox: '🧱', instagram: '📸', crunchyroll: '🍥', bluesky: '🦋' };
  el.innerHTML = html`<h1>Account & Settings</h1><p class="lead">Your account record: profile, private details, connections, settings, and what Discord remembers about your habits.</p>
  <div class="grid g2"><div class="card glow"><h2>Identity</h2><dl class="kv">
    <dt>User ID</dt><dd class="mono">${U.id}</dd><dt>Username</dt><dd>@${escH(U.username)}</dd><dt>Display name</dt><dd>${escH(U.global_name)}</dd>${meta.legacy_username ? `<dt>Legacy tag</dt><dd>${escH(meta.legacy_username)}</dd>` : ''}
    <dt>Email</dt><dd>${sens(U.email)} ${U.verified ? '<span class="chip g">verified</span>' : ''}</dd><dt>Phone</dt><dd>${sens(U.phone || '–')}</dd><dt>Last IP</dt><dd>${sens(U.ip || '–')}</dd>
    <dt>Created</dt><dd>${fmtDT(snow(U.id))}</dd><dt>Has mobile</dt><dd>${U.has_mobile ? 'yes' : 'no'}</dd><dt>Date of birth</dt><dd>${sens(U.date_of_birth || '–')}</dd><dt>Temp banned until</dt><dd>${U.temp_banned_until || 'never'}</dd>
    <dt>Nitro until</dt><dd>${fmtDT(iso(U.premium_until))}</dd><dt>Boosting since</dt><dd>${fmtDT(iso(meta.boosting_started_at))}</dd><dt>Avatar hash</dt><dd class="mono tiny">${escH(U.avatar_hash)}</dd>
    ${U.age_assurance ? `<dt>Age assurance</dt><dd>${escH(U.age_assurance.method)} via ${escH(U.age_assurance.vendor)} · ${fmtDate(iso(U.age_assurance.verified_at))}<br><span class="chip">estimated ${escH(U.age_assurance.estimated_age_group)}</span> <span class="chip">inferred ${escH(U.age_assurance.inferred_age_group)}</span></dd>` : ''}
    <dt>Predicted age / gender</dt><dd>${escH(U.predicted_age ?? 'none')} / ${escH(U.predicted_gender ?? 'none')}</dd>
  </dl></div>
  <div class="card"><h2>Avatars</h2><div class="avgrid">${D.avatar ? `<figure><img src="${D.avatar}"><figcaption>current</figcaption></figure>` : ''}${D.avatars.map(a => `<figure><img src="${escH(a.url)}"><figcaption>${fmtDate(snow(a.path.split('/').pop().split('.')[0]))}</figcaption></figure>`).join('')}</div>
    <h2 class="mt2">Connections</h2><div class="bars">${(U.connections || []).map(c => `<div class="row" style="gap:10px"><span style="font-size:18px;width:24px">${conIcon[c.type] || '🔗'}</span><b>${escH(c.type)}</b><span class="muted">${escH(c.name || c.id)}</span><div class="spacer"></div>${c.verified ? '<span class="chip g">verified</span>' : ''}${c.revoked ? '<span class="chip r">revoked</span>' : ''}${c.visibility ? '<span class="chip">public</span>' : '<span class="chip">hidden</span>'}${c.metadata ? `<span class="chip c" title="${escH(JSON.stringify(c.metadata))}">metadata</span>` : ''}</div>`).join('')}</div>
    <h2 class="mt2">Badges & flags</h2><div class="pill-list">${(U.flags || []).map(f => `<span class="chip a">${escH(prettyFlag(f))}</span>`).join('')}${(meta.owned_badges || []).map(b => `<span class="chip p" title="obtained ${fmtDate(iso(b.obtained_at))}">badge ${b.badge?.type} · ${escH(b.badge?.tier_base?.tier || '')}</span>`).join('')}</div>
  </div></div>
  <div class="grid g3 mt">
    <div class="card"><h2>Appearance & locale</h2><dl class="kv">${[['Theme', s.appearance?.theme], ['Developer mode', s.appearance?.developerMode], ['UI density', s.appearance?.uiDensity], ['Locale', s.localization?.locale], ['Timezone offset', s.localization?.timezoneOffset != null ? s.localization.timezoneOffset + ' min' : null], ['Status', s.status?.status], ['Show current game', s.status?.showCurrentGame], ['AFK timeout', s.voiceAndVideo?.afkTimeout ? s.voiceAndVideo.afkTimeout + 's' : null], ['Compact mode', s.textAndImages?.messageDisplayCompact], ['GIF autoplay', s.textAndImages?.gifAutoPlay], ['Default reaction', s.textAndImages?.defaultReactionEmoji?.emojiName]].filter(x => x[1] != null).map(([k, v]) => `<dt>${k}</dt><dd>${escH(String(v))}</dd>`).join('')}</dl></div>
    <div class="card"><h2>Privacy</h2><dl class="kv">${Object.entries(s.privacy || {}).map(([k, v]) => `<dt>${escH(k.replace(/([A-Z])/g, ' $1').toLowerCase())}</dt><dd>${Array.isArray(v) ? `${v.length} servers` : escH(String(v))}</dd>`).join('')}</dl></div>
    <div class="card"><h2>Custom status</h2>${s.status?.customStatus ? `<div class="row" style="gap:10px">${s.status.customStatus.emojiId ? `<img src="${emojiURL(s.status.customStatus.emojiId)}" style="width:32px">` : ''}<span style="font-size:15px">${escH(s.status.customStatus.text || '')}</span></div><p class="dim small">set ${fmtDT(+s.status.customStatus.createdAtMs)}${s.status.customStatus.expiresAtMs ? ' · expires ' + fmtDT(+s.status.customStatus.expiresAtMs) : ''}</p>` : '<span class="dim">none</span>'}
      <h2 class="mt2">Notes</h2>${Object.keys(U.notes || {}).length ? tableHTML(['User', 'Note'], Object.entries(U.notes).map(([id, n]) => [escH(userName(id) || id), escH(n)])) : '<span class="dim">No notes on anyone</span>'}</div>
  </div>
  <div class="grid g2 mt"><div class="card"><h2>Most used reactions <span class="sub">${react.length}</span></h2>${hbars(react.slice(0, 15).map(([k, v]) => ({ html: emo(k, 20) + (/^\d+$/.test(k) ? '' : ''), value: v.totalUses || 0 })))}</div>
  <div class="card"><h2>Most used emoji (picker) <span class="sub">${emoF.length}</span></h2>${hbars(emoF.slice(0, 15).map(([k, v]) => ({ html: emo(k, 20), value: v.totalUses || 0 })))}</div></div>
  ${(fr.favoriteEmojis?.emojis || []).length ? `<div class="card mt"><h2>Favourite emoji</h2><div class="pill-list" style="gap:8px">${fr.favoriteEmojis.emojis.map(k => emo(k, 30)).join('')}</div></div>` : ''}
  ${gifs.length ? `<div class="card mt"><h2>Favourite GIFs <span class="sub">${gifs.length} saved</span></h2><div class="gifgrid">${gifs.map(([u, g]) => g.format === 'VIDEO' ? `<video src="${escH(g.src)}" autoplay loop muted playsinline preload="none" onclick="window.open('${escH(u)}')" style="cursor:pointer" onerror="this.remove()"></video>` : `<img src="${escH(g.src)}" loading="lazy" onerror="this.remove()">`).join('')}</div></div>` : ''}
  ${(D.applications || []).length ? `<div class="card mt"><h2>Your developer applications</h2><div class="tiles">${D.applications.map(a => `<div class="tile" onclick="openModal('<pre class=json>'+escH(JSON.stringify(D.applications.find(x=>x.id==='${a.id}'),null,2))+'</pre>')">${avatarHTML(a.name, a._icon || a._bot_avatar, 'sq')}<div class="nm"><b>${escH(a.name)}</b><small>${a.bot_public ? 'public bot' : 'private'} · created ${fmtDate(snow(a.id))}</small></div></div>`).join('')}</div></div>` : ''}
  <div class="card mt"><h2>Frecency <span class="sub">what Discord tracks you use most</span></h2><div class="grid g4">${Object.entries(fr).filter(([k]) => k !== 'versions').map(([k, v]) => { const inner = Object.values(v || {})[0]; const n = Array.isArray(inner) ? inner.length : inner && typeof inner === 'object' ? Object.keys(inner).length : 0; return `<div class="stat"><span class="k">${escH(k.replace(/([A-Z])/g, ' $1'))}</span><span class="v" style="font-size:22px">${fmtN(n)}</span></div>`; }).join('')}</div></div>
  <div class="card mt"><h2>Complete settings tree</h2><div class="tree" id="st"></div></div>`;
  jsonTree($('#st'), U.settings, false);
};
window.openModal = openModal; window.escH = escH;

/* ================================================================== MONEY */
R.money = el => {
  const E = D.exports || {};
  const pay = E['discord_billing/payments']?.records || [], ent = E['discord_billing/entitlements']?.records || [], src = E['discord_billing/payment_sources']?.records || [];
  const coins = (E['discord_virtual_currency/coin_transactions']?.records || []).slice().sort((a, b) => iso(a.created_at) - iso(b.created_at));
  const quests = (D.ads?.['quests_user_status.json'] || []).slice().sort((a, b) => iso(b.enrolled_at) - iso(a.enrolled_at));
  const traits = D.ads?.['traits.json'] || {};
  const wish = E['discord_store/wishlist_items']?.records || [];
  const GATE = { 1: 'Stripe', 2: 'Braintree', 3: 'Apple', 4: 'Google', 5: 'Adyen', 6: 'Apple Partner', 7: 'Amazon', 8: 'Orbs', 9: 'Apple AC', 10: 'TDS' };
  const byCur = {}; pay.forEach(p => { if (p.status === 1 || p.status == null) byCur[p.currency] = (byCur[p.currency] || 0) + (p.amount - (p.amount_refunded || 0)); });
  const money = (a, c) => c === 'discord_orb' ? `${fmtN(a)} orbs` : `${(a / 100).toFixed(2)} ${String(c).toUpperCase()}`;
  const earned = coins.filter(c => c.quantity > 0).reduce((a, c) => a + c.quantity, 0), spent = -coins.filter(c => c.quantity < 0).reduce((a, c) => a + c.quantity, 0);
  const completed = quests.filter(q => q.completed_at).length;
  const sectionTable = key => { const s = E[key]; if (!s) return ''; const cols = s.records.length ? Object.keys(s.records[0]) : []; return `<details class="mt"><summary class="muted" style="cursor:pointer">Raw: ${escH(s.section)} (${s.records.length})</summary>${s.description ? `<p class="dim small">${escH(s.description)}</p>` : ''}${tableHTML(cols, s.records.map(r => cols.map(c => { const v = r[c]; return /ip|email|address|card|gateway_(source|customer)/i.test(c) ? sens(typeof v === 'object' ? JSON.stringify(v) : v ?? '') : escH(typeof v === 'object' && v ? JSON.stringify(v) : v ?? ''); })), { h: 320 })}</details>`; };
  el.innerHTML = html`<h1>Billing, Orbs & Quests</h1><p class="lead">What you paid for, what you were gifted, your Orb wallet, and the quests and ad traits Discord uses for promotions.</p>
  <div class="grid g4">${statCard('Payments', fmtN(pay.length), Object.entries(byCur).map(([c, a]) => money(a, c)).join(' · '), '💳')}${statCard('Entitlements', fmtN(ent.length), `${ent.filter(e => e.gifter_user_id).length} were gifts`, '🎁')}${statCard('Orb balance', fmtN(U.current_orbs_balance || 0), `+${fmtN(earned)} earned · −${fmtN(spent)} spent`, '🔮')}${statCard('Quests', fmtN(quests.length), `${completed} completed`, '🏆')}</div>
  <div class="card mt"><h2>Payments</h2>${tableHTML(['Date', 'Description', 'Amount', 'Via', 'Status'], pay.map(p => [fmtDT(iso(p.created_at)), escH(p.description || p.sku_id), money(p.amount, p.currency) + (p.amount_refunded ? ` <span class="chip r">refunded ${money(p.amount_refunded, p.currency)}</span>` : ''), GATE[p.payment_gateway] || p.payment_gateway, p.status === 1 ? '<span class="chip g">completed</span>' : `<span class="chip">${p.status}</span>`]))}${sectionTable('discord_billing/payments')}</div>
  <div class="card mt"><h2>Orb wallet</h2><div id="orbs"></div>${sectionTable('discord_virtual_currency/coin_transactions')}${sectionTable('discord_virtual_currency/coin_accounts')}</div>
  <div class="grid g2 mt"><div class="card"><h2>Payment methods</h2>${src.map(s => `<div class="row" style="gap:12px;margin-bottom:10px"><span style="font-size:22px">💳</span><div><b>${escH(s.card_brand || { 1: 'card', 2: 'PayPal', 3: 'giropay', 4: 'Sofort', 5: 'Przelewy24', 6: 'SEPA debit', 7: 'paysafecard', 11: 'Venmo', 14: 'Bancontact', 15: 'EPS', 16: 'iDEAL', 17: 'Cash App' }[s.type] || 'method ' + s.type)}</b> ${s.card_last_4 ? sens('•••• ' + s.card_last_4) : ''} <span class="dim small">${s.card_expires_month ? `exp ${s.card_expires_month}/${s.card_expires_year}` : ''} · ${GATE[s.payment_gateway] || ''}${s.deleted_at ? ' · removed' : ''}</span><div class="small muted">${sens([s.billing_address?.name, s.billing_address?.line_1, s.billing_address?.postal_code, s.billing_address?.city].filter(Boolean).join(', '))}</div></div></div>`).join('') || '<span class="dim">none</span>'}${sectionTable('discord_billing/payment_sources')}${sectionTable('discord_billing/billing_profile')}</div>
  <div class="card"><h2>Entitlements by year</h2><div id="ent"></div>${sectionTable('discord_billing/entitlements')}</div></div>
  <div class="card mt"><h2>Quests <span class="sub">Ads/quests_user_status.json</span></h2>${tableHTML(['Enrolled', 'Quest', 'Progress', 'Completed', 'Claimed', 'Orbs'], quests.map(q => [fmtDate(iso(q.enrolled_at)), `<span class="mono tiny">${q.quest_id}</span>`, Object.entries(q.progress || {}).map(([k, v]) => `<span class="chip">${escH(k.toLowerCase().replace(/_/g, ' '))} ${(v.value || 0) >= 60 ? fmtDur(v.value) : (v.value || 0) + 's'}</span>`).join(' ') || (q.stream_progress_seconds ? `stream ${fmtDur(q.stream_progress_seconds)}` : '–'), q.completed_at ? '✅ ' + fmtDate(iso(q.completed_at)) : '–', q.claimed_at ? fmtDate(iso(q.claimed_at)) : '–', q.orb_quantity_claimed ? fmtN(q.orb_quantity_claimed) : '–']), { h: 420 })}</div>
  <div class="grid g2 mt"><div class="card"><h2>Ad traits <span class="sub">Ads/traits.json · ${escH(traits.day_pt || '')}</span></h2><div class="tree" id="traits"></div></div>
  <div class="card"><h2>Wishlist</h2>${tableHTML(['SKU', 'Added', 'Status'], wish.map(w => [`<span class="mono">${w.sku_id}</span>`, fmtDate(iso(w.added_at)), w.fulfilled_at ? '🎁 fulfilled' : w.deleted_at ? 'removed' : 'wanted']))}
    <h2 class="mt2">Promotions & data requests</h2>${['discord_promotions/drops_reward_codes', 'discord_promotions/quests_reward_codes', 'discord_harvests/data_subject_access_requests'].map(k => E[k] ? `<div class="row small" style="margin:4px 0"><b>${escH(E[k].section)}</b><div class="spacer"></div><span class="muted">${E[k].records.length} records</span></div>` : '').join('')}${tableHTML(['Requested', 'Request ID'], (E['discord_harvests/data_subject_access_requests']?.records || []).map(r => [fmtDT(iso(r.created_at)), `<span class="mono">${r.id}</span>`]))}</div></div>`;
  jsonTree($('#traits'), traits, true);
  afterRender(() => {
    let bal = 0; const pts = coins.map(c => [iso(c.created_at), bal += c.quantity]);
    if (pts.length) areaChart($('#orbs'), [{ name: 'balance', color: '#c062ff', points: pts }], { height: 200, labelFn: t => fmtDT(t) }); else $('#orbs').innerHTML = '<div class="empty">No orb transactions</div>';
    const y = {}; ent.forEach(e => { const k = new Date(iso(e.created_at)).getFullYear(); y[k] = (y[k] || 0) + 1; });
    columns($('#ent'), Object.entries(y).sort(), { color: '#ff5fa2', unit: 'entitlements' });
  });
};

/* ================================================================== SUPPORT & ACTIVITIES */
R.support = el => {
  const t = Object.values(D.tickets || {}).sort((a, b) => iso(b.created_at) - iso(a.created_at));
  const acts = D.activities || {};
  el.innerHTML = html`<h1>Support & Activities</h1><p class="lead">Your Help Center tickets and data stored by Discord Activities (embedded games).</p>
  <h2>Support tickets <span class="sub">${t.length}</span></h2>
  ${t.map(k => `<div class="card mt"><div class="row"><b>#${k.ticket_id}</b><span class="chip ${k.status === 'solved' || k.status === 'closed' ? 'g' : 'w'}">${escH(k.status)}</span><span class="muted small">${escH(k.subject)}</span><div class="spacer"></div><span class="dim small">${fmtDT(iso(k.created_at))}</span></div><div class="mt">${(k.comments || []).map(c => `<div class="bubble ${c.author === 'User' ? 'u' : 'a'}"><small>${escH(c.author)} · ${fmtDT(iso(c.created_at))}</small>${escH(c.comment)}</div>`).join('')}</div></div>`).join('') || '<div class="empty">No tickets</div>'}
  <h2 class="mt2">Activities data</h2>
  <div class="grid g2">${Object.entries(acts).map(([k, v]) => `<div class="card"><h3 class="mono">${escH(k)}</h3>${typeof v === 'string' ? `<p>${escH(v)}</p>` : `<div class="tree" data-k="${escH(k)}"></div>`}</div>`).join('')}</div>`;
  el.querySelectorAll('.tree[data-k]').forEach(n => jsonTree(n, acts[n.dataset.k], false));
};

/* ================================================================== RAW */
R.raw = el => {
  const files = D.package.files;
  const folders = {};
  files.forEach(([n, s, c]) => { const top = n.split('/')[0] || n; const f = folders[top] = folders[top] || [0, 0, 0]; f[0]++; f[1] += s; f[2] += c; });
  const sections = { user: U, messages: '(see Messages page)', servers: D.servers, applications: D.applications, exports: D.exports, ads: D.ads, tickets: D.tickets, activities: D.activities, activity_summary: Object.fromEntries(Object.entries(A).filter(([k]) => k !== 'types')), activity_event_types: A.types };
  el.innerHTML = html`<h1>Raw Package</h1><p class="lead">${escH(D.package.name)} · ${fmtBytes(D.package.size)} compressed · ${fmtBytes(files.reduce((a, f) => a + f[1], 0))} uncompressed · ${fmtN(files.length)} files. Built ${fmtDT(Date.parse(D.generated))}.</p>
  <div class="grid g2"><div class="card"><h2>Size by folder</h2>${hbars(Object.entries(folders).sort((a, b) => b[1][1] - a[1][1]).map(([k, v]) => ({ label: `${k} (${fmtN(v[0])} files)`, value: v[1], right: fmtBytes(v[1]) })))}</div>
  <div class="card"><h2>README.txt</h2><pre class="json" style="max-height:320px">${escH(D.package.readme)}</pre></div></div>
  <div class="card mt"><h2>Explore everything <span class="sub">click to expand — every field from the package</span></h2><div class="tree" id="rt"></div></div>
  <div class="card mt"><div class="row"><h2 style="margin:0">All files</h2><div class="spacer"></div><input class="search" id="ff" style="max-width:300px" placeholder="Filter files…"></div><div id="fl" class="mt"></div></div>`;
  jsonTree($('#rt'), sections, false);
  const draw = () => { const q = $('#ff').value.toLowerCase(); const list = files.filter(f => f[0].toLowerCase().includes(q)).sort((a, b) => b[1] - a[1]); $('#fl').innerHTML = tableHTML(['Path', 'Size', 'Compressed'], list.slice(0, 500).map(([n, s, c]) => [`<span class="mono">${escH(n)}</span>`, fmtBytes(s), fmtBytes(c)]), { h: 480 }) + (list.length > 500 ? `<p class="dim small">showing 500 of ${fmtN(list.length)}</p>` : ''); };
  $('#ff').oninput = draw; draw();
};

/* ------------------------------------------------------------------ lazy JSON tree */
function jsonTree(el, val, open) {
  el.innerHTML = '';
  el.appendChild(treeNode(null, val, open, 0));
}
const SENS_KEYS = /^(email|phone|ip|user_ip|date_of_birth|card_last_4|billing_address|payment_gateway_(source|customer)_id|device_vendor_id|cfduid|ip_geo_postal_code|client_uuid)$/i;
function treeNode(key, v, open, depth) {
  const kHTML = key != null ? `<span class="k">${escH(key)}</span>: ` : '';
  if (v === null || typeof v !== 'object') {
    const d = document.createElement('div'); d.className = 'leaf';
    let s;
    if (typeof v === 'string') s = `<span class="s">"${escH(v.length > 2000 ? v.slice(0, 2000) + '…' : v)}"</span>`;
    else if (typeof v === 'number') s = `<span class="n">${v}</span>`;
    else if (typeof v === 'boolean') s = `<span class="b">${v}</span>`;
    else s = `<span class="z">null</span>`;
    if (key != null && SENS_KEYS.test(key)) s = `<span class="sens">${s}</span>`;
    d.innerHTML = kHTML + s; return d;
  }
  const isArr = Array.isArray(v), n = isArr ? v.length : Object.keys(v).length;
  const det = document.createElement('details');
  det.innerHTML = `<summary>${kHTML}<span class="cnt">${isArr ? `[${n}]` : `{${n}}`}</span></summary>`;
  if (key != null && SENS_KEYS.test(key)) det.querySelector('summary').classList.add('sens');
  let filled = false;
  const fill = () => {
    if (filled) return; filled = true;
    const entries = isArr ? v.map((x, i) => [i, x]) : Object.entries(v);
    const LIM = 300;
    entries.slice(0, LIM).forEach(([k, x]) => det.appendChild(treeNode(k, x, false, depth + 1)));
    if (entries.length > LIM) { const more = document.createElement('div'); more.className = 'leaf'; more.innerHTML = `<button class="btn" style="padding:2px 8px;font-size:11px">show ${entries.length - LIM} more</button>`; more.onclick = () => { more.remove(); entries.slice(LIM).forEach(([k, x]) => det.appendChild(treeNode(k, x, false, depth + 1))); }; det.appendChild(more); }
  };
  det.addEventListener('toggle', () => det.open && fill());
  if (open && depth < 1) { det.open = true; fill(); }
  return det;
}

/* ------------------------------------------------------------------ boot */
if (D) {
  window.closeModal = closeModal;
  const sm = $('#streamer');
  try { sm.checked = localStorage.getItem('spv-streamer') === '1'; } catch { }
  document.body.classList.toggle('streamer', sm.checked);
  sm.onchange = () => { document.body.classList.toggle('streamer', sm.checked); try { localStorage.setItem('spv-streamer', sm.checked ? '1' : '0'); } catch { } };
  $('#gen').textContent = 'Processed ' + fmtDate(Date.parse(D.generated)) + ' · stored only in this browser';
  $('#menu').onclick = () => $('#side').classList.toggle('open');
  window.addEventListener('hashchange', route);
  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (!location.hash.includes('browse')) route(); }, 300); });
  route();
}
