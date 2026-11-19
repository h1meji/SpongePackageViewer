/* Sponge Package Viewer processing worker.
   Receives {file, options} and posts back {type:'done', data, assets}.
   Everything happens inside this browser tab — nothing is sent anywhere. */
'use strict';
importScripts('zip.js');

const post = (m) => self.postMessage(m);
let lastProgress = 0;
function progress(stage, pct, detail, force) {
  const now = Date.now();
  if (!force && now - lastProgress < 150) return;
  lastProgress = now;
  post({ type: 'progress', stage, pct, detail });
}

self.onmessage = async (ev) => {
  try {
    const { file, options = {} } = ev.data;
    const t0 = Date.now();
    const zip = await ZipReader.open(file);
    const result = await build(zip, file, options);
    post({ type: 'done', data: result.data, assets: result.assets, ms: Date.now() - t0 });
  } catch (e) {
    console.error(e);
    post({ type: 'error', message: e && e.message ? e.message : String(e), stack: e && e.stack });
  }
};

/* ------------------------------------------------------------------ helpers */
const snowflakeMs = (id) => { try { return Number((BigInt(id) >> 22n) + 1420070400000n); } catch { return null; } };
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

class Counter extends Map {
  inc(k, n = 1) { this.set(k, (this.get(k) || 0) + n); }
  top(n = 200) { return [...this.entries()].sort((a, b) => b[1] - a[1]).slice(0, n); }
}
class RangeMap extends Map {
  add(k, ts, n = 1) {
    let r = this.get(k);
    if (!r) this.set(k, (r = { n: 0, first: null, last: null }));
    r.n += n;
    if (ts) { if (r.first === null || ts < r.first) r.first = ts; if (r.last === null || ts > r.last) r.last = ts; }
  }
  top(n = 200, keyfmt = (k) => k) { return [...this.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, n).map(([k, r]) => [keyfmt(k), r.n, r.first, r.last]); }
}
const hourCache = new Map();
function hourOf(ts) {
  const k = ts.slice(0, 13);
  let h = hourCache.get(k);
  if (h === undefined) {
    h = Math.floor(Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10), +k.slice(11, 13)) / 3600000);
    if (!Number.isFinite(h)) h = -1;
    hourCache.set(k, h);
  }
  return h;
}
function cleanTs(v) {
  if (!v || typeof v !== 'string') return null;
  if (v[0] === '"') v = v.replace(/^"|"$/g, '');
  return v.length >= 13 && v[4] === '-' ? v.replace(' ', 'T') : null;
}
const ITEM_RE = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|([^,\[\]\s]+)/g;
function asList(v) {
  if (v == null) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v[0] === '[') {
    try { return JSON.parse(v); } catch { }
    const out = []; let m; ITEM_RE.lastIndex = 0;
    while ((m = ITEM_RE.exec(v))) out.push(m[1] ?? m[2] ?? m[3]);
    return out;
  }
  return [v];
}
const asInt = (v) => { const n = parseInt(parseFloat(v)); return Number.isFinite(n) ? n : 0; };
const isTrue = (v) => v === true || v === 'True' || v === 'true';
const sortedPairs = (c) => [...c.entries()].filter(([k]) => k >= 0).sort((a, b) => a[0] - b[0]);

/* ------------------------------------------------------------------ activity scan */
async function scanActivity(zip, files) {
  const seen = new Set();
  const T = new Map();
  const A = {
    files: {}, hourly: new Counter(), hourly_msg: new Counter(), notif: new Counter(), hourly_cat: {},
    cities: new RangeMap(), countries: new Counter(), isps: new RangeMap(), ips: new RangeMap(), ip_city: new Map(),
    os: new Counter(), browsers: new Counter(), devices: new RangeMap(), clients: new Counter(), locales: new Counter(), timezones: new Counter(), languages: new Counter(),
    msg: new Counter(), msg_channels: new Counter(), msg_guilds: new Counter(), mimetypes: new Counter(), code_langs: new Counter(), game_mentions: new Counter(),
    spotify: new Map(), spotify_artists: new Counter(), activities: new Counter(), app_names: {}, games: new RangeMap(), reactions: new Counter(),
    experiments: new Counter(), opened_from: new Counter(), themes: new Counter(), guild_views: new Counter(), channel_views: new Counter(),
    voice_guilds: new Counter(), voice_channels: new Counter(), voice_dur: new Counter(), voice_sessions: new Counter(), voice_hourly: new Counter(),
    sessions: new Counter(), profile_actions: new Counter(), statuses: new Counter(), searches: new Counter(), slash: new Counter(), gifs: new Counter(),
    launches: new RangeMap(), streams: new Counter(), ad_traits: null,
  };
  const totalC = files.reduce((a, e) => a + e.csize, 0) || 1;
  let doneC = 0, events = 0;
  const t0 = Date.now();

  for (const e of files) {
    const cat = e.name.split('/')[1] || 'activity';
    const hc = A.hourly_cat[cat] || (A.hourly_cat[cat] = new Counter());
    let raw = 0, unique = 0;
    await zip.lines(e, (line) => {
      let d;
      try { d = JSON.parse(line); } catch { return; }
      raw++; events++;
      const et = d.event_type || '?';
      const ts = cleanTs(d.timestamp) || cleanTs(d.client_track_timestamp) || cleanTs(d._ingest_ts);
      let tt = T.get(et);
      if (!tt) T.set(et, (tt = { n: 0, first: null, last: null, cats: {}, keys: new Set(), sample: null }));
      tt.cats[cat] = (tt.cats[cat] || 0) + 1;
      const h = ts ? hourOf(ts) : -1;
      hc.inc(h);
      const eid = d.event_id;
      if (eid) { if (seen.has(eid)) return; seen.add(eid); }
      unique++;
      tt.n++;
      if (ts) { if (tt.first === null || ts < tt.first) tt.first = ts; if (tt.last === null || ts > tt.last) tt.last = ts; }
      if (tt.n <= 200) for (const k in d) tt.keys.add(k);
      if (tt.sample === null || tt.n % 997 === 1) {
        const s = {};
        for (const k in d) if (k !== '_governance_meta') { const v = d[k]; s[k] = typeof v === 'string' && v.length > 400 ? v.slice(0, 400) + '…' : v; }
        tt.sample = s;
      }
      A.hourly.inc(h);

      const city = d.city;
      if (city) A.cities.add(`${city}\u0001${d.region_code || ''}\u0001${d.country_code || ''}`, ts);
      if (d.country_code) A.countries.inc(d.country_code);
      if (d.isp) A.isps.add(d.isp, ts);
      if (d.ip) { A.ips.add(d.ip, ts); if (city && !A.ip_city.has(d.ip)) A.ip_city.set(d.ip, `${city}, ${d.country_code || ''}`); }
      const osn = d.os, br = d.browser;
      if (osn) A.os.inc(`${osn} ${d.os_version || ''}`.trim());
      if (br) A.browsers.inc(br);
      const dev = d.device_model || d.device;
      if (dev || osn) A.devices.add(`${osn || '?'}|${br || '?'}|${dev || ''}`, ts);
      if (d.client_version && br) A.clients.inc(`${br} ${d.client_version}`);
      if (d.system_locale) A.locales.inc(d.system_locale);
      if (d.time_zone) A.timezones.inc(d.time_zone);
      if (d.primary_accepted_language) A.languages.inc(d.primary_accepted_language);

      switch (et) {
        case 'send_message': {
          A.hourly_msg.inc(h);
          const m = A.msg;
          m.inc('count'); m.inc('length', asInt(d.length)); m.inc('words', asInt(d.word_count)); m.inc('attachments', asInt(d.num_attachments));
          m.inc('embeds', asInt(d.num_embeds)); m.inc('mentions', asInt(d.num_mentions)); m.inc('urls', asInt(d.num_urls));
          m.inc('emoji_unicode', asInt(d.emoji_unicode)); m.inc('emoji_custom', asInt(d.emoji_custom)); m.inc('emoji_animated', asInt(d.emoji_animated));
          if (isTrue(d.emoji_only)) m.inc('emoji_only');
          if (isTrue(d.private)) m.inc('private');
          if (isTrue(d.mention_everyone)) m.inc('mention_everyone');
          if (isTrue(d.has_spoiler)) m.inc('spoilers');
          if (isTrue(d.probably_has_markdown)) m.inc('markdown');
          if (isTrue(d.is_first_message)) m.inc('first_messages');
          m.inc('stickers', asList(d.sticker_ids).length);
          for (const mt of asList(d.attachment_mimetypes)) A.mimetypes.inc(String(mt));
          for (const s of asList(d.attachment_sizes)) m.inc('attachment_bytes', asInt(s));
          for (const l of asList(d.ast_code_block_langs)) A.code_langs.inc(String(l) || 'plain');
          for (const g of asList(d.game_mention_names)) A.game_mentions.inc(String(g));
          const ch = d.channel || d.channel_id;
          if (ch) A.msg_channels.inc(String(ch));
          if (d.guild_id) A.msg_guilds.inc(String(d.guild_id));
          break;
        }
        case 'activity_updated': {
          if (d.party_platform === 'spotify' || d.track_id) {
            const key = d.track_id || `${d.details}|${d.state}`;
            let tr = A.spotify.get(key);
            const artists = asList(d.author_names);
            const arts = artists.length ? artists : d.state ? [d.state] : [];
            if (!tr) A.spotify.set(key, (tr = [0, d.details || '?', arts.join(', '), d.album_id || null, ts, ts]));
            tr[0]++;
            if (ts) { if (!tr[4] || ts < tr[4]) tr[4] = ts; if (!tr[5] || ts > tr[5]) tr[5] = ts; }
            for (const a of arts) A.spotify_artists.inc(String(a));
          } else {
            const nm = d.name || d.application_name || d.activity_name || d.details;
            if (nm) A.activities.inc(String(nm));
          }
          break;
        }
        case 'add_reaction': A.reactions.inc(String(d.emoji_name || d.emoji || d.emoji_id || '(unknown)')); break;
        case 'app_opened': A.opened_from.inc(String(d.opened_from || 'direct')); if (d.theme) A.themes.inc(d.theme); break;
        case 'guild_viewed': if (d.guild_id) A.guild_views.inc(String(d.guild_id)); break;
        case 'channel_opened':
          if (d.channel_id) A.channel_views.inc(String(d.channel_id));
          if (d.guild_id) A.guild_views.inc(String(d.guild_id));
          break;
        case 'session_start': case 'session_start_success': case 'session_start_client': case 'session_end': A.sessions.inc(et); break;
        case 'user_profile_action': A.profile_actions.inc(String(d.profile_action)); break;
        case 'push_notification_received': case 'notification_viewed': case 'notification_clicked': A.notif.inc(h); break;
        case 'update_user_settings': if (d.status) A.statuses.inc(d.status); break;
        case 'ad_request_user_traits':
          if (!A.ad_traits) { A.ad_traits = {}; for (const k in d) if (/^(ip_geo|game_|genre|theme_ids|mobile|ml_|custom_aud|movie|music|third|quest_hist|is_opted)/.test(k)) A.ad_traits[k] = d[k]; }
          break;
        case 'application_command_used': case 'application_command_sent': { const nm = d.command_name || d.command_id; if (nm) A.slash.inc(String(nm)); break; }
        case 'message_sent_with_gif': A.gifs.inc(String(d.gif_url || d.gif_id || '?')); break;
        case 'launch_game': if (d.game) { A.launches.add(String(d.game), ts); if (d.game_id) A.app_names[String(d.game_id)] = String(d.game); } break;
        case 'video_stream_ended': {
          const role = d.participant_type === 'receiver' ? 'watched' : 'streamed';
          A.streams.inc(role + '_count'); A.streams.inc(role + '_secs', asInt(d.duration)); A.streams.inc(role + '_bytes', asInt(d.num_bytes));
          break;
        }
        default:
          if (et.startsWith('experiment_') && d.name) A.experiments.inc(d.name);
      }
      if (et.includes('search')) { const q = d.query || d.search_query; if (q) A.searches.inc(String(q).slice(0, 80)); }
      if (et.includes('voice') || et.startsWith('join_call') || et.startsWith('leave_call') || et.startsWith('start_speaking')) {
        if (d.guild_id) A.voice_guilds.inc(String(d.guild_id));
        const cid = d.channel_id || d.voice_channel_id;
        if (cid) A.voice_channels.inc(String(cid));
        if (et === 'voice_disconnect') {
          const dur = asInt(d.duration), key = String(d.guild_id || cid || '?');
          A.voice_dur.inc(key, dur); A.voice_sessions.inc(key); A.voice_hourly.inc(h, dur);
        }
      }
      const gname = d.game_name || d.application_name, gid = d.game_id || d.application_id;
      if (gname && gid) A.app_names[String(gid)] = String(gname);
      if (gname && (et.includes('game') || et.includes('activity') || et.includes('running'))) A.games.add(String(gname), ts);
    }, (n) => {
      doneC += n;
      const pct = doneC / totalC, el = (Date.now() - t0) / 1000;
      progress('Scanning telemetry', pct, `${e.name} · ${events.toLocaleString('en-US')} events · ${pct > 0.02 ? Math.round(el / pct - el) + 's left' : 'estimating…'}`);
    });
    A.files[cat] = { raw, unique_new: unique, bytes: e.usize };
  }

  const types = {};
  for (const [et, t] of T) types[et] = { n: t.n, first: t.first, last: t.last, cats: t.cats, keys: [...t.keys].sort(), sample: t.sample };
  let tracks = [...A.spotify.values()].sort((a, b) => b[0] - a[0]);
  return {
    version: 'web-1', files: A.files, unique_events: seen.size || [...T.values()].reduce((a, t) => a + t.n, 0), types,
    hourly: sortedPairs(A.hourly), hourly_msg: sortedPairs(A.hourly_msg), hourly_notif: sortedPairs(A.notif),
    hourly_cat: Object.fromEntries(Object.entries(A.hourly_cat).map(([c, cnt]) => [c, sortedPairs(cnt)])),
    cities: A.cities.top(300, (k) => k.split('\u0001')), countries: A.countries.top(), isps: A.isps.top(100),
    ips: A.ips.top(500).map((r) => [...r, A.ip_city.get(r[0]) || '']),
    os: A.os.top(60), browsers: A.browsers.top(40), devices: A.devices.top(80), clients: A.clients.top(80),
    locales: A.locales.top(30), timezones: A.timezones.top(30), languages: A.languages.top(30),
    msg: Object.fromEntries(A.msg), msg_channels: A.msg_channels.top(2000), msg_guilds: A.msg_guilds.top(500),
    mimetypes: A.mimetypes.top(50), code_langs: A.code_langs.top(30), game_mentions: A.game_mentions.top(50),
    spotify_tracks: tracks.slice(0, 1500), spotify_artists: A.spotify_artists.top(300),
    spotify_plays: tracks.reduce((a, r) => a + r[0], 0), spotify_unique: tracks.length,
    activities: A.activities.top(150), app_names: A.app_names, games: A.games.top(150), reactions: A.reactions.top(150),
    experiments: A.experiments.top(300), experiments_total: A.experiments.size, opened_from: A.opened_from.top(30), themes: A.themes.top(10),
    guild_views: A.guild_views.top(500), channel_views: A.channel_views.top(1500), voice_guilds: A.voice_guilds.top(300),
    voice_channels: A.voice_channels.top(500), voice_dur: A.voice_dur.top(300), voice_sessions: Object.fromEntries(A.voice_sessions),
    voice_hourly: sortedPairs(A.voice_hourly), launches: A.launches.top(150), streams: Object.fromEntries(A.streams),
    sessions: Object.fromEntries(A.sessions), profile_actions: A.profile_actions.top(30), statuses: A.statuses.top(10),
    searches: A.searches.top(200), slash: A.slash.top(100), gifs: A.gifs.top(100), ad_traits_event: A.ad_traits || {},
  };
}

/* ------------------------------------------------------------------ CSV (legacy messages.csv) */
function parseCSV(text) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}

/* ------------------------------------------------------------------ main build */
async function build(zip, file, options) {
  const files = zip.entries.filter((e) => !e.dir);
  const lower = (e) => e.name.toLowerCase();
  const json = async (name, dflt = null) => { const e = zip.get(name); if (!e) return dflt; try { return await zip.json(e); } catch (err) { console.warn('parse failed', name, err); return dflt; } };

  if (!files.some((e) => /(^|\/)account\/user\.json$/i.test(e.name)) && !files.some((e) => /(^|\/)messages\//i.test(e.name)))
    throw new Error("This zip doesn't look like a Discord data package (no Account/user.json or Messages/ folder found).");

  // packages are sometimes re-zipped inside a top folder: detect prefix
  const userEntry = files.find((e) => /(^|\/)account\/user\.json$/i.test(e.name));
  const prefix = userEntry ? userEntry.name.slice(0, userEntry.name.toLowerCase().indexOf('account/user.json')) : '';
  const P = (n) => prefix + n;
  const rel = (e) => e.name.slice(prefix.length);
  const getP = (n) => zip.get(P(n));
  const jsonP = (n, d) => json(P(n), d);

  /* activity */
  const actFiles = files.filter((e) => /^activity\/[^/]+\/.*\.json$/i.test(rel(e))).sort((a, b) => a.name.localeCompare(b.name));
  let activity = {};
  if (options.activity !== false && actFiles.length) activity = await scanActivity(zip, actFiles);
  progress('Reading your account', 0, '', true);

  /* assets */
  const assets = {};
  const imgFiles = files.filter((e) => /\.(png|jpe?g|gif|webp)$/i.test(e.name) && /^(account|servers|messages)\//i.test(rel(e)));
  let k = 0;
  for (const e of imgFiles) {
    const ext = e.name.split('.').pop().toLowerCase();
    assets['assets/' + rel(e)] = await zip.blob(e, MIME[ext]);
    progress('Extracting images', ++k / imgFiles.length, rel(e));
  }
  const assetPath = (e) => 'assets/' + rel(e);

  /* account */
  const user = (await jsonP('Account/user.json', {})) || {};
  const exports = {};
  for (const e of files.filter((e) => /^account\/user_data_exports\/.+\.json$/i.test(rel(e)))) {
    const d = await json(e.name);
    if (!d) continue;
    exports[rel(e).replace(/^account\/user_data_exports\//i, '').replace(/\.json$/i, '')] = { section: d.section, description: d.metadata?.description, columns: d.metadata?.columns, records: d.records || [] };
  }
  const apps = [];
  for (const e of files.filter((e) => /^account\/applications\/\d+\/application\.json$/i.test(rel(e)))) {
    const app = (await json(e.name)) || {};
    const dir = rel(e).replace(/application\.json$/i, '');
    for (const img of ['icon', 'bot-avatar', 'cover-image']) {
      const f = imgFiles.find((x) => rel(x).toLowerCase().startsWith((dir + img + '.').toLowerCase()));
      if (f) app['_' + img.replace('-', '_')] = assetPath(f);
    }
    apps.push(app);
  }
  const avatars = imgFiles.filter((e) => /^account\/recent_avatars\//i.test(rel(e))).map(assetPath)
    .sort((a, b) => (snowflakeMs(b.split('/').pop().split('.')[0]) || 0) - (snowflakeMs(a.split('/').pop().split('.')[0]) || 0));
  const mainAv = imgFiles.find((e) => /^account\/avatar\.\w+$/i.test(rel(e)));

  /* messages */
  progress('Reading messages', 0, '', true);
  const msgIndex = (await jsonP('Messages/index.json', {})) || {};
  const chanFiles = files.filter((e) => /^messages\/c?\d+\/channel\.json$/i.test(rel(e)));
  const messages = [];
  let mi = 0, totalMsgs = 0;
  for (const e of chanFiles) {
    const dir = rel(e).replace(/channel\.json$/i, '');
    const cid = dir.match(/(\d+)\/$/)[1];
    const ch = (await json(e.name)) || {};
    let rows = [];
    const mj = getP(dir + 'messages.json'), mc = getP(dir + 'messages.csv');
    if (mj) {
      const arr = (await json(mj.name, [])) || [];
      for (const m of arr) rows.push([String(m.ID ?? m.id), m.Timestamp || m.timestamp, m.Contents ?? m.contents ?? '', m.Attachments ?? m.attachments ?? '']);
    } else if (mc) {
      const t = await zip.text(mc);
      const csv = parseCSV(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t);
      const head = (csv.shift() || []).map((h) => h.toLowerCase());
      const ix = (n) => head.indexOf(n);
      for (const r of csv) if (r.length > 1) rows.push([r[ix('id')], r[ix('timestamp')], r[ix('contents')] || '', r[ix('attachments')] || '']);
    }
    rows = rows.map(([id, ts, c, a]) => {
      let ms = snowflakeMs(id);
      if (!ms && ts) ms = Date.parse(String(ts).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(ts) ? '' : 'Z'));
      return [id, Math.floor((ms || 0) / 1000), String(c ?? ''), String(a ?? '')];
    }).sort((x, y) => x[1] - y[1]);
    totalMsgs += rows.length;
    const icon = imgFiles.find((x) => rel(x).toLowerCase().startsWith((dir + 'icon.').toLowerCase()));
    const guild = ch.guild || {};
    const extra = {};
    for (const key in ch) if (!['id', 'type', 'name', 'guild', 'recipients'].includes(key)) extra[key] = ch[key];
    messages.push({ id: cid, type: normType(ch.type), name: ch.name || null, guild_id: guild.id || null, guild_name: guild.name || null, recipients: ch.recipients || null, index_name: msgIndex[cid] ?? null, icon: icon ? assetPath(icon) : null, extra, messages: rows });
    progress('Reading messages', ++mi / chanFiles.length, `${totalMsgs.toLocaleString('en-US')} messages`);
  }
  messages.sort((a, b) => b.messages.length - a.messages.length);

  /* servers */
  progress('Reading servers', 0, '', true);
  const srvIndex = (await jsonP('Servers/index.json', {})) || {};
  const servers = new Map();
  for (const e of files.filter((e) => /^servers\/\d+\/.+/i.test(rel(e)))) {
    const [, gid, restRaw] = rel(e).match(/^servers\/(\d+)\/(.+)$/i);
    const rest = restRaw, rl = rest.toLowerCase();
    let s = servers.get(gid);
    if (!s) servers.set(gid, (s = { id: gid, files: [] }));
    s.files.push(rest);
    if (rl === 'guild.json') s.guild = await json(e.name, {});
    else if (rl === 'audit-log.json') s.audit_log = await json(e.name, []);
    else if (rl === 'channels.json') s.channels = await json(e.name, []);
    else if (rl === 'emoji.json') s.emoji = await json(e.name, []);
    else if (rl === 'webhooks.json') s.webhooks = await json(e.name, []);
    else if (/^icon\.\w+$/.test(rl)) s.icon = assetPath(e);
    else if (/^(discovery-splash|splash|banner)/.test(rl) && /\.(png|jpe?g|gif|webp)$/.test(rl)) (s.images = s.images || []).push(assetPath(e));
    else if (rl.startsWith('emoji/')) (s.emoji_files = s.emoji_files || {})[rest.split('/')[1].split('.')[0]] = assetPath(e);
    else if (rl.startsWith('webhooks/')) (s.webhook_files = s.webhook_files || {})[rest.split('/')[1].split('.')[0]] = assetPath(e);
    else if (rl.endsWith('.json')) (s.other = s.other || {})[rest] = await json(e.name);
  }
  for (const [gid, s] of servers) s.name = s.guild?.name || srvIndex[gid] || null;

  /* activities / ads / support */
  progress('Reading the rest', 0.5, '', true);
  const activities = {};
  for (const e of files.filter((e) => /^activities\//i.test(rel(e)))) {
    const t = await zip.text(e);
    try { activities[rel(e).slice('activities/'.length)] = JSON.parse(t); } catch { activities[rel(e).slice('activities/'.length)] = t.length > 200000 ? t.slice(0, 200000) + '…' : t; }
  }
  const ads = {};
  for (const e of files.filter((e) => /^ads\/.+\.json$/i.test(rel(e)))) ads[rel(e).slice(4)] = await json(e.name);
  const tickets = (await jsonP('Support_Tickets/tickets.json', null)) || (await jsonP('Support Tickets/tickets.json', {})) || {};
  const readmeE = getP('README.txt');
  const readme = readmeE ? await zip.text(readmeE) : '';

  /* IDs end up in click handlers — keep them to safe characters */
  const S = (v) => (v == null ? v : String(v).replace(/[^\w .-]/g, ''));
  (user.relationships || []).forEach((r) => { r.id = S(r.id); if (r.user) r.user.id = S(r.user.id); });
  messages.forEach((c) => { c.guild_id = S(c.guild_id); if (Array.isArray(c.recipients)) c.recipients = c.recipients.map(S); });
  for (const s of servers.values()) s.id = S(s.id);
  const srvIdx = {}; for (const k in srvIndex) srvIdx[S(k)] = srvIndex[k];
  (user.settings?.settings?.guildFolders?.folders || []).forEach((f) => { if (Array.isArray(f.guildIds)) f.guildIds = f.guildIds.map(S); });
  for (const key of ['guild_views', 'channel_views', 'voice_guilds', 'voice_channels', 'voice_dur', 'msg_channels', 'msg_guilds']) if (activity[key]) activity[key] = activity[key].map(([k, v]) => [S(k), v]);
  (user.user_activity_application_statistics || []).forEach((x) => (x.application_id = S(x.application_id)));
  progress('Done', 1, '', true);
  return {
    assets,
    data: {
      generated: new Date().toISOString(),
      package: { name: file.name, size: file.size, files: files.map((e) => [e.name, e.usize, e.csize]), readme },
      user, avatar: mainAv ? assetPath(mainAv) : null, avatars, applications: apps, exports, messages,
      servers: { index: srvIdx, servers: [...servers.values()] }, activities, ads, tickets, activity,
    },
  };
}
function normType(t) {
  if (typeof t === 'string') return t;
  return { 0: 'GUILD_TEXT', 1: 'DM', 2: 'GUILD_VOICE', 3: 'GROUP_DM', 4: 'GUILD_CATEGORY', 5: 'GUILD_ANNOUNCEMENT', 10: 'ANNOUNCEMENT_THREAD', 11: 'PUBLIC_THREAD', 12: 'PRIVATE_THREAD', 13: 'GUILD_STAGE_VOICE', 15: 'GUILD_FORUM' }[t] || String(t ?? 'UNKNOWN');
}
